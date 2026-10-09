// Vista Zona: ¿dónde están las grietas de esta zona y cuál requiere acción?
import { simular } from '../reglas.js';
import { info } from '../ui/ayuda.js';
import { esquemaHTML } from '../ui/esquema.js';
import { graficoMini } from '../ui/grafico.js';
import { COLOR, esc, estadoHTML, fFecha, fMm, fNum, fTasa, rutaImagen } from '../ui/formato.js';
import { galeriaHTML, activarGaleria } from './comunes.js';

export function render(root, app, [zonaId]) {
  const A = app.A; const cfg = app.cfg;
  const z = cfg.zonas[zonaId];
  if (!z) { root.innerHTML = '<div class="aviso rojo">Zona no encontrada.</div>'; return; }
  const ps = Object.values(A.puntos).filter((a) => a.punto.zonaId === zonaId);
  const kz = A.kpis.porZona[zonaId];
  const fz = A.fotos[zonaId];
  app.migas([{ t: 'Flota', h: '#/flota' }, { t: `Equipo ${A.modelo.equipo.id}`, h: `#/equipo/${A.modelo.equipo.id}` }, { t: z.nombre }]);
  const sim = app.sim.dh ? simular(A, app.sim.dh) : null;
  const ult = A.ultimaInsp.fecha;

  root.innerHTML = `
  <div class="cabecera">
    <div><h1>${esc(z.nombre)} ${estadoHTML(kz.estado)} ${info(`<p><b>¿Dónde están las grietas y cuál requiere acción?</b> Los círculos del esquema son los puntos de inspección en su ubicación real, coloreados por estado; los que pulsan están en Alerta o Crítico y el borde violeta marca un dato sospechoso pendiente. Clic abre el historial del punto.</p><p>Umbrales de la zona: Caution ${ps[0].punto.caution} mm · Danger ${ps[0].punto.danger} mm.</p>`)}</h1></div>
    <div class="fila no-print">${Object.entries(cfg.zonas).filter(([id]) => id !== zonaId).map(([id, x]) => `<a class="btn chico" href="#/zona/${id}">${esc(x.nombre)}</a>`).join('')}</div>
  </div>
  ${sim ? `<div class="aviso violeta fila entre"><span>Mostrando estado <b>proyectado</b> a +${fNum(app.sim.dh)} h (${fFecha(sim.fecha)}) desde el simulador.</span><button class="btn chico" id="simOff">Ver estado actual</button></div>` : ''}
  <div class="rejilla c-3-2">
    <div class="panel">${esquemaHTML(zonaId, A, { sim })}
      <div class="leyenda">${['Normal', 'Alerta', 'Crítico', 'N/I'].map((e) => `<span><i style="background:${COLOR[e]}"></i>${e}</span>`).join('')}<span><i style="outline:2px dashed var(--sospechoso);background:transparent"></i>Dato sospechoso</span></div>
    </div>
    <div class="panel">
      <h3>Indicadores de la zona</h3>
      <div class="kpis">
        <div class="kpi"><div class="t">Reparaciones</div><div class="v">${kz.reparaciones}</div><div class="d">${kz.cambios} cambios de componente</div></div>
        <div class="kpi"><div class="t">Reincidencias</div><div class="v">${kz.reincidencias}</div><div class="d">grietas reaparecidas tras reparar</div></div>
        <div class="kpi"><div class="t">Tasa media</div><div class="v" style="font-size:1.2rem">${fTasa(kz.tasaMedia)}</div><div class="d">grietas activas</div></div>
        <div class="kpi"><div class="t">Horas en Crítico</div><div class="v">${fNum(kz.horasCritico)}</div><div class="d">operadas sobre Danger</div></div>
      </div>
      <p class="tenue" style="font-size:.85rem">Fotos: ${fz?.ultima ? `última ${fFecha(fz.ultima)}${fz.desactualizada ? ` <b style="color:#f2bd4c">(${fz.inspeccionesSinFoto} inspecciones sin foto nueva)</b>` : ''}` : 'sin fotos'}.</p>
    </div>
  </div>
  <div class="espacio"></div>
  <div class="panel">
    <h2>Puntos de inspección · ${fFecha(ult)}</h2>
    <div class="tabla-wrap"><table>
      <thead><tr><th>Código</th><th>Descripción</th><th class="n">Caution</th><th class="n">Danger</th><th class="n">L anterior</th><th class="n">L actual</th><th>Estado</th><th class="n">Tasa</th><th style="width:170px">Tendencia</th><th>Comentario</th></tr></thead>
      <tbody>${ps.map((a) => {
        const r = a.registros.filter((x) => x.fecha <= ult);
        const act = r.at(-1); const ant = r.at(-2);
        return `<tr class="clic" data-h="#/punto/${a.codigo}"><td><b>${a.codigo}</b></td><td>${esc(a.punto.descripcion)}</td><td class="n">${a.punto.caution}</td><td class="n">${a.punto.danger}</td>
          <td class="n">${ant ? fMm(ant.L) : '—'}</td><td class="n">${act ? fMm(act.L) : '—'}</td><td>${estadoHTML(act?.estado ?? 'N/I', !!act?.excluido)}</td><td class="n">${a.tendencia.tasa1000 ? fNum(a.tendencia.tasa1000) : '—'}</td>
          <td><div class="grafico chico" style="height:44px"><canvas data-c="${a.codigo}"></canvas></div></td><td><small>${esc(act?.comentario || '')}</small></td></tr>`;
      }).join('')}</tbody></table></div>
  </div>
  <div class="espacio"></div>
  <div class="panel"><h2>Registro fotográfico de la zona</h2>${galeriaHTML((fz?.fotos || []).map((f) => ({ src: rutaImagen(f.img, cfg), pie: `${f.codigo} · ${fFecha(f.fecha)}${f.comentario ? ' · ' + f.comentario : ''}` })))}</div>`;

  root.querySelectorAll('tr[data-h]').forEach((tr) => tr.addEventListener('click', () => app.ir(tr.dataset.h)));
  root.querySelector('#simOff')?.addEventListener('click', () => { app.sim.dh = 0; app.render(); });
  const charts = [...root.querySelectorAll('canvas[data-c]')].map((c) => graficoMini(c, A.puntos[c.dataset.c]));
  app.alLimpiar(() => charts.forEach((c) => c.destroy()));
  activarGaleria(root);
}
