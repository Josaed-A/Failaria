// Vista Flota: ¿qué equipo necesita atención primero? (preparada para N equipos)
import { COLOR, esc, estadoHTML, fFecha, fH, fNum, sevHTML } from '../ui/formato.js';

export function render(root, app) {
  const A = app.A; const cfg = app.cfg; const k = A.kpis;
  app.migas([{ t: 'Flota' }]);
  const nAl = A.alertas.filter((a) => ['critica', 'alta', 'media'].includes(a.severidad));
  const top = A.alertas.filter((a) => a.severidad !== 'info').slice(0, 4);
  const fuente = app.store.base ? 'Excel cargado por el usuario' : `Excel del repositorio (${cfg.excelRuta})`;
  const nApp = app.store.agregados.inspecciones.length;

  root.innerHTML = `
  <div class="cabecera">
    <div><h1>Flota · ${esc(A.modelo.equipo.flota || cfg.equipo.flota)}</h1><p>¿Qué equipo necesita atención primero? Semáforo según el peor punto de inspección.</p></div>
    <div class="fila no-print">
      <button class="btn" id="bCargar" title="Cargar un historial nuevo (mismo formato de hojas)">Cargar Excel…</button>
      ${app.store.base ? '<button class="btn" id="bRepo">Usar Excel del repositorio</button>' : ''}
    </div>
  </div>
  <div class="rejilla c-2-1">
    <a class="tarjeta" href="#/equipo/${esc(A.modelo.equipo.id)}" style="padding:20px">
      <div class="fila entre">
        <div class="fila"><span class="semaforo" style="background:${COLOR[A.estadoEquipo]};width:22px;height:22px"></span>
          <div><h2 style="margin:0">Equipo ${esc(A.modelo.equipo.id)}</h2><small>${esc(cfg.equipo.modelo)} · ${esc(cfg.equipo.faena)}</small></div></div>
        ${estadoHTML(A.estadoEquipo)}
      </div>
      <div class="espacio"></div>
      <div class="kpis">
        <div class="kpi"><div class="t">Última inspección</div><div class="v" style="font-size:1.15rem">${fFecha(A.ultimaInsp.fecha)}</div><div class="d">${fH(A.horasActuales)} · ${esc(A.ultimaInsp.inspector)}</div></div>
        <div class="kpi"><div class="t">Puntos por estado</div><div class="v" style="font-size:1.15rem"><span style="color:#5ccf8c">${k.conteo.Normal}</span> · <span style="color:#f2bd4c">${k.conteo.Alerta}</span> · <span style="color:#ff8080">${k.conteo['Crítico']}</span></div><div class="d">Normal · Alerta · Crítico (de ${Object.keys(A.puntos).length})</div></div>
        <div class="kpi"><div class="t">Alertas activas</div><div class="v">${nAl.length}</div><div class="d">${A.alertas.filter((a) => a.severidad === 'critica').length} críticas</div></div>
        <div class="kpi"><div class="t">Próxima parada</div><div class="v" style="font-size:1.15rem">${A.parada.requerida ? fFecha(A.parada.fecha) : '—'}</div><div class="d">${A.parada.requerida ? `en ≈ ${fNum(A.parada.horas)} h · ${A.parada.incluir.length} puntos` : 'No requerida'}</div></div>
      </div>
      <div class="espacio"></div>
      <div class="rejilla c3">
        ${Object.entries(cfg.zonas).map(([id, z]) => { const kz = k.porZona[id]; return `<div class="fila"><span class="semaforo" style="background:${COLOR[kz?.estado ?? 'N/I']}"></span><span>${esc(z.nombre)}</span></div>`; }).join('')}
      </div>
    </a>
    <div class="panel">
      <h3>Lo más urgente</h3>
      ${top.map((a) => `<div class="alerta-item"><div>${sevHTML(a.severidad)}</div><div><b>${esc(a.titulo)}</b><p class="acc">${esc(a.accion)}</p></div><div></div></div>`).join('') || '<p class="tenue">Sin alertas.</p>'}
      <p><a href="#/alertas">Ver centro de alertas →</a></p>
    </div>
  </div>
  <div class="espacio"></div>
  <div class="panel tenue" style="font-size:.85rem">
    Fuente de datos: <b>${esc(fuente)}</b> · ${A.inspecciones.length} inspecciones (${fFecha(A.inspecciones[0].fecha)} → ${fFecha(A.ultimaInsp.fecha)}) · ${k.mediciones} mediciones
    ${nApp ? ` · <b>${nApp}</b> inspección(es) registradas en la plataforma` : ''} · Utilización calculada ${fNum(A.utilizacion, 1)} h/día · Intervalo típico entre inspecciones ${fNum(A.intervalo)} h.
    El modelo de datos identifica el equipo en cada registro, preparado para sumar más palas a la flota.
  </div>`;
  root.querySelector('#bCargar').onclick = () => app.pedirExcel();
  root.querySelector('#bRepo')?.addEventListener('click', () => app.restaurarExcelRepo());
}
