// Gráficos de tendencia con Chart.js (global) + plugin de anotaciones (bandas Caution/Danger, reparaciones).
import { COLOR, fFecha, fH, fMes, fNum, isoDeTs, ts } from './formato.js';

const Chart = window.Chart;
if (Chart && window['chartjs-plugin-annotation']) Chart.register(window['chartjs-plugin-annotation']);
if (Chart) {
  Chart.defaults.color = '#a9b4c6';
  Chart.defaults.borderColor = 'rgba(38,51,73,.7)';
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
}

const alfa = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const enImpresion = () => window.matchMedia?.('print').matches;

function bandas(p, yMax) {
  return {
    bNormal: { type: 'box', yMin: 0, yMax: p.caution, backgroundColor: alfa(COLOR.Normal, 0.07), borderWidth: 0, drawTime: 'beforeDatasetsDraw' },
    bAlerta: { type: 'box', yMin: p.caution, yMax: p.danger, backgroundColor: alfa(COLOR.Alerta, 0.11), borderWidth: 0, drawTime: 'beforeDatasetsDraw' },
    bCritico: { type: 'box', yMin: p.danger, yMax: yMax, backgroundColor: alfa(COLOR['Crítico'], 0.12), borderWidth: 0, drawTime: 'beforeDatasetsDraw' },
    lCaution: { type: 'line', yMin: p.caution, yMax: p.caution, borderColor: COLOR.Alerta, borderWidth: 1.5, borderDash: [6, 4], label: { display: true, content: `Caution ${p.caution} mm`, position: 'start', backgroundColor: 'rgba(12,19,32,.85)', color: '#f2bd4c', font: { size: 11 }, padding: 3 } },
    lDanger: { type: 'line', yMin: p.danger, yMax: p.danger, borderColor: COLOR['Crítico'], borderWidth: 1.5, borderDash: [6, 4], label: { display: true, content: `Danger ${p.danger} mm`, position: 'start', backgroundColor: 'rgba(12,19,32,.85)', color: '#ff8080', font: { size: 11 }, padding: 3 } },
  };
}

/**
 * Tendencia de un punto: L vs fecha u horas, bandas de estado, reparaciones, datos sospechosos y proyección.
 * @param {HTMLCanvasElement} canvas
 * @param {object} a análisis del punto (reglas.analizarPunto + proyeccion)
 * @param {object} A análisis del equipo (para convertir horas ↔ fechas)
 * @param {{eje:'fecha'|'horas', proyeccion:boolean, sim?:number}} op
 */
export function graficoTendencia(canvas, a, A, op = {}) {
  const eje = op.eje || 'fecha';
  const p = a.punto;
  const X = (r) => (eje === 'fecha' ? ts(r.fecha) : r.horas);
  const XdeH = (h) => (eje === 'fecha' ? ts(A.fechaDeHoras(h)) : h);

  const validos = a.registros.filter((r) => r.Lef !== null && r.Lef !== undefined && !r.excluido);
  const datos = validos.map((r) => ({ x: X(r), y: r.Lef, r }));
  const sosp = a.registros.filter((r) => r.excluido).map((r) => ({ x: X(r), y: r.L, r }));
  const ni = a.registros.filter((r) => (r.Lef === null || r.Lef === undefined) && !r.excluido).map((r) => ({ x: X(r), y: 0, r }));

  // Proyección del ciclo actual.
  const t = a.tendencia;
  const proy = []; const lo = []; const hi = [];
  let xMaxProy = null;
  if (op.proyeccion !== false && t.proyectar && t.tasa1000 > 0) {
    const hD = a.proyeccion.hDanger;
    const horizonte = Math.max(Math.min((Number.isFinite(hD) ? hD - t.h0 : 0) + A.intervalo, 5000), op.sim || 0, 3 * A.intervalo);
    const pasos = 24;
    for (let i = 0; i <= pasos; i++) {
      const h = t.h0 + (horizonte * i) / pasos;
      const v = t.proyectar(h);
      proy.push({ x: XdeH(h), y: v.L }); lo.push({ x: XdeH(h), y: v.lo }); hi.push({ x: XdeH(h), y: v.hi });
    }
    xMaxProy = proy.at(-1).x;
  }

  const maxL = Math.max(p.danger, ...datos.map((d) => d.y), ...sosp.map((d) => d.y), ...proy.slice(0, 13).map((d) => d.y));
  const yMax = Math.ceil((maxL * 1.12) / 50) * 50;

  const anot = bandas(p, yMax);
  a.registros.filter((r) => r.evento).forEach((r, i) => {
    anot['ev' + i] = {
      type: 'line', xMin: X(r), xMax: X(r), borderColor: r.evento === 'cambio' ? '#8fc1f0' : '#4aa3df', borderWidth: 1.5, borderDash: [3, 3],
      label: { display: true, content: r.evento === 'cambio' ? 'Cambio' : r.eventoNoDocumentado ? 'Rep.?' : 'Reparación', position: 'end', rotation: -90, backgroundColor: 'rgba(12,19,32,.8)', color: '#8fc1f0', font: { size: 10 }, padding: 2 },
    };
  });
  if (op.sim) {
    const xs = XdeH(A.horasActuales + op.sim);
    anot.sim = { type: 'line', xMin: xs, xMax: xs, borderColor: '#c7a8f0', borderWidth: 2, label: { display: true, content: `Simulación +${fNum(op.sim)} h`, position: 'start', backgroundColor: 'rgba(155,107,214,.85)', color: '#fff', font: { size: 11 } } };
  }
  const xHoy = XdeH(A.horasActuales);
  anot.hoy = { type: 'line', xMin: xHoy, xMax: xHoy, borderColor: 'rgba(230,235,243,.35)', borderWidth: 1, label: { display: true, content: 'Últ. inspección', position: 'end', backgroundColor: 'rgba(12,19,32,.8)', color: '#a9b4c6', font: { size: 10 } } };

  const colorPunto = (ctx) => COLOR[ctx.raw?.r ? (ctx.raw.r.estado) : 'Normal'] || '#4aa3df';
  const fmtX = (v) => (eje === 'fecha' ? fMes(isoDeTs(v)) : fNum(v));

  const datasets = [
    {
      label: 'Longitud medida (mm)', data: datos, borderColor: '#9fb3cc', borderWidth: 2, tension: 0,
      pointRadius: 5, pointHoverRadius: 7, pointBackgroundColor: colorPunto, pointBorderColor: '#0c1320', pointBorderWidth: 1.5,
      segment: { borderDash: (s) => (s.p1.raw?.r?.evento ? [4, 4] : undefined), borderColor: (s) => (s.p1.raw?.r?.evento ? 'rgba(74,163,223,.6)' : undefined) },
      order: 1,
    },
    { label: 'Dato sospechoso (excluido)', data: sosp, showLine: false, pointStyle: 'rectRot', pointRadius: 8, pointHoverRadius: 10, pointBackgroundColor: alfa(COLOR.sospechoso, 0.35), pointBorderColor: COLOR.sospechoso, pointBorderWidth: 2, order: 0 },
    { label: 'No inspeccionado (N/I)', data: ni, showLine: false, pointStyle: 'triangle', pointRadius: 6, pointBackgroundColor: COLOR['N/I'], pointBorderColor: '#0c1320', order: 0 },
  ];
  if (proy.length) {
    datasets.push(
      { label: 'Banda de incertidumbre', data: hi, borderWidth: 0, pointRadius: 0, fill: '+1', backgroundColor: 'rgba(199,168,240,.13)', order: 3 },
      { label: '_lo', data: lo, borderWidth: 0, pointRadius: 0, fill: false, order: 3 },
      { label: `Proyección (${t.modelo || 'lineal'})`, data: proy, borderColor: '#c7a8f0', borderDash: [7, 5], borderWidth: 2, pointRadius: 0, order: 2 },
    );
  }

  const xs = [...datos, ...sosp, ...ni].map((d) => d.x);
  const ch = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: enImpresion() ? false : { duration: 300 },
      parsing: false, normalized: true,
      interaction: { mode: 'nearest', intersect: false, axis: 'x' },
      scales: {
        x: { type: 'linear', min: Math.min(...xs), max: Math.max(xMaxProy ?? -Infinity, ...xs), ticks: { callback: fmtX, maxRotation: 0, autoSkipPadding: 18 }, title: { display: true, text: eje === 'fecha' ? 'Fecha' : 'Horas de horómetro (h)' }, grid: { color: 'rgba(38,51,73,.45)' } },
        y: { min: 0, max: yMax, title: { display: true, text: 'Longitud de grieta L (mm)' }, grid: { color: 'rgba(38,51,73,.45)' } },
      },
      plugins: {
        legend: { labels: { filter: (it) => !it.text.startsWith('_') && (it.datasetIndex !== 1 || sosp.length) && (it.datasetIndex !== 2 || ni.length), usePointStyle: true, boxHeight: 8 } },
        annotation: { annotations: anot },
        tooltip: {
          callbacks: {
            title: (it) => { const r = it[0]?.raw?.r; return r ? `${fFecha(r.fecha)} · ${fH(r.horas)}` : (eje === 'fecha' ? fFecha(isoDeTs(it[0].raw.x)) : fH(it[0].raw.x)); },
            label: (it) => {
              const r = it.raw.r;
              if (!r) return `${it.dataset.label}: ${fNum(it.raw.y)} mm`;
              if (it.datasetIndex === 2) return 'No inspeccionado (N/I)';
              const base = `L = ${fNum(it.datasetIndex === 1 ? r.L : r.Lef)} mm · ${r.estado}`;
              return [base, r.excluido ? 'Dato sospechoso, excluido de la tendencia' : null, r.decision === 'corregir' ? `Corregido (original ${r.L} mm)` : null, r.evento ? (r.evento === 'cambio' ? 'Cambio de componente' : 'Reparación') : null, r.comentario || null].filter(Boolean);
            },
          },
        },
      },
      onClick: op.onClick ? (e, els) => { const el = els[0]; if (el) { const r = ch.data.datasets[el.datasetIndex].data[el.index]?.r; if (r) op.onClick(r); } } : undefined,
    },
  });
  return ch;
}

/** Mini-tendencia (sparkline) del ciclo completo con líneas de umbral. */
export function graficoMini(canvas, a) {
  const p = a.punto;
  const v = a.registros.filter((r) => r.Lef !== null && r.Lef !== undefined && !r.excluido);
  const maxL = Math.max(p.caution * 1.1, ...v.map((r) => r.Lef));
  return new Chart(canvas, {
    type: 'line',
    data: { datasets: [{ data: v.map((r) => ({ x: r.horas, y: r.Lef, r })), borderColor: '#9fb3cc', borderWidth: 1.5, pointRadius: 2.5, pointBackgroundColor: (c) => COLOR[c.raw?.r?.estado] || '#9fb3cc', pointBorderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
      scales: { x: { type: 'linear', display: false }, y: { min: 0, max: Math.ceil(maxL * 1.1), display: true, ticks: { maxTicksLimit: 3, font: { size: 9 } }, grid: { display: false } } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: (it) => fFecha(it[0].raw.r.fecha), label: (it) => `${it.raw.y} mm` } },
        annotation: { annotations: {
          c: { type: 'line', yMin: p.caution, yMax: p.caution, borderColor: COLOR.Alerta, borderWidth: 1, borderDash: [4, 3] },
          d: p.danger <= maxL * 1.1 ? { type: 'line', yMin: p.danger, yMax: p.danger, borderColor: COLOR['Crítico'], borderWidth: 1, borderDash: [4, 3] } : undefined,
        } },
      },
    },
  });
}

/** Barras horizontales simples (KPI por zona). */
export function graficoBarras(canvas, etiquetas, valores, op = {}) {
  return new Chart(canvas, {
    type: 'bar',
    data: { labels: etiquetas, datasets: [{ data: valores, backgroundColor: op.color || '#4aa3df', borderRadius: 4, barThickness: 16 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (it) => `${fNum(it.raw, op.dec || 0)} ${op.unidad || ''}` } } },
      scales: { x: { beginAtZero: true, title: { display: !!op.titulo, text: op.titulo } }, y: { grid: { display: false } } },
    },
  });
}
