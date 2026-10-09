// Vista Calidad de datos: «los datos vienen de campo; revísenlos antes de confiar».
import { diasEntre } from '../reglas.js';
import { info } from '../ui/ayuda.js';
import { esc, estadoHTML, fFecha, fMm, fNum, rutaImagen } from '../ui/formato.js';
import { activarDecisiones, decisionHTML } from './comunes.js';

export function render(root, app) {
  const A = app.A; const cfg = app.cfg;
  app.migas([{ t: 'Flota', h: '#/flota' }, { t: `Equipo ${A.modelo.equipo.id}`, h: `#/equipo/${A.modelo.equipo.id}` }, { t: 'Calidad de datos' }]);
  const regs = Object.values(A.puntos).flatMap((a) => a.registros.map((r) => ({ ...r, punto: a.punto })));
  const sosp = regs.filter((r) => r.calidad?.sospechoso);
  const variaciones = regs.filter((r) => r.calidad && !r.calidad.sospechoso);
  const ni = regs.filter((r) => r.L === null);
  const noDoc = regs.filter((r) => r.eventoNoDocumentado);
  const pend = sosp.filter((r) => !r.decision).length;
  const insp = A.inspecciones;
  const intervalos = insp.slice(1).map((x, i) => ({ desde: insp[i], hasta: x, dias: diasEntre(insp[i].fecha, x.fecha), horas: x.horas - insp[i].horas }));
  const medDias = [...intervalos].map((x) => x.dias).sort((a, b) => a - b)[Math.floor(intervalos.length / 2)];
  const largos = intervalos.filter((x) => x.dias > 1.4 * medDias);
  const utilAnom = intervalos.filter((x) => x.dias > 0 && Math.abs(x.horas / x.dias - A.utilizacion) > 6);
  const imgs = [...new Set(A.modelo.mediciones.flatMap((m) => m.imagenes || []).filter((x) => !x.startsWith('data:')))];

  root.innerHTML = `
  <div class="cabecera"><div><h1>Calidad de datos ${info(`<p>«Los datos vienen de campo; pueden tener valores atípicos o inconsistencias.» La plataforma los detecta, los <b>marca sin borrarlos</b> y los excluye de las tendencias hasta que usted decida.</p><p><b>Reglas:</b> salto que no sigue la tendencia (posible dígito extra); 0 sin comentario de reparación (probable N/I); disminución sin reparación (≤ ${cfg.toleranciaMedicionMm} mm = variación de medición, informativa; mayor = sospechosa).</p><p><b>Decisiones:</b> «Es real» lo incorpora; «Descartar» lo trata como N/I; «Corregir» usa el valor indicado. Quedan registradas y se exportan en la hoja Calidad.</p>`)}</h1></div></div>
  <div class="kpis">
    <div class="kpi"><div class="t">Datos sospechosos</div><div class="v" style="color:#c7a8f0">${sosp.length}</div><div class="d">${pend} pendientes de decisión</div></div>
    <div class="kpi"><div class="t">Variaciones de medición</div><div class="v">${variaciones.length}</div><div class="d">disminuciones ≤ ${cfg.toleranciaMedicionMm} mm sin reparación</div></div>
    <div class="kpi"><div class="t">No inspeccionados (N/I)</div><div class="v">${ni.length}</div><div class="d">celdas vacías; nunca se convierten en 0</div></div>
    <div class="kpi"><div class="t">Reparaciones sin comentario</div><div class="v">${noDoc.length}</div><div class="d">caídas a 0 aceptadas sin registro</div></div>
    <div class="kpi"><div class="t">Zonas con fotos antiguas</div><div class="v">${Object.values(A.fotos).filter((z) => z.desactualizada).length}</div><div class="d">de ${Object.keys(A.fotos).length}</div></div>
  </div>
  <div class="espacio"></div>

  <div class="panel" style="border-color:var(--sospechoso)">
    <h2>Datos sospechosos · requieren decisión</h2>
    ${sosp.map((r) => `<div class="alerta-item"><div><span class="chip violeta">${{ atipico: 'Atípico', 'cero-sin-reparacion': '0 sin reparación', disminucion: 'Disminución' }[r.calidad.tipo]}</span></div>
      <div><b><a href="#/punto/${r.codigo}">${r.codigo}</a> · ${fFecha(r.fecha)} · registrado ${fMm(r.L)}</b> ${estadoHTML(r.estado, !r.decision)}
      <p>${esc(r.calidad.motivo)}</p><p class="tenue" style="font-size:.82rem">Contexto: ${contexto(A.puntos[r.codigo], r)}</p>${decisionHTML(r)}</div><div></div></div>`).join('') || '<p class="tenue">No se detectaron datos sospechosos.</p>'}
  </div>
  <div class="espacio"></div>

  <div class="rejilla c2">
    <div class="panel"><h2>Variaciones de medición ${info('Disminuciones pequeñas sin reparación, dentro de la tolerancia: típicas del error de medición en campo. Se conservan en la tendencia (informativo).')}</h2>
      <ul class="lista-simple">${variaciones.map((r) => `<li><a href="#/punto/${r.codigo}">${r.codigo}</a> · ${fFecha(r.fecha)}: ${esc(r.calidad.motivo)}</li>`).join('') || '<li class="tenue">Ninguna.</li>'}</ul>
      ${noDoc.length ? `<h3 style="margin-top:14px">Reparaciones no documentadas</h3><ul class="lista-simple">${noDoc.map((r) => `<li><a href="#/punto/${r.codigo}">${r.codigo}</a> · ${fFecha(r.fecha)}: caída a 0 sin comentario, tratada como reparación.</li>`).join('')}</ul>` : ''}
    </div>
    <div class="panel"><h2>Puntos no inspeccionados (N/I) ${info('Una celda vacía en el Excel significa «no inspeccionado» (acceso, limpieza, programación). Nunca se convierte en 0; la plataforma alerta cuando un punto acumula N/I.')}</h2>
      <table><thead><tr><th>Punto</th><th>Fechas N/I</th></tr></thead><tbody>
      ${Object.values(A.puntos).filter((a) => a.registros.some((r) => r.L === null)).map((a) => `<tr><td><a href="#/punto/${a.codigo}">${a.codigo}</a></td><td>${a.registros.filter((r) => r.L === null).map((r) => fFecha(r.fecha)).join(', ')}</td></tr>`).join('')}
      </tbody></table>

    </div>
  </div>
  <div class="espacio"></div>

  <div class="rejilla c2">
    <div class="panel"><h2>Registro fotográfico</h2>
      <ul class="lista-simple">${Object.values(A.fotos).map((z) => `<li><b>${esc(z.zona)}</b>: ${z.ultima ? `última foto ${fFecha(z.ultima)} — ${z.inspeccionesSinFoto} inspecciones posteriores sin foto nueva` : 'sin fotos'}${z.desactualizada ? ' <span class="chip violeta">desactualizada</span>' : ''}</li>`).join('')}</ul>
      <div class="aviso" style="font-size:.88rem">El formato de inspección del ${fFecha(A.ultimaInsp.fecha)} incluye fotos rotuladas <i>01-Mar-2024</i>: se reutilizan fotos antiguas, por lo que no hay evidencia visual del estado actual de las grietas.</div>
      ${cfg.fotosExtra.map((x) => `<div class="aviso azul" style="font-size:.88rem">${esc(x.archivo)}: ${esc(x.nota)}. La plataforma admite N fotos por punto y fecha, y la asocia a ${x.codigo} · ${fFecha(x.fecha)}.</div>`).join('')}
      <h3 style="margin-top:12px">Archivos de imagen referenciados</h3>
      <ul class="lista-simple" id="imgs">${imgs.map((x) => `<li data-src="${esc(rutaImagen(x, cfg))}">${esc(x)} <span class="tenue">verificando…</span></li>`).join('')}</ul>
    </div>
    <div class="panel"><h2>Consistencia de fechas y horas</h2>
      <p style="font-size:.9rem">Intervalo mediano entre inspecciones: <b>${medDias} días</b> (${fNum(A.intervalo)} h). Utilización media: <b>${fNum(A.utilizacion, 1)} h/día</b>.</p>
      ${largos.length ? `<p style="margin-bottom:4px">Intervalos largos (&gt; 1,4× la mediana):</p><ul class="lista-simple">${largos.map((x) => `<li>${fFecha(x.desde.fecha)} → ${fFecha(x.hasta.fecha)}: <b>${x.dias} días</b> (${fNum(x.horas)} h)</li>`).join('')}</ul>` : '<p class="tenue">Sin intervalos anómalos.</p>'}
      ${utilAnom.length ? `<p style="margin-bottom:4px">Utilización atípica entre inspecciones (± 6 h/día):</p><ul class="lista-simple">${utilAnom.map((x) => `<li>${fFecha(x.desde.fecha)} → ${fFecha(x.hasta.fecha)}: ${fNum(x.horas / x.dias, 1)} h/día</li>`).join('')}</ul>` : '<p class="tenue">Horas de horómetro coherentes con las fechas (sin saltos ni retrocesos).</p>'}
      ${A.modelo.avisos?.length ? `<h3>Avisos de lectura</h3><ul class="lista-simple">${A.modelo.avisos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </div>
  </div>`;

  activarDecisiones(root, app);
  root.querySelectorAll('#imgs li').forEach(async (li) => {
    const s = li.querySelector('span');
    try { const r = await fetch(li.dataset.src, { method: 'HEAD' }); s.textContent = r.ok ? '✓ disponible' : '✗ no encontrado'; s.style.color = r.ok ? '#5ccf8c' : '#ff8080'; }
    catch { s.textContent = '(no verificable)'; }
  });
}

function contexto(a, r) {
  const i = a.registros.indexOf(a.registros.find((x) => x.id === r.id));
  return a.registros.slice(Math.max(0, i - 2), i + 3).map((x) => (x.id === r.id ? `<b>[${x.L ?? 'N/I'}]</b>` : `${x.L ?? 'N/I'}`)).join(' → ') + ' mm';
}
