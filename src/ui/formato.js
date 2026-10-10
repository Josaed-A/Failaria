// Utilidades de presentación (sin lógica de negocio).

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'aaaa-mm-dd' → 'dd-mmm-aaaa' */
export function fFecha(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}-${MESES[+m - 1]}-${a}`;
}
export const fMes = (iso) => (iso ? `${MESES[+iso.slice(5, 7) - 1]}-${iso.slice(2, 4)}` : '—');
export const ts = (iso) => Date.parse(iso + 'T00:00:00Z');
export const isoDeTs = (t) => new Date(t).toISOString().slice(0, 10);

export function fNum(x, dec = 0) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return x.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
export const fH = (h) => (Number.isFinite(h) ? `${fNum(h)} h` : '—');
export const fMm = (L) => (L === null || L === undefined ? 'N/I' : `${fNum(L)} mm`);
export const fPct = (x) => `${fNum(x * 100, 1)} %`;
export const fTasa = (t) => (t === null || t === undefined || !Number.isFinite(t) ? '—' : `${fNum(t)} mm/1000 h`);

/** Horas restantes → texto con días aproximados. */
export function fRestante(h, util) {
  if (!Number.isFinite(h)) return 'sin crecimiento';
  if (h <= 0) return 'ya superado';
  const d = h / util;
  return `${fNum(h)} h (≈ ${d >= 60 ? fNum(d / 30.4, 1) + ' meses' : fNum(d) + ' días'})`;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const claseEstado = (e) => 'e-' + (e === 'N/I' ? 'NI' : e);
export const estadoHTML = (e, sosp = false) => `<span class="estado ${claseEstado(e)}${sosp ? ' sosp' : ''}">${esc(e)}</span>`;
export const sevHTML = (s) => `<span class="sev sev-${s}">${{ critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja', info: 'Info' }[s] ?? s}</span>`;

export const COLOR = { Normal: '#2e9e5b', Alerta: '#e0a020', 'Crítico': '#d64545', 'N/I': '#7a8599', sospechoso: '#9b6bd6' };

// En la versión entregable (un solo archivo HTML, ver herramientas/empaquetar.mjs) las imágenes van
// embebidas en window.__RECURSOS como data URL (el historial va aparte, ya leído, en window.__DATOS);
// en el sitio normal se usa la ruta relativa.
export const recurso = (ruta) => (typeof window !== 'undefined' && window.__RECURSOS?.[ruta]) || ruta;

export function rutaImagen(img, cfg) {
  if (!img) return '';
  if (img.startsWith('data:')) return img;
  if (img.includes('/')) return recurso(img);
  return recurso((/\.(png)$/i.test(img) && Object.values(cfg.zonas).some((z) => z.esquema === img) ? cfg.esquemasDir : cfg.fotosDir) + img);
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
