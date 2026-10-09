// Simulador de falla: ¿cuándo y cómo fallaría cada pieza según la gravedad de su grieta?
// Tiempo real (ley de Paris), mapa de daño tipo FEA, sobreesfuerzo con el mouse, modo por pieza
// (boom · brazo · cucharón) con inspección de cada punto y lupa de grieta.
import { crearSimulacion, cargasPorDistancia, curvaFAD, CAUSAS, LR_MAX, MODOS, predecir } from '../falla.js';
import { descargar } from '../almacen.js';
import { COLOR, esc, estadoHTML, fFecha, fH, fNum } from '../ui/formato.js';
import { info } from '../ui/ayuda.js';

let velocidadSel = null; let seleccion = null; let modoPieza = 'general';
let simActual = null; // { A, sim }: la simulación sobrevive al cambiar de pieza o de vista
const PIEZAS = { general: { nombre: 'General', zona: null }, boom: { nombre: 'Boom', zona: 'BM' }, brazo: { nombre: 'Brazo', zona: 'BR' }, cucharon: { nombre: 'Cucharón', zona: 'CU' } };
const PIEZA_DE_ZONA = { BM: 'boom', BR: 'brazo', CU: 'cucharon' };

export function render(root, app, [piezaRuta]) {
  const A = app.A; const cfg = app.cfg; const f = { ...cfg.falla };
  modoPieza = piezaRuta && PIEZAS[piezaRuta] ? piezaRuta : 'general';
  const zonaSel = PIEZAS[modoPieza].zona; const zonaCfg = zonaSel ? cfg.zonas[zonaSel] : null;
  app.migas([{ t: 'Flota', h: '#/flota' }, { t: `Equipo ${A.modelo.equipo.id}`, h: `#/equipo/${A.modelo.equipo.id}` }, { t: 'Simulador de falla', h: '#/simulador' }, ...(zonaCfg ? [{ t: zonaCfg.nombre }] : [])]);
  if (!velocidadSel) velocidadSel = f.velocidades[1];
  if (!simActual || simActual.A !== A) simActual = { A, sim: crearSimulacion(A, cfg) };
  const sim = simActual.sim;
  const pred = predecir(A, cfg);
  const zonas = cfg.zonas;
  const codigosPieza = Object.keys(A.puntos).filter((c) => !zonaSel || A.puntos[c].punto.zonaId === zonaSel);
  if (seleccion && !codigosPieza.includes(seleccion)) seleccion = null;

  root.innerHTML = `
  <div class="cabecera">
    <div><h1>Simulador de falla${zonaCfg ? ` · ${esc(zonaCfg.nombre)}` : ''} ${info(`<p><b>Qué hace.</b> Hace avanzar las 12 grietas en el tiempo con la <b>ley de Paris</b> (la tasa crece con a<sup>m/2</sup>, m = ${f.m}) calibrada con la tasa medida de cada punto, hasta la <b>longitud crítica</b> a<sub>c</sub> = ${f.factorCritico} × Danger, donde la pieza se fractura.</p><p><b>General / Boom / Brazo / Cucharón.</b> En modo pieza se muestra solo ese componente, modelado según su esquema de inspección, con sus puntos; la simulación es la misma (las grietas siguen creciendo al cambiar de pieza).</p><p><b>Mapa FEA.</b> El color de la estructura muestra el daño: azul sano → rojo crítico. Crece alrededor de cada grieta según su gravedad y donde se aplicó sobreesfuerzo.</p><p><b>Tirar con el mouse.</b> Mantenga pulsado sobre la estructura y arrastre: aplica un sobreesfuerzo s (flecha roja) que multiplica la tasa por (1+s)<sup>${f.m}</sup> en los puntos cercanos y deja daño permanente. La pieza queda fija mientras tira; suelte para volver a orbitar.</p><p><b>Lupa de grieta.</b> Vista cercana del punto seleccionado: campo de tensión en las puntas, zona plástica, umbrales y cuánto crecerá en el próximo intervalo con y sin carga. Arrastrar sobre la lupa aplica esfuerzo solo a ese punto.</p><p><b>Causa de la falla.</b> Si una grieta llega a a<sub>c</sub> con carga normal la falla es <i>por horas de uso</i>; si un tirón hace cruzar el FAD, es <i>por fuerza excesiva</i> (súbita).</p><p>Fundamentos y límites: <i>docs/MANTENIMIENTO_Y_FALLA.md</i>.</p>`)}</h1></div>
    <div class="fila no-print">
      <div class="seg" id="segPieza">${Object.entries(PIEZAS).map(([k, v]) => `<button data-p="${k}" class="${modoPieza === k ? 'on' : ''}">${v.nombre}</button>`).join('')}</div>
      <a class="btn" href="#/equipo/${esc(A.modelo.equipo.id)}">Equipo</a>
    </div>
  </div>

  <div class="sim-barra no-print">
    <button class="btn prim icono" id="bPlay" title="Reproducir / pausar (barra espaciadora)">▶</button>
    <button class="btn icono" id="bReset" title="Reiniciar la simulación">↺</button>
    <label class="fila" style="gap:6px;font-size:.85rem">Velocidad <select id="vel">${f.velocidades.map((v) => `<option value="${v}" ${v === velocidadSel ? 'selected' : ''}>${fNum(v)} h/s</option>`).join('')}</select></label>
    <span class="reloj" id="reloj"></span>
    <label class="fila" style="gap:6px;font-size:.85rem;margin-left:auto"><input type="checkbox" id="chkTirar" checked> Tirar con el mouse ${info('Activado: mantener pulsado sobre la estructura y arrastrar aplica esfuerzo (la cámara no gira). Desactivado: el arrastre orbita la cámara.')}</label>
    <label class="fila" style="gap:6px;font-size:.85rem"><input type="checkbox" id="chkAuto"> Avanzar solo al tirar ${info('Con esta opción el reloj solo corre mientras se mantiene pulsado el mouse (en el 3D o en la lupa): cada «tirón» equivale a horas de operación bajo sobreesfuerzo.')}</label>
  </div>

  <div class="sim-layout">
    <div>
      <div class="panel" style="padding:10px">
        <div class="sim-3d ${zonaSel ? 'pieza' : ''}" id="s3d"><div class="cargando" style="padding-top:200px">Cargando modelo 3D…</div><div class="hud" id="hud"></div>
          <div class="sim-vistas no-print"><button class="btn chico" id="bEncuadre" title="Encuadre general">⌂</button></div></div>
        <div class="fea-leyenda"><span>Daño</span><span>0</span><div class="barra-color"></div><span>crítico</span>
          <span style="margin-left:14px">${['Normal', 'Alerta', 'Crítico'].map((e) => `<i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${COLOR[e]};margin:0 3px 0 8px"></i>${e}`).join('')}<i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#000;box-shadow:0 0 4px #f22;margin:0 3px 0 8px"></i>Falla</span>
          ${info('Esferas: estado de cada punto (umbrales de la hoja Puntos). Barra negra sobre la pieza: la grieta dibujada a escala real (1 mm = 1 mm). Anillos oscuros: mamparos y cordones transversales. Flecha roja: sobreesfuerzo del mouse.')}</div>
      </div>
      <div class="espacio"></div>
      <div class="panel" style="padding:10px" id="pLupa">
        <div class="fila entre"><h2 style="margin:0">Lupa de grieta <span id="lupaTitulo" class="tenue" style="font-weight:400;font-size:.9rem"></span> ${info('<p>Vista cercana de la grieta en el talón de soldadura del punto seleccionado, a escala (regla en mm; a<sub>c</sub> ocupa el ancho).</p><p><b>Colores:</b> campo de tensión de Irwin alrededor de las puntas, σ ∝ K/√(2πr); círculo punteado: zona plástica. <b>Línea negra:</b> grieta actual. <b>Trazo blanco:</b> hasta dónde llegará en el próximo intervalo sin sobrecarga; <b>trazo rojo:</b> con el sobreesfuerzo aplicado.</p><p>Arrastre sobre la lupa para aplicar esfuerzo solo a este punto.</p>')}</h2>
          <span class="fila no-print"><button class="btn chico" id="bVerPunto" title="Llevar la cámara 3D al punto">Ver en 3D</button></span></div>
        <canvas id="lupa" class="lupa" aria-label="Lupa de grieta"></canvas>
        <p class="tenue" id="lupaNota" style="margin:6px 0 0;font-size:.82rem">Seleccione un punto (esfera, fila o tarjeta de inspección).</p>
      </div>
    </div>
    <div>
      ${zonaSel ? `<div class="panel" id="pInsp"></div><div class="espacio"></div>` : ''}
      <div class="panel" id="pPieza"></div>
      <div class="espacio"></div>
      <div class="panel" style="padding:10px">
        <div class="tabla-wrap"><table class="sim-tabla"><thead><tr><th>Punto</th><th>Gravedad<br><small>y modo</small> ${info('<p>Gravedad = L / a<sub>c</sub>. A 100 % la grieta alcanza la longitud crítica y la pieza falla.</p>' + Object.values(MODOS).map((m) => `<p><b>${m.titulo}:</b> ${m.desc}</p>`).join(''))}</th><th class="n">Danger<br><small>h</small></th><th class="n">Falla<br><small>h</small></th></tr></thead><tbody id="tb"></tbody></table></div>
      </div>
      <div class="espacio"></div>
      <div class="rejilla c2">
        <div class="panel" style="padding:10px"><h3 style="margin:0 0 4px">FAD ${info(`<p><b>Diagrama de evaluación de falla</b>, curva Opción 1 de BS 7910 / API 579. Eje vertical K<sub>r</sub> = K/K<sub>IC</sub> (fractura frágil, crece con √a y con el sobreesfuerzo). Eje horizontal L<sub>r</sub> = σ<sub>ref</sub>/σ<sub>y</sub> (colapso plástico del ligamento), con corte en L<sub>r,max</sub> = ${LR_MAX}.</p><p>Dentro de la curva la grieta es tolerable; al cruzarla la pieza falla por el mecanismo dominante. Al tirar con el mouse los puntos se desplazan en diagonal hacia la curva.</p>`)}</h3><svg class="fad" id="fad" viewBox="0 0 220 190"></svg></div>
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
  let corriendo = false; let visor = null; let lupa = null; let vivo = true; let ultimoPanel = 0; let est = sim.estado(); let sLupa = 0;

  // --- 3D ---
  import('../ui/simulador3d.js').then(({ crearSimulador3D }) => {
    const cont = $('s3d'); if (!vivo || !cont) return;
    cont.querySelector('.cargando')?.remove();
    return crearSimulador3D(cont, A, { pieza: modoPieza, radio: f.radioInfluenciaM, sMax: f.sMax, pxPorS: f.pxPorS, onClick: (c) => seleccionar(c, true) })
      .then((v) => { if (!vivo) { v.destruir(); return; } visor = v; visor.tirar($('chkTirar').checked); visor.actualizar(est); if (seleccion) visor.enfocar(seleccion, zonaSel ? 4 : 6); });
  }).catch((e) => { console.warn(e); $('s3d').innerHTML = `<div class="cargando">No se pudo cargar el 3D (${esc(e.message)}). La tabla y la predicción siguen funcionando.</div>`; });

  // --- Lupa ---
  import('../ui/lupa.js').then(({ crearLupa }) => { if (!vivo) return; lupa = crearLupa($('lupa'), { sMax: f.sMax, pxPorS: f.pxPorS, onCarga: (s) => { sLupa = s; } }); pintarLupa(); });

  // --- Bucle de simulación ---
  let tPrev = performance.now();
  (function loop() {
    if (!vivo) return;
    const now = performance.now(); const dt = Math.min(0.1, (now - tPrev) / 1000); tPrev = now;
    const carga = visor ? visor.carga() : { s: 0, distancias: {} };
    const sTotal = Math.max(carga.s, sLupa);
    const soloTirar = $('chkAuto').checked;
    const avanza = soloTirar ? sTotal > 0 : (corriendo || sTotal > 0);
    if (avanza) {
      const cargas = cargasPorDistancia(carga.s, carga.distancias, f.radioInfluenciaM);
      if (sLupa > 0 && seleccion) cargas[seleccion] = Math.max(cargas[seleccion] || 0, sLupa);
      sim.paso(velocidadSel * dt, cargas);
      est = sim.estado(); visor?.actualizar(est);
    }
    hud(carga);
    if (now - ultimoPanel > 250 || (!avanza && now - ultimoPanel > 1000)) { ultimoPanel = now; pintarPanel(); pintarLupa(); }
    requestAnimationFrame(loop);
  })();

  function seleccionar(c, enfocar = false) {
    seleccion = c; pintarPanel(true); pintarLupa();
    if (enfocar) visor?.enfocar(c, zonaSel ? 4 : 6);
  }

  function hud(carga) {
    const h = $('hud'); if (!h) return;
    if (carga.s > 0) {
      const pieza = { boom: zonas.BM.nombre, brazo: zonas.BR.nombre, cucharon: zonas.CU.nombre }[carga.pieza] || '';
      const mas = Object.entries(cargasPorDistancia(carga.s, carga.distancias, f.radioInfluenciaM)).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, s]) => s > 0.03);
      h.innerHTML = `<b>Sobreesfuerzo ${fNum(carga.s * 100)} %</b> en ${esc(pieza)} · tasa × ${fNum(Math.pow(1 + carga.s, f.m), 1)}<br>${mas.map(([c, s]) => `${c}: +${fNum(s * 100)} %`).join(' · ') || 'lejos de los puntos de inspección'}`;
    } else if (sLupa > 0 && seleccion) h.innerHTML = `<b>Sobreesfuerzo ${fNum(sLupa * 100)} %</b> en ${seleccion} (desde la lupa)`;
    else h.innerHTML = `<span class="tenue">${visor ? (zonaSel ? 'Clic en una esfera para inspeccionar · mantenga pulsado y arrastre para tirar' : 'Arrastre para orbitar · mantenga pulsado sobre la estructura y arrastre para tirar') : ''}</span>`;
  }

  function pintarLupa() {
    const t = $('lupaTitulo'); const nota = $('lupaNota'); const cv = $('lupa');
    if (!seleccion || !lupa) { cv.style.display = 'none'; nota.style.display = ''; t.textContent = ''; return; }
    const x = est[seleccion]; const M = sim.modelos[seleccion];
    cv.style.display = 'block'; nota.style.display = 'none';
    t.textContent = `· ${seleccion} · ${A.puntos[seleccion].punto.descripcion}`;
    lupa.dibujar(M, x.a, Math.max(x.s || 0, sLupa), x.fad, A.intervalo, x.fallado);
  }

  function pintarPanel(forzar = false) {
    const todos = Object.values(est);
    const lista = todos.filter((x) => codigosPieza.includes(x.codigo)).sort((a, b) => (a.fallado === b.fallado ? b.severidad - a.severidad : a.fallado ? -1 : 1));
    $('reloj').textContent = `+${fNum(Math.round(sim.horas))} h · ${fFecha(sim.fecha())}`;
    $('tb').innerHTML = lista.map((x) => `<tr class="clic ${x.fallado ? 'fallado' : ''} ${seleccion === x.codigo ? 'sel' : ''}" data-c="${x.codigo}">
      <td><b>${x.codigo}</b><br><small class="num">${fNum(x.L)} mm</small></td>
      <td><div class="sev-fila"><div class="sev-barra" title="${fNum(x.severidad * 100)} %"><i style="width:${Math.round(x.severidad * 100)}%;background:${x.severidad > 0.62 ? '#d61f1f' : x.severidad > 0.37 ? '#f2d23a' : '#2ec46a'}"></i></div><small>${fNum(x.severidad * 100)} %</small></div><span class="modo-chip modo-${x.modo}">${MODOS[x.modo].corto}</span></td>
      <td class="n">${x.fallado ? '—' : x.horasDanger === 0 ? 'superado' : fNum(x.horasDanger)}</td>
      <td class="n">${x.fallado ? `<b style="color:#ff8080">+${fNum(Math.round(x.horaFalla))} h</b>` : Number.isFinite(x.horasCritico) ? fNum(x.horasCritico) : '∞'}</td></tr>`).join('');
    $('tb').querySelectorAll('tr').forEach((tr) => tr.addEventListener('click', () => seleccionar(tr.dataset.c)));

    // Inspección del componente (modo pieza)
    if (zonaSel) {
      const conGrieta = lista.filter((x) => x.L > 0).length;
      $('pInsp').innerHTML = `<h2 style="margin-bottom:6px">Inspección · ${esc(zonaCfg.nombre)} ${info(`<p>Recorrido de inspección del componente: los ${lista.length} puntos de la hoja Puntos (Caution ${A.puntos[lista[0].codigo].punto.caution} mm · Danger ${A.puntos[lista[0].codigo].punto.danger} mm).</p><p><b>Ver</b> lleva la cámara al punto; <b>Lupa</b> abre la vista cercana. Si existe grieta se dibuja sobre la pieza a escala; «sin grieta» significa L = 0 en la simulación.</p><p>Para registrar una inspección real use <a href="#/registrar">Registrar</a>.</p>`)}</h2>
        <p class="tenue" style="margin:0 0 8px;font-size:.85rem">${conGrieta} de ${lista.length} puntos con grieta · ${lista.filter((x) => x.fallado).length} fallados</p>
        <div class="insp-lista">${lista.sort((a, b) => a.codigo.localeCompare(b.codigo)).map((x) => { const p = A.puntos[x.codigo]; const real = p.ultimoValido; return `<div class="insp-tarjeta ${seleccion === x.codigo ? 'sel' : ''} ${x.fallado ? 'fallado' : ''}" data-c="${x.codigo}">
          <div class="fila entre"><b>${x.codigo}</b>${x.fallado ? '<span class="modo-chip modo-fractura">FALLA</span>' : estadoHTML(x.estado)}</div>
          <small class="tenue">${esc(p.punto.descripcion)}</small>
          <div class="fila entre" style="margin-top:4px"><span>${x.L > 0 ? `<b>Grieta ${fNum(x.L)} mm</b> <span class="modo-chip modo-${x.modo}">${MODOS[x.modo].corto}</span>` : '<span class="tenue">Sin grieta</span>'}</span></div>
          <small class="tenue">Último dato real: ${real ? `${fNum(real.Lef)} mm · ${fFecha(real.fecha)}` : 'N/I'}${x.a0 !== x.a ? ` · simulado ${fNum(x.a0)} → ${fNum(x.L)} mm` : ''}</small>
          <div class="fila no-print" style="margin-top:4px;gap:4px"><button class="btn chico" data-ver="${x.codigo}">Ver</button><button class="btn chico" data-lupa="${x.codigo}">Lupa</button><a class="btn chico" href="#/punto/${x.codigo}">Historial</a></div>
        </div>`; }).join('')}</div>`;
      $('pInsp').querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => seleccionar(b.dataset.ver, true)));
      $('pInsp').querySelectorAll('[data-lupa]').forEach((b) => b.addEventListener('click', () => { seleccionar(b.dataset.lupa); $('pLupa').scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
      $('pInsp').querySelectorAll('.insp-tarjeta').forEach((d) => d.addEventListener('click', (e) => { if (!e.target.closest('button,a')) seleccionar(d.dataset.c); }));
    }

    // Pieza en riesgo + punto seleccionado
    const porZona = Object.keys(zonas).filter((z) => !zonaSel || z === zonaSel).map((z) => { const ps = todos.filter((x) => A.puntos[x.codigo].punto.zonaId === z); const peor = ps.reduce((a, x) => (x.fallado ? (a?.fallado && a.horaFalla < x.horaFalla ? a : x) : a?.fallado ? a : !a || x.horasCritico < a.horasCritico ? x : a), null); return { z, peor }; });
    const primero = [...porZona].sort((a, b) => (a.peor.fallado ? -1 : b.peor.fallado ? 1 : a.peor.horasCritico - b.peor.horasCritico))[0];
    const sel = seleccion ? est[seleccion] : null; const p0 = sel ? pred.puntos.find((x) => x.codigo === seleccion) : null;
    $('pPieza').innerHTML = `
      <h2 style="margin-bottom:6px">${zonaSel ? 'Riesgo de la pieza' : 'Pieza en riesgo'} ${info('Para cada zona se toma el punto que antes alcanza la longitud crítica. Las horas se cuentan desde el instante simulado, sin sobreesfuerzo adicional; la fecha usa la utilización histórica.')}</h2>
      <div class="rejilla ${zonaSel ? 'c1' : 'c3'}" style="gap:8px">${porZona.map(({ z, peor }) => `<div class="kpi" style="padding:8px 10px;border-color:${primero.z === z ? 'var(--critico)' : 'var(--borde)'}"><div class="t">${esc(zonas[z].corto)}</div>
        <div class="v" style="font-size:1.05rem">${peor.fallado ? '<span style="color:#ff8080">FALLÓ</span>' : Number.isFinite(peor.horasCritico) ? fH(Math.round(peor.horasCritico)) : '∞'}</div>
        <div class="d">${peor.codigo} · <span class="modo-chip modo-${peor.modo}">${MODOS[peor.modo].corto}</span>${!peor.fallado && Number.isFinite(peor.horasCritico) ? `<br>${fFecha(A.fechaDeHoras(A.horasActuales + sim.horas + peor.horasCritico))}` : peor.fallado ? `<br>a +${fNum(Math.round(peor.horaFalla))} h · ${peor.causaInfo?.corto ?? ''}` : ''}</div></div>`).join('')}</div>
      ${sel ? `<div class="aviso ${sel.fallado || sel.modo === 'acelerada' ? 'rojo' : sel.modo === 'propagacion' ? '' : 'azul'}" style="margin:10px 0 0;font-size:.86rem">
        <b>${seleccion}</b> · ${esc(A.puntos[seleccion].punto.descripcion)}<br>
        L ${fNum(sel.a0)} → <b>${fNum(sel.L)} mm</b> (a<sub>c</sub> ${fNum(sel.aCrit)} mm) · tasa ${fNum(sel.tasa)} mm/1000 h${sel.s > 0.05 ? ` <b style="color:#ff8080">con sobreesfuerzo +${fNum(sel.s * 100)} %</b>` : ''}<br>
        ${sel.fallado && sel.causaInfo ? `<b style="color:#ff8080">FALLÓ a +${fNum(Math.round(sel.horaFalla))} h · ${sel.causaInfo.titulo}.</b> ${sel.causaInfo.desc}` : `<b>${MODOS[sel.modo].titulo}.</b> ${MODOS[sel.modo].desc}`}<br>
        ${sel.fallado ? '' : Number.isFinite(sel.horasCritico) ? `Falla en ≈ ${fH(Math.round(sel.horasCritico))} (${fFecha(A.fechaDeHoras(A.horasActuales + sim.horas + sel.horasCritico))}) por ${sel.fad.dominante === 'fractura' ? 'fractura inestable (K<sub>r</sub> domina)' : 'colapso del ligamento (L<sub>r</sub> domina)'}; la plataforma proyectaba Danger en ${fNum(p0.horasDangerLineal)} h con tasa constante, Paris lo adelanta a ${fNum(Math.round(p0.horasDanger))} h.` : 'Sin crecimiento previsto mientras no haya sobrecarga.'}
        ${sel.fallado && sel.detalleFalla ? `<div style="margin-top:6px;padding:6px 8px;border-radius:6px;background:rgba(214,69,69,.18)">${esc(sel.detalleFalla)}</div>` : ''}
        <div style="margin-top:6px;font-size:.82rem"><b>Esfuerzo al que se sometió:</b> ${sel.esfuerzo.horas > 0 ? `${fNum(Math.round(sel.esfuerzo.horas))} h sobrecargado · s medio +${fNum(sel.esfuerzo.sMedio * 100)} % · máx +${fNum(sel.esfuerzo.sMax * 100)} % · dosis ${fNum(Math.round(sel.esfuerzo.dosis))} h eq. · crecimiento ${fNum(Math.round(sel.esfuerzo.crecTiempo))} mm por tiempo + ${fNum(Math.round(sel.esfuerzo.crecSobrecarga))} mm por sobrecarga (${fNum(sel.esfuerzo.fraccionSobrecarga * 100)} %)` : `solo carga normal de operación · crecimiento ${fNum(Math.round(sel.esfuerzo.crecTiempo))} mm`}</div>
        <a href="#/punto/${seleccion}">Ver historial del punto →</a>${!zonaSel ? ` · <a href="#/simulador/${PIEZA_DE_ZONA[A.puntos[seleccion].punto.zonaId]}">Simular solo ${esc(zonas[A.puntos[seleccion].punto.zonaId].corto)} →</a>` : ''}</div>` : '<p class="tenue" style="margin:10px 0 0;font-size:.85rem">Clic en una esfera o en una fila para ver el detalle del punto.</p>'}`;

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
    $('tbRep').innerHTML = sim.reporte().filter((r) => codigosPieza.includes(r.codigo)).sort((a, b) => (a.fallado === b.fallado ? b.dosis - a.dosis || b.severidad - a.severidad : a.fallado ? -1 : 1)).map((r) => `<tr class="${r.fallado ? 'fallado' : ''}"><td><b>${r.codigo}</b></td><td class="n">${fNum(r.L0)} → ${fNum(r.L)} mm</td><td class="n">${fNum(r.horasSobrecarga)}</td><td class="n">${r.horasSobrecarga ? '+' + fNum(r.sMedio * 100) + ' %' : '—'}</td><td class="n">${r.sMax ? '+' + fNum(r.sMax * 100) + ' %' : '—'}</td><td class="n">${fNum(r.dosis)}</td><td class="n">${fNum(r.crecTiempo)} mm</td><td class="n">${r.crecSobrecarga ? `${fNum(r.crecSobrecarga)} mm (${fNum(r.fraccionSobrecarga * 100)} %)` : '—'}</td><td>${r.fallado ? `<b style="color:#ff8080">+${fNum(r.horaFalla)} h · ${esc(r.causa)}</b><br><small>${esc(r.detalleFalla)}</small>` : '<span class="tenue">—</span>'}</td></tr>`).join('');

    // Eventos
    const evs = sim.eventos.filter((e) => codigosPieza.includes(e.codigo));
    if (evs.length) $('ev').innerHTML = [...evs].reverse().slice(0, 40).map((e) => `<div><span class="tenue num">+${fNum(Math.round(e.horas))} h</span> · <b>${e.codigo}</b> ${e.tipo === 'falla' ? `<span class="modo-chip modo-fractura">FALLA</span> ${CAUSAS[e.causa]?.corto ?? ''} · ${fNum(Math.round(e.L))} mm${e.s ? ` con +${fNum(e.s * 100)} %` : ''}` : e.tipo === 'inicio' ? `grieta iniciada por sobrecarga (+${fNum((e.s || 0) * 100)} %)` : `${e.de} → ${estadoHTML(e.a)} (${fNum(Math.round(e.L))} mm)`}</div>`).join('');
    else if (sim.horas > 0) $('ev').innerHTML = '<span class="tenue">Sin eventos en esta pieza.</span>';
  }

  // --- Controles ---
  const bPlay = $('bPlay');
  const setPlay = (on) => { corriendo = on; bPlay.textContent = on ? '❚❚' : '▶'; bPlay.classList.toggle('prim', !on); };
  bPlay.addEventListener('click', () => setPlay(!corriendo));
  $('bReset').addEventListener('click', () => { sim.reiniciar(); est = sim.estado(); visor?.limpiarDano(); visor?.actualizar(est); $('ev').innerHTML = '<span class="tenue">Simulación reiniciada.</span>'; pintarPanel(true); pintarLupa(); setPlay(false); });
  $('vel').addEventListener('change', (e) => { velocidadSel = +e.target.value; });
  $('chkTirar').addEventListener('change', (e) => visor?.tirar(e.target.checked));
  $('bEncuadre').addEventListener('click', () => visor?.enfocar(null));
  $('bVerPunto').addEventListener('click', () => { if (seleccion) visor?.enfocar(seleccion, zonaSel ? 4 : 6); $('s3d').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  root.querySelectorAll('#segPieza button').forEach((b) => b.addEventListener('click', () => app.ir(b.dataset.p === 'general' ? '#/simulador' : `#/simulador/${b.dataset.p}`)));
  $('bCsv').addEventListener('click', () => {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cols = ['codigo', 'L0', 'L', 'aCrit', 'modo', 'horasSobrecarga', 'sMedio', 'sMax', 'dosis', 'crecTiempo', 'crecSobrecarga', 'fraccionSobrecarga', 'fallado', 'horaFalla', 'causa', 'detalleFalla'];
    const csv = [['Simulación', `+${Math.round(sim.horas)} h`, sim.fecha()].map(q).join(';'), cols.map(q).join(';'), ...sim.reporte().map((r) => cols.map((c) => q(typeof r[c] === 'number' ? Math.round(r[c] * 1000) / 1000 : r[c])).join(';'))].join('\r\n');
    descargar(`EX3600_reporte_esfuerzo_+${Math.round(sim.horas)}h.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
  });
  document.addEventListener('keydown', teclas);
  function teclas(e) { if (e.target.matches('input,select,textarea')) return; if (e.code === 'Space') { e.preventDefault(); setPlay(!corriendo); } }
  app.alLimpiar(() => { vivo = false; visor?.destruir(); lupa?.destruir(); document.removeEventListener('keydown', teclas); });
  pintarPanel(true);
}
