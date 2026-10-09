// Vista Registrar: formulario con la misma estructura del formato de inspección (Word).
import { estadoDe, ACCION_POR_ESTADO, simular } from '../reglas.js';
import { idInspeccion, idMedicion } from '../datos.js';
import { reducirImagen } from '../almacen.js';
import { esc, estadoHTML, fFecha, fNum } from '../ui/formato.js';
import { esquemaHTML } from '../ui/esquema.js';

export function render(root, app, [fechaEditar]) {
  const A = app.A; const cfg = app.cfg; const eq = A.modelo.equipo.id;
  app.migas([{ t: 'Flota', h: '#/flota' }, { t: `Equipo ${eq}`, h: `#/equipo/${eq}` }, { t: 'Registrar inspección' }]);
  const existente = fechaEditar ? A.inspecciones.find((i) => i.fecha === fechaEditar) : null;
  const hoy = new Date().toISOString().slice(0, 10);
  const fecha0 = existente?.fecha ?? (hoy > A.ultimaInsp.fecha ? hoy : A.ultimaInsp.fecha);
  const inspectores = [...new Set(A.inspecciones.map((i) => i.inspector).filter(Boolean))].sort();

  const anterior = (codigo, fecha) => {
    const r = A.puntos[codigo].registros.filter((x) => x.fecha < fecha && x.Lef !== null && x.Lef !== undefined && !x.excluido);
    return r.at(-1) ?? null;
  };
  const valorExistente = (codigo) => existente ? A.modelo.mediciones.find((m) => m.id === idMedicion(eq, existente.fecha, codigo)) : null;

  root.innerHTML = `
  <div class="cabecera"><div><h1>${existente ? 'Editar' : 'Registrar'} inspección estructural</h1>
    <p>Misma estructura del formato de inspección EX3600. La L anterior se completa sola y el estado se calcula en vivo con los umbrales de la hoja Puntos.</p></div>
    <div class="fila no-print"><select id="selEditar" aria-label="Editar una inspección existente"><option value="">Nueva inspección</option>${[...A.inspecciones].reverse().map((i) => `<option value="${i.fecha}" ${existente?.fecha === i.fecha ? 'selected' : ''}>Editar ${fFecha(i.fecha)}${i.origen === 'app' ? ' (app)' : ''}</option>`).join('')}</select></div></div>
  <form id="frm" class="panel" autocomplete="off">
    <div class="rejilla c4">
      <label class="campo">FECHA<input type="date" name="fecha" required value="${fecha0}"></label>
      <label class="campo">EQUIPO<input type="text" value="${esc(eq)}" disabled></label>
      <label class="campo">HORAS (horómetro)<input type="number" name="horas" step="0.1" min="0" required value="${existente?.horas ?? ''}" placeholder="p. ej. ${fNum(A.horasActuales + A.intervalo)}"><small id="hHoras"></small></label>
      <label class="campo">INSPECTOR<input type="text" name="inspector" list="dlInsp" required value="${esc(existente?.inspector ?? '')}"><datalist id="dlInsp">${inspectores.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label>
    </div>
    <p class="tenue" style="font-size:.85rem">ZONAS: ${Object.keys(cfg.zonas).length} zonas · ${Object.keys(A.puntos).length} puntos. NOTA: con el equipo armado algunas áreas quedan ocultas y no son inspeccionables; marque <b>N/I</b> en esos puntos (nunca 0).</p>
    <details><summary class="tenue">Criterio de estado</summary><table style="margin-top:6px"><tbody>${['Normal', 'Alerta', 'Crítico', 'N/I'].map((e) => `<tr><td>${estadoHTML(e)}</td><td>${{ Normal: 'L actual menor que Caution.', Alerta: 'L actual igual o mayor que Caution y menor que Danger.', 'Crítico': 'L actual igual o mayor que Danger.', 'N/I': 'No inspeccionado (acceso, limpieza deficiente o fuera de programación).' }[e]} ${ACCION_POR_ESTADO[e]}</td></tr>`).join('')}</tbody></table></details>
    <label class="campo" style="margin-top:10px">Observaciones generales de la inspección<textarea name="obs">${esc(existente?.observaciones ?? '')}</textarea></label>

    ${Object.entries(cfg.zonas).map(([zid, z], n) => `
    <div class="espacio"></div>
    <h2>ZONA ${n + 1}: ${esc(z.nombre.toUpperCase())}</h2>
    <div class="rejilla c-3-1">
      <div class="tabla-wrap form-zona"><table>
        <thead><tr><th>Código</th><th>Descripción</th><th class="n">Caution</th><th class="n">Danger</th><th class="n">L anterior</th><th>L actual (mm)</th><th>Estado</th><th>Comentario</th><th>Foto</th></tr></thead>
        <tbody>${Object.values(A.puntos).filter((a) => a.punto.zonaId === zid).map((a) => {
          const ex = valorExistente(a.codigo);
          return `<tr data-c="${a.codigo}"><td><b>${a.codigo}</b></td><td><small>${esc(a.punto.descripcion)}</small></td><td class="n">${a.punto.caution}</td><td class="n">${a.punto.danger}</td>
          <td class="n lant"></td>
          <td><input type="number" min="0" step="1" name="L_${a.codigo}" value="${ex && ex.L !== null ? ex.L : ''}" aria-label="L actual ${a.codigo}"> <label class="ni-check"><input type="checkbox" name="NI_${a.codigo}" ${ex && ex.L === null ? 'checked' : ''}>N/I</label></td>
          <td class="est"></td>
          <td><input type="text" name="C_${a.codigo}" value="${esc(ex?.comentario ?? '')}" placeholder="Observación" list="dlCom"><div class="aviso-l"></div></td>
          <td><input type="file" accept="image/*" capture="environment" name="F_${a.codigo}" style="max-width:150px;font-size:.75rem"></td></tr>`;
        }).join('')}</tbody></table></div>
      <div>${esquemaHTML(zid, A, { etiquetas: false })}<label class="campo" style="margin-top:8px">Observaciones de la zona<textarea name="obs_${zid}">${esc(existente?.observacionesZona?.[zid] ?? '')}</textarea></label></div>
    </div>`).join('')}
    <datalist id="dlCom"><option value="Zona reparada por soldadura"><option value="Grieta sobre reparación anterior"><option value="Grieta en metal base, programar reparación"><option value="Cucharón nuevo (cambio de componente)"><option value="No inspeccionable: acceso"><option value="No inspeccionable: limpieza deficiente"></datalist>
    <div class="espacio"></div>
    <div id="resumen"></div>
    <div class="fila entre no-print">
      <button type="button" class="btn" id="bDemo" title="Completa el formulario con la proyección a la próxima inspección, solo para demostrar el flujo">Rellenar con proyección (demo)</button>
      <div class="fila"><a class="btn" href="#/equipo/${esc(eq)}">Cancelar</a><button class="btn prim" type="submit">Guardar inspección</button></div>
    </div>
  </form>`;

  const frm = root.querySelector('#frm');
  root.querySelector('#selEditar').addEventListener('change', (e) => app.ir(e.target.value ? `#/registrar/${e.target.value}` : '#/registrar'));

  function actualizar() {
    const fecha = frm.fecha.value || fecha0;
    const horas = Number(frm.horas.value);
    const previa = [...A.inspecciones].filter((i) => i.fecha < fecha).at(-1);
    const sig = A.inspecciones.find((i) => i.fecha > fecha);
    const hh = root.querySelector('#hHoras');
    if (frm.horas.value && previa && horas <= previa.horas) hh.innerHTML = `<span style="color:#ff8080">Debe ser mayor que ${fNum(previa.horas, 1)} h (${fFecha(previa.fecha)})</span>`;
    else if (frm.horas.value && sig && horas >= sig.horas) hh.innerHTML = `<span style="color:#ff8080">Debe ser menor que ${fNum(sig.horas, 1)} h (${fFecha(sig.fecha)})</span>`;
    else if (previa) { const est = previa.horas + (Date.parse(fecha) - Date.parse(previa.fecha)) / 864e5 * A.utilizacion; hh.textContent = `Estimado por utilización: ≈ ${fNum(est)} h`; }
    const conteo = { Normal: 0, Alerta: 0, 'Crítico': 0, 'N/I': 0 };
    frm.querySelectorAll('tr[data-c]').forEach((tr) => {
      const c = tr.dataset.c; const a = A.puntos[c]; const p = a.punto;
      const ant = anterior(c, fecha);
      tr.querySelector('.lant').textContent = ant ? ant.Lef : '—';
      const ni = frm['NI_' + c].checked; const inp = frm['L_' + c];
      inp.disabled = ni;
      const L = ni || inp.value === '' ? null : Number(inp.value);
      const e = ni ? 'N/I' : L === null ? null : estadoDe(L, p);
      if (e) conteo[e]++;
      tr.querySelector('.est').innerHTML = e ? estadoHTML(e) : '<small class="tenue">—</small>';
      const com = frm['C_' + c].value;
      const repar = /reparad|nuevo|cambio/i.test(com);
      let aviso = '';
      if (L !== null && ant) {
        if (L === 0 && ant.Lef > 0 && !repar) aviso = 'Caída a 0: si se reparó, indíquelo en el comentario; si no se pudo medir, marque N/I.';
        else if (L < ant.Lef - cfg.toleranciaMedicionMm && !repar) aviso = `Disminuye ${ant.Lef - L} mm sin reparación: verifique la medición.`;
        else if (L - ant.Lef >= p.caution) aviso = `Salto de +${L - ant.Lef} mm en un intervalo: verifique (posible error de digitación).`;
      }
      tr.querySelector('.aviso-l').innerHTML = aviso ? `<small style="color:#c7a8f0">⚠ ${aviso}</small>` : '';
      tr.style.background = e === 'Crítico' ? 'rgba(214,69,69,.10)' : e === 'Alerta' ? 'rgba(224,160,32,.08)' : '';
    });
    const vacios = Object.keys(A.puntos).filter((c) => !frm['NI_' + c].checked && frm['L_' + c].value === '');
    root.querySelector('#resumen').innerHTML = `<div class="aviso ${conteo['Crítico'] ? 'rojo' : conteo.Alerta ? '' : 'azul'}">Resumen: ${conteo.Normal} Normal · ${conteo.Alerta} Alerta · ${conteo['Crítico']} Crítico · ${conteo['N/I']} N/I${vacios.length ? ` · <b>${vacios.length} sin completar</b> (se guardarán como N/I)` : ''}.
      ${conteo['Crítico'] ? '<br><b>Hay puntos en Crítico: reparar antes de continuar operando.</b>' : ''}</div>`;
  }
  frm.addEventListener('input', actualizar);
  frm.addEventListener('change', actualizar);
  actualizar();

  root.querySelector('#bDemo').addEventListener('click', () => {
    const s = simular(A, A.intervalo);
    if (!frm.horas.value) frm.horas.value = Math.round(s.horas * 10) / 10;
    if (!existente) frm.fecha.value = s.fecha;
    if (!frm.inspector.value) frm.inspector.value = inspectores[0] || 'INSP-01';
    Object.entries(s.puntos).forEach(([c, x]) => { if (x.L === null) frm['NI_' + c].checked = true; else frm['L_' + c].value = Math.round(x.L / 10) * 10; });
    frm.obs.value = frm.obs.value || 'Registro de demostración generado con la proyección de la plataforma.';
    actualizar();
    app.toast('Formulario completado con la proyección (demo). Revise y guarde.');
  });

  frm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fecha = frm.fecha.value; const horas = Number(frm.horas.value); const inspector = frm.inspector.value.trim();
    if (!fecha || !Number.isFinite(horas) || !inspector) { app.toast('Complete fecha, horas e inspector.', true); return; }
    const previa = A.inspecciones.filter((i) => i.fecha < fecha).at(-1); const sig = A.inspecciones.find((i) => i.fecha > fecha);
    if ((previa && horas <= previa.horas) || (sig && horas >= sig.horas)) { app.toast('Las horas no son coherentes con las inspecciones anteriores/posteriores.', true); return; }
    const yaExiste = A.inspecciones.find((i) => i.fecha === fecha);
    if (yaExiste && !existente && !confirm(`Ya existe una inspección el ${fFecha(fecha)}. ¿Reemplazar sus valores?`)) return;
    const idI = idInspeccion(eq, fecha);
    const insp = { id: idI, equipo: eq, fecha, horas, inspector, origen: 'app', observaciones: frm.obs.value.trim(), observacionesZona: Object.fromEntries(Object.keys(cfg.zonas).map((z) => [z, frm['obs_' + z].value.trim()])), registrada: new Date().toISOString() };
    const meds = []; const fotos = [];
    for (const c of Object.keys(A.puntos)) {
      const ni = frm['NI_' + c].checked; const v = frm['L_' + c].value;
      const id = idMedicion(eq, fecha, c);
      meds.push({ id, inspeccionId: idI, equipo: eq, fecha, horas, codigo: c, L: ni || v === '' ? null : Number(v), comentario: frm['C_' + c].value.trim(), imagenes: [], origen: 'app' });
      const f = frm['F_' + c].files[0];
      if (f) { try { fotos.push({ medicionId: id, codigo: c, fecha, src: await reducirImagen(f), agregada: new Date().toISOString() }); } catch (e) { app.toast(`Foto de ${c}: ${e.message}`, true); } }
    }
    // Si se edita y cambia la fecha, quitar la versión anterior registrada en la app.
    const ag = app.store.agregados;
    const quitar = new Set([idI, existente && existente.origen === 'app' ? existente.id : null].filter(Boolean));
    ag.inspecciones = ag.inspecciones.filter((i) => !quitar.has(i.id));
    ag.mediciones = ag.mediciones.filter((m) => !quitar.has(m.inspeccionId));
    ag.inspecciones.push(insp); ag.mediciones.push(...meds);
    app.store.fotos = [...(app.store.fotos || []), ...fotos];
    if (!app.guardar()) { app.store.fotos.splice(-fotos.length || app.store.fotos.length); return; }
    app.recalcular();
    const nuevas = app.A.alertas.filter((a) => a.severidad === 'critica' || a.severidad === 'alta');
    app.toast(`Inspección ${fFecha(fecha)} guardada. ${nuevas.length ? nuevas.length + ' alerta(s) crítica/alta.' : 'Sin alertas críticas.'}`, nuevas.some((a) => a.severidad === 'critica'));
    app.ir(`#/equipo/${eq}`);
  });
}
