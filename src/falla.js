// Modelo básico de falla por fatiga para el simulador: ley de Paris, longitud crítica,
// modo de falla y diagrama de evaluación de falla (FAD) simplificado.
// Lógica PURA (sin DOM) → se prueba con `node tests/verify.cjs`.
//
// Idea central (ver docs/MANTENIMIENTO_Y_FALLA.md):
//   da/dN = C·ΔK^m  con  ΔK = Y·Δσ·√(π·a)   ⇒   da/dh = k · a^(m/2)
// La tasa observada en campo (mm/1000 h) calibra k en la longitud actual; después la grieta
// acelera con a^(m/2) hasta la longitud crítica a_c, donde la pieza se fractura o el
// ligamento colapsa. Un sobreesfuerzo s (Δσ extra / Δσ nominal) multiplica la tasa por (1+s)^m.

import { estadoDe } from './reglas.js';

export const FALLA_DEFECTO = {
  m: 3, factorCritico: 1.6, aNucleacion: 5, sNucleacion: 0.3, tasaRefDefecto: 15,
  LrNominal: 0.45, sMax: 2, radioInfluenciaM: 1.6, pxPorS: 220, velocidades: [10, 50, 200, 1000],
};

export const MODOS = {
  'sin-grieta': { titulo: 'Sin grieta', corto: 'Sana', desc: 'No hay grieta detectable. Solo una sobrecarga importante podría iniciar una en el talón de soldadura.' },
  iniciacion: { titulo: 'Iniciación (etapa I)', corto: 'Iniciación', desc: 'Grieta corta en el talón de soldadura. Crece lento; se controla con la frecuencia normal de inspección.' },
  propagacion: { titulo: 'Propagación estable (etapa II)', corto: 'Propagación', desc: 'Crecimiento según la ley de Paris: la tasa aumenta con √a. Programar reparación y acortar el intervalo.' },
  acelerada: { titulo: 'Propagación acelerada (etapa III)', corto: 'Acelerada', desc: 'Sobre Danger: la tasa se dispara y el ligamento se reduce. Riesgo de fractura inestable en cualquier sobrecarga. Reparar antes de operar.' },
  fractura: { titulo: 'Fractura inestable / colapso', corto: 'FALLA', desc: 'La grieta alcanzó la longitud crítica: el factor de intensidad llega a la tenacidad (K = K_IC) o el ligamento colapsa. Pérdida del componente.' },
};

const cfgFalla = (cfg) => ({ ...FALLA_DEFECTO, ...(cfg?.falla || {}) });

/**
 * Parámetros del modelo de Paris para un punto, calibrados con su historia.
 * Régimen de grieta corta: por debajo de a_ref = max(L actual, Caution/2) la tasa observada se
 * mantiene constante (tensiones residuales de soldadura/reparación); desde a_ref sigue Paris.
 */
export function modeloPunto(a, cfg) {
  const f = cfgFalla(cfg);
  const p = a.punto;
  const aCrit = p.danger * f.factorCritico;
  const L0 = Math.max(0, a.ultimoValido?.Lef ?? 0);
  const n = f.m / 2;
  let tasa0;
  if (L0 > 0 && a.tendencia.tasa1000 > 0) tasa0 = a.tendencia.tasa1000;
  else if (a.medianaTasas > 0) tasa0 = a.medianaTasas;
  else tasa0 = f.tasaRefDefecto;
  const aRef = Math.max(L0, p.caution / 2);
  const k = tasa0 / 1000 / Math.pow(aRef, n); // mm/h / mm^n, válido para a ≥ aRef
  return { codigo: a.codigo, punto: p, aCrit, L0, tasa0, aRef, m: f.m, n, k, aNucleacion: f.aNucleacion, sNucleacion: f.sNucleacion, LrNominal: f.LrNominal };
}

/** Tasa de crecimiento (mm/1000 h) a la longitud a con sobreesfuerzo s. */
export const tasaEn = (M, a, s = 0) => (a > 0 ? M.tasa0 * Math.pow(Math.max(1, a / M.aRef), M.n) * factorCarga(s, M.m) : 0);

/** Factor de carga de Paris: (Δσ·(1+s))^m / Δσ^m. */
export const factorCarga = (s, m) => Math.pow(1 + Math.max(0, s), m);

/** Longitud tras dh horas con sobreesfuerzo s (solución cerrada por tramos). */
export function avanzar(M, a, dh, s = 0) {
  if (dh <= 0) return a;
  if (a < M.aNucleacion) {
    if (s >= M.sNucleacion) a = M.aNucleacion; // sobrecarga inicia una grieta en un punto sano
    else return a;
  }
  const F = factorCarga(s, M.m);
  if (a < M.aRef) { // tramo lineal (grieta corta)
    const v = (M.tasa0 / 1000) * F; const t1 = (M.aRef - a) / v;
    if (dh <= t1) return a + v * dh;
    a = M.aRef; dh -= t1;
  }
  const kF = M.k * F;
  if (Math.abs(M.n - 1) < 1e-9) return Math.min(a * Math.exp(kF * dh), M.aCrit * 1.05);
  const e = 1 - M.n; // < 0 cuando n > 1
  const base = Math.pow(a, e) + e * kF * dh;
  if (base <= 0) return M.aCrit * 1.05; // singularidad en tiempo finito = fractura
  return Math.min(Math.pow(base, 1 / e), M.aCrit * 1.05);
}

/** Horas para pasar de a a la longitud objetivo (Infinity si no crece). */
export function horasHasta(M, a, objetivo, s = 0) {
  if (a >= objetivo) return 0;
  if (a < M.aNucleacion) { if (s < M.sNucleacion) return Infinity; a = M.aNucleacion; }
  const F = factorCarga(s, M.m);
  if (!(M.tasa0 > 0)) return Infinity;
  let h = 0;
  if (a < M.aRef) { // tramo lineal
    const v = (M.tasa0 / 1000) * F;
    if (objetivo <= M.aRef) return (objetivo - a) / v;
    h = (M.aRef - a) / v; a = M.aRef;
  }
  const kF = M.k * F;
  if (Math.abs(M.n - 1) < 1e-9) return h + Math.log(objetivo / a) / kF;
  const e = 1 - M.n;
  return h + (Math.pow(a, e) - Math.pow(objetivo, e)) / ((M.n - 1) * kF);
}

export const severidad = (M, a) => Math.min(1, Math.max(0, a / M.aCrit));

export function modoFalla(M, a) {
  if (a >= M.aCrit) return 'fractura';
  if (a >= M.punto.danger) return 'acelerada';
  if (a >= M.punto.caution) return 'propagacion';
  if (a > 0) return 'iniciacion';
  return 'sin-grieta';
}

/**
 * Diagrama de evaluación de falla (FAD) simplificado, envolvente circular Kr² + Lr² = 1
 * (más conservadora que la Opción 1 de BS 7910 / API 579 Nivel 2).
 *  Kr = K/K_IC ≈ (1+s)·√(a/a_c)      Lr = σ_ref/σ_y, crece al reducirse el ligamento.
 */
export function evaluarFAD(M, a, s = 0) {
  const Kr = (1 + Math.max(0, s)) * Math.sqrt(Math.min(1.2, a / M.aCrit));
  const Lr = Math.min(1.5, (M.LrNominal * (1 + Math.max(0, s))) / Math.max(0.2, 1 - 0.5 * Math.min(1, a / M.aCrit)));
  const r = Math.hypot(Kr, Lr);
  return { Kr, Lr, margen: 1 - r, falla: r >= 1, dominante: Kr >= Lr ? 'fractura' : 'colapso' };
}

/** Predicción estática (sin mouse) de cuándo y cómo fallaría cada punto y cada pieza. */
export function predecir(A, cfg) {
  const puntos = Object.values(A.puntos).map((a) => {
    const M = modeloPunto(a, cfg);
    const a0 = M.L0;
    const hD = horasHasta(M, a0, M.punto.danger);
    const hC = horasHasta(M, a0, M.aCrit);
    return {
      codigo: a.codigo, zonaId: M.punto.zonaId, L0: a0, aCrit: M.aCrit, tasa0: M.tasa0, tasaHoy: tasaEn(M, a0),
      severidad: severidad(M, a0), modo: modoFalla(M, a0), estado: a.estadoActual,
      horasDanger: hD, horasCritico: hC, fechaCritico: Number.isFinite(hC) ? A.fechaDeHoras(A.horasActuales + hC) : null,
      horasDangerLineal: a.proyeccion.restanteDanger, fad: evaluarFAD(M, a0),
    };
  }).sort((x, y) => x.horasCritico - y.horasCritico || y.severidad - x.severidad);
  const piezas = {};
  for (const p of puntos) {
    const z = (piezas[p.zonaId] = piezas[p.zonaId] || { zonaId: p.zonaId, primero: null, horasCritico: Infinity, severidad: 0 });
    if (p.horasCritico < z.horasCritico) { z.horasCritico = p.horasCritico; z.primero = p.codigo; }
    z.severidad = Math.max(z.severidad, p.severidad);
  }
  return { puntos, piezas, primero: puntos[0] };
}

/** Simulación en tiempo real: estado mutable de las 12 grietas que avanza por pasos. */
export function crearSimulacion(A, cfg) {
  const f = cfgFalla(cfg);
  const modelos = Object.fromEntries(Object.values(A.puntos).map((a) => [a.codigo, modeloPunto(a, cfg)]));
  const sim = { horas: 0, puntos: {}, eventos: [], cfg: f };
  const reiniciar = () => {
    sim.horas = 0; sim.eventos = [];
    for (const M of Object.values(modelos)) sim.puntos[M.codigo] = { codigo: M.codigo, a: M.L0, a0: M.L0, estado: estadoDe(M.L0 > 0 ? M.L0 : (A.puntos[M.codigo].ultimoValido?.Lef ?? null), M.punto), modo: modoFalla(M, M.L0), sMax: 0, horasSobrecarga: 0, fallado: M.L0 >= M.aCrit, horaFalla: null, s: 0 };
  };
  reiniciar();
  /** Avanza dh horas; cargas = { codigo: s } con el sobreesfuerzo relativo en cada punto. */
  sim.paso = (dh, cargas = {}) => {
    if (!(dh > 0)) return;
    sim.horas += dh;
    for (const M of Object.values(modelos)) {
      const x = sim.puntos[M.codigo]; const s = cargas[M.codigo] || 0;
      x.s = s;
      if (s > 0.05) { x.horasSobrecarga += dh; x.sMax = Math.max(x.sMax, s); }
      if (x.fallado) continue;
      const antes = x.a;
      x.a = avanzar(M, x.a, dh, s);
      const e0 = estadoDe(antes > 0 ? antes : null, M.punto); const e1 = estadoDe(x.a > 0 ? x.a : null, M.punto);
      x.estado = x.a > 0 ? e1 : x.estado;
      if (x.a > 0 && e1 !== e0 && antes > 0) sim.eventos.push({ horas: sim.horas, codigo: M.codigo, tipo: 'estado', de: e0, a: e1, L: x.a });
      if (antes < M.aNucleacion && x.a >= M.aNucleacion) sim.eventos.push({ horas: sim.horas, codigo: M.codigo, tipo: 'inicio', L: x.a });
      x.modo = modoFalla(M, x.a);
      if (x.a >= M.aCrit && !x.fallado) { x.fallado = true; x.horaFalla = sim.horas; sim.eventos.push({ horas: sim.horas, codigo: M.codigo, tipo: 'falla', L: x.a }); }
    }
  };
  /** Estado para la vista: por punto, severidad, modo, FAD y horas restantes sin sobrecarga. */
  sim.estado = () => {
    const out = {};
    for (const M of Object.values(modelos)) {
      const x = sim.puntos[M.codigo];
      const hC = x.fallado ? 0 : horasHasta(M, x.a, M.aCrit);
      out[M.codigo] = { ...x, L: Math.round(x.a), aCrit: M.aCrit, severidad: severidad(M, x.a), tasa: tasaEn(M, x.a, x.s), horasCritico: hC, horasDanger: x.a >= M.punto.danger ? 0 : horasHasta(M, x.a, M.punto.danger), fad: evaluarFAD(M, x.a, x.s), modoInfo: MODOS[x.modo] };
    }
    return out;
  };
  sim.reiniciar = reiniciar;
  sim.modelos = modelos;
  sim.fecha = () => A.fechaDeHoras(A.horasActuales + sim.horas);
  return sim;
}

/** Distribuye el sobreesfuerzo del mouse (magnitud s en el punto de agarre) sobre los puntos por distancia. */
export function cargasPorDistancia(s, distancias, radio) {
  const out = {};
  if (!(s > 0)) return out;
  for (const [c, d] of Object.entries(distancias)) out[c] = s * Math.exp(-(d * d) / (2 * radio * radio));
  return out;
}
