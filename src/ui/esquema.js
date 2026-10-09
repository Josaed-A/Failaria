// Esquema de zona con hotspots clicables coloreados por estado (actual o simulado).
import { COLOR, esc, fMm, recurso } from './formato.js';

/**
 * @param {string} zonaId 'BM' | 'BR' | 'CU'
 * @param {object} A análisis del equipo
 * @param {{sim?: object, etiquetas?: boolean}} op  sim = resultado de reglas.simular()
 */
export function esquemaHTML(zonaId, A, op = {}) {
  const cfg = A.cfg;
  const z = cfg.zonas[zonaId];
  const ps = Object.values(A.puntos).filter((a) => a.punto.zonaId === zonaId);
  const hots = ps.map((a) => {
    const h = a.punto.hotspot || cfg.hotspots[a.codigo];
    if (!h) return '';
    const lado = h.etq || cfg.hotspots[a.codigo]?.etq;
    const s = op.sim?.puntos[a.codigo];
    const estado = s ? s.estado : a.estadoActual;
    const L = s ? s.L : a.ultimoValido?.Lef;
    const pulso = estado === 'Crítico' || estado === 'Alerta';
    const tit = `${a.codigo} · ${a.punto.descripcion}\n${s ? 'Proyectado' : 'Último'}: ${fMm(L)} · ${estado}${a.niUltima && !s ? ' (N/I en la última inspección)' : ''}`;
    return `<a class="hot${pulso ? ' pulso' : ''}${a.pendientes.length ? ' sosp' : ''}" href="#/punto/${a.codigo}" style="left:${h.x * 100}%;top:${h.y * 100}%;background:${COLOR[estado]}" title="${esc(tit)}" aria-label="${esc(tit)}">${a.codigo.slice(3)}${op.etiquetas !== false ? `<span class="etq${lado ? ' etq-' + lado : ''}">${a.codigo} · ${L === null || L === undefined ? 'N/I' : L + ' mm'}</span>` : ''}</a>`;
  }).join('');
  return `<div class="esquema"><img src="${recurso(cfg.esquemasDir + z.esquema)}" alt="Esquema ${esc(z.nombre)} con la ubicación de los puntos de inspección">${hots}</div>`;
}
