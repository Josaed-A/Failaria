// Reglas de mantenimiento: estado, ciclos de reparación, tasas, proyección, alertas, plan y KPIs.
// Lógica PURA (sin DOM) → se prueba con `node tests/verify.cjs`.

import { RE_CAMBIO, RE_REPARACION, agrupar, cmpInsp, validar } from './datos.js';

export const ESTADOS = ['Normal', 'Alerta', 'Crítico', 'N/I'];
export const RANGO_ESTADO = { 'N/I': -1, Normal: 0, Alerta: 1, 'Crítico': 2 };
export const SEVERIDADES = ['critica', 'alta', 'media', 'baja', 'info'];

export const ACCION_POR_ESTADO = {
  Normal: 'Seguimiento en la frecuencia normal de inspección.',
  Alerta: 'Aumentar frecuencia de inspección y programar reparación.',
  'Crítico': 'Reparar antes de continuar operando.',
  'N/I': 'Inspeccionar en la próxima oportunidad (sin dato).',
};

/** Estado según el criterio del formato: Normal L<Caution · Alerta Caution≤L<Danger · Crítico L≥Danger · vacío = N/I. */
export function estadoDe(L, p) {
  if (L === null || L === undefined || Number.isNaN(L)) return 'N/I';
  if (L >= p.danger) return 'Crítico';
  if (L >= p.caution) return 'Alerta';
  return 'Normal';
}

export const peorEstado = (lista) => lista.reduce((a, e) => (RANGO_ESTADO[e] > RANGO_ESTADO[a] ? e : a), 'N/I');

const mediana = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const k = Math.floor(v.length / 2);
  return v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2;
};

export function sumarDias(fechaISO, dias) {
  const [a, m, d] = fechaISO.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d) + Math.round(dias) * 864e5);
  return t.toISOString().slice(0, 10);
}
export const diasEntre = (f1, f2) => Math.round((Date.parse(f2) - Date.parse(f1)) / 864e5);

/** Regresión lineal por mínimos cuadrados sobre [{x,y}]. */
export function regresionLineal(pts) {
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) ** 2; }
  if (sxx === 0) return null;
  const b = sxy / sxx; const a = my - b * mx;
  const sse = pts.reduce((s, p) => s + (p.y - (a + b * p.x)) ** 2, 0);
  const r2 = syy === 0 ? 1 : 1 - sse / syy;
  return { a, b, r2, n, mx, sxx, s: n > 2 ? Math.sqrt(sse / (n - 2)) : null, pred: (x) => a + b * x };
}

/** Valor que se usa en tendencias según la calidad del dato y la decisión del usuario. */
export function valorEfectivo(m, q, d) {
  if (d) {
    if (d.accion === 'aceptar') return { L: m.L, excluido: false, decision: 'aceptar' };
    if (d.accion === 'descartar') return { L: null, excluido: false, decision: 'descartar' };
    if (d.accion === 'corregir') return { L: d.valor ?? q?.sugerido ?? m.L, excluido: false, decision: 'corregir' };
  }
  if (m.L === null || m.L === undefined) return { L: null, excluido: false, decision: null };
  if (q?.sospechoso) return { L: m.L, excluido: true, decision: null }; // pendiente: fuera de tendencias
  return { L: m.L, excluido: false, decision: null };
}

const valido = (r) => r.Lef !== null && r.Lef !== undefined && !r.excluido;

/** Análisis completo de un punto. */
export function analizarPunto(p, meds, ctx) {
  const { calidad = {}, decisiones = {}, cfg = {} } = ctx;
  const tol = cfg.toleranciaMedicionMm ?? 20;

  // 1) Registros con valor efectivo y estado.
  const registros = meds.map((m) => {
    const q = calidad[m.id] || null;
    const ef = valorEfectivo(m, q, decisiones[m.id]);
    const Lmostrar = ef.excluido ? m.L : ef.L;
    return { ...m, Lef: ef.L, excluido: ef.excluido, decision: ef.decision, calidad: q, estado: estadoDe(Lmostrar, p), evento: null, ciclo: 1 };
  });

  // 2) Ciclos: una reparación o cambio de componente reinicia la grieta.
  let ciclo = 1; let prev = null; let hayDatosEnCiclo = false;
  for (const r of registros) {
    if (!valido(r)) { r.ciclo = ciclo; continue; }
    let ev = null;
    if (RE_CAMBIO.test(r.comentario)) ev = 'cambio';
    else if (RE_REPARACION.test(r.comentario)) ev = 'reparacion';
    else if (prev && prev.Lef > 0 && r.Lef === 0) { ev = 'reparacion'; r.eventoNoDocumentado = true; }
    if (ev) { if (hayDatosEnCiclo) ciclo++; r.evento = ev; }
    r.ciclo = ciclo; hayDatosEnCiclo = true; prev = r;
  }
  const ciclos = [];
  for (const r of registros) {
    let c = ciclos[r.ciclo - 1];
    if (!c) {
      c = ciclos[r.ciclo - 1] = { n: r.ciclo, inicio: { fecha: r.fecha, horas: r.horas }, evento: r.evento, registros: [] };
    }
    c.registros.push(r);
  }
  ciclos.forEach((c, i) => {
    const v = c.registros.filter(valido);
    c.fin = { fecha: c.registros.at(-1).fecha, horas: c.registros.at(-1).horas };
    c.cerrado = i < ciclos.length - 1;
    c.maxL = v.length ? Math.max(...v.map((r) => r.Lef)) : null;
    c.peorEstado = peorEstado(v.map((r) => estadoDe(r.Lef, p)));
    const primeraGrieta = v.find((r) => r.Lef > 0);
    c.reincidencia = c.evento === 'reparacion' && !!primeraGrieta;
    c.horasHastaGrieta = primeraGrieta && c.evento ? primeraGrieta.horas - c.inicio.horas : null;
    if (c.cerrado) c.horasDuracion = ciclos[i + 1].inicio.horas - c.inicio.horas;
  });

  // 3) Tasas por intervalo (mm/1000 h) dentro de cada ciclo.
  const tasas = [];
  for (const c of ciclos) {
    const v = c.registros.filter(valido);
    for (let i = 1; i < v.length; i++) {
      const dh = v[i].horas - v[i - 1].horas;
      if (dh > 0) tasas.push({ desde: v[i - 1], hasta: v[i], tasa: ((v[i].Lef - v[i - 1].Lef) / dh) * 1000, ciclo: c.n });
    }
  }
  const medianaTasas = mediana(tasas.filter((t) => t.tasa > 0).map((t) => t.tasa));
  const maxTasa = tasas.length ? Math.max(0, ...tasas.map((t) => t.tasa)) : 0;
  const actual = ciclos.at(-1);
  const tasasCiclo = tasas.filter((t) => t.ciclo === actual.n);
  const tasaUltima = tasasCiclo.length ? tasasCiclo.at(-1).tasa : null;

  // 4) Estado actual.
  const ultimo = registros.at(-1);
  const validos = registros.filter(valido);
  const ultimoValido = validos.at(-1) || null;
  const estadoActual = ultimoValido ? estadoDe(ultimoValido.Lef, p) : 'N/I';
  const niUltima = !ultimo || ultimo.Lef === null || ultimo.Lef === undefined;
  const pendientes = registros.filter((r) => r.excluido);

  // 5) Tendencia del ciclo actual (desde el último 0 = inicio de la grieta) y proyección.
  const tendencia = calcularTendencia(actual.registros.filter(valido), cfg, medianaTasas, tol);

  // 6) Episodios en Alerta/Crítico (exposición operando con la grieta sobre umbral).
  const episodios = [];
  for (const nivel of ['Alerta', 'Crítico']) {
    let ep = null;
    for (const r of validos) {
      const sobre = RANGO_ESTADO[estadoDe(r.Lef, p)] >= RANGO_ESTADO[nivel];
      if (sobre && !ep) ep = { nivel, desde: { fecha: r.fecha, horas: r.horas }, maxL: r.Lef };
      else if (sobre && ep) ep.maxL = Math.max(ep.maxL, r.Lef);
      else if (!sobre && ep) {
        ep.hasta = { fecha: r.fecha, horas: r.horas, evento: r.evento };
        ep.horas = ep.hasta.horas - ep.desde.horas; ep.dias = diasEntre(ep.desde.fecha, ep.hasta.fecha);
        episodios.push(ep); ep = null;
      }
    }
    if (ep) { ep.hasta = null; ep.abierto = true; ep.horas = (ultimoValido?.horas ?? ep.desde.horas) - ep.desde.horas; ep.dias = diasEntre(ep.desde.fecha, ultimoValido.fecha); episodios.push(ep); }
  }

  const eventos = registros.filter((r) => r.evento);
  return {
    codigo: p.codigo, punto: p, registros, ciclos, cicloActual: actual, tasas, medianaTasas, maxTasa, tasaUltima,
    ultimo, ultimoValido, estadoActual, niUltima, pendientes, tendencia, episodios,
    reparaciones: eventos.filter((r) => r.evento === 'reparacion').length,
    cambios: eventos.filter((r) => r.evento === 'cambio').length,
    reincidencias: ciclos.filter((c) => c.reincidencia).length,
  };
}

function calcularTendencia(v, cfg, medianaTasas, tol) {
  if (!v.length) return { tipo: 'sin-datos', tasa1000: null };
  const ult = v.at(-1);
  if (ult.Lef === 0) return { tipo: 'sin-grieta', tasa1000: 0, L0: 0, h0: ult.horas, proyectar: () => ({ L: 0, lo: 0, hi: 0 }) };
  // Inicio de la grieta: último registro en 0 antes de la racha actual de valores > 0.
  let ini = 0;
  for (let i = v.length - 1; i >= 0; i--) if (v[i].Lef === 0) { ini = i; break; }
  const pts = v.slice(ini).map((r) => ({ x: r.horas, y: r.Lef, fecha: r.fecha }));
  const h0 = ult.horas;
  const lin = regresionLineal(pts);

  if (!lin || lin.b <= 0) {
    // Sin suficiente historia en el ciclo: usar la mediana histórica del punto como tasa supuesta.
    const b = (medianaTasas ?? 0) / 1000;
    const L0 = ult.Lef;
    return {
      tipo: 'supuesta', modelo: 'lineal', tasa1000: b * 1000, b, L0, h0, r2: null, n: pts.length, pts,
      nota: lin ? 'La grieta no crece en el ciclo actual; se usa la tasa mediana histórica del punto.' : 'Un solo dato en el ciclo; se usa la tasa mediana histórica del punto.',
      proyectar: (h) => { const L = L0 + b * Math.max(0, h - h0); const w = tol + 0.5 * b * Math.max(0, h - h0); return { L, lo: Math.max(0, L - w), hi: L + w }; },
    };
  }

  // Valor base: la mayor de las dos últimas mediciones del ciclo (no subestimar por variación de medición).
  const Lmed = Math.max(ult.Lef, v.length > 1 ? v.at(-2).Lef : 0);
  const L0 = Lmed;
  const s = lin.s ?? tol;
  const banda = (h) => 2 * s * Math.sqrt(1 + 1 / lin.n + (h - lin.mx) ** 2 / lin.sxx);
  let modelo = 'lineal'; let exp = null;
  const pos = pts.filter((p) => p.y > 0);
  if (pos.length >= 4) {
    const le = regresionLineal(pos.map((p) => ({ x: p.x, y: Math.log(p.y) })));
    if (le && le.b > 0) {
      const my = pos.reduce((a, p) => a + p.y, 0) / pos.length;
      const syy = pos.reduce((a, p) => a + (p.y - my) ** 2, 0);
      const sse = pos.reduce((a, p) => a + (p.y - Math.exp(le.pred(p.x))) ** 2, 0);
      const linPos = regresionLineal(pos);
      exp = { a: le.a, b: le.b, r2: syy ? 1 - sse / syy : 1 };
      if (linPos && exp.r2 > linPos.r2 + (cfg.mejoraR2Exponencial ?? 0.05)) modelo = 'exponencial';
    }
  }
  if (modelo === 'exponencial') {
    const L0e = Lmed;
    return {
      tipo: 'ajuste', modelo, b: exp.b, L0: L0e, h0, r2: exp.r2, r2Lineal: lin.r2, n: pts.length, pts, lin, exp,
      tasa1000: exp.b * L0e * 1000,
      proyectar: (h) => { const dh = Math.max(0, h - h0); const L = L0e * Math.exp(exp.b * dh); const w = banda(h) * (L / L0e); return { L, lo: Math.max(0, L - w), hi: L + w }; },
      horasHasta: (U) => (L0e >= U ? 0 : Math.log(U / L0e) / exp.b),
    };
  }
  return {
    tipo: 'ajuste', modelo, b: lin.b, L0, h0, r2: lin.r2, r2Exp: exp?.r2 ?? null, n: pts.length, pts, lin,
    tasa1000: lin.b * 1000,
    proyectar: (h) => { const L = L0 + lin.b * Math.max(0, h - h0); const w = banda(h); return { L, lo: Math.max(0, L - w), hi: L + w }; },
  };
}

/** Horas de horómetro (absolutas) en que la tendencia alcanza el umbral U. Infinity si no crece. */
export function horasHastaUmbral(t, U) {
  if (!t || t.tasa1000 === null) return Infinity;
  if (t.L0 >= U) return t.h0;
  if (t.horasHasta) return t.h0 + t.horasHasta(U);
  if (!(t.b > 0)) return Infinity;
  return t.h0 + (U - t.L0) / t.b;
}

/** Análisis del equipo completo. */
export function analizar(modelo, cfg = {}, decisiones = {}) {
  const calidad = validar(modelo, cfg);
  const inspecciones = [...modelo.inspecciones].sort(cmpInsp);
  const ultimaInsp = inspecciones.at(-1);
  const primera = inspecciones[0];
  const dias = primera && ultimaInsp ? diasEntre(primera.fecha, ultimaInsp.fecha) : 0;
  const utilizacion = dias > 30 ? (ultimaInsp.horas - primera.horas) / dias : (cfg.utilizacionHDiaDefecto ?? 17);
  const difs = inspecciones.slice(1).map((x, i) => x.horas - inspecciones[i].horas).filter((x) => x > 0);
  const intervalo = mediana(difs) ?? cfg.intervaloInspeccionHDefecto ?? 750;
  const horasActuales = ultimaInsp?.horas ?? 0;
  const fechaDeHoras = (h) => (Number.isFinite(h) && ultimaInsp ? sumarDias(ultimaInsp.fecha, (h - horasActuales) / utilizacion) : null);

  const grupos = agrupar(modelo.mediciones);
  const ctx = { calidad, decisiones, cfg };
  const puntos = {};
  for (const p of modelo.puntos) {
    const a = analizarPunto(p, grupos[p.codigo] || [], ctx);
    const hC = horasHastaUmbral(a.tendencia, p.caution);
    const hD = horasHastaUmbral(a.tendencia, p.danger);
    a.proyeccion = {
      hCaution: hC, hDanger: hD,
      restanteCaution: Number.isFinite(hC) ? Math.max(0, hC - horasActuales) : Infinity,
      restanteDanger: Number.isFinite(hD) ? Math.max(0, hD - horasActuales) : Infinity,
      fechaCaution: fechaDeHoras(Math.max(hC, horasActuales)), fechaDanger: fechaDeHoras(Math.max(hD, horasActuales)),
    };
    puntos[p.codigo] = a;
  }

  const base = { modelo, cfg, decisiones, calidad, inspecciones, ultimaInsp, utilizacion, intervalo, horasActuales, fechaDeHoras, puntos };
  base.fotos = analizarFotos(base);
  base.alertas = generarAlertas(base);
  base.plan = generarPlan(base);
  base.parada = proximaParada(base);
  base.kpis = calcularKpis(base);
  base.estadoEquipo = peorEstado(Object.values(puntos).map((a) => a.estadoActual));
  return base;
}

const esFoto = (img, esquemas) => img && !esquemas.has(img);

/** Registro fotográfico por zona: última foto y antigüedad en inspecciones (D6). */
export function analizarFotos(A) {
  const esquemas = new Set(A.modelo.puntos.map((p) => p.esquema));
  const zonas = {};
  for (const p of A.modelo.puntos) zonas[p.zonaId] = zonas[p.zonaId] || { zonaId: p.zonaId, zona: p.zona, fotos: [] };
  for (const m of A.modelo.mediciones) {
    const z = m.codigo.split('-')[0];
    (m.imagenes || []).filter((i) => esFoto(i, esquemas)).forEach((img) => zonas[z]?.fotos.push({ img, fecha: m.fecha, codigo: m.codigo, comentario: m.comentario }));
  }
  for (const z of Object.values(zonas)) {
    z.fotos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    z.ultima = z.fotos[0]?.fecha ?? null;
    z.inspeccionesSinFoto = A.inspecciones.filter((i) => !z.ultima || i.fecha > z.ultima).length;
    z.desactualizada = z.inspeccionesSinFoto > (A.cfg.fotoAntiguedadMaxInspecciones ?? 2);
  }
  return zonas;
}

const fmtH = (h) => `${Math.round(h).toLocaleString('es-CL')} h`;

/** Alertas vigentes según el estado actual del equipo. */
export function generarAlertas(A) {
  const cfg = A.cfg; const out = [];
  const add = (a) => out.push({ id: `${a.tipo}|${a.codigo ?? a.zonaId}`, ...a });
  const I = A.intervalo; const N = cfg.horizonteProximidadIntervalos ?? 2;
  for (const a of Object.values(A.puntos)) {
    const p = a.punto; const z = p.zonaId;
    const Lu = a.ultimoValido?.Lef;
    // (a) Umbral
    if (a.estadoActual === 'Crítico') add({ tipo: 'umbral', severidad: 'critica', codigo: p.codigo, zonaId: z, titulo: `${p.codigo} en estado Crítico (${Lu} mm ≥ Danger ${p.danger} mm)`, detalle: p.descripcion, accion: ACCION_POR_ESTADO['Crítico'] });
    else if (a.estadoActual === 'Alerta') add({ tipo: 'umbral', severidad: 'alta', codigo: p.codigo, zonaId: z, titulo: `${p.codigo} en Alerta (${Lu} mm ≥ Caution ${p.caution} mm)`, detalle: `${p.descripcion}. Danger en ${Number.isFinite(a.proyeccion.restanteDanger) ? '≈ ' + fmtH(a.proyeccion.restanteDanger) : '—'}.`, accion: ACCION_POR_ESTADO.Alerta });
    // (b) Proximidad
    const pr = a.proyeccion;
    if (a.estadoActual === 'Normal' && pr.restanteCaution <= N * I) add({ tipo: 'proximidad', severidad: pr.restanteCaution <= I ? 'media' : 'baja', codigo: p.codigo, zonaId: z, titulo: `${p.codigo} alcanzaría Caution en ≈ ${fmtH(pr.restanteCaution)}`, detalle: `Proyección ${a.tendencia.modelo ?? ''} desde ${Lu} mm a ${Math.round(a.tendencia.tasa1000)} mm/1000 h → ${pr.fechaCaution}. ${pr.restanteCaution <= I ? 'Antes de la próxima inspección.' : `Dentro de ${N} inspecciones.`}`, accion: 'Aumentar frecuencia de inspección; incluir en la próxima parada programada.' });
    if (a.estadoActual === 'Alerta' && pr.restanteDanger <= N * I) add({ tipo: 'proximidad', severidad: pr.restanteDanger <= I ? 'critica' : 'alta', codigo: p.codigo, zonaId: z, titulo: `${p.codigo} alcanzaría Danger en ≈ ${fmtH(pr.restanteDanger)}`, detalle: `Proyección → ${pr.fechaDanger}.`, accion: 'Reparar antes de esa fecha.' });
    // (c) Crecimiento rápido
    const t = a.tendencia.tipo === 'ajuste' ? a.tendencia.tasa1000 : null;
    const tu = a.tasaUltima;
    const rapidoAbs = (t ?? 0) > cfg.crecimientoRapidoMmPor1000h || (tu ?? 0) > cfg.crecimientoRapidoMmPor1000h;
    const rapidoRel = tu !== null && a.medianaTasas && tu > (cfg.factorCrecimientoRapido ?? 2) * a.medianaTasas && tu > (cfg.tasaMinimaRelevante ?? 40);
    if (a.estadoActual !== 'N/I' && (rapidoAbs || rapidoRel)) add({ tipo: 'crecimiento', severidad: 'media', codigo: p.codigo, zonaId: z, titulo: `${p.codigo} con crecimiento rápido (${Math.round(Math.max(t ?? 0, tu ?? 0))} mm/1000 h)`, detalle: `Mediana histórica del punto: ${a.medianaTasas ? Math.round(a.medianaTasas) : '—'} mm/1000 h. Umbral: ${cfg.crecimientoRapidoMmPor1000h} mm/1000 h o ${cfg.factorCrecimientoRapido}× la mediana.`, accion: 'Revisar causa (operación, carga, calidad de reparación) y acortar intervalo de inspección.' });
    // (d) N/I
    const ventana = A.inspecciones.slice(-(cfg.niRepetidoVentana ?? 6)).map((i) => i.fecha);
    const nNI = a.registros.filter((r) => ventana.includes(r.fecha) && (r.Lef === null || r.Lef === undefined) && !r.excluido).length;
    if (nNI >= (cfg.niRepetidoMinimo ?? 2)) add({ tipo: 'ni', severidad: 'media', codigo: p.codigo, zonaId: z, titulo: `${p.codigo} sin inspeccionar ${nNI} veces en las últimas ${ventana.length} inspecciones`, detalle: 'Cobertura insuficiente: la tendencia pierde confiabilidad.', accion: 'Asegurar acceso/limpieza para inspeccionar el punto.' });
    else if (a.niUltima) add({ tipo: 'ni', severidad: 'baja', codigo: p.codigo, zonaId: z, titulo: `${p.codigo} no inspeccionado en la última inspección`, detalle: `Último dato válido: ${a.ultimoValido ? `${a.ultimoValido.Lef} mm (${a.ultimoValido.fecha})` : '—'}.`, accion: 'Inspeccionar en la próxima oportunidad.' });
    // (e) Dato sospechoso pendiente
    for (const r of a.pendientes) {
      const eBruto = estadoDe(r.L, p);
      const esUltimo = r === a.ultimo;
      add({ tipo: 'sospechoso', id: `sospechoso|${r.id}`, severidad: esUltimo && eBruto === 'Crítico' ? 'critica' : esUltimo ? 'alta' : 'media', codigo: p.codigo, zonaId: z, medicionId: r.id, titulo: `Dato sospechoso ${p.codigo} · ${r.fecha}: ${r.L} mm`, detalle: r.calidad.motivo, accion: esUltimo ? 'Re-medir antes de liberar el equipo; confirmar o corregir en Calidad de datos.' : 'Confirmar, descartar o corregir en Calidad de datos.' });
    }
    // Reincidencia en el ciclo actual (informativo: calidad de reparación)
    const c = a.cicloActual;
    if (c.reincidencia && a.ultimoValido?.Lef > 0) add({ tipo: 'reincidencia', severidad: 'info', codigo: p.codigo, zonaId: z, titulo: `${p.codigo}: grieta reaparecida tras reparación`, detalle: `Reparado ${c.inicio.fecha}; grieta detectada ${fmtH(c.horasHastaGrieta)} después. Reincidencias en el historial: ${a.reincidencias}.`, accion: 'Revisar procedimiento de soldadura / causa raíz.' });
  }
  for (const z of Object.values(A.fotos)) {
    if (z.desactualizada) out.push({ id: `foto|${z.zonaId}`, tipo: 'foto', severidad: 'baja', zonaId: z.zonaId, titulo: `Registro fotográfico desactualizado: ${z.zona}`, detalle: z.ultima ? `Última foto ${z.ultima}; ${z.inspeccionesSinFoto} inspecciones sin foto nueva (el formato reutiliza fotos antiguas).` : 'Sin fotos registradas.', accion: 'Tomar fotos actuales de los puntos con grieta en la próxima inspección.' });
  }
  return out.sort((a, b) => SEVERIDADES.indexOf(a.severidad) - SEVERIDADES.indexOf(b.severidad));
}

/** Ranking de puntos por riesgo con acción recomendada. */
export function generarPlan(A) {
  const I = A.intervalo;
  const filas = Object.values(A.puntos).map((a) => {
    const p = a.punto; const pr = a.proyeccion; const t = a.tendencia;
    let score = { 'Crítico': 100, Alerta: 60, Normal: 10, 'N/I': 5 }[a.estadoActual];
    if (Number.isFinite(pr.restanteDanger)) score += 40 * Math.max(0, 1 - pr.restanteDanger / 6000);
    if (a.estadoActual === 'Normal' && Number.isFinite(pr.restanteCaution)) score += 25 * Math.max(0, 1 - pr.restanteCaution / 3000);
    score += Math.min(15, Math.max(0, t.tasa1000 ?? 0) / 6);
    score += 4 * a.reincidencias;
    if (a.pendientes.length) score += 10;
    if (a.niUltima) score += 5;
    let accion; let plazoH = null;
    if (a.pendientes.some((r) => r === a.ultimo)) accion = 'Re-medir y confirmar el dato antes de decidir.';
    else if (a.estadoActual === 'Crítico') { accion = 'Reparar antes de continuar operando.'; plazoH = 0; }
    else if (a.estadoActual === 'Alerta') { accion = 'Programar reparación y aumentar frecuencia de inspección.'; plazoH = pr.restanteDanger; }
    else if (pr.restanteCaution <= 2 * I) { accion = 'Aumentar frecuencia de inspección; incluir en la próxima parada.'; plazoH = pr.restanteCaution; }
    else if (A.alertas?.some((x) => x.codigo === p.codigo && x.tipo === 'crecimiento')) { accion = 'Acortar intervalo de inspección (crecimiento rápido); revisar causa y calidad de reparación.'; plazoH = I; }
    else if (a.niUltima) accion = 'Inspeccionar en la próxima oportunidad (sin dato reciente).';
    else if ((a.ultimoValido?.Lef ?? 0) > 0) accion = 'Seguimiento en frecuencia normal (grieta activa).';
    else accion = 'Seguimiento en frecuencia normal.';
    return { codigo: p.codigo, zonaId: p.zonaId, descripcion: p.descripcion, estado: a.estadoActual, L: a.ultimoValido?.Lef ?? null, tasa1000: t.tasa1000, score: Math.round(score), accion, plazoH, plazoFecha: plazoH !== null && Number.isFinite(plazoH) ? A.fechaDeHoras(A.horasActuales + plazoH) : null };
  });
  return filas.sort((a, b) => b.score - a.score);
}

/** Cuándo conviene la próxima parada y qué incluir en ella. */
export function proximaParada(A) {
  const I = A.intervalo;
  const ps = Object.values(A.puntos);
  const limites = ps.filter((a) => a.estadoActual === 'Crítico' || a.estadoActual === 'Alerta').map((a) => (a.estadoActual === 'Crítico' ? 0 : a.proyeccion.restanteDanger));
  if (!limites.length) {
    const prox = Math.min(...ps.map((a) => a.proyeccion.restanteCaution));
    return { requerida: false, horas: Number.isFinite(prox) ? prox : null, fecha: Number.isFinite(prox) ? A.fechaDeHoras(A.horasActuales + prox) : null, incluir: [], texto: 'Ningún punto en Alerta: no se requiere parada de reparación. Mantener frecuencia de inspección.' };
  }
  const limite = Math.min(...limites);
  const horas = Math.max(0, limite - I); // margen de un intervalo de inspección antes de Danger
  const incluir = ps.filter((a) => a.estadoActual === 'Crítico' || a.estadoActual === 'Alerta' || a.proyeccion.restanteCaution <= horas + I).map((a) => a.codigo);
  return { requerida: true, horas, limiteH: limite, fecha: A.fechaDeHoras(A.horasActuales + horas), fechaLimite: A.fechaDeHoras(A.horasActuales + limite), incluir, texto: horas === 0 ? 'Detener y reparar de inmediato.' : `Programar parada de reparación antes de ≈ ${fmtH(horas)} (margen de un intervalo antes de Danger).` };
}

export function calcularKpis(A) {
  const ps = Object.values(A.puntos);
  const conteo = { Normal: 0, Alerta: 0, 'Crítico': 0, 'N/I': 0 };
  ps.forEach((a) => conteo[a.estadoActual]++);
  const span = A.inspecciones.length > 1 ? A.horasActuales - A.inspecciones[0].horas : 0;
  const porZona = {};
  for (const a of ps) {
    const z = a.punto.zonaId;
    const k = (porZona[z] = porZona[z] || { zonaId: z, zona: a.punto.zona, puntos: 0, reparaciones: 0, cambios: 0, reincidencias: 0, tasas: [], horasCritico: 0, horasAlerta: 0, estados: [] });
    k.puntos++; k.reparaciones += a.reparaciones; k.cambios += a.cambios; k.reincidencias += a.reincidencias; k.estados.push(a.estadoActual);
    if ((a.ultimoValido?.Lef ?? 0) > 0 && a.tendencia.tasa1000 > 0) k.tasas.push(a.tendencia.tasa1000);
    for (const e of a.episodios) { if (e.nivel === 'Crítico') k.horasCritico += e.horas; else k.horasAlerta += e.horas; }
  }
  for (const k of Object.values(porZona)) {
    k.tasaMedia = k.tasas.length ? k.tasas.reduce((s, x) => s + x, 0) / k.tasas.length : 0;
    k.mtbr = k.reparaciones ? (span * k.puntos) / k.reparaciones : null; // horas-punto entre reparaciones
    k.estado = peorEstado(k.estados);
  }
  const mediciones = ps.reduce((s, a) => s + a.registros.length, 0);
  const ni = ps.reduce((s, a) => s + a.registros.filter((r) => r.L === null || r.L === undefined).length, 0);
  const reparaciones = ps.reduce((s, a) => s + a.reparaciones, 0);
  return {
    conteo, porZona, mediciones, ni, cobertura: mediciones ? 1 - ni / mediciones : 1,
    reparaciones, cambios: ps.reduce((s, a) => s + a.cambios, 0), reincidencias: ps.reduce((s, a) => s + a.reincidencias, 0),
    mtbr: reparaciones ? (span * ps.length) / reparaciones : null,
    horasCritico: Object.values(porZona).reduce((s, k) => s + k.horasCritico, 0),
    grietasActivas: ps.filter((a) => (a.ultimoValido?.Lef ?? 0) > 0).length,
    sospechososPendientes: ps.reduce((s, a) => s + a.pendientes.length, 0),
    utilizacion: A.utilizacion, intervalo: A.intervalo,
  };
}

/** Simulador "¿qué pasa si?": estado proyectado de cada punto dentro de dh horas. */
export function simular(A, dh) {
  const h = A.horasActuales + dh;
  const out = {};
  for (const a of Object.values(A.puntos)) {
    const t = a.tendencia;
    const base = a.ultimoValido?.Lef ?? null;
    const L = t.proyectar ? t.proyectar(h).L : base;
    out[a.codigo] = { L: L === null ? null : Math.round(L), estado: L === null ? 'N/I' : estadoDe(L, a.punto), estadoHoy: a.estadoActual };
  }
  return { horas: h, fecha: A.fechaDeHoras(h), puntos: out };
}

/** Evalúa un intervalo de inspección: qué puntos podrían pasar de Normal a Crítico sin ser detectados en Alerta. */
export function evaluarIntervalo(A, I) {
  const filas = [];
  let recomendado = Infinity;
  for (const a of Object.values(A.puntos)) {
    const p = a.punto;
    const tasa = Math.max(a.tendencia.tasa1000 ?? 0, a.maxTasa ?? 0); // conservador: la peor tasa observada
    const ventana = tasa > 0 ? ((p.danger - p.caution) / tasa) * 1000 : Infinity; // horas que una grieta permanece en Alerta
    recomendado = Math.min(recomendado, ventana);
    const pr = a.proyeccion;
    let riesgo = null;
    if (a.estadoActual === 'Alerta' && pr.restanteDanger < I) riesgo = `Llegaría a Danger (≈ ${fmtH(pr.restanteDanger)}) antes de la siguiente inspección.`;
    else if (I > ventana) riesgo = `Con la peor tasa observada (${Math.round(tasa)} mm/1000 h) la grieta cruza la banda de Alerta en ${fmtH(ventana)}: podría pasar de Normal a Crítico entre dos inspecciones.`;
    filas.push({ codigo: p.codigo, tasa, ventana, riesgo });
  }
  return { I, filas, recomendado: Number.isFinite(recomendado) ? recomendado : null, enRiesgo: filas.filter((f) => f.riesgo) };
}

/** Repite el análisis inspección por inspección: qué alertas habría emitido la plataforma en su momento. */
export function historialAlertas(modelo, cfg, decisiones) {
  const insp = [...modelo.inspecciones].sort(cmpInsp);
  const pasos = [];
  for (let i = 2; i < insp.length; i++) {
    const f = insp[i].fecha;
    const sub = { ...modelo, inspecciones: insp.slice(0, i + 1), mediciones: modelo.mediciones.filter((m) => m.fecha <= f) };
    const A = analizar(sub, cfg, decisiones);
    pasos.push({ fecha: f, horas: insp[i].horas, alertas: A.alertas.filter((a) => ['umbral', 'proximidad', 'crecimiento', 'sospechoso'].includes(a.tipo)) });
  }
  // Primera emisión de cada alerta (por id) → línea de tiempo.
  const vistos = new Map();
  const eventos = [];
  pasos.forEach((p, k) => {
    for (const a of p.alertas) {
      const key = a.id + '|' + a.severidad;
      if (!vistos.has(key) || vistos.get(key) !== k - 1) eventos.push({ fecha: p.fecha, horas: p.horas, ...a });
      vistos.set(key, k);
    }
  });
  return { pasos, eventos };
}
