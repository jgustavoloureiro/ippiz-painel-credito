# Ippiz — Painel Executivo de Carteira e Risco (Case de Portfólio)

> Case de portfólio construído a partir de uma vaga real de **Business Analyst** (fintech de crédito
> instantâneo via PIX para micro e pequenas empresas). **Todos os dados são 100% fictícios** — nenhuma
> informação real de qualquer empresa foi usada. "Ippiz" é um nome fictício.

Autor: **J. Gustavo Loureiro** — [github.com/jgustavoloureiro](https://github.com/jgustavoloureiro) · [linkedin.com/in/josegustavoloureiro](https://linkedin.com/in/josegustavoloureiro)

## Por que esse case

A vaga pedia alguém capaz de estruturar problemas de negócio ambíguos, construir análises/dashboards
para diferentes áreas (risco, operações, financeiro), mapear e melhorar processos, e transitar entre
dados e stakeholders. Este projeto cobre as quatro frentes descritas na vaga, usando o domínio de
negócio da própria empresa (crédito via PIX para MPEs):

| Frente da vaga | Onde está neste case |
|---|---|
| Estruturação e resolução de problemas | Faixas de risco, funil de aprovação, concentração de volume por analista |
| Análises e reporte | Dashboard interativo + modelo Power BI (DAX) |
| Mapeamento e melhoria de processos | Aba "Operação Diária" — SLA, fila e produtividade por analista |
| Gestão de stakeholders | Painel pensado para diretoria/coordenação/gerência, com linguagem executiva |

## Estrutura do repositório

```
ippiz-portfolio/
├── index.html                    # dashboard interativo — arquivo único, é o que o GitHub Pages carrega
├── data/
│   └── ippiz_data.json          # dataset fictício completo (fonte única de verdade)
├── excel/
│   └── Ippiz_Base_Dados.xlsx    # base em Excel, com fórmulas (não valores fixos) e gráficos nativos
├── powerbi/
│   ├── Ippiz.pbip                # projeto Power BI (abre direto no Power BI Desktop)
│   ├── Ippiz.SemanticModel/      # modelo semântico em TMDL (tabelas, relacionamentos, medidas DAX)
│   ├── Ippiz.Report/             # relatório (página inicial em branco, pronta para receber visuais)
│   └── data_local/ippiz_data.json
├── web/
│   ├── index.html                # versão modular do mesmo dashboard (código separado em arquivos)
│   ├── styles.css
│   ├── charts.js                 # gráficos SVG próprios (sem dependência externa)
│   ├── ai-assistant.js           # assistente offline (motor de regras + modelo local opcional)
│   ├── app.js
│   └── data/ippiz_data.json
└── scripts/
    ├── generate_data.py          # gera o dataset fictício (JSON)
    └── build_xlsx.py             # gera o Excel a partir do dataset
```

## Dashboard interativo

Tem duas versões — abra a que for mais conveniente:

- **`index.html`** (raiz do projeto) — **arquivo único**, com CSS, JS e os dados
  todos embutidos. Dá duplo clique e abre, sem servidor, sem internet, sem depender de nenhum outro
  arquivo ao lado. É esse arquivo que o GitHub Pages carrega automaticamente na URL principal do site
  (por isso o nome `index.html` — é a convenção que toda hospedagem estática usa pra achar a home).
- **`web/index.html`** — versão modular (HTML + `styles.css` + `charts.js` + `ai-assistant.js` +
  `app.js` + `data/`), pensada pra mostrar organização de código real (não é a que fica pública no
  Pages, mas está no repo como referência de como o código é estruturado).
  Essa **precisa** dos arquivos ao lado dela — se for baixar, baixe a pasta `web/` inteira, não só o
  `index.html`.

- **KPIs com hover**: cada card mostra o indicador na frente e, ao passar o mouse, "vira" e revela
  detalhamento + minigráfico de tendência (últimos 8 meses).
- **Tema claro/escuro**: alternável pelo botão no topo, com preferência salva no navegador.
- **Filtros**: chips de Região / Segmento / Setor (destacam as barras correspondentes nos gráficos) e
  um slider de período que recalcula os KPIs e as séries temporais.
- **Gráficos**: todos desenhados em SVG puro (sem biblioteca externa) — evolução da carteira, funil de
  aprovação, inadimplência vs. aprovação, aging de risco, distribuição por região/segmento/setor e
  tabela de produtividade por analista.
- **Assistente offline**: ver seção abaixo.

### Se for usar a versão modular (`web/index.html`)

Navegadores bloqueiam `fetch()` de arquivos abertos direto com duplo clique (`file://`) — mas nessa
versão os dados também já vêm embutidos no HTML (não dependem mais de `fetch`), então funciona igual
com duplo clique. O que ela ainda precisa é dos arquivos `styles.css`, `charts.js`, `ai-assistant.js`
e `app.js` estarem na mesma pasta. Para publicar em GitHub Pages, suba a pasta `web/` inteira.

## O assistente "totalmente offline" — como funciona de verdade

Pedido: um assistente de IA rodando 100% offline. Implementei em **duas camadas**, para o recurso
nunca ficar quebrado:

1. **Motor de regras (sempre ativo, instantâneo)** — lê o dataset filtrado no momento e responde
   perguntas sobre carteira, inadimplência, aprovação, SLA, cobrança, NPS e região com frases geradas
   a partir dos números reais do painel. Não depende de internet nem de download nenhum.
2. **Modelo neural local (opcional, upgrade progressivo)** — ao abrir o assistente, o painel tenta
   carregar um modelo de linguagem pequeno (**Qwen2.5-0.5B-Instruct**, ~0,5B parâmetros) inteiramente
   no navegador via [transformers.js](https://huggingface.co/docs/transformers.js) (WebGPU/WASM). Uma
   vez baixado, ele fica em cache do navegador e roda sem rede nas próximas vezes — nenhum dado é
   enviado a servidor nenhum, é inferência local mesmo. Esse modelo é usado só para *reescrever* a
   resposta de forma mais natural, sempre "grounded" nos fatos calculados pelo motor de regras (uma
   forma simples de RAG local) — ele não pode inventar números.

Se o modelo neural não carregar (sem internet na primeira visita, navegador sem suporte, GitHub Pages
sem CDN acessível etc.), o assistente **continua 100% funcional** só com o motor de regras — isso é
proposital: é a diferença entre "demo que quebra" e "produto com degradação graciosa", que é
exatamente o tipo de decisão de engenharia que quero mostrar num processo seletivo.

## Excel (`excel/Ippiz_Base_Dados.xlsx`)

Todas as métricas da aba **KPIs** são fórmulas apontando para a aba `Serie_Mensal` (não valores
fixos) — muda o dado na fonte, os indicadores recalculam. Zero erros de fórmula (validado com
recálculo automático). Abas: Serie_Mensal, Regional, Segmento, Setor, Funil_Aprovacao, Faixas_Risco,
Operacao_Diaria, KPIs.

## Power BI (`powerbi/`) — leia isso antes de abrir

Entreguei o projeto no formato **`.pbip`** (Power BI Project — pastas com modelo em **TMDL** e DAX),
que é o formato que se versiona bem no Git e o que qualquer avaliador técnico vai reconhecer como boa
prática de BI. Ele inclui:

- Modelo semântico completo: `DimTempo`, `FatoSerieMensal`, `Regional`, `Segmento`, `Setor`,
  `FunilAprovacao`, `FaixasRisco`, `OperacaoDiaria` e uma tabela `_Medidas` com as medidas DAX
  (Valor Concedido, Variação MoM, Ticket Médio, Taxa de Aprovação, Inadimplência 15/30/90d, SLA Médio,
  Recuperação em Cobrança, NPS, Carteira Ativa Total, % Conversão do Funil).
- Uma página de relatório em branco, pronta para você montar os visuais no Power BI Desktop.

**Sobre o `.pbix`**: é um formato binário compilado — só o próprio Power BI Desktop consegue gerá-lo
corretamente (não é algo que se escreve à mão com segurança, ao contrário do `.pbip`/TMDL, que é
texto puro). Por isso não incluí um `.pbix` pronto: incluí o `.pbip` completo, e gerar o `.pbix` é um
único clique depois de abrir:

1. Abra `Ippiz.pbip` no Power BI Desktop (versão de 2024 em diante, com o recurso PBIP habilitado em
   Opções → Recursos de visualização prévia).
2. Na primeira abertura, vá em **Transformar Dados → Configurações de Origem de Dados** e ajuste o
   caminho do arquivo JSON (hoje aponta para um placeholder `C:\CAMINHO\PARA\...`) para o caminho real
   de `data/ippiz_data.json` (ou `powerbi/data_local/ippiz_data.json`) na sua máquina.
3. **Arquivo → Salvar Como → Power BI (.pbix)** — pronto, você tem o `.pbix`.

Isso é intencional e é a forma correta de versionar Power BI em repositórios Git — times reais de BI
fazem exatamente assim (pbip no repo, pbix é o artefato de distribuição gerado localmente).

## Dataset (`data/ippiz_data.json`)

Fonte única de verdade, usada tanto pelo Excel quanto pelo Power BI quanto pelo dashboard web. Contém:
série mensal (18 meses), quebras por região/segmento/setor, funil de aprovação, faixas de risco (aging)
e operação diária por analista (30 dias). Gerado por `scripts/generate_data.py` com números sintéticos
mas realistas (sazonalidade, tendência de melhoria de risco/SLA ao longo do tempo, etc.).

## Stack

Python (pandas, numpy, openpyxl) para geração de dados · HTML/CSS/JS vanilla + SVG próprio para o
dashboard (sem framework, sem dependência de build) · transformers.js para o modelo local opcional ·
Power BI (TMDL/DAX) para o modelo semântico.
