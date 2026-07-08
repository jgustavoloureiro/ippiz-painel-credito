const REGION_COLORS = ["#00A878", "#0B2540", "#F2A93B", "#5AA9E6", "#D65B5B"];
const RISK_COLORS = ["#00A878", "#8FCB9A", "#F2A93B", "#E88A4C", "#D65B5B"];
const CARTEIRA_FACTOR = 3.1 / 18; // espelha a geração em generate_data.py

let DATA = null;
let CURRENT = {}; // agregados recalculados a cada renderAll(), na visão do filtro atual
const state = { regioes: new Set(), segmentos: new Set(), setores: new Set(), monthRange: [0, 0], view: "executiva" };

function fmtDelta(v, positiveIsGood = true) {
  const up = v >= 0;
  const good = positiveIsGood ? up : !up;
  return `<span class="kpi-delta ${good ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(v).toFixed(1)}%</span>`;
}

async function init() {
  const embedded = document.getElementById("ippiz-data");
  if (embedded && embedded.textContent.trim()) {
    DATA = JSON.parse(embedded.textContent);
  } else {
    const res = await fetch("./data/ippiz_data.json");
    DATA = await res.json();
  }
  state.monthRange = [0, DATA.serie_mensal.length - 1];
  buildFilterChips();
  wireCover();
  wireViewTabs();
  wireTheme();
  wireAssistant();
  renderCoverHeadline();
  renderAll();
  window.addEventListener("resize", debounce(renderCharts, 200));
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---------- Capa ----------
function renderCoverHeadline() {
  const k = DATA.kpis_atuais;
  const wrap = document.getElementById("cover-headline");
  wrap.innerHTML = `
    <div class="hstat"><div class="hval mono">${fmtBRL(k.carteira_ativa_total)}</div><div class="hlabel">Carteira ativa total</div></div>
    <div class="hstat"><div class="hval mono">${fmtNum(k.clientes_ativos_total)}</div><div class="hlabel">Clientes ativos</div></div>
    <div class="hstat"><div class="hval mono">${fmtPct(k.taxa_aprovacao)}</div><div class="hlabel">Taxa de aprovação</div></div>`;
}

function wireCover() {
  document.querySelectorAll(".tier").forEach(tier => {
    tier.onclick = () => enterApp(tier.dataset.view);
  });
  document.getElementById("back-to-cover").onclick = () => {
    document.getElementById("app").classList.remove("active");
    document.getElementById("cover").style.display = "flex";
  };
}
function enterApp(view) {
  document.getElementById("cover").style.display = "none";
  document.getElementById("app").classList.add("active");
  setView(view);
}

// ---------- Navegação entre visões ----------
function wireViewTabs() {
  document.querySelectorAll(".view-tab").forEach(btn => {
    btn.onclick = () => setView(btn.dataset.view);
  });
}
function setView(view) {
  state.view = view;
  document.querySelectorAll(".view-tab").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view-panel").forEach(p => p.classList.toggle("active", p.id === "view-" + view));
  renderCharts();
}

// ---------- Filtros ----------
function buildFilterChips() {
  const regWrap = document.getElementById("chips-regiao");
  DATA.meta.dimensoes.regioes.forEach(r => {
    const chip = document.createElement("div");
    chip.className = "chip"; chip.textContent = r;
    chip.onclick = () => toggleChip(chip, state.regioes, r);
    regWrap.appendChild(chip);
  });
  const segWrap = document.getElementById("chips-segmento");
  DATA.meta.dimensoes.segmentos.forEach(s => {
    const chip = document.createElement("div");
    chip.className = "chip"; chip.textContent = s;
    chip.onclick = () => toggleChip(chip, state.segmentos, s);
    segWrap.appendChild(chip);
  });
  const setWrap = document.getElementById("chips-setor");
  DATA.meta.dimensoes.setores.forEach(s => {
    const chip = document.createElement("div");
    chip.className = "chip"; chip.textContent = s;
    chip.onclick = () => toggleChip(chip, state.setores, s);
    setWrap.appendChild(chip);
  });

  const slider = document.getElementById("month-slider");
  slider.max = DATA.serie_mensal.length - 1;
  slider.value = DATA.serie_mensal.length - 1;
  updateSliderLabel();
  slider.addEventListener("input", () => {
    state.monthRange = [0, Number(slider.value)];
    updateSliderLabel();
    renderAll();
  });

  document.getElementById("reset-filters").onclick = () => {
    state.regioes.clear(); state.segmentos.clear(); state.setores.clear();
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    slider.value = DATA.serie_mensal.length - 1;
    state.monthRange = [0, DATA.serie_mensal.length - 1];
    updateSliderLabel();
    renderAll();
  };
}
function updateSliderLabel() {
  const [a, b] = state.monthRange;
  document.getElementById("month-slider-label").textContent =
    `${DATA.serie_mensal[0].mes_label} — ${DATA.serie_mensal[b].mes_label}`;
}
function toggleChip(chip, set, value) {
  chip.classList.toggle("active");
  if (set.has(value)) set.delete(value); else set.add(value);
  renderAll();
}

// ---------- Motor de filtro cruzado sobre a tabela fato ----------
function filterFato({ skipRegiao = false, skipSegmento = false, skipSetor = false } = {}) {
  const [a, b] = state.monthRange;
  return DATA.fato.filter(r =>
    r.mes_idx >= a && r.mes_idx <= b &&
    (skipRegiao || !state.regioes.size || state.regioes.has(r.regiao)) &&
    (skipSegmento || !state.segmentos.size || state.segmentos.has(r.segmento)) &&
    (skipSetor || !state.setores.size || state.setores.has(r.setor))
  );
}

function computeSerieMensal(fato) {
  const byMonth = new Map();
  fato.forEach(r => {
    if (!byMonth.has(r.mes_idx)) {
      byMonth.set(r.mes_idx, {
        mes_idx: r.mes_idx, competencia: r.competencia, mes_label: r.mes_label,
        valor_concedido: 0, qtd_operacoes: 0,
        wInad15: 0, wInad30: 0, wInad90: 0, wAprov: 0, wRecup: 0, wNps: 0, wSla: 0, wQtd: 0,
      });
    }
    const m = byMonth.get(r.mes_idx);
    m.valor_concedido += r.valor_concedido;
    m.qtd_operacoes += r.qtd_operacoes;
    m.wInad15 += r.inadimplencia_15d * r.valor_concedido;
    m.wInad30 += r.inadimplencia_30d * r.valor_concedido;
    m.wInad90 += r.inadimplencia_90d * r.valor_concedido;
    m.wAprov += r.taxa_aprovacao * r.valor_concedido;
    m.wRecup += r.recuperacao_cobranca * r.valor_concedido;
    m.wNps += r.nps * r.valor_concedido;
    m.wSla += r.sla_medio_horas * r.qtd_operacoes;
    m.wQtd += r.qtd_operacoes;
  });
  return [...byMonth.values()].sort((x, y) => x.mes_idx - y.mes_idx).map(m => ({
    mes_idx: m.mes_idx, competencia: m.competencia, mes_label: m.mes_label,
    valor_concedido: m.valor_concedido, qtd_operacoes: m.qtd_operacoes,
    ticket_medio: m.valor_concedido / (m.qtd_operacoes || 1),
    inadimplencia_15d: m.valor_concedido ? m.wInad15 / m.valor_concedido : 0,
    inadimplencia_30d: m.valor_concedido ? m.wInad30 / m.valor_concedido : 0,
    inadimplencia_90d: m.valor_concedido ? m.wInad90 / m.valor_concedido : 0,
    taxa_aprovacao: m.valor_concedido ? m.wAprov / m.valor_concedido : 0,
    sla_medio_horas: m.wQtd ? m.wSla / m.wQtd : 0,
    recuperacao_cobranca: m.valor_concedido ? m.wRecup / m.valor_concedido : 0,
    nps: m.valor_concedido ? m.wNps / m.valor_concedido : 0,
  }));
}

function computeGroupBy(fato, dimKey) {
  const map = new Map();
  fato.forEach(r => {
    const key = r[dimKey];
    if (!map.has(key)) map.set(key, { label: key, valor: 0, qtd: 0, wInad: 0 });
    const g = map.get(key);
    g.valor += r.valor_concedido; g.qtd += r.qtd_operacoes; g.wInad += r.inadimplencia_30d * r.valor_concedido;
  });
  return [...map.values()].map(g => ({
    label: g.label,
    valor_carteira: g.valor * CARTEIRA_FACTOR,
    qtd_clientes_ativos: Math.round(g.qtd * CARTEIRA_FACTOR * 0.6),
    inadimplencia_30d: g.valor ? g.wInad / g.valor : 0,
    ticket_medio: g.valor / (g.qtd || 1),
  }));
}

function computeFunilMeta() {
  const seen = new Map();
  DATA.funil_aprovacao.forEach(f => { if (!seen.has(f.etapa)) seen.set(f.etapa, f.ordem); });
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(e => e[0]);
}
function computeFaixasMeta() {
  const seen = new Map();
  DATA.faixas_risco.forEach(f => { if (!seen.has(f.faixa)) seen.set(f.faixa, f.ordem); });
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(e => e[0]);
}

function regioesSelecionadas() { return state.regioes.size ? [...state.regioes] : DATA.meta.dimensoes.regioes; }

function computeFunil() {
  const regs = regioesSelecionadas();
  const etapas = computeFunilMeta();
  return etapas.map(et => ({
    etapa: et,
    qtd: DATA.funil_aprovacao.filter(f => f.etapa === et && regs.includes(f.regiao)).reduce((s, f) => s + f.qtd, 0),
  }));
}
function computeRisco() {
  const regs = regioesSelecionadas();
  const faixas = computeFaixasMeta();
  const rows = faixas.map(fx => ({
    faixa: fx,
    valor: DATA.faixas_risco.filter(f => f.faixa === fx && regs.includes(f.regiao)).reduce((s, f) => s + f.valor, 0),
  }));
  const total = rows.reduce((s, r) => s + r.valor, 0);
  rows.forEach(r => r.percentual = total ? (r.valor / total) * 100 : 0);
  return rows;
}
function computeOpsRows() {
  const regs = regioesSelecionadas();
  return DATA.operacao_diaria.filter(o => regs.includes(o.regiao));
}

// ---------- Render ----------
function renderAll() {
  const fatoFull = filterFato();
  CURRENT.serieMensal = computeSerieMensal(fatoFull);
  CURRENT.regional = computeGroupBy(filterFato({ skipRegiao: true }), "regiao");
  CURRENT.segmento = computeGroupBy(filterFato({ skipSegmento: true }), "segmento");
  CURRENT.setor = computeGroupBy(filterFato({ skipSetor: true }), "setor");
  CURRENT.funil = computeFunil();
  CURRENT.risco = computeRisco();
  CURRENT.opsRows = computeOpsRows();
  // total "real" respeitando TODOS os filtros (diferente de CURRENT.regional, que ignora
  // o próprio filtro de região de propósito para manter o contexto visual do gráfico)
  CURRENT.carteiraFiltrada = fatoFull.reduce((s, r) => s + r.valor_concedido, 0) * CARTEIRA_FACTOR;
  CURRENT.clientesFiltrados = Math.round(fatoFull.reduce((s, r) => s + r.qtd_operacoes, 0) * CARTEIRA_FACTOR * 0.6);

  const semDados = CURRENT.serieMensal.length === 0;
  document.querySelectorAll("main").forEach(m => m.classList.toggle("sem-dados", semDados));

  renderKPIs();
  renderCharts();
}

function kpiCardsHTML(gridId, cards) {
  const grid = document.getElementById(gridId);
  grid.innerHTML = "";
  cards.forEach(c => {
    const card = document.createElement("div");
    card.className = "kpi-card";
    const deltaTxt = c.isPP
      ? `<span class="kpi-delta ${(c.good ? c.delta >= 0 : c.delta < 0) ? "up" : "down"}">${c.delta >= 0 ? "▲" : "▼"} ${Math.abs(c.delta).toFixed(1)} p.p.</span>`
      : fmtDelta(c.delta, c.good);
    card.innerHTML = `
      <div class="kpi-face kpi-front">
        <span class="kpi-label">${c.label}</span>
        <div class="kpi-value mono">${c.value}</div>
        ${deltaTxt}
      </div>
      <div class="kpi-face kpi-back">
        <div class="kpi-back-title">Detalhe</div>
        <div class="kpi-back-detail">${c.detail}</div>
      </div>`;
    const sparkWrap = document.createElement("div");
    sparkWrap.className = "spark";
    sparkWrap.appendChild(sparkline(c.spark, { color: c.good ? "#00C896" : "#F2A93B" }));
    card.querySelector(".kpi-back").appendChild(sparkWrap);
    grid.appendChild(card);
  });
}

function renderKPIs() {
  const serie = CURRENT.serieMensal;
  if (!serie.length) {
    ["kpi-grid-executiva", "kpi-grid-risco", "kpi-grid-comercial"].forEach(id => {
      document.getElementById(id).innerHTML = `<div class="empty-state">Nenhum dado para os filtros selecionados. Tente limpar algum filtro.</div>`;
    });
    return;
  }
  const last = serie[serie.length - 1];
  const prev = serie.length > 1 ? serie[serie.length - 2] : last;
  const spark = k => serie.slice(-8).map(m => m[k]);
  const faixaRisco90 = CURRENT.risco.find(f => f.faixa === "90+ dias");

  kpiCardsHTML("kpi-grid-executiva", [
    { label: "Valor Concedido (mês)", value: fmtBRL(last.valor_concedido), delta: (last.valor_concedido / prev.valor_concedido - 1) * 100, good: true,
      detail: `Ticket médio: ${fmtBRL(last.ticket_medio, false)}<br>Operações: ${fmtNum(last.qtd_operacoes)}`, spark: spark("valor_concedido") },
    { label: "Taxa de Aprovação", value: fmtPct(last.taxa_aprovacao), delta: last.taxa_aprovacao - prev.taxa_aprovacao, good: true, isPP: true,
      detail: `Mês anterior: ${fmtPct(prev.taxa_aprovacao)}<br>Meta de referência: 70,0%`, spark: spark("taxa_aprovacao") },
    { label: "Inadimplência 30d", value: fmtPct(last.inadimplencia_30d), delta: last.inadimplencia_30d - prev.inadimplencia_30d, good: false, isPP: true,
      detail: `15d: ${fmtPct(last.inadimplencia_15d)}<br>90d: ${fmtPct(last.inadimplencia_90d)}`, spark: spark("inadimplencia_30d") },
    { label: "NPS", value: last.nps.toFixed(1), delta: last.nps - prev.nps, good: true,
      detail: `Carteira ativa (filtro atual): ${fmtBRL(CURRENT.carteiraFiltrada)}`, spark: spark("nps") },
  ]);

  kpiCardsHTML("kpi-grid-risco", [
    { label: "Inadimplência 15d", value: fmtPct(last.inadimplencia_15d), delta: last.inadimplencia_15d - prev.inadimplencia_15d, good: false, isPP: true,
      detail: `30d: ${fmtPct(last.inadimplencia_30d)}<br>90d: ${fmtPct(last.inadimplencia_90d)}`, spark: spark("inadimplencia_15d") },
    { label: "Inadimplência 90d", value: fmtPct(last.inadimplencia_90d), delta: last.inadimplencia_90d - prev.inadimplencia_90d, good: false, isPP: true,
      detail: `Faixa 90+ dias: ${faixaRisco90 ? faixaRisco90.percentual.toFixed(2) : "—"}% da carteira filtrada`, spark: spark("inadimplencia_90d") },
    { label: "SLA Médio de Análise", value: last.sla_medio_horas.toFixed(1) + "h", delta: (last.sla_medio_horas / prev.sla_medio_horas - 1) * 100, good: false,
      detail: `Meta interna: ≤ 12h<br>Ver tabela de produtividade abaixo`, spark: spark("sla_medio_horas") },
    { label: "Recuperação em Cobrança", value: fmtPct(last.recuperacao_cobranca), delta: last.recuperacao_cobranca - prev.recuperacao_cobranca, good: true, isPP: true,
      detail: `Faixa 90+ dias: ${faixaRisco90 ? faixaRisco90.percentual.toFixed(2) : "—"}%`, spark: spark("recuperacao_cobranca") },
  ]);

  const regTop = [...CURRENT.regional].sort((a, b) => b.valor_carteira - a.valor_carteira)[0];
  kpiCardsHTML("kpi-grid-comercial", [
    { label: "Carteira Ativa (filtro atual)", value: fmtBRL(CURRENT.carteiraFiltrada), delta: 0, good: true,
      detail: `Clientes ativos: ${fmtNum(CURRENT.clientesFiltrados)}`, spark: spark("valor_concedido") },
    { label: "Região com Maior Carteira", value: regTop ? regTop.label : "—", delta: 0, good: true,
      detail: regTop ? `${fmtBRL(regTop.valor_carteira)} · inadimplência ${fmtPct(regTop.inadimplencia_30d)}` : "—", spark: spark("valor_concedido") },
    { label: "Ticket Médio", value: fmtBRL(last.ticket_medio, false), delta: (last.ticket_medio / prev.ticket_medio - 1) * 100, good: true,
      detail: `Operações no período: ${fmtNum(serie.reduce((s, m) => s + m.qtd_operacoes, 0))}`, spark: spark("ticket_medio") },
    { label: "Qtd. Operações (mês)", value: fmtNum(last.qtd_operacoes), delta: (last.qtd_operacoes / prev.qtd_operacoes - 1) * 100, good: true,
      detail: `Valor concedido no mês: ${fmtBRL(last.valor_concedido)}`, spark: spark("qtd_operacoes") },
  ]);
}

function renderCharts() {
  const serie = CURRENT.serieMensal;
  const view = state.view;

  if (view === "executiva") {
    if (!serie.length) {
      document.getElementById("chart-carteira").innerHTML = `<div class="empty-state">Sem dados no período/filtro selecionado.</div>`;
      document.getElementById("chart-funil").innerHTML = "";
    } else {
      const labels = serie.map(m => m.mes_label);
      lineChart(document.getElementById("chart-carteira"), { labels, series: [serie.map(m => m.valor_concedido)], colors: ["#00A878"], valueFmt: v => fmtBRL(v) });
      funnelChart(document.getElementById("chart-funil"), { labels: CURRENT.funil.map(f => f.etapa), values: CURRENT.funil.map(f => f.qtd), color: "#0B2540" });
    }
  }

  if (view === "risco") {
    if (!serie.length) {
      document.getElementById("chart-risco-aprovacao").innerHTML = `<div class="empty-state">Sem dados no período/filtro selecionado.</div>`;
    } else {
      const labels = serie.map(m => m.mes_label);
      lineChart(document.getElementById("chart-risco-aprovacao"), {
        labels, series: [serie.map(m => m.inadimplencia_30d), serie.map(m => m.taxa_aprovacao)],
        colors: ["#D65B5B", "#0B2540"], valueFmt: v => v.toFixed(0) + "%", unit: "%",
      });
    }
    riskBar(document.getElementById("chart-risco"), {
      labels: CURRENT.risco.map(f => f.faixa), values: CURRENT.risco.map(f => f.valor),
      percentuais: CURRENT.risco.map(f => f.percentual), colors: RISK_COLORS,
    });
    renderOpsTable();
  }

  if (view === "comercial") {
    const regSel = state.regioes.size ? [...state.regioes] : null;
    barChart(document.getElementById("chart-regional"), {
      labels: CURRENT.regional.map(r => r.label), values: CURRENT.regional.map(r => r.valor_carteira),
      color: "#00A878", valueFmt: v => fmtBRL(v), highlight: regSel,
    });
    const segSel = state.segmentos.size ? [...state.segmentos] : null;
    barChart(document.getElementById("chart-segmento"), {
      labels: CURRENT.segmento.map(s => s.label), values: CURRENT.segmento.map(s => s.valor_carteira),
      color: "#0B2540", valueFmt: v => fmtBRL(v), highlight: segSel,
    });
    const setSel = state.setores.size ? [...state.setores] : null;
    barChart(document.getElementById("chart-setor"), {
      labels: CURRENT.setor.map(s => s.label), values: CURRENT.setor.map(s => s.valor_carteira),
      color: "#F2A93B", valueFmt: v => fmtBRL(v), highlight: setSel,
    });
  }
}

function renderOpsTable() {
  const byAnalyst = {};
  CURRENT.opsRows.forEach(o => {
    if (!byAnalyst[o.analista]) byAnalyst[o.analista] = { regiao: o.regiao, fila: [], tempo: [], ops: 0 };
    byAnalyst[o.analista].fila.push(o.fila_pendente);
    byAnalyst[o.analista].tempo.push(o.tempo_medio_resposta_h);
    byAnalyst[o.analista].ops += o.operacoes_analisadas;
  });
  const rows = Object.entries(byAnalyst).map(([nome, d]) => ({
    nome, regiao: d.regiao,
    filaMedia: d.fila.reduce((a, b) => a + b, 0) / d.fila.length,
    tempoMedio: d.tempo.reduce((a, b) => a + b, 0) / d.tempo.length,
    totalOps: d.ops,
  })).sort((a, b) => b.totalOps - a.totalOps);

  const tbody = document.getElementById("ops-tbody");
  tbody.innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td style="font-family:'Inter'">${r.nome}</td>
      <td style="font-family:'Inter'">${r.regiao}</td>
      <td>${fmtNum(r.totalOps)}</td>
      <td>${r.tempoMedio.toFixed(1)}h</td>
      <td>${r.filaMedia.toFixed(0)}</td>
    </tr>`).join("") : `<tr><td colspan="5" style="font-family:'Inter'">Nenhum analista para a região filtrada.</td></tr>`;
}

function wireTheme() {
  const root = document.documentElement;
  const saved = localStorage.getItem("ippiz-theme");
  if (saved === "dark") root.setAttribute("data-theme", "dark");
  updateThemeBtn();
  document.getElementById("theme-toggle").onclick = () => {
    const isDark = root.getAttribute("data-theme") === "dark";
    if (isDark) root.removeAttribute("data-theme"); else root.setAttribute("data-theme", "dark");
    localStorage.setItem("ippiz-theme", isDark ? "light" : "dark");
    updateThemeBtn();
    renderCharts();
  };
}
function updateThemeBtn() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  document.getElementById("theme-toggle").textContent = isDark ? "☀️ Claro" : "🌙 Escuro";
}

function wireAssistant() {
  const panel = document.getElementById("assistant-panel");
  const openBtn = document.getElementById("assistant-open");
  const closeBtn = document.getElementById("assistant-close");
  const input = document.getElementById("assistant-input");
  const sendBtn = document.getElementById("assistant-send");
  const body = document.getElementById("assistant-body");
  const statusDot = document.getElementById("status-dot");
  const statusLabel = document.getElementById("status-label");
  const progressWrap = document.getElementById("progress-wrap");
  const progressFill = document.getElementById("progress-fill");
  const progressLabel = document.getElementById("progress-label");

  let opened = false;
  openBtn.onclick = () => {
    panel.classList.add("open");
    if (!opened) {
      opened = true;
      addMsg("bot", "Oi! Sou o assistente do painel Ippiz — rodo 100% no seu navegador, sem enviar nada para servidores. Respondo considerando os filtros que você tiver aplicado. Tentando carregar um modelo local para respostas mais naturais…");
      progressWrap.style.display = "block";
      tryLoadLocalLLM(pct => {
        progressFill.style.width = pct + "%";
        progressLabel.textContent = `Baixando modelo local (uma vez só, fica em cache)… ${pct}%`;
      }).then(status => {
        progressWrap.style.display = "none";
        if (status === "ready") {
          statusDot.classList.add("ready");
          statusLabel.textContent = "Modelo neural local ativo";
          addMsg("bot", "Modelo local carregado com sucesso. Pode perguntar à vontade.");
        } else {
          statusLabel.textContent = "Motor de regras (offline)";
          addMsg("bot", "Não consegui carregar o modelo neural agora (sem rede ou sem suporte no navegador) — sigo respondendo com o motor de regras baseado nos dados reais do painel.");
        }
      });
    }
  };
  closeBtn.onclick = () => panel.classList.remove("open");

  document.querySelectorAll(".suggestion").forEach(s => {
    s.onclick = () => { input.value = s.textContent; send(); };
  });

  function addMsg(who, text) {
    const div = document.createElement("div");
    div.className = "msg " + who;
    div.innerHTML = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  async function send() {
    const q = input.value.trim();
    if (!q) return;
    addMsg("user", q);
    input.value = "";
    const thinking = addMsg("bot", "…");
    const { text, engine } = await answerQuestion(q, DATA, state, CURRENT);
    thinking.innerHTML = text + `<div style="opacity:.55;font-size:10px;margin-top:6px">via ${engine}</div>`;
    body.scrollTop = body.scrollHeight;
  }
  sendBtn.onclick = send;
  input.addEventListener("keydown", e => { if (e.key === "Enter") send(); });
}

init();
