// Planificación y programación de mantenimiento: tablero tipo Trello + calendario de tareas.
import { COLUMNAS, TIPOS, PRIORIDADES, nuevaTarea, validarTarea, mover, vencida, progreso, sugerir, agenda, porDia, tareasCSV, kpisTareas } from '../tareas.js';
import { descargar } from '../almacen.js';
import { esc, fFecha, fNum } from '../ui/formato.js';
import { info } from '../ui/ayuda.js';

let modo = 'tablero'; let mesSel = null; let filtroTexto = '';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function render(root, app) {
  const A = app.A; const cfg = app.cfg;
  app.migas([{ t: 'Flota', h: '#/flota' }, { t: `Equipo ${A.modelo.equipo.id}`, h: `#/equipo/${A.modelo.equipo.id}` }, { t: 'Planificación' }]);
  app.store.tareas = app.store.tareas || [];
  const hoy = new Date().toISOString().slice(0, 10);
  if (!mesSel) { const prox = (app.store.tareas || []).filter((t) => t.estado !== 'hecha' && t.fecha && t.fecha >= hoy).map((t) => t.fecha).sort()[0]; mesSel = (prox || hoy).slice(0, 7); }
  const tareas = () => app.store.tareas;
  const guardar = () => { app.guardar(); app.actualizarBadges?.(); };
  const k = kpisTareas(tareas(), hoy); const ag = agenda(tareas(), hoy);
  const sug = sugerir(A, tareas(), hoy);

  root.innerHTML = `
  <div class="cabecera">
    <div><h1>Planificación de mantenimiento ${info(`<p><b>Qué es.</b> Un tablero de tareas (como Trello) y un calendario para llevar a cabo lo que la plataforma recomienda: reparaciones, inspecciones adicionales, re-mediciones, fotos y paradas.</p><p><b>Flujo:</b> Por planificar → Programada (fecha y responsable) → En ejecución → Hecha. Arrastre las tarjetas entre columnas o use las flechas; en tablet las flechas son más cómodas.</p><p><b>Sugerir tareas</b> crea tarjetas desde el plan priorizado, la próxima parada y las alertas vigentes (sin duplicar las ya creadas). También puede crear tareas manuales.</p><p>Las tareas se guardan en este navegador y viajan en el respaldo JSON; exporte CSV para compartirlas.</p>`)}</h1>
      <p>${k.pendientes} pendientes · <span style="color:${k.vencidas ? '#ff8080' : 'inherit'}">${k.vencidas} vencidas</span> · ${k.altas} de prioridad alta · ${k.hechas} hechas</p></div>
    <div class="fila no-print">
      <div class="seg"><button data-m="tablero" class="${modo === 'tablero' ? 'on' : ''}">Tablero</button><button data-m="calendario" class="${modo === 'calendario' ? 'on' : ''}">Calendario</button><button data-m="lista" class="${modo === 'lista' ? 'on' : ''}">Lista</button></div>
      <button class="btn" id="bSugerir" ${sug.length ? '' : 'disabled'} title="${sug.length ? sug.map((t) => t.titulo).join('\\n') : 'No hay sugerencias nuevas'}">Sugerir tareas${sug.length ? ` (${sug.length})` : ''}</button>
      <button class="btn prim" id="bNueva">+ Nueva tarea</button>
      <button class="btn" id="bCsv">CSV</button><button class="btn" id="bPrint">Imprimir</button>
    </div>
  </div>
  ${ag.vencidas.length ? `<div class="aviso rojo"><b>${ag.vencidas.length} tarea(s) vencida(s):</b> ${ag.vencidas.map((t) => `<a href="#" data-abrir="${t.id}">${esc(t.titulo)}</a> (${fFecha(t.fecha)})`).join(' · ')}</div>` : ''}
  <div id="cuerpo"></div>
  <dialog id="dlg" class="dlg"></dialog>`;

  const $ = (id) => root.querySelector('#' + id);
  root.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { modo = b.dataset.m; app.render(); }));
  $('bNueva').addEventListener('click', () => editar(nuevaTarea({ fecha: modo === 'calendario' ? null : null })));
  $('bSugerir').addEventListener('click', () => { app.store.tareas.push(...sug); guardar(); app.toast(`${sug.length} tarea(s) sugeridas agregadas a «Por planificar».`); app.render(); });
  $('bCsv').addEventListener('click', () => descargar(`EX3600_plan_mantenimiento_${hoy}.csv`, '﻿' + tareasCSV(tareas()), 'text/csv;charset=utf-8'));
  $('bPrint').addEventListener('click', () => window.print());
  root.querySelectorAll('[data-abrir]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const t = tareas().find((x) => x.id === a.dataset.abrir); if (t) editar(t); }));

  // ---------- Tarjeta ----------
  const prioColor = { alta: '#d64545', media: '#e0a020', baja: '#4aa3df' };
  const tarjeta = (t) => {
    const pr = progreso(t); const v = vencida(t, hoy); const tp = TIPOS[t.tipo] || TIPOS.otra;
    return `<div class="tarea ${v ? 'vencida' : ''} ${t.estado === 'hecha' ? 'hecha' : ''}" draggable="true" data-id="${t.id}" style="border-left-color:${prioColor[t.prioridad]}">
      <div class="fila entre" style="gap:4px"><b class="titulo">${tp.icono} ${esc(t.titulo)}</b><span class="chip" style="border-color:${prioColor[t.prioridad]};color:${prioColor[t.prioridad]}">${t.prioridad}</span></div>
      <div class="meta">${t.codigo ? `<a href="#/punto/${t.codigo}">${t.codigo}</a> · ` : t.zonaId ? `${esc(cfg.zonas[t.zonaId]?.corto ?? t.zonaId)} · ` : ''}${esc(tp.nombre)}${t.duracionH ? ` · ${fNum(t.duracionH)} h` : ''}</div>
      <div class="meta">${t.fecha ? `<span class="${v ? 'rojo' : ''}">📅 ${fFecha(t.fecha)}${v ? ' · vencida' : ''}</span>` : '<span class="tenue">sin fecha</span>'}${t.horas ? ` · ${fNum(t.horas)} h` : ''}${t.responsable ? ` · 👤 ${esc(t.responsable)}` : ''}</div>
      ${pr !== null ? `<div class="sev-barra" style="margin-top:5px"><i style="width:${Math.round(pr * 100)}%;background:${pr === 1 ? '#2e9e5b' : '#4aa3df'}"></i></div><small class="tenue">${t.checklist.filter((c) => c.ok).length}/${t.checklist.length} pasos</small>` : ''}
      <div class="fila acciones no-print"><button class="btn chico" data-prev="${t.id}" title="Columna anterior" ${t.estado === 'planificar' ? 'disabled' : ''}>←</button><button class="btn chico" data-edit="${t.id}">✎ Editar</button><button class="btn chico" data-next="${t.id}" title="Siguiente columna" ${t.estado === 'hecha' ? 'disabled' : ''}>→</button></div>
    </div>`;
  };
  const activarTarjetas = (cont) => {
    cont.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editar(tareas().find((t) => t.id === b.dataset.edit))));
    const paso = (id, d) => { const t = tareas().find((x) => x.id === id); const i = COLUMNAS.findIndex((c) => c.id === t.estado) + d; if (i < 0 || i >= COLUMNAS.length) return; const dest = COLUMNAS[i].id; if (dest !== 'planificar' && !t.fecha) { editar(t, dest); return; } cambiar(t, dest); };
    cont.querySelectorAll('[data-prev]').forEach((b) => b.addEventListener('click', () => paso(b.dataset.prev, -1)));
    cont.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', () => paso(b.dataset.next, +1)));
    cont.querySelectorAll('.tarea[draggable]').forEach((el) => {
      el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', el.dataset.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('arrastrando'); });
      el.addEventListener('dragend', () => el.classList.remove('arrastrando'));
    });
  };
  const cambiar = (t, estado) => { const i = tareas().indexOf(t); app.store.tareas[i] = mover(t, estado); guardar(); app.render(); };

  // ---------- Tablero ----------
  function pintarTablero() {
    const lista = tareas().filter((t) => !filtroTexto || `${t.titulo} ${t.codigo} ${t.responsable} ${t.descripcion}`.toLowerCase().includes(filtroTexto.toLowerCase()));
    $('cuerpo').innerHTML = `
      <div class="fila no-print" style="margin-bottom:10px"><input type="text" id="buscar" placeholder="Buscar tarea, punto o responsable…" value="${esc(filtroTexto)}" style="min-width:260px"></div>
      <div class="tablero">${COLUMNAS.map((c) => `<div class="columna" data-col="${c.id}">
        <div class="col-cab"><b>${c.nombre}</b> ${info(c.desc)}<span class="chip">${lista.filter((t) => t.estado === c.id).length}</span></div>
        <div class="col-cuerpo">${lista.filter((t) => t.estado === c.id).sort((a, b) => PRIORIDADES.indexOf(a.prioridad) - PRIORIDADES.indexOf(b.prioridad) || String(a.fecha ?? '9').localeCompare(String(b.fecha ?? '9'))).map(tarjeta).join('') || '<div class="tenue" style="font-size:.82rem;padding:8px">Vacío. Arrastre una tarjeta aquí.</div>'}</div>
      </div>`).join('')}</div>`;
    $('buscar').addEventListener('input', (e) => { filtroTexto = e.target.value; pintarTablero(); });
    activarTarjetas($('cuerpo'));
    root.querySelectorAll('.columna').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('sobre'); });
      col.addEventListener('dragleave', () => col.classList.remove('sobre'));
      col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('sobre'); const t = tareas().find((x) => x.id === e.dataTransfer.getData('text/plain')); if (!t || t.estado === col.dataset.col) return; if (col.dataset.col !== 'planificar' && !t.fecha) { editar(t, col.dataset.col); return; } cambiar(t, col.dataset.col); });
    });
  }

  // ---------- Calendario ----------
  function pintarCalendario() {
    const [a, m] = mesSel.split('-').map(Number);
    const primero = new Date(Date.UTC(a, m - 1, 1)); const dow = (primero.getUTCDay() + 6) % 7; // lunes = 0
    const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const g = porDia(tareas(), mesSel);
    const celdas = [];
    for (let i = 0; i < dow; i++) celdas.push('<div class="dia vacio"></div>');
    for (let d = 1; d <= dias; d++) {
      const f = `${mesSel}-${String(d).padStart(2, '0')}`; const ts = g[f] || [];
      celdas.push(`<div class="dia ${f === hoy ? 'hoy' : ''} ${f === A.ultimaInsp.fecha ? 'insp' : ''}" data-f="${f}"><div class="n">${d}${f === A.ultimaInsp.fecha ? ' <small title="Última inspección">🔍</small>' : ''}</div>
        ${ts.sort((x, y) => PRIORIDADES.indexOf(x.prioridad) - PRIORIDADES.indexOf(y.prioridad)).map((t) => `<div class="ev ${t.estado === 'hecha' ? 'hecha' : vencida(t, hoy) ? 'vencida' : ''}" data-edit="${t.id}" style="border-left-color:${prioColor[t.prioridad]}" title="${esc(t.titulo)}">${TIPOS[t.tipo]?.icono ?? ''} ${esc(t.titulo)}</div>`).join('')}</div>`);
    }
    const prox = agenda(tareas(), hoy, 30).proximas;
    $('cuerpo').innerHTML = `
      <div class="rejilla c-3-1">
        <div class="panel" style="padding:10px">
          <div class="fila entre" style="margin-bottom:6px"><button class="btn chico" id="mPrev">‹</button><b>${MESES[m - 1]} ${a}</b><button class="btn chico" id="mNext">›</button></div>
          <div class="cal-cab">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((x) => `<div>${x}</div>`).join('')}</div>
          <div class="calendario">${celdas.join('')}</div>
          <small class="tenue">Clic en un día crea una tarea en esa fecha; clic en una tarea la edita. Doble borde: hoy. 🔍 última inspección.</small>
        </div>
        <div class="panel" style="padding:10px"><h3>Próximos 30 días ${info('Tareas pendientes con fecha dentro de los próximos 30 días, ordenadas por fecha.')}</h3>
          ${prox.map((t) => `<div class="alerta-item" style="grid-template-columns:auto 1fr"><div><small class="num">${fFecha(t.fecha)}</small></div><div><a href="#" data-edit="${t.id}">${TIPOS[t.tipo]?.icono ?? ''} ${esc(t.titulo)}</a><br><small class="tenue">${esc(COLUMNAS.find((c) => c.id === t.estado)?.nombre ?? '')}${t.responsable ? ' · ' + esc(t.responsable) : ''}</small></div></div>`).join('') || '<p class="tenue">Nada programado.</p>'}
          ${ag.sinFecha.length ? `<h3 style="margin-top:12px">Sin fecha (${ag.sinFecha.length})</h3>${ag.sinFecha.slice(0, 8).map((t) => `<div><a href="#" data-edit="${t.id}">${esc(t.titulo)}</a></div>`).join('')}` : ''}
        </div>
      </div>`;
    const cambiarMes = (d) => { const nm = new Date(Date.UTC(a, m - 1 + d, 1)); mesSel = nm.toISOString().slice(0, 7); pintarCalendario(); };
    $('mPrev').addEventListener('click', () => cambiarMes(-1)); $('mNext').addEventListener('click', () => cambiarMes(1));
    root.querySelectorAll('.dia[data-f]').forEach((d) => d.addEventListener('click', (e) => { if (e.target.closest('[data-edit]')) return; editar(nuevaTarea({ fecha: d.dataset.f, estado: 'programada' })); }));
    root.querySelectorAll('[data-edit]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); editar(tareas().find((t) => t.id === el.dataset.edit)); }));
  }

  // ---------- Lista ----------
  function pintarLista() {
    const lista = [...tareas()].sort((x, y) => (x.estado === 'hecha') - (y.estado === 'hecha') || String(x.fecha ?? '9').localeCompare(String(y.fecha ?? '9')));
    $('cuerpo').innerHTML = `<div class="panel"><div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Tarea</th><th>Tipo</th><th>Punto</th><th>Prioridad</th><th>Estado</th><th>Responsable</th><th class="n">Avance</th><th class="no-print"></th></tr></thead>
      <tbody>${lista.map((t) => { const pr = progreso(t); return `<tr class="${vencida(t, hoy) ? 'fila-vencida' : ''}"><td>${t.fecha ? fFecha(t.fecha) : '—'}</td><td><b>${esc(t.titulo)}</b><br><small class="tenue">${esc(t.descripcion || '').slice(0, 90)}</small></td><td>${TIPOS[t.tipo]?.icono ?? ''} ${esc(TIPOS[t.tipo]?.nombre ?? t.tipo)}</td><td>${t.codigo ? `<a href="#/punto/${t.codigo}">${t.codigo}</a>` : esc(cfg.zonas[t.zonaId]?.corto ?? '')}</td><td><span class="chip" style="color:${prioColor[t.prioridad]}">${t.prioridad}</span></td><td>${esc(COLUMNAS.find((c) => c.id === t.estado)?.nombre ?? '')}</td><td>${esc(t.responsable)}</td><td class="n">${pr === null ? '—' : fNum(pr * 100) + ' %'}</td><td class="no-print"><button class="btn chico" data-edit="${t.id}">✎</button></td></tr>`; }).join('') || '<tr><td colspan="9" class="tenue">Sin tareas. Use «Sugerir tareas» o «+ Nueva tarea».</td></tr>'}</tbody></table></div></div>`;
    root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editar(tareas().find((t) => t.id === b.dataset.edit))));
  }

  // ---------- Editor (diálogo) ----------
  function editar(t, estadoDestino = null) {
    const dlg = $('dlg'); const nueva = !tareas().includes(t);
    const puntos = Object.keys(A.puntos);
    dlg.innerHTML = `<form method="dialog" class="dlg-form">
      <div class="fila entre"><h2 style="margin:0">${nueva ? 'Nueva tarea' : 'Editar tarea'}</h2><button type="button" class="btn chico" id="dX" aria-label="Cerrar">×</button></div>
      <label class="campo">Título<input name="titulo" required value="${esc(t.titulo)}" placeholder="p. ej. Reparar BR-01 por soldadura"></label>
      <div class="rejilla c3">
        <label class="campo">Tipo<select name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${t.tipo === k ? 'selected' : ''}>${v.icono} ${v.nombre}</option>`).join('')}</select></label>
        <label class="campo">Punto / zona<select name="codigo"><option value="">Equipo completo</option>${Object.entries(cfg.zonas).map(([z, v]) => `<option value="Z:${z}" ${!t.codigo && t.zonaId === z ? 'selected' : ''}>Zona ${v.corto}</option>`).join('')}${puntos.map((c) => `<option value="${c}" ${t.codigo === c ? 'selected' : ''}>${c} · ${esc(A.puntos[c].punto.descripcion)}</option>`).join('')}</select></label>
        <label class="campo">Prioridad<select name="prioridad">${PRIORIDADES.map((p) => `<option ${t.prioridad === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      </div>
      <div class="rejilla c4">
        <label class="campo">Estado<select name="estado">${COLUMNAS.map((c) => `<option value="${c.id}" ${(estadoDestino ?? t.estado) === c.id ? 'selected' : ''}>${c.nombre}</option>`).join('')}</select></label>
        <label class="campo">Fecha programada<input type="date" name="fecha" value="${t.fecha ?? ''}"></label>
        <label class="campo">Horómetro previsto (h)<input type="number" name="horas" step="1" value="${t.horas ?? ''}"></label>
        <label class="campo">Duración (h)<input type="number" name="duracionH" step="0.5" value="${t.duracionH ?? ''}"></label>
      </div>
      <label class="campo">Responsable<input name="responsable" value="${esc(t.responsable)}" placeholder="Nombre o cargo"></label>
      <label class="campo">Descripción<textarea name="descripcion" style="min-height:56px">${esc(t.descripcion)}</textarea></label>
      <label class="campo">Pasos (uno por línea; marque los hechos en la tarjeta) ${info('Cada línea es un paso de la lista de verificación. Las tareas sugeridas traen pasos típicos de reparación por soldadura, inspección NDT o registro.')}
        <div class="checklist">${(t.checklist || []).map((c, i) => `<label class="fila" style="gap:6px"><input type="checkbox" data-ck="${i}" ${c.ok ? 'checked' : ''}><span>${esc(c.texto)}</span></label>`).join('')}</div>
        <textarea name="pasos" style="min-height:48px" placeholder="Nuevo paso por línea…"></textarea></label>
      <label class="campo">Notas de ejecución<textarea name="notas" style="min-height:40px">${esc(t.notas)}</textarea></label>
      <div class="fila entre" style="margin-top:8px"><div>${nueva ? '' : `<button type="button" class="btn chico peligro" id="dDel">Eliminar</button>`} ${t.origen === 'auto' ? '<span class="chip">sugerida por la plataforma</span>' : ''}</div>
        <div class="fila"><button type="button" class="btn" id="dCancel">Cancelar</button><button class="btn prim" id="dOk">Guardar</button></div></div>
      <div id="dErr" class="aviso rojo" hidden></div>
    </form>`;
    const f = dlg.querySelector('form');
    dlg.querySelector('#dX').onclick = dlg.querySelector('#dCancel').onclick = () => dlg.close();
    dlg.querySelector('#dDel')?.addEventListener('click', () => { if (!confirm('¿Eliminar esta tarea?')) return; app.store.tareas = tareas().filter((x) => x !== t); guardar(); dlg.close(); app.render(); });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(f); const sel = fd.get('codigo');
      const nuevosPasos = String(fd.get('pasos') || '').split('\n').map((x) => x.trim()).filter(Boolean).map((texto) => ({ texto, ok: false }));
      const checklist = (t.checklist || []).map((c, i) => ({ ...c, ok: f.querySelector(`[data-ck="${i}"]`)?.checked ?? c.ok })).concat(nuevosPasos);
      const upd = { ...t, titulo: String(fd.get('titulo')).trim(), tipo: fd.get('tipo'), prioridad: fd.get('prioridad'), fecha: fd.get('fecha') || null, horas: fd.get('horas') ? Number(fd.get('horas')) : null, duracionH: fd.get('duracionH') ? Number(fd.get('duracionH')) : null, responsable: String(fd.get('responsable')).trim(), descripcion: String(fd.get('descripcion')).trim(), notas: String(fd.get('notas')).trim(), checklist, codigo: sel && !sel.startsWith('Z:') ? sel : '', zonaId: sel ? (sel.startsWith('Z:') ? sel.slice(2) : sel.split('-')[0]) : '', actualizada: new Date().toISOString() };
      const estado = fd.get('estado'); const final = estado !== t.estado ? mover(upd, estado) : upd;
      if (!upd.titulo && TIPOS[upd.tipo] && (upd.codigo || upd.zonaId)) upd.titulo = `${TIPOS[upd.tipo].nombre} ${upd.codigo || cfg.zonas[upd.zonaId]?.corto || ''}`;
      const err = validarTarea(final);
      if (err.length) { const d = dlg.querySelector('#dErr'); d.hidden = false; d.textContent = err.join(' '); return; }
      if (nueva) app.store.tareas.push(final); else app.store.tareas[tareas().indexOf(t)] = final;
      guardar(); dlg.close(); app.toast(nueva ? 'Tarea creada.' : 'Tarea guardada.'); app.render();
    });
    dlg.showModal();
  }

  ({ tablero: pintarTablero, calendario: pintarCalendario, lista: pintarLista })[modo]();
}
