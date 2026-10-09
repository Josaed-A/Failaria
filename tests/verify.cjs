// Verificación de datos.js y reglas.js con node, sin dependencias externas.
// Uso: node tests/verify.cjs
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const XLSX = require(path.join(raiz, 'vendor/xlsx.full.min.js'));

let fallos = 0, ok = 0;
function check(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ✔ ' + nombre); }
  else { fallos++; console.log('  ✘ ' + nombre + (detalle !== undefined ? '  → ' + JSON.stringify(detalle) : '')); }
}
const cerca = (a, b, tol) => Math.abs(a - b) <= tol;

(async () => {
  const url = (f) => 'file:///' + path.join(raiz, f).replace(/\\/g, '/');
  const { CONFIG } = await import(url('src/config.js'));
  const D = await import(url('src/datos.js'));
  const R = await import(url('src/reglas.js'));
  const F = await import(url('src/falla.js'));
  const T = await import(url('src/tareas.js'));

  const buf = fs.readFileSync(path.join(raiz, CONFIG.excelRuta));
  const modelo = D.leerLibro(XLSX, buf, CONFIG);

  console.log('\nLectura del Excel');
  check('12 puntos con umbrales', modelo.puntos.length === 12 && modelo.puntos.every((p) => p.caution > 0 && p.danger > p.caution));
  check('Umbrales BM 250/500, BR 300/600, CU 400/800', ['BM-01:250:500', 'BR-01:300:600', 'CU-01:400:800'].every((s) => { const [c, a, b] = s.split(':'); const p = modelo.puntos.find((x) => x.codigo === c); return p.caution === +a && p.danger === +b; }));
  check('23 inspecciones', modelo.inspecciones.length === 23, modelo.inspecciones.length);
  check('276 mediciones', modelo.mediciones.length === 276, modelo.mediciones.length);
  check('8 N/I (celdas vacías, nunca 0)', modelo.mediciones.filter((m) => m.L === null).length === 8);
  check('Fechas ISO correctas (primera 2023-01-18, última 2025-10-11)', modelo.inspecciones[0].fecha === '2023-01-18' && modelo.inspecciones.at(-1).fecha === '2025-10-11', [modelo.inspecciones[0].fecha, modelo.inspecciones.at(-1).fecha]);
  check('Horas 48310 → 65703.2', modelo.inspecciones[0].horas === 48310 && modelo.inspecciones.at(-1).horas === 65703.2);
  check('Foto _b del boom asociada (D7)', modelo.mediciones.find((m) => m.codigo === 'BM-04' && m.fecha === '2024-03-01').imagenes.length === 2);

  console.log('\nCalidad de datos');
  const q = D.validar(modelo, CONFIG);
  const qid = (c, f) => q[D.idMedicion('3600-01', f, c)];
  check('D1 CU-01 2025-04-22 1010 mm → atípico, sugerido 101', qid('CU-01', '2025-04-22')?.tipo === 'atipico' && qid('CU-01', '2025-04-22').sugerido === 101, qid('CU-01', '2025-04-22'));
  check('D2 CU-02 2025-04-22 0 mm → probable N/I', qid('CU-02', '2025-04-22')?.tipo === 'cero-sin-reparacion', qid('CU-02', '2025-04-22'));
  check('D3 BR-01 2025-10-11 420→410 → variación de medición', qid('BR-01', '2025-10-11')?.tipo === 'variacion' && !qid('BR-01', '2025-10-11').sospechoso);
  check('D4 CU-03 2025-08-26 220→200 → variación de medición', qid('CU-03', '2025-08-26')?.tipo === 'variacion');
  check('CU-02 840 mm (real) NO marcado', !qid('CU-02', '2025-03-07'));
  check('Reparaciones con comentario NO marcadas', !qid('CU-02', '2025-07-19') && !qid('BM-04', '2023-11-17'));
  const sosp = Object.entries(q).filter(([, x]) => x.sospechoso).map(([k]) => k);
  check('Exactamente 2 datos sospechosos (D1, D2)', sosp.length === 2, sosp);

  console.log('\nCiclos, estado y proyección');
  const A = R.analizar(modelo, CONFIG, {});
  const P = A.puntos;
  check('Utilización ≈ 17 h/día', cerca(A.utilizacion, 17.4, 0.5), A.utilizacion);
  check('Intervalo típico ≈ 750 h', cerca(A.intervalo, 750, 60), A.intervalo);
  check('Estado actual BR-01 = Alerta', P['BR-01'].estadoActual === 'Alerta');
  check('Resto de puntos Normal', Object.values(P).filter((a) => a.codigo !== 'BR-01').every((a) => a.estadoActual === 'Normal'), Object.values(P).map((a) => a.codigo + ':' + a.estadoActual));
  check('BR-04 N/I en la última inspección (último válido 0 mm)', P['BR-04'].niUltima && P['BR-04'].ultimoValido.Lef === 0);
  check('BM-04: 3 ciclos (reparado nov-23 y oct-24), 1 reincidencia', P['BM-04'].ciclos.length === 3 && P['BM-04'].reincidencias === 1, P['BM-04'].ciclos.map((c) => c.inicio.fecha));
  check('CU-01: cambio mar-24 + reparación mar-25 (3 ciclos)', P['CU-01'].ciclos.length === 3 && P['CU-01'].cambios === 1 && P['CU-01'].reparaciones === 1, P['CU-01'].ciclos.map((c) => c.inicio.fecha + ':' + c.evento));
  check('CU-02: ciclo actual empieza 2025-07-19 (reparación)', P['CU-02'].cicloActual.inicio.fecha === '2025-07-19');
  check('CU-02 0 sospechoso no reinicia ciclo', !P['CU-02'].registros.find((r) => r.fecha === '2025-04-22').evento);
  check('Tasa BR-01 ≈ 48 mm/1000 h', cerca(P['BR-01'].tendencia.tasa1000, 48, 6), P['BR-01'].tendencia.tasa1000);
  check('BR-01 llega a Danger en ≈ 4000 h', cerca(P['BR-01'].proyeccion.restanteDanger, 4000, 700), P['BR-01'].proyeccion.restanteDanger);
  check('BM-01 llega a Caution en ≈ 1200 h', cerca(P['BM-01'].proyeccion.restanteCaution, 1200, 350), P['BM-01'].proyeccion.restanteCaution);
  const epCU02 = P['CU-02'].episodios.find((e) => e.nivel === 'Crítico');
  check('CU-02 operó en Crítico ≈ 4 meses (mar-25 → jul-25)', epCU02 && epCU02.desde.fecha === '2025-03-07' && epCU02.hasta.fecha === '2025-07-19' && cerca(epCU02.dias, 134, 3), epCU02);
  check('CU-01 1010 no genera episodio Crítico (excluido)', !P['CU-01'].episodios.some((e) => e.nivel === 'Crítico'));

  console.log('\nAlertas, plan y simulación');
  const tipos = (c) => A.alertas.filter((a) => a.codigo === c).map((a) => a.tipo);
  check('Alerta de umbral para BR-01', tipos('BR-01').includes('umbral'));
  check('Alerta de crecimiento rápido para CU-02 (≈88 mm/1000 h)', tipos('CU-02').includes('crecimiento'), tipos('CU-02'));
  check('Alerta de proximidad para BM-01', tipos('BM-01').includes('proximidad'), tipos('BM-01'));
  check('Alerta N/I para BR-04', tipos('BR-04').includes('ni'));
  check('Alerta de fotos desactualizadas (D6)', A.alertas.some((a) => a.tipo === 'foto'));
  check('Datos sospechosos históricos generan alerta de confirmación', A.alertas.filter((a) => a.tipo === 'sospechoso').length === 2);
  check('Plan: BR-01 primero', A.plan[0].codigo === 'BR-01', A.plan.slice(0, 3).map((x) => x.codigo + ':' + x.score));
  check('Próxima parada requerida e incluye BR-01 y BM-01', A.parada.requerida && A.parada.incluir.includes('BR-01') && A.parada.incluir.includes('BM-01'), A.parada);
  const s = R.simular(A, 1500);
  check('Simulador +1500 h: BM-01 pasa a Alerta', s.puntos['BM-01'].estado === 'Alerta', s.puntos['BM-01']);
  check('Simulador +5000 h: BR-01 Crítico', R.simular(A, 5000).puntos['BR-01'].estado === 'Crítico');
  check('KPI cobertura ≈ 97 %', cerca(A.kpis.cobertura, 268 / 276, 0.001));

  console.log('\nModelo de falla (ley de Paris, FAD, simulación)');
  const M = F.modeloPunto(P['BR-01'], CONFIG);
  check('a_crítica BR-01 = 1,6 × Danger = 960 mm', M.aCrit === 960, M.aCrit);
  check('Tasa calibrada en L actual ≈ tasa observada', cerca(F.tasaEn(M, M.L0), P['BR-01'].tendencia.tasa1000, 0.01));
  check('La tasa acelera con a^(m/2): a 820 mm ≈ 2,83× la de 410 mm', cerca(F.tasaEn(M, 820) / F.tasaEn(M, 410), Math.pow(2, 1.5), 0.01));
  const hC = F.horasHasta(M, M.L0, M.aCrit); const hD = F.horasHasta(M, M.L0, 600);
  check('Paris adelanta Danger de BR-01 respecto de la proyección lineal', hD < P['BR-01'].proyeccion.restanteDanger && hD > 0.5 * P['BR-01'].proyeccion.restanteDanger, [hD, P['BR-01'].proyeccion.restanteDanger]);
  check('BR-01 falla (a_c) en ≈ 6000 h', cerca(hC, 5900, 900), hC);
  check('Solución cerrada ≡ integración numérica', (() => { let a = M.L0; for (let i = 0; i < 20000; i++) a += (F.tasaEn(M, a) / 1000) * (hC / 20000); return cerca(a, M.aCrit, 15); })());
  check('avanzar(h hasta a_c) llega a a_c', cerca(F.avanzar(M, M.L0, hC), M.aCrit, 1), F.avanzar(M, M.L0, hC));
  check('Sobreesfuerzo s=1 → factor (1+s)^3 = 8', F.factorCarga(1, 3) === 8 && cerca(F.horasHasta(M, M.L0, M.aCrit, 1) * 8, hC, 1));
  check('Punto sano no crece sin sobrecarga; con s ≥ 0,3 se inicia', F.horasHasta(F.modeloPunto(P['BM-02'], CONFIG), 0, 250) === Infinity && F.avanzar(F.modeloPunto(P['BM-02'], CONFIG), 0, 10, 0.5) >= 5);
  check('Modos: 0 sana · <Caution iniciación · <Danger propagación · <a_c acelerada · ≥a_c fractura', ['sin-grieta', 'iniciacion', 'propagacion', 'acelerada', 'fractura'].every((m, i) => F.modoFalla(M, [0, 100, 400, 700, 960][i]) === m));
  check('FAD: punto sano dentro, grieta crítica fuera, Kr domina al fracturar; BR-01 tolera +30 % pero no +60 %', !F.evaluarFAD(M, 0).falla && F.evaluarFAD(M, 960).falla && F.evaluarFAD(M, 960).dominante === 'fractura' && !F.evaluarFAD(M, 410, 0.3).falla && F.evaluarFAD(M, 410, 0.6).falla);
  const pr = F.predecir(A, CONFIG);
  check('Predicción: CU-02 (la grieta más rápida) es la primera en alcanzar a_c; cucharón primera pieza', pr.primero.codigo === 'CU-02' && Object.values(pr.piezas).sort((a, b) => a.horasCritico - b.horasCritico)[0].zonaId === 'CU', pr.puntos.slice(0, 3).map((x) => x.codigo));
  check('Predicción: puntos sanos (0 mm) no fallan sin sobrecarga', pr.puntos.filter((x) => x.L0 === 0).every((x) => x.horasCritico === Infinity && x.modo === 'sin-grieta'));
  check('Régimen de grieta corta: CU-02 (70 mm) mantiene 88 mm/1000 h hasta a_ref = 200 mm', (() => { const Mc = F.modeloPunto(P['CU-02'], CONFIG); return Mc.aRef === 200 && cerca(F.tasaEn(Mc, 70), 88, 2) && cerca(F.tasaEn(Mc, 200), 88, 2) && F.tasaEn(Mc, 400) > 2 * 88; })());
  const S = F.crearSimulacion(A, CONFIG);
  for (let i = 0; i < 100; i++) S.paso(hC / 100);
  check('Simulación: tras h_c BR-01 falló y quedó registrado el evento', S.puntos['BR-01'].fallado && S.eventos.some((e) => e.tipo === 'falla' && e.codigo === 'BR-01'), S.eventos.filter((e) => e.codigo === 'BR-01'));
  check('Simulación: BM-01 pasó a Alerta antes de ≈ 1300 h', S.eventos.some((e) => e.codigo === 'BM-01' && e.tipo === 'estado' && e.a === 'Alerta' && e.horas < 1300), S.eventos.filter((e) => e.codigo === 'BM-01'));
  S.reiniciar();
  check('Reiniciar vuelve al estado inicial', S.horas === 0 && S.puntos['BR-01'].a === 410 && !S.puntos['BR-01'].fallado);
  const cg = F.cargasPorDistancia(1, { 'BR-01': 0, 'BR-02': 1.6, 'CU-01': 10 }, 1.6);
  check('Carga del mouse decae con la distancia (gaussiana)', cg['BR-01'] === 1 && cerca(cg['BR-02'], Math.exp(-0.5), 1e-9) && cg['CU-01'] < 1e-6);
  S.paso(100, { 'BR-01': 1 }); S.paso(100, {});
  check('Tirar 100 h con s=1 hace crecer BR-01 ≈ 8× más que 100 h sin carga', (() => { const a1 = F.avanzar(M, 410, 100, 1) - 410; const a0 = F.avanzar(M, 410, 100, 0) - 410; return a1 / a0 > 7 && S.puntos['BR-01'].horasSobrecarga === 100; })());

  console.log('\nCausa de falla y reporte de esfuerzo');
  const S2 = F.crearSimulacion(A, CONFIG);
  for (let i = 0; i < 200; i++) S2.paso(40);
  const r2 = S2.reporte().find((r) => r.codigo === 'BR-01');
  check('Sin sobrecargas la falla es «por tiempo» y Δa sobrecarga = 0', S2.puntos['BR-01'].fallado && S2.puntos['BR-01'].causa === 'tiempo' && r2.crecSobrecarga === 0 && r2.horasSobrecarga === 0, [S2.puntos['BR-01'].causa, r2]);
  const S3 = F.crearSimulacion(A, CONFIG);
  S3.paso(1, { 'BR-01': 1.5 });
  check('Tirón de +150 % sobre BR-01 (410 mm) → fractura súbita por sobrecarga, antes de a_c', S3.puntos['BR-01'].fallado && S3.puntos['BR-01'].causa === 'sobrecarga' && S3.puntos['BR-01'].LFalla < 960 && /tenacidad|ligamento/.test(S3.puntos['BR-01'].detalleFalla), S3.puntos['BR-01']);
  check('El mismo tirón sobre un punto sano (BM-04) lo inicia pero no lo fractura', S3.puntos['BM-04'].a === 0 && !S3.puntos['BM-04'].fallado && (() => { const S4 = F.crearSimulacion(A, CONFIG); S4.paso(1, { 'BM-04': 1.5 }); return S4.puntos['BM-04'].a >= 5 && !S4.puntos['BM-04'].fallado; })());
  check('FAD Opción 1: f(0) = 1, decrece y vale 0 en Lr,max', cerca(F.curvaFAD(0), 1, 1e-9) && F.curvaFAD(0.8) < F.curvaFAD(0.4) && F.curvaFAD(F.LR_MAX) === 0);
  const S5 = F.crearSimulacion(A, CONFIG);
  for (let i = 0; i < 200; i++) S5.paso(10, { 'BR-03': 0.3 });
  const e5 = S5.estado()['BR-03'];
  check('Sobrecarga moderada sostenida (+30 %, 2000 h) en BR-03 (grieta corta): no fractura, s medio 0,30, dosis > 0, Δa sobrecarga > 50 %', !e5.fallado && cerca(e5.esfuerzo.sMedio, 0.3, 1e-9) && e5.esfuerzo.horas === 2000 && e5.esfuerzo.dosis > 0 && e5.esfuerzo.fraccionSobrecarga > 0.5, e5.esfuerzo);
  check('Sobrecarga sostenida sobre una grieta ya larga (BM-01 a +25 %) termina en fractura súbita antes de a_c', (() => { const S6 = F.crearSimulacion(A, CONFIG); for (let i = 0; i < 300 && !S6.puntos['BM-01'].fallado; i++) S6.paso(10, { 'BM-01': 0.25 }); const x = S6.puntos['BM-01']; return x.fallado && x.causa === 'sobrecarga' && x.LFalla < 800; })());
  for (let i = 0; i < 5000 && !S5.puntos['BR-03'].fallado; i++) S5.paso(10);
  const e5b = S5.estado()['BR-03'];
  check('Luego sin carga llega a a_c; la causa es coherente con la fracción de crecimiento por sobrecarga', e5b.fallado && e5b.causa === (e5b.esfuerzo.fraccionSobrecarga > 0.5 ? 'fatiga-sobrecarga' : 'tiempo') && e5b.esfuerzo.horas === 2000, [e5b.causa, e5b.esfuerzo]);
  check('Reporte CSV-ready: 12 filas con causa vacía o texto', S5.reporte().length === 12 && S5.reporte().every((r) => typeof r.causa === 'string'));

  console.log('\nPlanificación de mantenimiento (tareas.js)');
  const sug = T.sugerir(A, []);
  check('Sugerencias: parada, reparación de BR-01, inspección periódica y fotos', sug.some((t) => t.tipo === 'parada') && sug.some((t) => t.codigo === 'BR-01' && t.tipo === 'reparacion') && sug.some((t) => t.clave === 'inspeccion-periodica') && sug.some((t) => t.tipo === 'foto'), sug.map((t) => t.clave));
  check('Reparación de BR-01 con fecha = plazo del plan y lista de pasos de soldadura', (() => { const t = sug.find((t) => t.codigo === 'BR-01'); return t.fecha === A.plan.find((f) => f.codigo === 'BR-01').plazoFecha && t.checklist.length === 4; })());
  check('Con «hoy» posterior, ninguna sugerencia queda en el pasado', T.sugerir(A, [], '2026-10-08').every((t) => !t.fecha || t.fecha >= '2026-10-08'));
  check('Volver a sugerir no duplica', T.sugerir(A, sug).length === 0);
  check('Validación: título obligatorio y fecha obligatoria fuera de «Por planificar»', T.validarTarea(T.nuevaTarea({ titulo: '' })).length === 1 && T.validarTarea(T.nuevaTarea({ titulo: 'x', estado: 'programada' })).length === 1 && T.validarTarea(T.nuevaTarea({ titulo: 'x', estado: 'programada', fecha: '2026-01-05' })).length === 0);
  const t1 = T.mover(T.nuevaTarea({ titulo: 'a', fecha: '2025-10-01' }), 'ejecucion'); const t2 = T.mover(t1, 'hecha');
  check('mover registra historial y fecha de término', t1.estado === 'ejecucion' && t1.historial.length === 2 && t2.terminada && !T.vencida(t2, '2025-12-01') && T.vencida(t1, '2025-12-01'));
  const ag = T.agenda([t1, T.nuevaTarea({ titulo: 'b', fecha: '2025-12-05', estado: 'programada' }), T.nuevaTarea({ titulo: 'c' })], '2025-12-01');
  check('agenda: vencidas, próximas y sin fecha', ag.vencidas.length === 1 && ag.proximas.length === 1 && ag.sinFecha.length === 1);
  check('CSV con cabecera y una fila por tarea', T.tareasCSV(sug).split('\r\n').length === sug.length + 1);
  check('KPIs del tablero', T.kpisTareas([t1, t2], '2025-12-01').vencidas === 1 && T.kpisTareas([t1, t2], '2025-12-01').hechas === 1);

  console.log('\nDecisiones del usuario y registro nuevo');
  const dec = { [D.idMedicion('3600-01', '2025-04-22', 'CU-01')]: { accion: 'corregir', valor: 101 }, [D.idMedicion('3600-01', '2025-04-22', 'CU-02')]: { accion: 'descartar' } };
  const A2 = R.analizar(modelo, CONFIG, dec);
  check('Corrección D1 → 101 entra a la tendencia', A2.puntos['CU-01'].registros.find((r) => r.fecha === '2025-04-22').Lef === 101);
  check('Descartar D2 → N/I', A2.puntos['CU-02'].registros.find((r) => r.fecha === '2025-04-22').estado === 'N/I');
  check('Sin alertas de sospechosos tras decidir', !A2.alertas.some((a) => a.tipo === 'sospechoso'));
  const f = '2025-11-25', idI = D.idInspeccion('3600-01', f);
  const nuevos = {
    inspecciones: [{ id: idI, equipo: '3600-01', fecha: f, horas: 66450, inspector: 'INSP-02', origen: 'app' }],
    mediciones: modelo.puntos.map((p) => ({ id: D.idMedicion('3600-01', f, p.codigo), inspeccionId: idI, equipo: '3600-01', fecha: f, horas: 66450, codigo: p.codigo, L: p.codigo === 'BR-01' ? 650 : p.codigo === 'BM-01' ? 210 : null, comentario: '', imagenes: [], origen: 'app' })),
  };
  const M3 = D.fusionar(modelo, nuevos);
  const A3 = R.analizar(M3, CONFIG, {});
  check('Fusión agrega 1 inspección y 12 mediciones', M3.inspecciones.length === 24 && M3.mediciones.length === 288);
  check('Inspección nueva: BR-01 650 mm → Crítico y alerta crítica', A3.puntos['BR-01'].estadoActual === 'Crítico' && A3.alertas[0].severidad === 'critica', A3.alertas[0]);
  const M4 = D.fusionar(M3, { inspecciones: [], mediciones: [{ ...nuevos.mediciones[0], L: 999 }] });
  check('Re-registrar misma Fecha+Código reemplaza (no duplica)', M4.mediciones.length === 288);

  console.log('\nExportación');
  const wb = D.exportarLibro(XLSX, M3, { calidad: q });
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const re = D.leerLibro(XLSX, out, CONFIG);
  check('Excel exportado se vuelve a leer igual (288 mediciones, 24 inspecciones)', re.mediciones.length === 288 && re.inspecciones.length === 24, [re.mediciones.length, re.inspecciones.length]);
  check('Ida y vuelta conserva N/I y valores', re.mediciones.filter((m) => m.L === null).length === M3.mediciones.filter((m) => m.L === null).length && re.mediciones.find((m) => m.codigo === 'CU-01' && m.fecha === '2025-04-22').L === 1010);

  console.log('\nHistorial de alertas (¿qué habría dicho la plataforma?)');
  const H = R.historialAlertas(modelo, CONFIG, {});
  const critCU02 = H.eventos.find((e) => e.codigo === 'CU-02' && e.tipo === 'umbral' && e.severidad === 'critica');
  check('CU-02 Crítico alertado el 2025-03-07', critCU02 && critCU02.fecha === '2025-03-07', critCU02 && critCU02.fecha);
  const altaCU02 = H.eventos.find((e) => e.codigo === 'CU-02' && e.tipo === 'umbral' && e.fecha > '2024-03-01');
  check('CU-02 (cucharón nuevo) en Alerta desde 2024-09-18', altaCU02 && altaCU02.fecha === '2024-09-18', altaCU02 && altaCU02.fecha);

  console.log(`\n${ok} correctas, ${fallos} fallidas`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
