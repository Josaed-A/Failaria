// Vista Punto: ¿cómo evoluciona esta grieta, cuándo cruzará los umbrales y qué hago?
import { graficoTendencia } from '../ui/grafico.js';
import { info } from '../ui/ayuda.js';
import { esc, estadoHTML, fFecha, fH, fMm, fNum, fRestante, fTasa, rutaImagen, COLOR } from '../ui/formato.js';
import { reducirImagen } from '../almacen.js';
import { activarDecisiones, activarGaleria, decisionHTML, galeriaHTML } from './comunes.js';

let eje = 'fecha'; let conProy = true;

export function render(root, app, [codigo]) {
  const A = app.A; const cfg = app.cfg;
  const a = A.puntos[codigo];
  if (!a) { root.innerHTML = '<div class="aviso rojo">Punto no encontrado.</div>'; return; }
  const p = a.punto; const z = cfg.zonas[p.zonaId];
  const cods = Object.keys(A.puntos); const i = cods.indexOf(codigo);
  app.migas([{ t: 'Flota', h: '#/flota' }, { t: `Equipo ${A.modelo.equipo.id}`, h: `#/equipo/${A.modelo.equipo.id}` }, { t: z.nombre, h: `#/zona/${p.zonaId}` }, { t: codigo }]);
  const t = a.tendencia; const pr = a.proyeccion;
  const plan = A.plan.find((x) => x.codigo === codigo);
  const alertas = A.alertas.filter((x) => x.codigo === codigo);
  const fotos = a.registros.flatMap((r) => (r.imagenes || []).filter((img) => img !== p.esquema).map((img) => ({ src: rutaImagen(img, cfg), pie: `${fFecha(r.fecha)}${r.comentario ? ' · ' + r.comentario : ''}` }))).reverse();
  const marcados = a.registros.filter((r) => r.calidad);

  root.innerHTML = `
  <div class="cabecera">
    <div><h1>${codigo} · ${esc(p.descripcion)}</h1>
      <p>${esc(z.nombre)} · Caution ${p.caution} mm · Danger ${p.danger} mm · ${a.registros.length} mediciones · ciclo actual desde ${fFecha(a.cicloActual.inicio.fecha)}${a.cicloActual.evento ? ` (${a.cicloActual.evento === 'cambio' ? 'cambio de componente' : 'reparación'})` : ''}</p></div>
    <div class="fila no-print"><a class="btn chico" href="#/punto/${cods[(i + cods.length - 1) % cods.length]}">‹ ${cods[(i + cods.length - 1) % cods.length]}</a><a class="btn chico" href="#/punto/${cods[(i + 1) % cods.length]}">${cods[(i + 1) % cods.length]} ›</a></div>
  </div>

  <div class="rejilla c4">
    <div class="kpi"><div class="t">Estado actual</div><div class="v" style="font-size:1.2rem">${estadoHTML(a.estadoActual, a.pendientes.includes(a.ultimo))}</div><div class="d">${a.niUltima ? 'N/I en la última inspección; se muestra el último dato válido' : 'según la última inspección'}</div></div>
    <div class="kpi"><div class="t">Última longitud válida</div><div class="v">${fMm(a.ultimoValido?.Lef ?? null)}</div><div class="d">${a.ultimoValido ? fFecha(a.ultimoValido.fecha) + ' · ' + fH(a.ultimoValido.horas) : ''}</div></div>
    <div class="kpi"><div class="t">Tasa de crecimiento (ciclo actual)</div><div class="v" style="font-size:1.2rem">${fTasa(t.tasa1000)}</div><div class="d">${t.tipo === 'ajuste' ? `modelo ${t.modelo}, R² ${fNum(t.r2, 2)}, ${t.n} puntos` : t.tipo === 'sin-grieta' ? 'sin grieta detectable' : esc(t.nota || '')}</div></div>
    <div class="kpi"><div class="t">Mediana histórica / máx.</div><div class="v" style="font-size:1.2rem">${fTasa(a.medianaTasas)}</div><div class="d">máximo observado ${fTasa(a.maxTasa)} · ${a.reparaciones} reparaciones · ${a.reincidencias} reincidencias</div></div>
  </div>
  <div class="espacio"></div>

  <div class="rejilla c-3-2">
    <div class="panel">
      <div class="fila entre">
        <h2 style="margin:0">Tendencia de la grieta ${info('<p><b>Bandas:</b> verde Normal, ámbar Alerta, rojo Crítico (umbrales de la hoja Puntos).</p><p><b>Líneas azules:</b> reparaciones o cambios de componente; reinician el ciclo de la grieta.</p><p><b>Rombos violeta:</b> datos sospechosos, excluidos de la tendencia hasta confirmarlos. <b>Triángulos:</b> no inspeccionado.</p><p><b>Proyección:</b> regresión sobre el ciclo actual (exponencial solo si mejora R² en 0,05) con banda de ±2σ. Clic en un punto de la curva resalta su fila en el historial.</p>')}</h2>
        <div class="fila no-print">
          <div class="seg" id="segEje"><button data-v="fecha" class="${eje === 'fecha' ? 'on' : ''}">vs fecha</button><button data-v="horas" class="${eje === 'horas' ? 'on' : ''}">vs horas</button></div>
          <label class="fila" style="gap:5px;font-size:.85rem"><input type="checkbox" id="chkProy" ${conProy ? 'checked' : ''}> Proyección</label>
        </div>
      </div>
      <div class="grafico" style="margin-top:10px"><canvas id="gT" role="img" aria-label="Tendencia de longitud de grieta de ${codigo}"></canvas></div>

    </div>
    <div class="panel">
      <h2>¿Qué hacer? ${info('Acción y plazo del plan priorizado. «Alcanza Caution/Danger» usa la proyección del ciclo actual; la fecha, la utilización histórica. «Exposición sobre umbral» cuenta las horas que la grieta operó en Alerta o Crítico hasta repararla.')}</h2>
      <div class="aviso ${a.estadoActual === 'Crítico' ? 'rojo' : a.estadoActual === 'Alerta' ? '' : 'azul'}"><b>${esc(plan.accion)}</b>${plan.plazoFecha ? `<br>Plazo: antes de ${fFecha(plan.plazoFecha)} (≈ ${fNum(plan.plazoH)} h)` : ''}</div>
      <table><tbody>
        <tr><td>Alcanza Caution (${p.caution} mm)</td><td class="n">${a.estadoActual !== 'Normal' && a.estadoActual !== 'N/I' ? 'ya superado' : fRestante(pr.restanteCaution, A.utilizacion)}<br><small>${pr.fechaCaution && Number.isFinite(pr.restanteCaution) ? fFecha(pr.fechaCaution) : ''}</small></td></tr>
        <tr><td>Alcanza Danger (${p.danger} mm)</td><td class="n">${a.estadoActual === 'Crítico' ? 'ya superado' : fRestante(pr.restanteDanger, A.utilizacion)}<br><small>${pr.fechaDanger && Number.isFinite(pr.restanteDanger) ? fFecha(pr.fechaDanger) : ''}</small></td></tr>
        <tr><td>Próxima inspección (+${fNum(A.intervalo)} h)</td><td class="n">${t.proyectar ? `≈ ${fNum(t.proyectar(A.horasActuales + A.intervalo).L)} mm` : '—'}</td></tr>
      </tbody></table>
      ${alertas.length ? `<h3 style="margin-top:14px">Alertas del punto</h3><ul class="lista-simple">${alertas.map((x) => `<li><b>${esc(x.titulo)}</b><br><small>${esc(x.detalle || '')}</small></li>`).join('')}</ul>` : ''}
      ${a.episodios.length ? `<h3 style="margin-top:14px">Exposición sobre umbral</h3><ul class="lista-simple">${a.episodios.map((e) => `<li><span style="color:${COLOR[e.nivel]}">${e.nivel === 'Crítico' ? 'Sobre Danger' : 'Sobre Caution'}</span> desde ${fFecha(e.desde.fecha)} ${e.hasta ? `hasta ${fFecha(e.hasta.fecha)}` : '(vigente)'}: <b>${fNum(e.horas)} h</b> (${e.dias} días), máx. ${e.maxL} mm</li>`).join('')}</ul>` : ''}
    </div>
  </div>
  <div class="espacio"></div>

  <div class="rejilla c2">
    <div class="panel">
      <h2>Ciclos de la grieta</h2>
      <div class="tabla-wrap"><table><thead><tr><th>Ciclo</th><th>Inicio</th><th>Fin</th><th class="n">L máx.</th><th>Peor estado</th><th class="n">Duración</th><th>Notas</th></tr></thead>
      <tbody>${a.ciclos.map((c) => `<tr><td>${c.n}</td><td>${fFecha(c.inicio.fecha)}<br><small>${c.evento ? (c.evento === 'cambio' ? 'Cambio de componente' : 'Reparación') : 'Inicio del registro'}</small></td><td>${c.cerrado ? fFecha(c.fin.fecha) : 'actual'}</td>
        <td class="n">${c.maxL ?? '—'}</td><td>${estadoHTML(c.peorEstado)}</td><td class="n">${c.horasDuracion ? fH(c.horasDuracion) : fH(A.horasActuales - c.inicio.horas)}</td>
        <td><small>${c.reincidencia ? `Reincidencia: grieta ${fH(c.horasHastaGrieta)} después de reparar` : ''}</small></td></tr>`).join('')}</tbody></table></div>
    </div>
    <div class="panel">
      <div class="fila entre"><h2 style="margin:0">Fotos y esquema</h2>
        <label class="btn chico no-print">+ Agregar foto (${fFecha(A.ultimaInsp.fecha)})<input type="file" accept="image/*" capture="environment" id="fFoto" hidden></label></div>
      <div class="espacio"></div>
      ${galeriaHTML([{ src: rutaImagen(cfg.esquemasDir + p.esquema, cfg), pie: `Esquema ${z.nombre} (ubicación de ${codigo})` }, ...fotos])}
    </div>
  </div>
  <div class="espacio"></div>

  ${marcados.length ? `<div class="panel" style="border-color:var(--sospechoso)"><h2>Calidad de datos de este punto</h2>
    ${marcados.map((r) => `<div class="alerta-item"><div><span class="chip ${r.calidad.sospechoso ? 'violeta' : ''}">${r.calidad.sospechoso ? 'Sospechoso' : 'Info'}</span></div><div><b>${fFecha(r.fecha)} · ${fMm(r.L)}</b><p>${esc(r.calidad.motivo)}</p>${decisionHTML(r)}</div><div></div></div>`).join('')}</div><div class="espacio"></div>` : ''}

  <div class="panel">
    <h2>Historial de mediciones</h2>
    <div class="tabla-wrap"><table>
      <thead><tr><th>Fecha</th><th class="n">Horas</th><th>Inspector</th><th class="n">L (mm)</th><th>Estado</th><th class="n">ΔL</th><th>Evento / calidad</th><th>Comentario</th></tr></thead>
      <tbody>${[...a.registros].reverse().map((r, k, arr) => {
        const prev = arr.slice(k + 1).find((x) => x.Lef !== null && x.Lef !== undefined && !x.excluido);
        const dL = r.Lef !== null && r.Lef !== undefined && !r.excluido && prev ? r.Lef - prev.Lef : null;
        const insp = A.inspecciones.find((x) => x.id === r.inspeccionId);
        return `<tr id="r-${r.fecha}" class="${r.excluido ? 'fila-sosp' : ''}"><td>${fFecha(r.fecha)}</td><td class="n">${fNum(r.horas)}</td><td>${esc(insp?.inspector ?? '')}</td>
        <td class="n">${r.L === null ? 'N/I' : r.L}${r.decision === 'corregir' ? ` → <b>${r.Lef}</b>` : ''}</td><td>${estadoHTML(r.estado, r.excluido)}</td><td class="n">${dL === null ? '' : (dL > 0 ? '+' : '') + dL}</td>
        <td>${r.evento ? `<span class="chip rep">${r.evento === 'cambio' ? 'Cambio' : r.eventoNoDocumentado ? 'Reparación (no documentada)' : 'Reparación'}</span> ` : ''}${r.calidad ? `<span class="chip ${r.calidad.sospechoso ? 'violeta' : ''}" title="${esc(r.calidad.motivo)}">${{ atipico: 'Atípico', 'cero-sin-reparacion': '0 sin reparación', variacion: 'Variación de medición', disminucion: 'Disminución' }[r.calidad.tipo]}${r.decision ? ' · ' + r.decision : ''}</span>` : ''}${r.origen === 'app' ? ' <span class="chip">App</span>' : ''}</td>
        <td><small>${esc(r.comentario)}</small></td></tr>`;
      }).join('')}</tbody></table></div>
  </div>`;

  let ch = graficoTendencia(root.querySelector('#gT'), a, A, { eje, proyeccion: conProy, onClick: (r) => { const tr = root.querySelector('#r-' + r.fecha); tr?.scrollIntoView({ behavior: 'smooth', block: 'center' }); tr?.animate([{ background: 'rgba(74,163,223,.35)' }, { background: 'transparent' }], 1500); } });
  const redibujar = () => { ch.destroy(); ch = graficoTendencia(root.querySelector('#gT'), a, A, { eje, proyeccion: conProy }); };
  app.alLimpiar(() => ch.destroy());
  root.querySelectorAll('#segEje button').forEach((b) => b.addEventListener('click', () => { eje = b.dataset.v; root.querySelectorAll('#segEje button').forEach((x) => x.classList.toggle('on', x === b)); redibujar(); }));
  root.querySelector('#chkProy').addEventListener('change', (e) => { conProy = e.target.checked; redibujar(); });
  activarGaleria(root);
  activarDecisiones(root, app);

  root.querySelector('#fFoto').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const src = await reducirImagen(f);
      const ult = a.registros.at(-1);
      app.store.fotos = app.store.fotos || [];
      app.store.fotos.push({ medicionId: ult.id, codigo, fecha: ult.fecha, src, agregada: new Date().toISOString() });
      if (app.guardar()) { app.recalcular(); app.render(); app.toast(`Foto agregada a ${codigo} · ${fFecha(ult.fecha)}.`); }
      else app.store.fotos.pop();
    } catch (err) { app.toast(err.message, true); }
  });
}
