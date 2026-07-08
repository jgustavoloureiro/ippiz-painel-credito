// ---------- Formatting helpers ----------
function fmtBRL(v, compact = true) {
  if (v == null || isNaN(v)) return "—";
  if (compact) {
    if (Math.abs(v) >= 1e9) return "R$ " + (v / 1e9).toFixed(2).replace(".", ",") + " bi";
    if (Math.abs(v) >= 1e6) return "R$ " + (v / 1e6).toFixed(1).replace(".", ",") + " mi";
    if (Math.abs(v) >= 1e3) return "R$ " + (v / 1e3).toFixed(0) + " mil";
  }
  return "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function fmtNum(v) { return v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }); }
function fmtPct(v, casas = 1) { return v == null ? "—" : v.toFixed(casas).replace(".", ",") + "%"; }

// ---------- Shared tooltip ----------
const tooltipEl = document.createElement("div");
tooltipEl.className = "tooltip";
document.body.appendChild(tooltipEl);
function showTip(evt, html) {
  tooltipEl.innerHTML = html;
  tooltipEl.classList.add("show");
  positionTip(evt);
}
function positionTip(evt) {
  const pad = 14;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  const rect = tooltipEl.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = evt.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight) y = evt.clientY - rect.height - pad;
  tooltipEl.style.left = x + "px";
  tooltipEl.style.top = y + "px";
}
function hideTip() { tooltipEl.classList.remove("show"); }

const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// ---------- Sparkline (mini line, used on KPI card backs) ----------
function sparkline(values, { w = 140, h = 34, color = "var(--accent)" } = {}) {
  const svg = el("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}` });
  if (!values.length) return svg;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1 || 1);
  const pts = values.map((v, i) => [i * step, h - 4 - ((v - min) / span) * (h - 8)]);
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  svg.appendChild(el("path", { d, fill: "none", stroke: color, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  const last = pts[pts.length - 1];
  svg.appendChild(el("circle", { cx: last[0], cy: last[1], r: 2.6, fill: color }));
  return svg;
}

// ---------- Line chart (one or two series) with hover ----------
function lineChart(container, { labels, series, colors, height = 240, valueFmt = fmtNum, unit = "" }) {
  container.innerHTML = "";
  const w = container.clientWidth || 600, h = height;
  const padL = 46, padR = 14, padT = 16, padB = 28;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const svg = el("svg", { width: "100%", height: h, viewBox: `0 0 ${w} ${h}` });

  const allVals = series.flat();
  const min = Math.min(0, ...allVals), max = Math.max(...allVals) * 1.12;
  const x = i => padL + (innerW * i) / (labels.length - 1 || 1);
  const y = v => padT + innerH - ((v - min) / (max - min || 1)) * innerH;

  // grid
  const gridN = 4;
  for (let i = 0; i <= gridN; i++) {
    const gy = padT + (innerH * i) / gridN;
    svg.appendChild(el("line", { x1: padL, x2: w - padR, y1: gy, y2: gy, class: "axis-line" }));
    const val = max - ((max - min) * i) / gridN;
    const t = el("text", { x: padL - 8, y: gy + 3, "text-anchor": "end" });
    t.textContent = valueFmt(val);
    svg.appendChild(t);
  }
  // x labels (every ~3rd to avoid crowding)
  const step = Math.ceil(labels.length / 8);
  labels.forEach((l, i) => {
    if (i % step !== 0 && i !== labels.length - 1) return;
    const t = el("text", { x: x(i), y: h - 8, "text-anchor": "middle" });
    t.textContent = l;
    svg.appendChild(t);
  });

  series.forEach((s, si) => {
    const d = s.map((v, i) => (i === 0 ? "M" : "L") + x(i).toFixed(1) + "," + y(v).toFixed(1)).join(" ");
    svg.appendChild(el("path", { d, fill: "none", stroke: colors[si], "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  });

  // hover hit areas
  labels.forEach((l, i) => {
    const hit = el("rect", { x: x(i) - innerW / labels.length / 2, y: padT, width: innerW / labels.length, height: innerH, fill: "transparent" });
    hit.addEventListener("mousemove", evt => {
      const lines = series.map((s, si) => `<span style="color:${colors[si]}">●</span> ${valueFmt(s[i])}${unit}`).join("<br>");
      showTip(evt, `<strong>${l}</strong><br>${lines}`);
    });
    hit.addEventListener("mouseleave", hideTip);
    svg.appendChild(hit);
    series.forEach((s, si) => {
      svg.appendChild(el("circle", { cx: x(i), cy: y(s[i]), r: 2.6, fill: colors[si], opacity: 0.9, "pointer-events": "none" }));
    });
  });

  container.appendChild(svg);
}

// ---------- Bar chart (vertical) ----------
function barChart(container, { labels, values, color = "var(--accent)", height = 240, valueFmt = fmtNum, highlight = null }) {
  container.innerHTML = "";
  const w = container.clientWidth || 500, h = height;
  const padL = 50, padR = 14, padT = 16, padB = 46;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const svg = el("svg", { width: "100%", height: h, viewBox: `0 0 ${w} ${h}` });
  const max = Math.max(...values) * 1.15 || 1;
  const bw = innerW / values.length;

  for (let i = 0; i <= 4; i++) {
    const gy = padT + (innerH * i) / 4;
    svg.appendChild(el("line", { x1: padL, x2: w - padR, y1: gy, y2: gy, class: "axis-line" }));
    const t = el("text", { x: padL - 8, y: gy + 3, "text-anchor": "end" });
    t.textContent = valueFmt(max - (max * i) / 4);
    svg.appendChild(t);
  }

  values.forEach((v, i) => {
    const bh = (v / max) * innerH;
    const bx = padL + i * bw + bw * 0.18;
    const bwidth = bw * 0.64;
    const by = padT + innerH - bh;
    const isDim = highlight && highlight.length && !highlight.includes(labels[i]);
    const rect = el("rect", {
      x: bx, y: by, width: bwidth, height: bh, rx: 5,
      fill: color, opacity: isDim ? 0.28 : 1,
    });
    rect.addEventListener("mousemove", evt => showTip(evt, `<strong>${labels[i]}</strong><br>${valueFmt(v)}`));
    rect.addEventListener("mouseleave", hideTip);
    svg.appendChild(rect);
    const t = el("text", { x: bx + bwidth / 2, y: h - padB + 16, "text-anchor": "middle" });
    t.textContent = labels[i].length > 12 ? labels[i].slice(0, 11) + "…" : labels[i];
    svg.appendChild(t);
  });
  container.appendChild(svg);
}

// ---------- Horizontal stacked-style risk bar ----------
function riskBar(container, { labels, values, percentuais, colors, height = 150, valueFmt = fmtBRL }) {
  container.innerHTML = "";
  const w = container.clientWidth || 500, h = height;
  const padL = 110, padR = 60, padT = 10, padB = 10;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const rowH = innerH / labels.length;
  const svg = el("svg", { width: "100%", height: h, viewBox: `0 0 ${w} ${h}` });
  const max = Math.max(...values) * 1.1 || 1;

  labels.forEach((l, i) => {
    const y0 = padT + i * rowH + rowH * 0.22;
    const bh = rowH * 0.56;
    const bw = (values[i] / max) * innerW;
    const rect = el("rect", { x: padL, y: y0, width: bw, height: bh, rx: 5, fill: colors[i] });
    rect.addEventListener("mousemove", evt => showTip(evt, `<strong>${l}</strong><br>${valueFmt(values[i])} · ${percentuais[i].toFixed(2)}%`));
    rect.addEventListener("mouseleave", hideTip);
    svg.appendChild(rect);
    const label = el("text", { x: padL - 10, y: y0 + bh / 2 + 3.5, "text-anchor": "end" });
    label.textContent = l;
    svg.appendChild(label);
    const pctLabel = el("text", { x: padL + bw + 8, y: y0 + bh / 2 + 3.5 });
    pctLabel.textContent = percentuais[i].toFixed(2) + "%";
    svg.appendChild(pctLabel);
  });
  container.appendChild(svg);
}

// ---------- Funnel ----------
function funnelChart(container, { labels, values, color = "var(--primary)", height = 230 }) {
  container.innerHTML = "";
  const w = container.clientWidth || 500, h = height;
  const padT = 10, padB = 10, padX = 40;
  const rowH = (h - padT - padB) / labels.length;
  const max = values[0] || 1;
  const svg = el("svg", { width: "100%", height: h, viewBox: `0 0 ${w} ${h}` });

  labels.forEach((l, i) => {
    const wTop = ((values[i] / max) * (w - padX * 2));
    const wBot = i === labels.length - 1 ? wTop : ((values[i + 1] / max) * (w - padX * 2));
    const y0 = padT + i * rowH, y1 = y0 + rowH * 0.86;
    const cx = w / 2;
    const x0a = cx - wTop / 2, x0b = cx + wTop / 2, x1a = cx - wBot / 2, x1b = cx + wBot / 2;
    const path = `M ${x0a},${y0} L ${x0b},${y0} L ${x1b},${y1} L ${x1a},${y1} Z`;
    const alpha = 1 - i * 0.13;
    const shape = el("path", { d: path, fill: color, opacity: Math.max(alpha, 0.35) });
    shape.addEventListener("mousemove", evt => showTip(evt, `<strong>${l}</strong><br>${fmtNum(values[i])} operações`));
    shape.addEventListener("mouseleave", hideTip);
    svg.appendChild(shape);
    const t = el("text", { x: cx, y: (y0 + y1) / 2 + 4, "text-anchor": "middle", fill: "#fff", style: "font-size:11.5px;font-weight:600" });
    t.textContent = `${l} · ${fmtNum(values[i])}`;
    svg.appendChild(t);
  });
  container.appendChild(svg);
}
