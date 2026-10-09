// Centro de alertas: ¿qué requiere acción hoy? + ¿qué habría advertido la plataforma en el pasado?
import { esc, fFecha, fH, fNum, sevHTML, COLOR } from '../ui/formato.js';
import { info } from '../ui/ayuda.js';
import { predecir } from '../falla.js';

const TIPOS = { umbral: 'Umbral', proximidad: 'Proximidad', crecimiento: 'Crecimiento rápido', ni: 'No inspeccionado', sospechoso: 'Dato sospechoso', foto: 'Registro fotográfico', reincidencia: 'Reincidencia' };
const REGLAS = (cfg, A) => ({
  umbral: 'Alerta si L ≥ Caution; Crítica si L ≥ Danger (umbrales de la hoja Puntos).',
  proximidad: `La proyección del ciclo actual cruza Caution o Danger antes de ${cfg.horizonteProximidadIntervalos} inspecciones (intervalo típico ${fNum(A.intervalo)} h).`,
  crecimiento: `Tasa > ${cfg.crecimientoRapidoMmPor1000h} mm/1000 h o > ${cfg.factorCrecimientoRapido}× la mediana histórica del punto.`,
  ni: `N/I en la última inspección, o ≥ ${cfg.niRepetidoMinimo} veces en las últimas ${cfg.niRepetidoVentana}.`,
  sospechoso: 'Valor que no sigue la tendencia; queda fuera de tendencias hasta que se confirme en Calidad de datos.',
  foto: `La última foto de la zona tiene más de ${cfg.fotoAntiguedadMaxInspecciones} inspecciones.`,
  reincidencia: 'La grieta reapareció después de reparar → revisar procedimiento de soldadura (informativo).',
});
let filtroTipo = '';

export function render(root, app) {
  const A = app.A; const cfg = app.cfg;
  app.migas([{ t: 'Flota', h: '#/flota' }, { t: `Equipo ${A.modelo.equipo.id}`, h: `#/equipo/${A.modelo.equipo.id}` }, { t: 'Alertas' }]);
  const H = app.historial();
  const episodios = Object.values(A.puntos).flatMap((a) => a.episodios.map((e) => ({ ...e, codigo: a.codigo }))).sort((x, y) => (x.desde.fecha < y.desde.fecha ? -1 : 1));
  const crit = episodios.filter((e) => e.nivel === 'Crítico');
  const cuenta = (t) => A.alertas.filter((a) => a.tipo === t).length;
  const reglas = REGLAS(cfg, A);
  const pred = predecir(A, cfg);

  root.innerHTML = `
  <div class="cabecera"><div><h1>Centro de alertas ${info(`<p><b>¿Qué requiere acción hoy?</b> Alertas calculadas con la última inspección (${fFecha(A.ultimaInsp.fecha)}), ordenadas por severidad. Cada tipo tiene su regla en el ⓘ del filtro.</p>${Object.entries(TIPOS).map(([t, n]) => `<p><b>${n}:</b> ${reglas[t]}</p>`).join('')}`)}</h1></div></div>
  <div class="fila no-print" style="margin-bottom:12px">
    <button class="btn chico ${!filtroTipo ? 'prim' : ''}" data-t="">Todas (${A.alertas.length})</button>
    ${Object.entries(TIPOS).filter(([t]) => cuenta(t)).map(([t, n]) => `<span class="fila" style="gap:0"><button class="btn chico ${filtroTipo === t ? 'prim' : ''}" data-t="${t}">${n} (${cuenta(t)})</button>${info(reglas[t], 'Regla: ' + n)}</span>`).join('')}
  </div>
  <div class="rejilla c-3-2">
    <div class="panel">
      ${A.alertas.filter((a) => !filtroTipo || a.tipo === filtroTipo).map((a) => `
        <div class="alerta-item"><div>${sevHTML(a.severidad)}</div>
          <div><b>${esc(a.titulo)}</b> <span class="chip">${TIPOS[a.tipo]}</span><p>${esc(a.detalle || '')}</p><p class="acc">→ ${esc(a.accion)}</p></div>
          <div>${a.codigo ? `<a class="btn chico" href="#/punto/${a.codigo}">Ver ${a.codigo}</a>` : a.zonaId ? `<a class="btn chico" href="#/zona/${a.zonaId}">Ver zona</a>` : ''}${a.tipo === 'sospechoso' ? ' <a class="btn chico" href="#/calidad">Revisar</a>' : ''}</div></div>`).join('') || '<p class="tenue">Sin alertas de este tipo.</p>'}
    </div>
    <div class="panel">
      <h2>Exposición sobre umbrales ${info('Periodos en que una grieta operó sobre Caution o Danger hasta su reparación. Un buen programa de mantenimiento minimiza estas horas.')}</h2>
      <div class="tabla-wrap"><table><thead><tr><th>Punto</th><th>Nivel</th><th>Desde</th><th>Hasta</th><th class="n">Horas</th><th class="n">L máx.</th></tr></thead>
      <tbody>${episodios.map((e) => `<tr class="clic" data-h="#/punto/${e.codigo}"><td><b>${e.codigo}</b></td><td style="color:${COLOR[e.nivel]}">${e.nivel === 'Crítico' ? '≥ Danger' : '≥ Caution'}</td><td>${fFecha(e.desde.fecha)}</td><td>${e.hasta ? fFecha(e.hasta.fecha) : '<b>vigente</b>'}</td><td class="n">${fNum(e.horas)}</td><td class="n">${e.maxL}</td></tr>`).join('')}</tbody></table></div>
    </div>
  </div>
  <div class="espacio"></div>

  <div class="rejilla c2">
    <div class="panel">
      <h2>¿Qué habría advertido la plataforma? ${info('Se repite el análisis inspección por inspección con los datos disponibles en cada fecha. Se muestra la primera emisión de cada alerta de umbral, proximidad o crecimiento (los datos sospechosos se revisan en Calidad de datos).')}</h2>
      ${crit.length ? `<div class="aviso rojo"><b>Lección del historial:</b> ${crit.map((e) => `${e.codigo} superó Danger el ${fFecha(e.desde.fecha)} (${e.Linicio} mm; luego hasta ${e.maxL} mm) y ${e.hasta ? `se reparó el ${fFecha(e.hasta.fecha)}: <b>${fNum(e.horas)} h (${e.dias} días) operando en Crítico</b>` : 'sigue sin reparar'}`).join('; ')}. Con esta plataforma la alerta crítica se habría emitido el mismo día de la inspección, con la instrucción «reparar antes de continuar operando».</div>` : ''}
      <div class="historia" style="max-height:520px;overflow:auto;margin-top:12px">
        ${[...H.eventos].reverse().map((e) => `<div class="h ${e.severidad}"><small class="tenue">${fFecha(e.fecha)} · ${fH(e.horas)}</small><br>${sevHTML(e.severidad)} ${esc(e.titulo)}</div>`).join('')}
      </div>
    </div>
    <div class="panel">
      <h2>Lección del simulador ${info('Qué pasaría si las grietas actuales siguieran creciendo sin reparación, según la ley de Paris del Simulador de falla: primer punto en alcanzar la longitud crítica por zona.')}</h2>
      ${Object.values(pred.piezas).sort((a, b) => a.horasCritico - b.horasCritico).map((z) => `<div class="alerta-item"><div><span class="chip">${esc(cfg.zonas[z.zonaId].corto)}</span></div><div><b>${z.primero}</b> alcanzaría la longitud crítica en ${Number.isFinite(z.horasCritico) ? `≈ ${fH(Math.round(z.horasCritico))} (${fFecha(A.fechaDeHoras(A.horasActuales + z.horasCritico))})` : '— (sin grieta activa)'}</div><div><a class="btn chico" href="#/simulador">Simular</a></div></div>`).join('')}
    </div>
  </div>`;

  root.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { filtroTipo = b.dataset.t; app.render(); }));
  root.querySelectorAll('tr[data-h]').forEach((tr) => tr.addEventListener('click', () => app.ir(tr.dataset.h)));
}
