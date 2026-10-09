// Reporte imprimible (CSS print → PDF) con el orden del formato de inspección + resumen, plan y diagnóstico IA.
import { analizar, ACCION_POR_ESTADO } from '../reglas.js';
import { esquemaHTML } from '../ui/esquema.js';
import { graficoTendencia } from '../ui/grafico.js';
import { esc, estadoHTML, fFecha, fH, fMm, fNum, fRestante, fTasa, rutaImagen, sevHTML } from '../ui/formato.js';
import { mdSeguro } from '../ia.js';

let fechaSel = null;

export function render(root, app) {
  const cfg = app.cfg;
  const insps = app.A.inspecciones;
  if (!fechaSel || !insps.some((i) => i.fecha === fechaSel)) fechaSel = app.A.ultimaInsp.fecha;
  const esUltima = fechaSel === app.A.ultimaInsp.fecha;
  const A = esUltima ? app.A : analizar({ ...app.modelo, inspecciones: app.modelo.inspecciones.filter((i) => i.fecha <= fechaSel), mediciones: app.modelo.mediciones.filter((m) => m.fecha <= fechaSel) }, cfg, app.store.decisiones);
  const insp = A.ultimaInsp; const eq = A.modelo.equipo;
  app.migas([{ t: 'Flota', h: '#/flota' }, { t: `Equipo ${eq.id}`, h: `#/equipo/${eq.id}` }, { t: 'Reporte' }]);
  const foco = cfg.componenteFoco;
  const ia = app.store.ia;
  const enAlerta = Object.values(A.puntos).filter((a) => a.estadoActual === 'Alerta' || a.estadoActual === 'Crítico');

  root.innerHTML = `
  <div class="cabecera no-print"><div><h1>Reporte de inspección estructural</h1><p>Vista previa imprimible. Use «Imprimir / Guardar PDF» (orientación vertical, márgenes predeterminados).</p></div>
    <div class="fila"><label class="campo" style="flex-direction:row;align-items:center;gap:6px">Inspección <select id="selF">${[...insps].reverse().map((i) => `<option value="${i.fecha}" ${i.fecha === fechaSel ? 'selected' : ''}>${fFecha(i.fecha)}</option>`).join('')}</select></label>
      <button class="btn prim" id="bPrint">Imprimir / Guardar PDF</button></div></div>

  <article class="reporte">
  <div class="panel">
    <div class="fila entre"><div><h1 style="margin:0">INSPECCIÓN ESTRUCTURAL · PALA ${esc(cfg.equipo.modelo.toUpperCase())}</h1><small>${esc(cfg.equipo.faena)} · Plataforma de integridad estructural</small></div>${estadoHTML(A.estadoEquipo)}</div>
    <div class="espacio"></div>
    <table><tbody><tr><th>Fecha</th><td>${fFecha(insp.fecha)}</td><th>Equipo</th><td>${esc(eq.id)}</td><th>Horas</th><td>${fNum(insp.horas, 1)} h</td></tr>
      <tr><th>Inspector</th><td>${esc(insp.inspector)}</td><th>Zonas</th><td colspan="3">${Object.keys(cfg.zonas).length} zonas · ${Object.keys(A.puntos).length} puntos</td></tr></tbody></table>
  </div>
  <div class="espacio"></div>

  <div class="panel"><h2>Resumen ejecutivo</h2>${resumen(A).map((p) => `<p>${p}</p>`).join('')}</div>
  <div class="espacio"></div>

  <div class="rejilla c2">
    <div class="panel"><h2>Criterio de estado</h2><table><tbody>${['Normal', 'Alerta', 'Crítico', 'N/I'].map((e) => `<tr><td>${estadoHTML(e)}</td><td><small>${ACCION_POR_ESTADO[e]}</small></td></tr>`).join('')}</tbody></table></div>
    <div class="panel"><h2>Próxima parada recomendada</h2>
      ${A.parada.requerida ? `<p><b>${fFecha(A.parada.fecha)}</b> (≈ ${fH(A.parada.horas)} desde esta inspección). Límite por Danger: ${fFecha(A.parada.fechaLimite)}.</p><p>Incluir: <b>${A.parada.incluir.join(', ')}</b>.</p>` : `<p>${esc(A.parada.texto)}</p>`}
      <p class="tenue" style="font-size:.85rem">Utilización ${fNum(A.utilizacion, 1)} h/día · intervalo típico ${fNum(A.intervalo)} h.</p>
      ${insp.observaciones ? `<h3>Observaciones generales</h3><p>${esc(insp.observaciones)}</p>` : ''}</div>
  </div>
  <div class="espacio"></div>

  <div class="panel"><h2>Plan de mantenimiento priorizado</h2>
    <table><thead><tr><th>#</th><th>Punto</th><th>Estado</th><th class="n">L (mm)</th><th class="n">Tasa</th><th>Acción</th><th>Plazo</th></tr></thead>
    <tbody>${A.plan.filter((f) => f.estado !== 'Normal' || f.plazoFecha || f.score >= 20).map((f, i) => `<tr><td>${i + 1}</td><td><b>${f.codigo}</b> <small>${esc(f.descripcion)}</small></td><td>${estadoHTML(f.estado)}</td><td class="n">${f.L ?? '—'}</td><td class="n">${f.tasa1000 ? fNum(f.tasa1000) : '—'}</td><td>${esc(f.accion)}</td><td>${f.plazoFecha ? fFecha(f.plazoFecha) : '—'}</td></tr>`).join('')}</tbody></table>
    <small class="tenue">Puntos restantes: seguimiento en la frecuencia normal de inspección.</small>
  </div>

  ${Object.entries(cfg.zonas).map(([zid, z], n) => {
    const ps = Object.values(A.puntos).filter((a) => a.punto.zonaId === zid);
    const fz = A.fotos[zid];
    const esFoco = zid === foco;
    return `<div class="panel salto" style="margin-top:16px">
      <h2>ZONA ${n + 1}: ${esc(z.nombre.toUpperCase())}${esFoco ? ' <span class="chip">componente asignado</span>' : ''}</h2>
      <table><thead><tr><th>Código</th><th>Descripción</th><th class="n">Caution</th><th class="n">Danger</th><th class="n">L anterior</th><th class="n">L actual</th><th>Estado</th><th>Comentario</th></tr></thead><tbody>
      ${ps.map((a) => { const act = a.registros.find((r) => r.fecha === insp.fecha); const ant = a.registros.filter((r) => r.fecha < insp.fecha && r.Lef !== null && r.Lef !== undefined && !r.excluido).at(-1);
        return `<tr><td><b>${a.codigo}</b></td><td>${esc(a.punto.descripcion)}</td><td class="n">${a.punto.caution}</td><td class="n">${a.punto.danger}</td><td class="n">${ant ? ant.Lef : '—'}</td><td class="n">${act ? (act.L ?? '—') : '—'}</td><td>${estadoHTML(act?.estado ?? 'N/I', !!act?.excluido)}</td><td><small>${esc(act?.comentario || '')}${act?.calidad?.sospechoso ? ' [dato sospechoso]' : ''}</small></td></tr>`; }).join('')}
      </tbody></table>
      <div class="rejilla c2" style="margin-top:12px">
        <div><h3>Ubicación de los puntos de inspección</h3>${esquemaHTML(zid, A, { etiquetas: true })}</div>
        <div><h3>Tendencias</h3><table><thead><tr><th>Punto</th><th class="n">Tasa</th><th>Caution</th><th>Danger</th></tr></thead><tbody>
          ${ps.map((a) => `<tr><td>${a.codigo}</td><td class="n">${fTasa(a.tendencia.tasa1000)}</td><td><small>${a.estadoActual !== 'Normal' ? 'superado' : fRestante(a.proyeccion.restanteCaution, A.utilizacion)}</small></td><td><small>${a.estadoActual === 'Crítico' ? 'superado' : fRestante(a.proyeccion.restanteDanger, A.utilizacion)}</small></td></tr>`).join('')}</tbody></table>
          <h3 style="margin-top:10px">Registro fotográfico</h3>
          ${fz?.fotos.length ? `<div class="galeria">${fz.fotos.slice(0, 2).map((f) => `<figure><img src="${esc(rutaImagen(f.img, cfg))}" alt=""><figcaption>${esc(z.corto)} · ${fFecha(f.fecha)} · ${f.codigo}</figcaption></figure>`).join('')}</div>` : '<p class="tenue">Sin fotos.</p>'}
          ${fz?.desactualizada ? `<p style="font-size:.85rem;color:#c0761a">Fotos de ${fFecha(fz.ultima)}: ${fz.inspeccionesSinFoto} inspecciones sin registro fotográfico nuevo.</p>` : ''}
        </div>
      </div>
      ${esFoco ? ps.filter((a) => (a.ultimoValido?.Lef ?? 0) > 0 || a.reparaciones).map((a) => `<div style="margin-top:12px;break-inside:avoid"><h3>${a.codigo} · ${esc(a.punto.descripcion)}</h3><div class="grafico" style="height:240px"><canvas data-g="${a.codigo}"></canvas></div></div>`).join('') : ''}
      ${insp.observacionesZona?.[zid] ? `<h3>Observaciones de la zona</h3><p>${esc(insp.observacionesZona[zid])}</p>` : ''}
    </div>`;
  }).join('')}

  ${(app.store.tareas || []).some((t) => t.estado !== 'hecha') ? `<div class="panel" style="margin-top:16px"><h2>Tareas de mantenimiento programadas</h2>
    <table><thead><tr><th>Fecha</th><th>Tarea</th><th>Punto</th><th>Prioridad</th><th>Estado</th><th>Responsable</th></tr></thead><tbody>
    ${[...app.store.tareas].filter((t) => t.estado !== 'hecha').sort((x, y) => String(x.fecha ?? '9').localeCompare(String(y.fecha ?? '9'))).map((t) => `<tr><td>${t.fecha ? fFecha(t.fecha) : '—'}</td><td>${esc(t.titulo)}</td><td>${esc(t.codigo || cfg.zonas[t.zonaId]?.corto || 'Equipo')}</td><td>${esc(t.prioridad)}</td><td>${esc({ planificar: 'Por planificar', programada: 'Programada', ejecucion: 'En ejecución' }[t.estado] ?? t.estado)}</td><td>${esc(t.responsable || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
  <div class="panel salto" style="margin-top:16px"><h2>Alertas</h2>
    ${A.alertas.filter((a) => a.severidad !== 'info').map((a) => `<div class="alerta-item"><div>${sevHTML(a.severidad)}</div><div><b>${esc(a.titulo)}</b><p class="acc">→ ${esc(a.accion)}</p></div><div></div></div>`).join('') || '<p>Sin alertas.</p>'}
  </div>
  <div class="espacio"></div>
  <div class="panel"><h2>Calidad de datos</h2>
    <ul class="lista-simple">${Object.values(A.puntos).flatMap((a) => a.registros.filter((r) => r.calidad).map((r) => `<li>${a.codigo} · ${fFecha(r.fecha)} · ${fMm(r.L)}: ${esc(r.calidad.motivo)} <b>${r.decision ? `Decisión: ${r.decision}${r.decision === 'corregir' ? ' a ' + r.Lef + ' mm' : ''}.` : r.calidad.sospechoso ? 'Pendiente de revisión (excluido de tendencias).' : ''}</b></li>`)).join('')}
      <li>Cobertura de inspección: ${fNum(A.kpis.cobertura * 100, 1)} % (${A.kpis.ni} mediciones N/I en el historial).</li></ul>
  </div>
  <div class="espacio"></div>
  <div class="panel"><h2>Diagnóstico asistido por IA</h2>
    ${ia ? `<small class="tenue">${esc(ia.origen)}${ia.modelo ? ' · ' + esc(ia.modelo) : ''} · ${fFecha(ia.fecha.slice(0, 10))} · datos hasta ${fFecha(ia.datosHasta)}</small>${ia.datosHasta !== insp.fecha ? '<p class="tenue">(El diagnóstico se generó con datos de otra fecha.)</p>' : ''}<div>${mdSeguro(ia.texto)}</div>` : '<p class="tenue no-print">Sin diagnóstico. Genérelo en <a href="#/ia">Análisis con IA</a>.</p><p class="solo-print tenue">No se generó diagnóstico IA para este reporte.</p>'}
  </div>
  <div class="espacio"></div>
  <div class="panel"><div class="rejilla c3" style="margin-top:30px">${['Inspector', 'Supervisor de mantenimiento', 'Ingeniero de confiabilidad'].map((r) => `<div style="border-top:1px solid var(--texto2);padding-top:6px;text-align:center"><small>${r}</small></div>`).join('')}</div>
    <p class="tenue" style="font-size:.78rem;margin-top:18px">Generado ${fFecha(new Date().toISOString().slice(0, 10))} por la Plataforma de integridad estructural EX3600. Proyecciones con regresión sobre el ciclo actual de cada grieta; fechas estimadas con la utilización histórica.</p></div>
  </article>`;

  root.querySelector('#selF').addEventListener('change', (e) => { fechaSel = e.target.value; app.render(); });
  root.querySelector('#bPrint').addEventListener('click', () => window.print());
  const charts = [...root.querySelectorAll('canvas[data-g]')].map((c) => graficoTendencia(c, A.puntos[c.dataset.g], A, { eje: 'fecha', proyeccion: true }));
  const rs = () => charts.forEach((c) => c.resize());
  window.addEventListener('beforeprint', rs); window.addEventListener('afterprint', rs);
  app.alLimpiar(() => { charts.forEach((c) => c.destroy()); window.removeEventListener('beforeprint', rs); window.removeEventListener('afterprint', rs); });
}

function resumen(A) {
  const eq = A.modelo.equipo.id;
  const ps = Object.values(A.puntos);
  const crit = ps.filter((a) => a.estadoActual === 'Crítico'); const al = ps.filter((a) => a.estadoActual === 'Alerta');
  const lista = (xs) => xs.map((a) => `${a.codigo} (${a.ultimoValido.Lef} mm)`).join(', ');
  const out = [];
  out.push(`Al ${fFecha(A.ultimaInsp.fecha)} (${fH(A.horasActuales)}), el equipo ${esc(eq)} se encuentra en estado <b>${A.estadoEquipo}</b>: ${A.kpis.conteo.Normal} puntos Normal, ${al.length} en Alerta y ${crit.length} en Crítico${A.kpis.conteo['N/I'] ? `, ${A.kpis.conteo['N/I']} sin dato` : ''}.`);
  if (crit.length) out.push(`<b>Crítico:</b> ${lista(crit)}. Reparar antes de continuar operando.`);
  if (al.length) out.push(`<b>Alerta:</b> ${al.map((a) => `${a.codigo} (${a.ultimoValido.Lef} mm, ${fTasa(a.tendencia.tasa1000)}; alcanzaría Danger en ≈ ${fNum(a.proyeccion.restanteDanger)} h, ${fFecha(a.proyeccion.fechaDanger)})`).join('; ')}. Aumentar frecuencia de inspección y programar la reparación.`);
  const prox = ps.filter((a) => a.estadoActual === 'Normal' && a.proyeccion.restanteCaution <= 2 * A.intervalo);
  if (prox.length) out.push(`Próximos a Caution (≤ 2 inspecciones): ${prox.map((a) => `${a.codigo} en ≈ ${fNum(a.proyeccion.restanteCaution)} h`).join(', ')}.`);
  const rap = A.alertas.filter((a) => a.tipo === 'crecimiento');
  if (rap.length) out.push(`Crecimiento rápido: ${rap.map((a) => esc(a.titulo)).join('; ')}.`);
  if (A.parada.requerida && A.parada.horas === 0) out.push(`<b>Detener el equipo y reparar de inmediato</b>; aprovechar la parada para intervenir ${A.parada.incluir.join(', ')}.`);
  else if (A.parada.requerida) out.push(`Se recomienda programar una parada de reparación antes del <b>${fFecha(A.parada.fecha)}</b> que incluya ${A.parada.incluir.join(', ')}.`);
  const reinc = ps.filter((a) => a.reincidencias);
  if (reinc.length) out.push(`Reincidencias tras reparación en ${reinc.map((a) => a.codigo).join(', ')}: revisar el procedimiento de soldadura y la causa raíz.`);
  const pend = A.kpis.sospechososPendientes;
  if (pend) out.push(`${pend} dato(s) del historial están marcados como sospechosos y excluidos de las tendencias hasta su revisión.`);
  const fv = Object.values(A.fotos).filter((z) => z.desactualizada);
  if (fv.length) out.push(`El registro fotográfico está desactualizado en ${fv.length} de ${Object.keys(A.fotos).length} zonas (última foto ${fFecha(fv[0].ultima)}).`);
  return out;
}
