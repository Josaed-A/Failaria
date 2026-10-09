// Simulador de falla: ¿cuándo y cómo fallaría cada pieza según la gravedad de su grieta?
// Tiempo real (ley de Paris), mapa de daño tipo FEA y sobreesfuerzo aplicado con el mouse.
import { crearSimulacion, cargasPorDistancia, curvaFAD, CAUSAS, LR_MAX, MODOS, predecir } from '../falla.js';
import { descargar } from '../almacen.js';
import { COLOR, esc, estadoHTML, fFecha, fH, fNum } from '../ui/formato.js';
import { info } from '../ui/ayuda.js';

let velocidadSel = null; let seleccion = null;

export function render(root, app) {
  const A = app.A; const cfg = app.cfg; const f = { ...cfg.falla };
  app.migas([{ t: 'Flota', h: '#/flota' }, { t: `Equipo ${A.modelo.equipo.id}`, h: `#/equipo/${A.modelo.equipo.id}` }, { t: 'Simulador de falla' }]);
  if (!velocidadSel) velocidadSel = f.velocidades[1];
  const sim = crearSimulacion(A, cfg);
  const pred = predecir(A, cfg);
  const zonas = cfg.zonas;

  root.innerHTML = `
  <div class="cabecera">
    <div><h1>Simulador de falla ${info(`<p><b>Qué hace.</b> Hace avanzar las 12 grietas en el tiempo con la <b>ley de Paris</b> (la tasa crece con a<sup>m/2</sup>, m = ${f.m}) calibrada con la tasa medida de cada punto, hasta la <b>longitud crítica</b> a<sub>c</sub> = ${f.factorCritico} × Danger, donde la pieza se fractura.</p><p><b>Mapa FEA.</b> El color de la estructura muestra el daño: azul sano → rojo crítico. Crece alrededor de cada grieta según su gravedad y donde se aplicó sobreesfuerzo.</p><p><b>Tirar con el mouse.</b> Mantenga pulsado sobre el boom, brazo o cucharón y arrastre: aplica un sobreesfuerzo s (flecha roja) que multiplica la tasa de crecimiento por (1+s)<sup>${f.m}</sup> en los puntos cercanos y deja daño permanente. La estructura queda fija mientras tira; suelte para volver a orbitar.</p><p><b>Causa de la falla.</b> Si una grieta llega a a<sub>c</sub> con carga normal la falla es <i>por horas de uso</i>; si un tirón hace cruzar el FAD, es <i>por fuerza excesiva</i> (súbita). El reporte inferior detalla el esfuerzo recibido por cada punto.</p><p>Fundamentos y límites: <i>docs/MANTENIMIENTO_Y_FALLA.md</i>.</p>`)}</h1></div>
    <div class="fila no-print"><a class="btn" href="#/equipo/${esc(A.modelo.equipo.id)}">Equipo</a><a class="btn" href="#/alertas">Alertas</a></div>
  </div>

  <div class="sim-barra no-print">
    <button class="btn prim icono" id="bPlay" title="Reproducir / pausar">▶</button>
    <button class="btn icono" id="bReset" title="Reiniciar la simulación">↺</button>
    <label class="fila" style="gap:6px;font-size:.85rem">Velocidad <select id="vel">${f.velocidades.map((v) => `<option value="${v}" ${v === velocidadSel ? 'selected' : ''}>${fNum(v)} h/s</option>`).join('')}</select></label>
    <span class="reloj" id="reloj"></span>
    <label class="fila" style="gap:6px;font-size:.85rem;margin-left:auto"><input type="checkbox" id="chkTirar" checked> Tirar con el mouse ${info('Activado: mantener pulsado sobre la estructura y arrastrar aplica esfuerzo (la cámara no gira). Desactivado: el arrastre orbita la cámara.')}</label>
    <label class="fila" style="gap:6px;font-size:.85rem"><input type="checkbox" id="chkAuto"> Avanzar solo al tirar ${info('Con esta opción el reloj solo corre mientras se mantiene pulsado el mouse: cada «tirón» equivale a horas de operación bajo sobreesfuerzo.')}</label>
  </div>

  <div class="sim-layout">
    <div class="panel" style="padding:10px">
      <div class="sim-3d" id="s3d"><div class="cargando" style="padding-top:200px">Cargando modelo 3D…</div><div class="hud" id="hud"></div></div>
      <div class="fea-leyenda"><span>Daño</span><span>0</span><div class="barra-color"></div><span>crítico</span>
        <span style="margin-left:14px">${['Normal', 'Alerta', 'Crítico'].map((e) => `<i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${COLOR[e]};margin:0 3px 0 8px"></i>${e}`).join('')}<i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#000;box-shadow:0 0 4px #f22;margin:0 3px 0 8px"></i>Falla</span>
        ${info('Esferas: estado de cada punto (umbrales de la hoja Puntos). Barra negra sobre la pieza: la grieta dibujada a escala real (1 mm = 1 mm). Flecha roja: sobreesfuerzo del mouse.')}</div>
    </div>
    <div>
      <div class="panel" id="pPieza"></div>
      <div class="espacio"></div>
      <div class="panel" style="padding:10px">
        <div class="tabla-wrap"><table class="sim-tabla"><thead><tr><th>Punto</th><th>Gravedad ${info('Gravedad = L / a<sub>c</sub>. A 100 % la grieta alcanza la longitud crítica y la pieza falla.')}</th><th>Modo ${info(Object.values(MODOS).map((m) => `<p><b>${m.titulo}:</b> ${m.desc}</p>`).join(''))}</th><th class="n">Danger (h)</th><th class="n">Falla (h)</th></tr></thead><tbody id="tb"></tbody></table></div>
      </div>
      <div class="espacio"></div>
      <div class="rejilla c2">
        <div class="panel" style="padding:10px"><h3 style="margin:0 0 4px">FAD ${info('<p><b>Diagrama de evaluación de falla</b>, curva Opción 1 de BS 7910 / API 579. Eje vertical K<sub>r</sub> = K/K<sub>IC</sub> (fractura frágil, crece con √a y con el sobreesfuerzo). Eje horizontal L<sub>r</sub> = σ<sub>ref</sub>/σ<sub>y</sub> (colapso plástico del ligamento), con corte en L<sub>r,max</sub> = ${LR_MAX}.</p><p>Dentro de la curva la grieta es tolerable; al cruzarla la pieza falla por el mecanismo dominante. Al tirar con el mouse los puntos se desplazan en diagonal hacia la curva.</p>')}</h3><svg class="fad" id="fad" viewBox="0 0 220 190"></svg></div>
        <div class="panel" style="padding:10px"><h3 style="margin:0 0 4px">Eventos</h3><div class="sim-eventos" id="ev"><span class="tenue">Pulse ▶ o tire de la estructura.</span></div></div>
      </div>
    </div>
  </div>
  <div class="espacio"></div>
  <div class="panel" style="padding:10px">
    <div class="fila entre"><h2 style="margin:0">Reporte de esfuerzo y falla ${info(`<p>Qué esfuerzo recibió cada punto durante la simulación y, si falló, <b>por qué</b>:</p>${Object.values(CAUSAS).map((c) => `<p><b>${c.titulo}:</b> ${c.desc}</p>`).join('')}<p><b>Horas sobrecargado:</b> tiempo simulado con sobreesfuerzo. <b>s medio / máx:</b> sobreesfuerzo relativo (Δσ extra / Δσ nominal). <b>Dosis:</b> horas equivalentes de daño adicional, ∫[(1+s)<sup>m</sup> − 1]·dh. <b>Δa tiempo / Δa sobrecarga:</b> mm de crecimiento con carga normal y mm adicionales por sobreesfuerzo.</p>`)}</h2>
      <button class="btn chico no-print" id="bCsv">Descargar CSV</button></div>
    <div class="tabla-wrap" style="margin-top:6px"><table class="sim-tabla"><thead><tr><th>Punto</th><th class="n">L inicial → actual</th><th class="n">h sobrecargado</th><th class="n">s medio</th><th class="n">s máx</th><th class="n">Dosis (h eq.)</th><th class="n">Δa tiempo</th><th class="n">Δa sobrecarga</th><th>Falla</th></tr></thead><tbody id="tbRep"></tbody></table></div>
  </div>`;

  const $ = (id) => root.querySelector('#' + id);
  let corriendo = false; let visor = null; let vivo = true; let ultimoPanel = 0; let est = sim.estado();

  // --- 3D ---
  import('../ui/simulador3d.js').then(({ crearSimulador3D }) => {
    const cont = $('s3d'); if (!vivo || !cont) return;
    cont.querySelector('.cargando')?.remove();
    return crearSimulador3D(cont, A, { radio: f.radioInfluenciaM, sMax: f.sMax, pxPorS: f.pxPorS, onClick: (c) => { seleccion = c; pintarPanel(true); } })
      .then((v) => { if (!vivo) { v.destruir(); return; } visor = v; visor.tirar($('chkTirar').checked); visor.actualizar(est); });
  }).catch((e) => { console.warn(e); $('s3d').innerHTML = `<div class="cargando">No se pudo cargar el 3D (${esc(e.message)}). La tabla y la predicción siguen funcionando.</div>`; });

  // --- Bucle de simulación ---
  let tPrev = performance.now();
  (function loop() {
    if (!vivo) return;
    const now = performance.now(); const dt = Math.min(0.1, (now - tPrev) / 1000); tPrev = now;
    const carga = visor ? visor.carga() : { s: 0, distancias: {} };
    const soloTirar = $('chkAuto').checked;
    const avanza = soloTirar ? carga.s > 0 : (corriendo || carga.s > 0);
    if (avanza) {
      const cargas = cargasPorDistancia(carga.s, carga.distancias, f.radioInfluenciaM);
      sim.paso(velocidadSel * dt, cargas);
      est = sim.estado(); visor?.actualizar(est);
    }
    hud(carga);
    if (now - ultimoPanel > 250 || !avanza && now - ultimoPanel > 1000) { ultimoPanel = now; pintarPanel(); }
    requestAnimationFrame(loop);
  })();

  function hud(carga) {
    const h = $('hud'); if (!h) return;
    if (carga.s > 0) {
      const pieza = { boom: zonas.BM.nombre, brazo: zonas.BR.nombre, cucharon: zonas.CU.nombre }[carga.pieza] || '';
      const mas = Object.entries(cargasPorDistancia(carga.s, carga.distancias, f.radioInfluenciaM)).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, s]) => s > 0.03);
      h.innerHTML = `<b>Sobreesfuerzo ${fNum(carga.s * 100)} %</b> en ${esc(pieza)} · tasa × ${fNum(Math.pow(1 + carga.s, f.m), 1)}<br>${mas.map(([c, s]) => `${c}: +${fNum(s * 100)} %`).join(' · ') || 'lejos de los puntos de inspección'}`;
    } else h.innerHTML = `<span class="tenue">${visor ? 'Arrastre para orbitar · mantenga pulsado sobre la estructura y arrastre para tirar' : ''}</span>`;
  }

  function pintarPanel(forzar = false) {
    const lista = Object.values(est).sort((a, b) => (a.fallado === b.fallado ? b.severidad - a.severidad : a.fallado ? -1 : 1));
    $('reloj').textContent = `+${fNum(Math.round(sim.horas))} h · ${fFecha(sim.fecha())}`;
    $('tb').innerHTML = lista.map((x) => `<tr class="clic ${x.fallado ? 'fallado' : ''} ${seleccion === x.codigo ? 'sel' : ''}" data-c="${x.codigo}">
      <td><b>${x.codigo}</b><br><small class="num">${fNum(x.L)} mm</small></td>
      <td><div class="sev-barra" title="${fNum(x.severidad * 100)} %"><i style="width:${Math.round(x.severidad * 100)}%;background:${x.severidad > 0.62 ? '#d61f1f' : x.severidad > 0.37 ? '#f2d23a' : '#2ec46a'}"></i></div><small>${fNum(x.severidad * 100)} %</small></td>
      <td><span class="modo-chip modo-${x.modo}">${MODOS[x.modo].corto}</span></td>
      <td class="n">${x.fallado ? '—' : x.horasDanger === 0 ? 'superado' : fNum(x.horasDanger)}</td>
      <td class="n">${x.fallado ? `<b style="color:#ff8080">+${fNum(Math.round(x.horaFalla))} h</b>` : Number.isFinite(x.horasCritico) ? fNum(x.horasCritico) : '∞'}</td></tr>`).join('');
    $('tb').querySelectorAll('tr').forEach((tr) => tr.addEventListener('click', () => { seleccion = tr.dataset.c; pintarPanel(true); }));

    // Pieza en riesgo + punto seleccionado
    const porZona = Object.keys(zonas).map((z) => { const ps = lista.filter((x) => A.puntos[x.codigo].punto.zonaId === z); const peor = ps.reduce((a, x) => (x.fallado ? (a?.fallado && a.horaFalla < x.horaFalla ? a : x) : a?.fallado ? a : !a || x.horasCritico < a.horasCritico ? x : a), null); return { z, peor }; });
    const primero = [...porZona].sort((a, b) => (a.peor.fallado ? -1 : b.peor.fallado ? 1 : a.peor.horasCritico - b.peor.horasCritico))[0];
    const sel = seleccion ? est[seleccion] : null; const M = sel ? sim.modelos[seleccion] : null; const p0 = sel ? pred.puntos.find((x) => x.codigo === seleccion) : null;
    $('pPieza').innerHTML = `
      <h2 style="margin-bottom:6px">Pieza en riesgo ${info('Para cada zona se toma el punto que antes alcanza la longitud crítica. Las horas se cuentan desde el instante simulado, sin sobreesfuerzo adicional; la fecha usa la utilización histórica.')}</h2>
      <div class="rejilla c3" style="gap:8px">${porZona.map(({ z, peor }) => `<div class="kpi" style="padding:8px 10px;border-color:${primero.z === z ? 'var(--critico)' : 'var(--borde)'}"><div class="t">${esc(zonas[z].corto)}</div>
        <div class="v" style="font-size:1.05rem">${peor.fallado ? '<span style="color:#ff8080">FALLÓ</span>' : Number.isFinite(peor.horasCritico) ? fH(Math.round(peor.horasCritico)) : '∞'}</div>
        <div class="d">${peor.codigo} · <span class="modo-chip modo-${peor.modo}">${MODOS[peor.modo].corto}</span>${!peor.fallado && Number.isFinite(peor.horasCritico) ? `<br>${fFecha(A.fechaDeHoras(A.horasActuales + sim.horas + peor.horasCritico))}` : peor.fallado ? `<br>a +${fNum(Math.round(peor.horaFalla))} h` : ''}</div></div>`).join('')}</div>
      ${sel ? `<div class="aviso ${sel.fallado || sel.modo === 'acelerada' ? 'rojo' : sel.modo === 'propagacion' ? '' : 'azul'}" style="margin:10px 0 0;font-size:.86rem">
        <b>${seleccion}</b> · ${esc(A.puntos[seleccion].punto.descripcion)}<br>
        L ${fNum(sel.a0)} → <b>${fNum(sel.L)} mm</b> (a<sub>c</sub> ${fNum(sel.aCrit)} mm) · tasa ${fNum(sel.tasa)} mm/1000 h${sel.s > 0.05 ? ` <b style="color:#ff8080">con sobreesfuerzo +${fNum(sel.s * 100)} %</b>` : ''}<br>
        ${sel.fallado && sel.causaInfo ? `<b style="color:#ff8080">FALLÓ a +${fNum(Math.round(sel.horaFalla))} h · ${sel.causaInfo.titulo}.</b> ${sel.causaInfo.desc}` : `<b>${MODOS[sel.modo].titulo}.</b> ${MODOS[sel.modo].desc}`}<br>
        ${sel.fallado ? '' : Number.isFinite(sel.horasCritico) ? `Falla en ≈ ${fH(Math.round(sel.horasCritico))} (${fFecha(A.fechaDeHoras(A.horasActuales + sim.horas + sel.horasCritico))}) por ${sel.fad.dominante === 'fractura' ? 'fractura inestable (K<sub>r</sub> domina)' : 'colapso del ligamento (L<sub>r</sub> domina)'}; la plataforma proyectaba Danger en ${fNum(p0.horasDangerLineal)} h con tasa constante, Paris lo adelanta a ${fNum(Math.round(p0.horasDanger))} h.` : 'Sin crecimiento previsto mientras no haya sobrecarga.'}
        ${sel.fallado && sel.detalleFalla ? `<div style="margin-top:6px;padding:6px 8px;border-radius:6px;background:rgba(214,69,69,.18)">${esc(sel.detalleFalla)}</div>` : ''}
        <div style="margin-top:6px;font-size:.82rem"><b>Esfuerzo al que se sometió:</b> ${sel.esfuerzo.horas > 0 ? `${fNum(Math.round(sel.esfuerzo.horas))} h sobrecargado · s medio +${fNum(sel.esfuerzo.sMedio * 100)} % · máx +${fNum(sel.esfuerzo.sMax * 100)} % · dosis ${fNum(Math.round(sel.esfuerzo.dosis))} h eq. · crecimiento ${fNum(Math.round(sel.esfuerzo.crecTiempo))} mm por tiempo + ${fNum(Math.round(sel.esfuerzo.crecSobrecarga))} mm por sobrecarga (${fNum(sel.esfuerzo.fraccionSobrecarga * 100)} %)` : `solo carga normal de operación · crecimiento ${fNum(Math.round(sel.esfuerzo.crecTiempo))} mm`}</div>
        <a href="#/punto/${seleccion}">Ver historial del punto →</a></div>` : '<p class="tenue" style="margin:10px 0 0;font-size:.85rem">Clic en una esfera o en una fila para ver el detalle del punto.</p>'}`;

    // FAD
    const X = (Lr) => 28 + (Lr / 1.3) * 180, Y = (Kr) => 165 - (Kr / 1.3) * 150;
    const arco = []; for (let i = 0; i <= 46; i++) { const Lr = LR_MAX * (i / 46); arco.push(`${X(Lr).toFixed(1)},${Y(curvaFAD(Lr)).toFixed(1)}`); }
    $('fad').innerHTML = `<path d="M${X(0)},${Y(0)} L${arco.join(' L')} L${X(LR_MAX)},${Y(0)} Z" fill="rgba(46,158,91,.14)" stroke="#5ccf8c" stroke-width="1.2"/>
      <line x1="${X(0)}" y1="${Y(0)}" x2="${X(1.3)}" y2="${Y(0)}" stroke="#6f7c92"/><line x1="${X(0)}" y1="${Y(0)}" x2="${X(0)}" y2="${Y(1.3)}" stroke="#6f7c92"/>
      <text x="${X(1.3) - 2}" y="${Y(0) + 14}" fill="#a9b4c6" font-size="9" text-anchor="end">Lr = σ/σy (colapso)</text><text x="${X(0) - 4}" y="${Y(1.3) + 4}" fill="#a9b4c6" font-size="9" transform="rotate(-90 ${X(0) - 4},${Y(1.3) + 4})" text-anchor="end">Kr = K/KIC (fractura)</text>
      <text x="${X(LR_MAX)}" y="${Y(0) + 10}" fill="#6f7c92" font-size="8" text-anchor="middle">Lr,max</text><text x="${X(0) - 6}" y="${Y(1) + 3}" fill="#6f7c92" font-size="8" text-anchor="end">1</text>
      <text x="${X(0.3)}" y="${Y(0.35)}" fill="#5ccf8c" font-size="9">tolerable</text><text x="${X(0.85)}" y="${Y(1.1)}" fill="#ff8080" font-size="9">falla</text>
      ${lista.map((x) => `<circle cx="${X(Math.min(1.3, x.fad.Lr)).toFixed(1)}" cy="${Y(Math.min(1.3, x.fad.Kr)).toFixed(1)}" r="${seleccion === x.codigo ? 5 : 3.2}" fill="${x.fallado ? '#000' : COLOR[x.estado]}" stroke="${seleccion === x.codigo ? '#fff' : x.fallado ? '#f22' : '#0c1320'}" stroke-width="1.2"><title>${x.codigo}: Kr ${x.fad.Kr.toFixed(2)} · Lr ${x.fad.Lr.toFixed(2)}</title></circle>`).join('')}
      ${sel ? `<text x="${X(Math.min(1.3, sel.fad.Lr)) + 7}" y="${Y(Math.min(1.3, sel.fad.Kr)) + 3}" fill="#fff" font-size="9" font-weight="700">${seleccion}</text>` : ''}`;

    // Reporte de esfuerzo
    $('tbRep').innerHTML = sim.reporte().sort((a, b) => (a.fallado === b.fallado ? b.dosis - a.dosis || b.severidad - a.severidad : a.fallado ? -1 : 1)).map((r) => `<tr class="${r.fallado ? 'fallado' : ''}"><td><b>${r.codigo}</b></td><td class="n">${fNum(r.L0)} → ${fNum(r.L)} mm</td><td class="n">${fNum(r.horasSobrecarga)}</td><td class="n">${r.horasSobrecarga ? '+' + fNum(r.sMedio * 100) + ' %' : '—'}</td><td class="n">${r.sMax ? '+' + fNum(r.sMax * 100) + ' %' : '—'}</td><td class="n">${fNum(r.dosis)}</td><td class="n">${fNum(r.crecTiempo)} mm</td><td class="n">${r.crecSobrecarga ? `${fNum(r.crecSobrecarga)} mm (${fNum(r.fraccionSobrecarga * 100)} %)` : '—'}</td><td>${r.fallado ? `<b style="color:#ff8080">+${fNum(r.horaFalla)} h · ${esc(r.causa)}</b><br><small>${esc(r.detalleFalla)}</small>` : '<span class="tenue">—</span>'}</td></tr>`).join('');

    // Eventos
    if (sim.eventos.length) $('ev').innerHTML = [...sim.eventos].reverse().slice(0, 40).map((e) => `<div><span class="tenue num">+${fNum(Math.round(e.horas))} h</span> · <b>${e.codigo}</b> ${e.tipo === 'falla' ? `<span class="modo-chip modo-fractura">FALLA</span> ${CAUSAS[e.causa]?.corto ?? ''} · ${fNum(Math.round(e.L))} mm${e.s ? ` con +${fNum(e.s * 100)} %` : ''}` : e.tipo === 'inicio' ? `grieta iniciada por sobrecarga (+${fNum((e.s || 0) * 100)} %)` : `${e.de} → ${estadoHTML(e.a)} (${fNum(Math.round(e.L))} mm)`}</div>`).join('');
  }

  // --- Controles ---
  const bPlay = $('bPlay');
  const setPlay = (on) => { corriendo = on; bPlay.textContent = on ? '❚❚' : '▶'; bPlay.classList.toggle('prim', !on); };
  bPlay.addEventListener('click', () => setPlay(!corriendo));
  $('bReset').addEventListener('click', () => { sim.reiniciar(); est = sim.estado(); visor?.limpiarDano(); visor?.actualizar(est); $('ev').innerHTML = '<span class="tenue">Simulación reiniciada.</span>'; pintarPanel(true); setPlay(false); });
  $('vel').addEventListener('change', (e) => { velocidadSel = +e.target.value; });
  $('chkTirar').addEventListener('change', (e) => visor?.tirar(e.target.checked));
  $('bCsv').addEventListener('click', () => {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cols = ['codigo', 'L0', 'L', 'aCrit', 'modo', 'horasSobrecarga', 'sMedio', 'sMax', 'dosis', 'crecTiempo', 'crecSobrecarga', 'fraccionSobrecarga', 'fallado', 'horaFalla', 'causa', 'detalleFalla'];
    const csv = [['Simulación', `+${Math.round(sim.horas)} h`, sim.fecha()].map(q).join(';'), cols.map(q).join(';'), ...sim.reporte().map((r) => cols.map((c) => q(typeof r[c] === 'number' ? Math.round(r[c] * 1000) / 1000 : r[c])).join(';'))].join('\r\n');
    descargar(`EX3600_reporte_esfuerzo_+${Math.round(sim.horas)}h.csv`, '\ufeff' + csv, 'text/csv;charset=utf-8');
  });
  document.addEventListener('keydown', teclas);
  function teclas(e) { if (e.target.matches('input,select,textarea')) return; if (e.code === 'Space') { e.preventDefault(); setPlay(!corriendo); } }
  app.alLimpiar(() => { vivo = false; visor?.destruir(); document.removeEventListener('keydown', teclas); });
  pintarPanel(true);
}
