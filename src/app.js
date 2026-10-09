// Shell de la aplicación: carga de datos, estado global, router por hash y migas de pan.
import { CONFIG } from './config.js';
import { leerLibro, fusionar, exportarLibro } from './datos.js';
import { analizar, historialAlertas } from './reglas.js';
import * as almacen from './almacen.js';
import { esc } from './ui/formato.js';

import * as vFlota from './vistas/flota.js';
import * as vEquipo from './vistas/equipo.js';
import * as vZona from './vistas/zona.js';
import * as vPunto from './vistas/punto.js';
import * as vRegistrar from './vistas/registrar.js';
import * as vHistorial from './vistas/historial.js';
import * as vAlertas from './vistas/alertas.js';
import * as vCalidad from './vistas/calidad.js';
import * as vReporte from './vistas/reporte.js';
import * as vIA from './vistas/ia.js';

window.__appLista = true;

const RUTAS = { flota: vFlota, equipo: vEquipo, zona: vZona, punto: vPunto, registrar: vRegistrar, historial: vHistorial, alertas: vAlertas, calidad: vCalidad, reporte: vReporte, ia: vIA };

export const app = {
  cfg: CONFIG,
  base: null,          // modelo leído del Excel
  store: null,         // datos persistidos (agregados, decisiones, ia)
  modelo: null,        // base + agregados
  A: null,             // análisis vigente
  sim: { dh: 0 },      // estado del simulador (compartido entre vistas)
  _limpiezas: [],
  _historial: null,

  alLimpiar(fn) { this._limpiezas.push(fn); },

  recalcular() {
    this.modelo = fusionar(this.base, this.store.agregados);
    // Fotos agregadas desde la plataforma (N fotos por punto y fecha).
    const porId = new Map(this.modelo.mediciones.map((m) => [m.id, m]));
    (this.store.fotos || []).forEach((f) => { const m = porId.get(f.medicionId); if (m && !m.imagenes.includes(f.src)) m.imagenes.push(f.src); });
    this.A = analizar(this.modelo, this.cfg, this.store.decisiones);
    this._historial = null;
    actualizarBadges();
  },
  historial() {
    if (!this._historial) this._historial = historialAlertas(this.modelo, this.cfg, this.store.decisiones);
    return this._historial;
  },
  guardar() {
    const err = almacen.guardar(this.cfg.storageKey, this.store);
    if (err) this.toast(err, true);
    return !err;
  },
  toast(msg, error = false) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast ver' + (error ? ' error' : '');
    clearTimeout(t._h); t._h = setTimeout(() => { t.className = 'toast'; }, error ? 6000 : 3500);
  },
  migas(items) {
    document.getElementById('migas').innerHTML = items.map((x, i) => (i < items.length - 1 && x.h ? `<a href="${x.h}">${esc(x.t)}</a>` : `<span>${esc(x.t)}</span>`)).join('<span class="sep">›</span>');
  },
  ir(hash) { location.hash = hash; },

  exportarExcel() {
    const wb = exportarLibro(window.XLSX, this.modelo, { calidad: this.A.calidad, decisiones: this.store.decisiones });
    window.XLSX.writeFile(wb, `EX3600_historial_grietas_${this.A.ultimaInsp.fecha}.xlsx`);
  },
  exportarRespaldo() {
    almacen.descargar(`respaldo_ex3600_${new Date().toISOString().slice(0, 10)}.json`, almacen.respaldoJSON({ ...this.store, base: this.store.base }), 'application/json');
  },
  async importarRespaldo(file) {
    const d = almacen.leerRespaldo(await file.text());
    this.store = d;
    if (d.base) this.base = d.base;
    this.guardar(); this.recalcular(); render();
    this.toast('Respaldo importado.');
  },
  async cargarExcel(file) {
    const buf = await file.arrayBuffer();
    const m = leerLibro(window.XLSX, new Uint8Array(buf), this.cfg);
    this.base = m; this.store.base = m;
    this.guardar(); this.recalcular();
    this.toast(`Excel cargado: ${m.inspecciones.length} inspecciones, ${m.mediciones.length} mediciones.${m.avisos.length ? ' Avisos: ' + m.avisos.length : ''}`);
    render();
  },
  async restaurarExcelRepo() {
    this.store.base = null; this.guardar();
    this.base = await leerExcelRepo(); this.recalcular(); render();
    this.toast('Se usa nuevamente el Excel del repositorio.');
  },
  pedirExcel() { document.getElementById('archivoExcel').click(); },
};
window.app = app; // útil para depurar desde la consola

async function leerExcelRepo() {
  const r = await fetch(CONFIG.excelRuta, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`No se encontró ${CONFIG.excelRuta} (${r.status})`);
  return leerLibro(window.XLSX, new Uint8Array(await r.arrayBuffer()), CONFIG);
}

function actualizarBadges() {
  const n = app.A.alertas.filter((a) => ['critica', 'alta', 'media'].includes(a.severidad)).length;
  const crit = app.A.alertas.some((a) => a.severidad === 'critica');
  const b = document.getElementById('badgeAlertas');
  b.hidden = !n; b.textContent = n; b.style.background = crit ? 'var(--critico)' : 'var(--alerta)'; b.style.color = crit ? '#fff' : '#111';
  const q = app.A.kpis.sospechososPendientes;
  const c = document.getElementById('badgeCalidad'); c.hidden = !q; c.textContent = q;
}

function parsear() {
  const partes = (location.hash || '#/flota').replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { ruta: RUTAS[partes[0]] ? partes[0] : 'flota', params: partes.slice(1) };
}

function render() {
  app._limpiezas.splice(0).forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
  const { ruta, params } = parsear();
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('activo', a.dataset.r === ruta || (ruta === 'zona' || ruta === 'punto') && a.dataset.r === 'equipo'));
  document.getElementById('nav').classList.remove('abierto');
  const root = document.getElementById('vista');
  if (!app.A) return;
  try {
    root.innerHTML = '';
    RUTAS[ruta].render(root, app, params);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="aviso rojo"><b>Error al mostrar la vista.</b><br>${esc(e.message)}</div>`;
  }
  window.scrollTo(0, 0);
}
app.render = render;

function pantallaSinDatos(err) {
  document.getElementById('vista').innerHTML = `
    <div class="panel" style="max-width:640px;margin:40px auto;text-align:center">
      <h2>Cargar historial de inspecciones</h2>
      <p class="tenue">No se pudo leer automáticamente <code>${esc(CONFIG.excelRuta)}</code>${err ? ` (${esc(err.message)})` : ''}.</p>
      <p>Seleccione el archivo <b>EX3600_historial_grietas.xlsx</b> (hojas Historial y Puntos):</p>
      <button class="btn prim" onclick="app.pedirExcel()">Cargar Excel…</button>
    </div>`;
  app.migas([{ t: 'Inicio' }]);
}

async function iniciar() {
  document.getElementById('menuBtn').addEventListener('click', (e) => {
    const n = document.getElementById('nav'); n.classList.toggle('abierto'); e.currentTarget.setAttribute('aria-expanded', n.classList.contains('abierto'));
  });
  document.getElementById('archivoExcel').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { await app.cargarExcel(f); } catch (err) { console.error(err); app.toast('No se pudo leer el Excel: ' + err.message, true); }
  });
  app.store = almacen.cargar(CONFIG.storageKey);
  window.addEventListener('hashchange', render);
  try {
    app.base = app.store.base || await leerExcelRepo();
  } catch (err) {
    console.warn(err);
    pantallaSinDatos(err);
    return;
  }
  app.recalcular();
  render();
}

iniciar();
