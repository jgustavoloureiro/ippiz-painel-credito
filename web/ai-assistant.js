/*
 * Assistente 100% offline.
 * Camada 1 (sempre ativa): motor de regras que lê o dataset filtrado e responde
 * perguntas sobre os KPIs com frases determinísticas — funciona sem internet e sem download.
 * Camada 2 (opcional, upgrade progressivo): um modelo de linguagem pequeno rodando
 * inteiramente no navegador via transformers.js (WebGPU/WASM), usado para reescrever a
 * resposta de forma mais natural, sempre grounded nos fatos calculados na Camada 1 (RAG local).
 * Se o modelo não carregar (sem rede na primeira visita, sem WebGPU, etc.), o assistente
 * continua funcional só com a Camada 1 — nunca fica "quebrado".
 */

let llmPipeline = null;
let llmStatus = "rules"; // 'loading' | 'ready' | 'rules' | 'error'

async function tryLoadLocalLLM(onProgress) {
  llmStatus = "loading";
  try {
    const { pipeline } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2");
    llmPipeline = await pipeline("text-generation", "onnx-community/Qwen2.5-0.5B-Instruct", {
      dtype: "q4f16",
      progress_callback: (p) => {
        if (p.status === "progress" && onProgress) {
          onProgress(Math.round(p.progress || 0));
        }
      },
    });
    llmStatus = "ready";
  } catch (err) {
    console.warn("Modelo local não pôde ser carregado — usando motor de regras.", err);
    llmStatus = "error";
  }
  return llmStatus;
}

// ---------- Camada 1: fatos determinísticos a partir do dataset filtrado ----------
function buildFactSheet(data, state, current) {
  const serie = current.serieMensal;
  const ultimo = serie.length ? serie[serie.length - 1] : null;
  if (!ultimo) return null;

  const regDestaque = [...current.regional].sort((a, b) => b.valor_carteira - a.valor_carteira)[0];
  const riscoAlto = current.risco.find(f => f.faixa === "90+ dias");
  const analistaTop = current.opsRows.reduce((acc, o) => {
    acc[o.analista] = (acc[o.analista] || 0) + o.operacoes_analisadas;
    return acc;
  }, {});
  const analistaTopNome = Object.entries(analistaTop).sort((a, b) => b[1] - a[1])[0];
  const carteiraTotal = current.carteiraFiltrada;
  const clientesTotal = current.clientesFiltrados;

  return {
    valorConcedido: ultimo.valor_concedido,
    variacaoMoM: serie.length > 1 ? (ultimo.valor_concedido / serie[serie.length - 2].valor_concedido - 1) * 100 : 0,
    qtdOperacoes: ultimo.qtd_operacoes,
    ticketMedio: ultimo.ticket_medio,
    taxaAprovacao: ultimo.taxa_aprovacao,
    inad15: ultimo.inadimplencia_15d,
    inad30: ultimo.inadimplencia_30d,
    inad90: ultimo.inadimplencia_90d,
    sla: ultimo.sla_medio_horas,
    recuperacao: ultimo.recuperacao_cobranca,
    nps: ultimo.nps,
    carteiraTotal, clientesTotal,
    regiaoDestaque: regDestaque ? regDestaque.label : "—",
    regiaoDestaqueValor: regDestaque ? regDestaque.valor_carteira : 0,
    riscoAltoPct: riscoAlto ? riscoAlto.percentual : 0,
    analistaTop: analistaTopNome ? analistaTopNome[0] : "—",
    mesLabel: ultimo.mes_label,
    filtrosAtivos: state.regioes.size || state.segmentos.size || state.setores.size,
  };
}

function ruleBasedAnswer(question, facts) {
  if (!facts) {
    return "Não há dados para a combinação de filtros que você aplicou no painel agora. Tente limpar algum filtro (região, segmento, setor ou período) e pergunte de novo.";
  }
  const q = question.toLowerCase();
  const hit = (...words) => words.some(w => q.includes(w));
  const filtroNota = facts.filtrosAtivos ? " (considerando os filtros ativos no painel)" : "";

  if (hit("inadimpl", "risco", "atraso")) {
    return `Em ${facts.mesLabel}${filtroNota}, a inadimplência está em ${fmtPct(facts.inad15)} (15d), ${fmtPct(facts.inad30)} (30d) e ${fmtPct(facts.inad90)} (90d). A faixa acima de 90 dias representa ${facts.riscoAltoPct.toFixed(2)}% da carteira — esse é o indicador que eu priorizaria num plano de ação de cobrança.`;
  }
  if (hit("aprova", "funil")) {
    return `A taxa de aprovação do mês${filtroNota} é ${fmtPct(facts.taxaAprovacao)}. Olhando o funil completo, vale acompanhar a conversão entre "Em Análise" e "Aprovado" — é onde normalmente mora a maior perda de eficiência.`;
  }
  if (hit("sla", "tempo", "análise", "analise", "fila")) {
    return `O SLA médio de análise de crédito${filtroNota} está em ${facts.sla.toFixed(1)} horas. O analista com maior volume analisado no período foi ${facts.analistaTop} — bom ponto de partida para entender boas práticas replicáveis no time.`;
  }
  if (hit("cobran", "recupera")) {
    return `A recuperação em cobrança${filtroNota} está em ${fmtPct(facts.recuperacao)}. Cruzar esse número com a faixa de 90+ dias (${facts.riscoAltoPct.toFixed(2)}% da carteira) ajuda a priorizar régua de cobrança por severidade.`;
  }
  if (hit("regi", "estado", "sudeste", "nordeste", "sul", "norte")) {
    return `A região com maior carteira ativa${filtroNota} é ${facts.regiaoDestaque}, com ${fmtBRL(facts.regiaoDestaqueValor)}. Recomendo cruzar esse dado com a inadimplência regional antes de redistribuir metas comerciais.`;
  }
  if (hit("nps", "satisfa", "cliente")) {
    return `O NPS atual${filtroNota} é ${facts.nps.toFixed(1)}. Vale acompanhar esse número lado a lado com o SLA de análise — tempo de resposta costuma ser um dos maiores drivers de satisfação em crédito.`;
  }
  if (hit("carteira", "concedido", "total", "quanto")) {
    return `A carteira ativa total${filtroNota} é ${fmtBRL(facts.carteiraTotal)}, com ${fmtNum(facts.clientesTotal)} clientes ativos. Em ${facts.mesLabel} foram concedidos ${fmtBRL(facts.valorConcedido)} (${facts.variacaoMoM >= 0 ? "+" : ""}${facts.variacaoMoM.toFixed(1)}% vs. mês anterior) em ${fmtNum(facts.qtdOperacoes)} operações.`;
  }
  if (hit("ticket")) {
    return `O ticket médio das operações${filtroNota} em ${facts.mesLabel} é ${fmtBRL(facts.ticketMedio, false)}.`;
  }
  if (hit("resumo", "geral", "overview", "panorama")) {
    return `Panorama de ${facts.mesLabel}${filtroNota}: carteira concedida ${fmtBRL(facts.valorConcedido)} (${facts.variacaoMoM >= 0 ? "+" : ""}${facts.variacaoMoM.toFixed(1)}%), aprovação em ${fmtPct(facts.taxaAprovacao)}, inadimplência 30d em ${fmtPct(facts.inad30)}, SLA de ${facts.sla.toFixed(1)}h e NPS de ${facts.nps.toFixed(1)}.`;
  }
  return `Posso falar sobre carteira, inadimplência/risco, aprovação, SLA, cobrança, NPS ou distribuição regional — todos calculados a partir do que estiver filtrado no painel agora. Pode reformular a pergunta usando um desses temas?`;
}

function fmtPctLocal(v) { return v.toFixed(1).replace(".", ",") + "%"; }
// reuse formatters from charts.js if present in global scope
const fmtPct_ = typeof fmtPct !== "undefined" ? fmtPct : fmtPctLocal;

async function answerQuestion(question, data, state, current, { onToken } = {}) {
  const facts = buildFactSheet(data, state, current);
  const baseAnswer = ruleBasedAnswer(question, facts);

  if (llmStatus !== "ready" || !llmPipeline) {
    return { text: baseAnswer, engine: "regras" };
  }

  try {
    const system = `Você é um assistente analítico de um dashboard de crédito fintech chamado Ippiz. ` +
      `Responda SEMPRE em português, em no máximo 3 frases, usando apenas os fatos fornecidos abaixo. ` +
      `Não invente números que não estejam nos fatos.\nFATOS: ${baseAnswer}`;
    const messages = [
      { role: "system", content: system },
      { role: "user", content: question },
    ];
    const out = await llmPipeline(messages, { max_new_tokens: 160, temperature: 0.4, do_sample: false });
    const gen = Array.isArray(out) ? out[0]?.generated_text : out?.generated_text;
    const last = Array.isArray(gen) ? gen[gen.length - 1]?.content : null;
    return { text: (last && last.trim()) || baseAnswer, engine: "modelo local (Qwen2.5-0.5B)" };
  } catch (err) {
    console.warn("Falha na geração local, retornando resposta baseada em regras.", err);
    return { text: baseAnswer, engine: "regras (fallback)" };
  }
}
