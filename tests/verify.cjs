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
