// Vista Equipo: ¿en qué estado está la pala, qué reparo primero y cuándo debo parar?
import { simular, evaluarIntervalo } from '../reglas.js';
import { esquemaHTML } from '../ui/esquema.js';
import { graficoBarras } from '../ui/grafico.js';
import { COLOR, esc, estadoHTML, fFecha, fH, fNum, fPct, fTasa, sevHTML } from '../ui/formato.js';

export function render(root, app) {
  const A = app.A; const cfg = app.cfg; const k = A.kpis; const eq = A.modelo.equipo;
  app.migas([{ t: 'Flota', h: '#/flota' }, { t: `Equipo ${eq.id}` }]);
  const fotosViejas = Object.values(A.fotos).filter((z) => z.desactualizada).length;

  root.innerHTML = `
  <div class="cabecera">
    <div><h1>Equipo ${esc(eq.id)} <span style="vertical-align:middle">${estadoHTML(A.estadoEquipo)}</span></h1>
      <p>Última inspección ${fFecha(A.ultimaInsp.fecha)} · ${fH(A.horasActuales)} · ${esc(A.ultimaInsp.inspector)} · ${A.inspecciones.length} inspecciones en el historial</p></div>
    <div class="fila no-print"><a class="btn prim" href="#/registrar">+ Registrar inspección</a><a class="btn" href="#/reporte">Reporte</a></div>
  </div>

  <div class="kpis">
    ${kpi('Puntos en Alerta / Crítico', `<span style="color:#f2bd4c">${k.conteo.Alerta}</span> / <span style="color:#ff8080">${k.conteo['Crítico']}</span>`, `${k.conteo.Normal} Normal de ${Object.keys(A.puntos).length}`)}
    ${kpi('Grietas activas', k.grietasActivas, 'puntos con L > 0 en el ciclo actual')}
    ${kpi('Reparaciones', k.reparaciones, `${k.cambios} cambios de componente · ${k.reincidencias} reincidencias`)}
    ${kpi('MTBR', k.mtbr ? `${fNum(k.mtbr / 1000, 1)}<small> mil h</small>` : '—', 'horas medias entre reparaciones por punto')}
    ${kpi('Horas operadas en Crítico', fNum(k.horasCritico), 'grietas sobre Danger sin reparar (historial)')}
    ${kpi('Cobertura de inspección', fPct(k.cobertura), `${k.ni} mediciones N/I`)}
    ${kpi('Registro fotográfico', fotosViejas ? `<span style="color:#f2bd4c">${fotosViejas}/3</span>` : 'Al día', fotosViejas ? 'zonas con fotos desactualizadas' : 'fotos recientes')}
  </div>
  <div class="espacio"></div>

  <div class="rejilla c-3-2">
    <div class="panel">
      <div class="fila entre"><h2 style="margin:0">Modelo 3D · estado por punto</h2><span class="tenue" id="simEtq"></span></div>
      <p class="tenue" style="margin:.3em 0 .8em;font-size:.85rem">Clic en una esfera para abrir el punto. Arrastre para girar, rueda para acercar.</p>
      <div class="pala3d" id="p3d"><div class="cargando" style="padding-top:150px">Cargando modelo 3D…</div><div class="ayuda">EX3600 · modelo esquemático</div></div>
      <div class="leyenda">${['Normal', 'Alerta', 'Crítico', 'N/I'].map((e) => `<span><i style="background:${COLOR[e]}"></i>${e}</span>`).join('')}</div>
    </div>
    <div class="panel">
      <h2>Simulador «¿qué pasa si?»</h2>
      <label class="campo">Horas de operación desde la última inspección: <b id="dhV"></b>
        <input type="range" id="dh" min="0" max="6000" step="50" value="${app.sim.dh}"></label>
      <div id="simRes"></div>
      <hr style="border:0;border-top:1px solid var(--borde);margin:14px 0">
      <label class="campo">Intervalo entre inspecciones: <b id="ivV"></b>
        <input type="range" id="iv" min="250" max="2500" step="50" value="${Math.round(A.intervalo / 50) * 50}"></label>
      <div id="ivRes"></div>
    </div>
  </div>
  <div class="espacio"></div>

  <div class="rejilla c-2-1">
    <div class="panel">
      <h2>Plan de mantenimiento priorizado</h2>
      <p class="tenue" style="margin-top:-.3em;font-size:.85rem">Riesgo = estado + cercanía a Danger/Caution + tasa de crecimiento + reincidencia + datos pendientes. Acción según el criterio del formato de inspección.</p>
      <div class="tabla-wrap"><table>
        <thead><tr><th>#</th><th>Punto</th><th>Estado</th><th class="n">L</th><th class="n">Tasa</th><th class="n">Hasta Caution</th><th class="n">Hasta Danger</th><th>Acción recomendada</th><th class="n">Riesgo</th></tr></thead>
        <tbody>${A.plan.map((f, i) => { const a = A.puntos[f.codigo]; return `<tr class="clic" data-h="#/punto/${f.codigo}">
          <td>${i + 1}</td><td><b>${f.codigo}</b><br><small>${esc(f.descripcion)}</small></td><td>${estadoHTML(f.estado, a.pendientes.includes(a.ultimo))}${a.niUltima ? ' <span class="chip">N/I último</span>' : ''}</td>
          <td class="n">${f.L === null ? '—' : f.L}</td><td class="n">${f.tasa1000 ? fNum(f.tasa1000) : '—'}</td>
          <td class="n">${a.estadoActual !== 'Normal' ? '—' : fNum(a.proyeccion.restanteCaution)}</td><td class="n">${fNum(a.proyeccion.restanteDanger)}</td>
          <td>${esc(f.accion)}${f.plazoFecha ? `<br><small>Antes de ${fFecha(f.plazoFecha)}</small>` : ''}</td><td class="n"><b>${f.score}</b></td></tr>`; }).join('')}</tbody>
      </table></div>
      <small class="tenue">Horas desde la última inspección (${fH(A.horasActuales)}). Tasa en mm/1000 h. Fechas estimadas con utilización de ${fNum(A.utilizacion, 1)} h/día.</small>
    </div>
    <div>
      <div class="panel" style="border-color:${A.parada.requerida ? 'var(--alerta)' : 'var(--borde)'}">
        <h2>Próxima parada recomendada</h2>
        ${A.parada.requerida ? `<div class="v" style="font-size:1.5rem;font-weight:700">${fFecha(A.parada.fecha)}</div>
          <p>${esc(A.parada.texto)} Límite (Danger): ${fFecha(A.parada.fechaLimite)}.</p>
          <p style="margin-bottom:4px"><b>Incluir en la parada</b> (en Alerta o que la alcanzarán para entonces):</p>
          <div class="fila">${A.parada.incluir.map((c) => `<a class="chip" href="#/punto/${c}" style="color:${COLOR[A.puntos[c].estadoActual]}">${c}</a>`).join('')}</div>`
          : `<p>${esc(A.parada.texto)}</p>`}
      </div>
      <div class="espacio"></div>
      <div class="panel">
        <h2>Alertas activas</h2>
        ${A.alertas.filter((a) => a.severidad !== 'info').slice(0, 6).map((a) => `<div class="alerta-item"><div>${sevHTML(a.severidad)}</div><div><b>${esc(a.titulo)}</b></div><div></div></div>`).join('')}
        <p><a href="#/alertas">Centro de alertas →</a></p>
      </div>
    </div>
  </div>
  <div class="espacio"></div>

  <h2>Zonas</h2>
  <div class="rejilla c3">
    ${Object.entries(cfg.zonas).map(([id, z]) => { const kz = k.porZona[id]; return `<div class="tarjeta clic" data-h="#/zona/${id}" role="link" tabindex="0">
      <div class="fila entre"><a href="#/zona/${id}"><b>${esc(z.nombre)}</b></a>${estadoHTML(kz.estado)}</div>
      <div class="zona-esq" data-z="${id}">${esquemaHTML(id, A, { etiquetas: false, sim: app.sim.dh ? simular(A, app.sim.dh) : null })}</div>
      <small>${kz.reparaciones} reparaciones · ${kz.cambios} cambios · ${kz.reincidencias} reincidencias · tasa media ${fTasa(kz.tasaMedia)}</small>
    </div>`; }).join('')}
  </div>
  <div class="espacio"></div>
  <div class="rejilla c2">
    <div class="panel"><h3>Tasa media de crecimiento por zona (grietas activas)</h3><div class="grafico chico" style="height:150px"><canvas id="gTasa"></canvas></div></div>
    <div class="panel"><h3>Reparaciones y cambios por zona (historial)</h3><div class="grafico chico" style="height:150px"><canvas id="gRep"></canvas></div></div>
  </div>`;

  root.querySelectorAll('tr[data-h], .tarjeta[data-h]').forEach((el) => {
    el.addEventListener('click', (e) => { if (!e.target.closest('a')) app.ir(el.dataset.h); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') app.ir(el.dataset.h); });
  });
  const zonas = Object.keys(cfg.zonas);
  const c1 = graficoBarras(root.querySelector('#gTasa'), zonas.map((z) => cfg.zonas[z].corto), zonas.map((z) => k.porZona[z].tasaMedia), { unidad: 'mm/1000 h', color: '#e0a020' });
  const c2 = graficoBarras(root.querySelector('#gRep'), zonas.map((z) => cfg.zonas[z].corto), zonas.map((z) => k.porZona[z].reparaciones + k.porZona[z].cambios), { unidad: 'eventos', color: '#4aa3df' });
  app.alLimpiar(() => { c1.destroy(); c2.destroy(); });

  // 3D
  let pala = null; let vivo = true;
  import('../ui/pala3d.js').then(({ crearPala3D }) => {
    const cont = root.querySelector('#p3d');
    if (!vivo || !cont) return;
    cont.querySelector('.cargando')?.remove();
    return crearPala3D(cont, A, { onClick: (c) => app.ir('#/punto/' + c) }).then((p) => { if (!vivo) { p.destruir(); return; } pala = p; aplicarSim(); });
  }).catch((e) => { console.warn(e); const c = root.querySelector('#p3d'); if (c) c.innerHTML = `<div class="cargando">No se pudo cargar el modelo 3D (${esc(e.message)}). El resto de la plataforma funciona normalmente.</div>`; });
  app.alLimpiar(() => { vivo = false; pala?.destruir(); });

  // Simulador
  const dh = root.querySelector('#dh'); const iv = root.querySelector('#iv');
  function aplicarSim() {
    const v = +dh.value; app.sim.dh = v;
    const s = simular(A, v);
    root.querySelector('#dhV').textContent = v ? `+${fNum(v)} h → ${fFecha(s.fecha)}` : 'hoy (última inspección)';
    root.querySelector('#simEtq').textContent = v ? `Estado proyectado a ${fFecha(s.fecha)}` : 'Estado actual';
    pala?.actualizar(v ? s.puntos : null);
    const cambios = Object.entries(s.puntos).filter(([, x]) => x.estado !== x.estadoHoy && x.estado !== 'N/I');
    root.querySelector('#simRes').innerHTML = !v ? '<p class="tenue" style="font-size:.88rem">Mueva el control para proyectar cada grieta con su tendencia del ciclo actual. El modelo 3D y los esquemas se recolorean con el estado proyectado.</p>'
      : cambios.length ? `<p style="margin:.6em 0 .3em">Cambian de estado:</p><ul class="lista-simple">${cambios.map(([c, x]) => `<li><a href="#/punto/${c}">${c}</a>: ${x.estadoHoy} → ${estadoHTML(x.estado)} (${fNum(x.L)} mm)</li>`).join('')}</ul>`
      : '<p class="tenue">Ningún punto cambia de estado en ese horizonte.</p>';
    root.querySelectorAll('.zona-esq').forEach((d) => { d.innerHTML = esquemaHTML(d.dataset.z, A, { etiquetas: false, sim: v ? s : null }); });
  }
  function aplicarIv() {
    const I = +iv.value; const ev = evaluarIntervalo(A, I);
    root.querySelector('#ivV').textContent = `${fNum(I)} h (≈ ${fNum(I / A.utilizacion)} días)`;
    root.querySelector('#ivRes').innerHTML = `
      <p style="font-size:.88rem;margin:.5em 0">Intervalo máximo recomendado: <b>${ev.recomendado ? fH(Math.floor(ev.recomendado / 50) * 50) : '—'}</b>
      <span class="tenue">(tiempo que la grieta más rápida observada permanece en la banda de Alerta; inspeccionar más seguido garantiza detectarla antes de Danger).</span></p>
      ${ev.enRiesgo.length ? `<div class="aviso rojo" style="font-size:.86rem"><b>Con ${fNum(I)} h hay ${ev.enRiesgo.length} punto(s) en riesgo:</b><ul class="lista-simple">${ev.enRiesgo.map((f) => `<li><b>${f.codigo}</b>: ${esc(f.riesgo)}</li>`).join('')}</ul></div>` : '<div class="aviso azul" style="font-size:.86rem">Con este intervalo ningún punto puede pasar de Normal a Crítico sin ser detectado en Alerta.</div>'}`;
  }
  dh.addEventListener('input', aplicarSim); iv.addEventListener('input', aplicarIv);
  aplicarSim(); aplicarIv();
}

const kpi = (t, v, d) => `<div class="kpi"><div class="t">${t}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
