// Vista Historial: consulta filtrable de todas las mediciones + exportación.
import { esc, estadoHTML, fFecha, fNum } from '../ui/formato.js';
import { descargar } from '../almacen.js';

const filtros = { zona: '', punto: '', desde: '', hasta: '', estado: '', inspector: '', marcados: false, texto: '' };

export function render(root, app) {
  const A = app.A; const cfg = app.cfg;
  app.migas([{ t: 'Flota', h: '#/flota' }, { t: `Equipo ${A.modelo.equipo.id}`, h: `#/equipo/${A.modelo.equipo.id}` }, { t: 'Historial' }]);
  const inspPorId = Object.fromEntries(A.inspecciones.map((i) => [i.id, i]));
  const filas = Object.values(A.puntos).flatMap((a) => a.registros.map((r) => ({ ...r, zonaId: a.punto.zonaId, inspector: inspPorId[r.inspeccionId]?.inspector ?? '' })))
    .sort((x, y) => (x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : x.codigo < y.codigo ? -1 : 1));
  const inspectores = [...new Set(A.inspecciones.map((i) => i.inspector))].sort();
  const appInsp = app.store.agregados.inspecciones;

  root.innerHTML = `
  <div class="cabecera"><div><h1>Historial de inspecciones</h1><p>${A.inspecciones.length} inspecciones · ${filas.length} mediciones. Filtre por zona, punto, fecha, estado o inspector; clic en una fila abre el punto.</p></div>
    <div class="fila no-print">
      <button class="btn prim" id="bXlsx" title="Mismo formato de hojas que el Excel original (Léame, Historial, Puntos) + hoja Calidad">Exportar Excel</button>
      <button class="btn" id="bCsv">CSV (filtro actual)</button>
      <button class="btn" id="bJson" title="Incluye inspecciones registradas, fotos y decisiones de calidad">Respaldo JSON</button>
      <label class="btn">Importar respaldo<input type="file" accept=".json" id="fJson" hidden></label>
    </div></div>
  ${appInsp.length ? `<div class="panel" style="margin-bottom:16px"><h3>Inspecciones registradas en la plataforma</h3>
    <table><thead><tr><th>Fecha</th><th class="n">Horas</th><th>Inspector</th><th>Observaciones</th><th></th></tr></thead><tbody>
    ${[...appInsp].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).map((i) => `<tr><td>${fFecha(i.fecha)}</td><td class="n">${fNum(i.horas, 1)}</td><td>${esc(i.inspector)}</td><td><small>${esc(i.observaciones || '')}</small></td>
      <td class="no-print" style="text-align:right"><a class="btn chico" href="#/registrar/${i.fecha}">Editar</a> <button class="btn chico peligro" data-del="${esc(i.id)}">Eliminar</button></td></tr>`).join('')}
    </tbody></table></div>` : ''}
  <div class="panel no-print">
    <div class="rejilla c4" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      <label class="campo">Zona<select id="fz"><option value="">Todas</option>${Object.entries(cfg.zonas).map(([k, z]) => `<option value="${k}">${esc(z.nombre)}</option>`).join('')}</select></label>
      <label class="campo">Punto<select id="fp"><option value="">Todos</option>${Object.keys(A.puntos).map((c) => `<option>${c}</option>`).join('')}</select></label>
      <label class="campo">Desde<input type="date" id="fd"></label>
      <label class="campo">Hasta<input type="date" id="fh"></label>
      <label class="campo">Estado<select id="fe"><option value="">Todos</option>${['Normal', 'Alerta', 'Crítico', 'N/I'].map((e) => `<option>${e}</option>`).join('')}</select></label>
      <label class="campo">Inspector<select id="fi"><option value="">Todos</option>${inspectores.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>
      <label class="campo">Buscar en comentarios<input type="text" id="ft" placeholder="p. ej. repar"></label>
      <label class="campo">&nbsp;<span class="fila" style="gap:6px"><input type="checkbox" id="fm"> Solo eventos / datos marcados</span></label>
    </div>
  </div>
  <div class="espacio"></div>
  <div class="panel"><div class="fila entre"><b id="cuenta"></b><button class="btn chico no-print" id="bLimpiar">Limpiar filtros</button></div>
    <div class="tabla-wrap" style="max-height:70vh"><table>
      <thead><tr><th>Fecha</th><th class="n">Horas</th><th>Inspector</th><th>Zona</th><th>Código</th><th class="n">L (mm)</th><th>Estado</th><th>Evento / calidad</th><th>Comentario</th><th class="n">Fotos</th></tr></thead>
      <tbody id="tb"></tbody></table></div></div>`;

  const $ = (id) => root.querySelector('#' + id);
  const ctrl = { zona: $('fz'), punto: $('fp'), desde: $('fd'), hasta: $('fh'), estado: $('fe'), inspector: $('fi'), texto: $('ft'), marcados: $('fm') };
  for (const [k, c] of Object.entries(ctrl)) { if (c.type === 'checkbox') c.checked = filtros[k]; else c.value = filtros[k]; }

  let visibles = [];
  function pintar() {
    for (const [k, c] of Object.entries(ctrl)) filtros[k] = c.type === 'checkbox' ? c.checked : c.value;
    const t = filtros.texto.toLowerCase();
    visibles = filas.filter((r) => (!filtros.zona || r.zonaId === filtros.zona) && (!filtros.punto || r.codigo === filtros.punto)
      && (!filtros.desde || r.fecha >= filtros.desde) && (!filtros.hasta || r.fecha <= filtros.hasta) && (!filtros.estado || r.estado === filtros.estado)
      && (!filtros.inspector || r.inspector === filtros.inspector) && (!t || (r.comentario || '').toLowerCase().includes(t)) && (!filtros.marcados || r.evento || r.calidad));
    $('cuenta').textContent = `${visibles.length} mediciones`;
    $('tb').innerHTML = visibles.slice(0, 600).map((r) => `<tr class="clic ${r.excluido ? 'fila-sosp' : ''}" data-h="#/punto/${r.codigo}"><td>${fFecha(r.fecha)}</td><td class="n">${fNum(r.horas, 1)}</td><td>${esc(r.inspector)}</td><td>${esc(cfg.zonas[r.zonaId].corto)}</td><td><b>${r.codigo}</b></td>
      <td class="n">${r.L === null ? 'N/I' : r.L}${r.decision === 'corregir' ? ` → ${r.Lef}` : ''}</td><td>${estadoHTML(r.estado, r.excluido)}</td>
      <td>${r.evento ? `<span class="chip rep">${r.evento === 'cambio' ? 'Cambio' : 'Reparación'}</span> ` : ''}${r.calidad ? `<span class="chip ${r.calidad.sospechoso ? 'violeta' : ''}" title="${esc(r.calidad.motivo)}">${r.calidad.sospechoso ? 'Sospechoso' : 'Variación'}${r.decision ? ' · ' + r.decision : ''}</span>` : ''}${r.origen === 'app' ? ' <span class="chip">App</span>' : ''}</td>
      <td><small>${esc(r.comentario)}</small></td><td class="n">${(r.imagenes || []).filter((x) => !/\.png$/i.test(x)).length || ''}</td></tr>`).join('')
      + (visibles.length > 600 ? `<tr><td colspan="10" class="tenue">… ${visibles.length - 600} filas más; refine el filtro.</td></tr>` : '');
  }
  Object.values(ctrl).forEach((c) => c.addEventListener('input', pintar));
  $('tb').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-h]'); if (tr) app.ir(tr.dataset.h); });
  $('bLimpiar').addEventListener('click', () => { Object.keys(filtros).forEach((k) => { filtros[k] = typeof filtros[k] === 'boolean' ? false : ''; }); app.render(); });
  pintar();

  $('bXlsx').addEventListener('click', () => app.exportarExcel());
  $('bJson').addEventListener('click', () => app.exportarRespaldo());
  $('fJson').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { await app.importarRespaldo(f); } catch (err) { app.toast(err.message, true); } });
  $('bCsv').addEventListener('click', () => {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const csv = ['Fecha;Horas;Inspector;Zona;Código;L (mm);L usada;Estado;Evento;Calidad;Comentario',
      ...visibles.map((r) => [r.fecha, r.horas, r.inspector, cfg.zonas[r.zonaId].nombre, r.codigo, r.L ?? '', r.Lef ?? '', r.estado, r.evento ?? '', r.calidad?.tipo ?? '', r.comentario].map(q).join(';'))].join('\r\n');
    descargar('EX3600_historial_filtrado.csv', '﻿' + csv, 'text/csv;charset=utf-8');
  });
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.del; const i = appInsp.find((x) => x.id === id);
    if (!confirm(`¿Eliminar la inspección del ${fFecha(i.fecha)} registrada en la plataforma? Si reemplazaba datos del Excel, se vuelve a los valores originales.`)) return;
    const ag = app.store.agregados;
    ag.inspecciones = ag.inspecciones.filter((x) => x.id !== id);
    const ids = new Set(ag.mediciones.filter((m) => m.inspeccionId === id).map((m) => m.id));
    ag.mediciones = ag.mediciones.filter((m) => m.inspeccionId !== id);
    app.store.fotos = (app.store.fotos || []).filter((f) => !ids.has(f.medicionId));
    app.guardar(); app.recalcular(); app.render(); app.toast('Inspección eliminada.');
  }));
}
