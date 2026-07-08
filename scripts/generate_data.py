"""
Gera o dataset fictício do case Ippiz com uma tabela fato granular
(mês x região x segmento x setor), permitindo filtros cruzados reais
no dashboard — em vez de tabelas de quebra independentes.
"""
import json
import numpy as np
import pandas as pd
from datetime import date

rng = np.random.default_rng(7)

MESES = pd.date_range("2025-01-01", "2026-06-01", freq="MS")
N = len(MESES)

REGIOES = ["Sudeste", "Sul", "Nordeste", "Centro-Oeste", "Norte"]
PESO_REG = dict(zip(REGIOES, [0.42, 0.21, 0.19, 0.11, 0.07]))
RISCO_REG = dict(zip(REGIOES, [0.90, 0.92, 1.12, 1.05, 1.18]))   # >1 = mais arriscado
SLA_REG = dict(zip(REGIOES, [0.94, 0.97, 1.08, 1.05, 1.15]))     # >1 = SLA mais lento

SEGMENTOS = ["Microempreendedor (MEI)", "Micro Empresa", "Pequena Empresa"]
PESO_SEG = dict(zip(SEGMENTOS, [0.47, 0.33, 0.20]))
RISCO_SEG = dict(zip(SEGMENTOS, [1.18, 0.98, 0.74]))
TICKET_SEG = dict(zip(SEGMENTOS, [0.52, 1.05, 2.15]))

SETORES = ["Varejo", "Serviços", "Alimentação", "Construção", "Indústria", "Tecnologia"]
PESO_SET = dict(zip(SETORES, [0.29, 0.24, 0.18, 0.13, 0.10, 0.06]))
RISCO_SET = dict(zip(SETORES, [1.02, 0.95, 1.08, 1.22, 0.98, 0.80]))

trend = np.linspace(18_000_000, 64_000_000, N)
season = 1 + 0.06 * np.sin(np.linspace(0, 3 * np.pi, N))
base_valor = trend * season
base_ticket = 2350 * np.ones(N) * (1 + np.linspace(0, 0.08, N))
base_inad30 = np.clip(4.2 - np.linspace(0, 1.0, N) + rng.normal(0, 0.15, N), 1.8, None)
base_aprov = np.clip(np.linspace(58, 71, N), 50, 85)
base_sla = np.clip(np.linspace(30, 11, N), 6, None)
base_recup = np.clip(np.linspace(41, 63, N), 30, 90)
base_nps = np.clip(np.linspace(38, 57, N), 0, 100)

rows = []
combos = [(r, s, t) for r in REGIOES for s in SEGMENTOS for t in SETORES]
peso_total = sum(PESO_REG[r] * PESO_SEG[s] * PESO_SET[t] for r, s, t in combos)

for mi, mdate in enumerate(MESES):
    competencia = mdate.strftime("%Y-%m")
    mes_label = mdate.strftime("%b/%y")
    for r, s, t in combos:
        w = (PESO_REG[r] * PESO_SEG[s] * PESO_SET[t]) / peso_total
        noise = rng.normal(1, 0.05)
        valor = base_valor[mi] * w * noise
        ticket = base_ticket[mi] * TICKET_SEG[s] * rng.normal(1, 0.04)
        qtd_op = max(1, round(valor / ticket))
        risco_mult = RISCO_REG[r] * RISCO_SEG[s] * RISCO_SET[t]
        inad30 = np.clip(base_inad30[mi] * risco_mult * rng.normal(1, 0.06), 0.4, 18)
        inad15 = np.clip(inad30 * rng.normal(1.62, 0.05), 0.3, None)
        inad90 = np.clip(inad30 * rng.normal(0.40, 0.05), 0.1, None)
        aprov = np.clip(base_aprov[mi] / risco_mult * rng.normal(1, 0.03), 35, 92)
        sla = np.clip(base_sla[mi] * SLA_REG[r] * rng.normal(1, 0.05), 4, None)
        recup = np.clip(base_recup[mi] / (risco_mult ** 0.5) * rng.normal(1, 0.04), 20, 95)
        nps = np.clip(base_nps[mi] - (risco_mult - 1) * 12 + rng.normal(0, 2.5), 0, 100)
        rows.append({
            "competencia": competencia, "mes_label": mes_label, "mes_idx": mi,
            "regiao": r, "segmento": s, "setor": t,
            "valor_concedido": round(float(valor), 2),
            "qtd_operacoes": int(qtd_op),
            "inadimplencia_15d": round(float(inad15), 2),
            "inadimplencia_30d": round(float(inad30), 2),
            "inadimplencia_90d": round(float(inad90), 2),
            "taxa_aprovacao": round(float(aprov), 2),
            "sla_medio_horas": round(float(sla), 2),
            "recuperacao_cobranca": round(float(recup), 2),
            "nps": round(float(nps), 1),
        })

fato = pd.DataFrame(rows)

ultimo_mes = fato["mes_idx"].max()
funil_rows = []
for r in REGIOES:
    aprov_r = fato[(fato.regiao == r) & (fato.mes_idx == ultimo_mes)]["taxa_aprovacao"].mean()
    peso_r = PESO_REG[r]
    solicitado = int(9_400 * peso_r / PESO_REG["Sudeste"] * 0.55) if r != "Sudeste" else 9_400
    solicitado = max(solicitado, 300)
    em_analise = int(solicitado * 0.94)
    aprovado = int(solicitado * (aprov_r / 100))
    desembolsado = int(aprovado * 0.93)
    recusado = em_analise - aprovado
    for etapa, ordem, qtd in [("Solicitado", 1, solicitado), ("Em Análise", 2, em_analise),
                                ("Aprovado", 3, aprovado), ("Desembolsado", 4, desembolsado),
                                ("Recusado", 5, recusado)]:
        funil_rows.append({"regiao": r, "etapa": etapa, "ordem": ordem, "qtd": qtd})
funil = pd.DataFrame(funil_rows)

faixas = ["Em dia", "15-30 dias", "31-60 dias", "61-90 dias", "90+ dias"]
peso_base = np.array([0.874, 0.052, 0.034, 0.021, 0.019])
risco_rows = []
for r in REGIOES:
    carteira_r = fato[fato.regiao == r].groupby("mes_idx")["valor_concedido"].sum().sum() / N * 3.1
    risco_mult_r = RISCO_REG[r]
    peso_r = peso_base.copy()
    peso_r[1:] = peso_r[1:] * risco_mult_r
    peso_r[0] = 1 - peso_r[1:].sum()
    peso_r = np.clip(peso_r, 0.001, None)
    peso_r = peso_r / peso_r.sum()
    for i, f in enumerate(faixas):
        risco_rows.append({
            "regiao": r, "faixa": f, "ordem": i + 1,
            "valor": round(float(carteira_r * peso_r[i]), 2),
            "percentual": round(float(peso_r[i] * 100), 2),
        })
risco = pd.DataFrame(risco_rows)

dias = pd.date_range("2026-06-01", "2026-06-30", freq="D")
analistas = [("Analista A", "Sudeste"), ("Analista B", "Sudeste"), ("Analista C", "Sul"),
             ("Analista D", "Nordeste"), ("Analista E", "Centro-Oeste"), ("Analista F", "Norte")]
ops_rows = []
for d in dias:
    for nome, regiao in analistas:
        sla_mult = SLA_REG[regiao]
        fila = max(0, int(rng.normal(14 * sla_mult, 5)))
        tempo = max(2.0, rng.normal(11.0 * sla_mult, 3.0))
        analisadas = max(0, int(rng.normal(38 / sla_mult, 9)))
        ops_rows.append({
            "data": d.strftime("%Y-%m-%d"), "analista": nome, "regiao": regiao,
            "fila_pendente": fila, "tempo_medio_resposta_h": round(tempo, 1),
            "operacoes_analisadas": analisadas,
        })
ops_diario = pd.DataFrame(ops_rows)

def agg_serie_mensal(df):
    g = df.groupby(["mes_idx", "competencia", "mes_label"])
    out = g.apply(lambda x: pd.Series({
        "valor_concedido": x.valor_concedido.sum(),
        "qtd_operacoes": x.qtd_operacoes.sum(),
        "ticket_medio": x.valor_concedido.sum() / max(x.qtd_operacoes.sum(), 1),
        "inadimplencia_15d": np.average(x.inadimplencia_15d, weights=x.valor_concedido),
        "inadimplencia_30d": np.average(x.inadimplencia_30d, weights=x.valor_concedido),
        "inadimplencia_90d": np.average(x.inadimplencia_90d, weights=x.valor_concedido),
        "taxa_aprovacao": np.average(x.taxa_aprovacao, weights=x.valor_concedido),
        "sla_medio_horas": np.average(x.sla_medio_horas, weights=x.qtd_operacoes),
        "recuperacao_cobranca": np.average(x.recuperacao_cobranca, weights=x.valor_concedido),
        "nps": np.average(x.nps, weights=x.valor_concedido),
    }), include_groups=False).reset_index().sort_values("mes_idx")
    return out

serie_mensal = agg_serie_mensal(fato)

def agg_by(df, dim):
    g = df.groupby(dim)
    out = g.apply(lambda x: pd.Series({
        "valor_carteira": x.valor_concedido.sum() * 3.1 / N,
        "qtd_clientes_ativos": int(x.qtd_operacoes.sum() * 3.1 / N * 0.6),
        "inadimplencia_30d": np.average(x.inadimplencia_30d, weights=x.valor_concedido),
        "ticket_medio": x.valor_concedido.sum() / max(x.qtd_operacoes.sum(), 1),
    }), include_groups=False).reset_index()
    return out

regional = agg_by(fato, "regiao")
segmento = agg_by(fato, "segmento")
setor = agg_by(fato, "setor")[["setor", "valor_carteira", "qtd_clientes_ativos"]]

kpis_atuais = {
    "valor_concedido_mes": round(float(serie_mensal.iloc[-1].valor_concedido), 2),
    "valor_concedido_mes_var_pct": round(float((serie_mensal.iloc[-1].valor_concedido / serie_mensal.iloc[-2].valor_concedido - 1) * 100), 2),
    "qtd_operacoes_mes": int(serie_mensal.iloc[-1].qtd_operacoes),
    "ticket_medio": round(float(serie_mensal.iloc[-1].ticket_medio), 2),
    "taxa_aprovacao": round(float(serie_mensal.iloc[-1].taxa_aprovacao), 2),
    "inadimplencia_15d": round(float(serie_mensal.iloc[-1].inadimplencia_15d), 2),
    "inadimplencia_30d": round(float(serie_mensal.iloc[-1].inadimplencia_30d), 2),
    "inadimplencia_90d": round(float(serie_mensal.iloc[-1].inadimplencia_90d), 2),
    "sla_medio_horas": round(float(serie_mensal.iloc[-1].sla_medio_horas), 2),
    "recuperacao_cobranca": round(float(serie_mensal.iloc[-1].recuperacao_cobranca), 2),
    "nps": round(float(serie_mensal.iloc[-1].nps), 1),
    "carteira_ativa_total": round(float(regional.valor_carteira.sum()), 2),
    "clientes_ativos_total": int(regional.qtd_clientes_ativos.sum()),
}

dataset = {
    "meta": {
        "empresa": "Ippiz",
        "descricao": "Crédito instantâneo via PIX para micro e pequenas empresas (dados fictícios de portfólio)",
        "moeda": "BRL",
        "gerado_em": date.today().isoformat(),
        "periodo": {"inicio": serie_mensal.iloc[0].competencia, "fim": serie_mensal.iloc[-1].competencia},
        "dimensoes": {"regioes": REGIOES, "segmentos": SEGMENTOS, "setores": SETORES},
    },
    "kpis_atuais": kpis_atuais,
    "fato": fato.to_dict(orient="records"),
    "serie_mensal": serie_mensal.to_dict(orient="records"),
    "regional": regional.to_dict(orient="records"),
    "segmento": segmento.to_dict(orient="records"),
    "setor": setor.to_dict(orient="records"),
    "funil_aprovacao": funil.to_dict(orient="records"),
    "faixas_risco": risco.to_dict(orient="records"),
    "operacao_diaria": ops_diario.to_dict(orient="records"),
}

with open("/home/claude/ippiz-portfolio/data/ippiz_data.json", "w", encoding="utf-8") as f:
    json.dump(dataset, f, ensure_ascii=False, separators=(",", ":"))

serie_mensal.to_csv("/tmp/_monthly.csv", index=False)
regional.to_csv("/tmp/_regional.csv", index=False)
segmento.to_csv("/tmp/_segmento.csv", index=False)
setor.to_csv("/tmp/_setor.csv", index=False)
funil[funil.regiao == "Sudeste"].drop(columns="regiao").to_csv("/tmp/_funil.csv", index=False)
risco[risco.regiao == "Sudeste"].drop(columns="regiao").to_csv("/tmp/_risco.csv", index=False)
ops_diario.to_csv("/tmp/_ops_diario.csv", index=False)

import os
print("Linhas no fato:", len(fato))
print("Tamanho do JSON:", round(os.path.getsize("/home/claude/ippiz-portfolio/data/ippiz_data.json") / 1024, 1), "KB")
