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
  LrNominal: 0.35, sMax: 1.5, radioInfluenciaM: 1.6, pxPorS: 220, velocidades: [10, 50, 200, 1000],
};

/** Causas de falla que distingue el simulador. */
export const CAUSAS = {
  tiempo: { titulo: 'Fatiga por horas de uso', corto: 'Por tiempo', desc: 'La grieta creció ciclo a ciclo con la carga normal de operación hasta la longitud crítica. Se habría evitado reparando a tiempo.' },
  sobrecarga: { titulo: 'Fractura por fuerza excesiva', corto: 'Por sobrecarga', desc: 'Un sobreesfuerzo superó lo que la sección agrietada podía resistir: el factor de intensidad llegó a la tenacidad o el ligamento colapsó. Falla súbita, sin aviso.' },
  'fatiga-sobrecarga': { titulo: 'Fatiga acelerada por sobrecargas', corto: 'Tiempo + sobrecarga', desc: 'La grieta llegó a la longitud crítica, pero más de la mitad de su crecimiento ocurrió bajo sobreesfuerzo. Operar sobrecargado acortó la vida.' },
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
 * Diagrama de evaluación de falla (FAD), curva Opción 1 de BS 7910 / API 579 Nivel 2:
 *   f(Lr) = (1 − 0,14·Lr²)·(0,3 + 0,7·exp(−0,65·Lr⁶)),  Lr ≤ Lr,max (≈ 1,15 en acero estructural)
 *  Kr = K/K_IC ≈ (1+s)·√(a/a_c)      Lr = σ_ref/σ_y, crece al reducirse el ligamento.
 * Falla si Kr ≥ f(Lr) (fractura) o Lr ≥ Lr,max (colapso plástico).
 */
export const LR_MAX = 1.15;
export const curvaFAD = (Lr) => (Lr >= LR_MAX ? 0 : (1 - 0.14 * Lr * Lr) * (0.3 + 0.7 * Math.exp(-0.65 * Math.pow(Lr, 6))));
export function evaluarFAD(M, a, s = 0) {
  const Kr = (1 + Math.max(0, s)) * Math.sqrt(Math.max(0, a) / M.aCrit);
  const Lr = (M.LrNominal * (1 + Math.max(0, s))) / Math.max(0.2, 1 - 0.5 * Math.min(1, a / M.aCrit));
  const f = curvaFAD(Lr);
  const rK = f > 0 ? Kr / f : Infinity; const rL = Lr / LR_MAX;
  const ratio = Math.max(rK, rL);
  return { Kr, Lr, f, ratio, margen: 1 - ratio, falla: ratio >= 1, dominante: rK >= rL ? 'fractura' : 'colapso' };
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
    for (const M of Object.values(modelos)) sim.puntos[M.codigo] = {
      codigo: M.codigo, a: M.L0, a0: M.L0, estado: estadoDe(M.L0 > 0 ? M.L0 : (A.puntos[M.codigo].ultimoValido?.Lef ?? null), M.punto), modo: modoFalla(M, M.L0),
      s: 0, sMax: 0, horasSobrecarga: 0, sumaS: 0, dosis: 0, crecTiempo: 0, crecSobrecarga: 0,
      fallado: M.L0 >= M.aCrit, horaFalla: null, causa: null, detalleFalla: null, sFalla: null, LFalla: null,
    };
  };
  reiniciar();
  /** Avanza dh horas; cargas = { codigo: s } con el sobreesfuerzo relativo en cada punto. */
  sim.paso = (dh, cargas = {}) => {
    if (!(dh > 0)) return;
    sim.horas += dh;
    for (const M of Object.values(modelos)) {
      const x = sim.puntos[M.codigo]; const s = cargas[M.codigo] || 0;
      x.s = s;
      if (x.fallado) continue;
      if (s > 0.05) { x.horasSobrecarga += dh; x.sMax = Math.max(x.sMax, s); x.sumaS += s * dh; x.dosis += (factorCarga(s, M.m) - 1) * dh; }
      const antes = x.a;
      const sinCarga = avanzar(M, x.a, dh, 0);
      x.a = avanzar(M, x.a, dh, s);
      x.crecTiempo += Math.max(0, sinCarga - antes);
      x.crecSobrecarga += Math.max(0, x.a - sinCarga);
      const e0 = estadoDe(antes > 0 ? antes : null, M.punto); const e1 = estadoDe(x.a > 0 ? x.a : null, M.punto);
      x.estado = x.a > 0 ? e1 : x.estado;
      if (x.a > 0 && e1 !== e0 && antes > 0) sim.eventos.push({ horas: sim.horas, codigo: M.codigo, tipo: 'estado', de: e0, a: e1, L: x.a });
      if (antes < M.aNucleacion && x.a >= M.aNucleacion) sim.eventos.push({ horas: sim.horas, codigo: M.codigo, tipo: 'inicio', L: x.a, s });
      x.modo = modoFalla(M, x.a);
      // Falla súbita: con el sobreesfuerzo aplicado la grieta actual cruza el FAD aunque no llegue a a_c.
      const fad = evaluarFAD(M, x.a, s);
      if (!x.fallado && x.a >= M.aNucleacion && s > 0.05 && fad.falla) {
        x.fallado = true; x.horaFalla = sim.horas; x.causa = 'sobrecarga'; x.sFalla = s; x.LFalla = x.a;
        x.detalleFalla = `Con +${Math.round(s * 100)} % de esfuerzo y una grieta de ${Math.round(x.a)} mm (a_c ${M.aCrit} mm) ${fad.dominante === 'fractura' ? `el factor de intensidad superó la tenacidad (Kr = ${fad.Kr.toFixed(2)})` : `el ligamento no resistió la carga (Lr = ${fad.Lr.toFixed(2)})`}: fractura súbita.`;
        x.modo = 'fractura';
        sim.eventos.push({ horas: sim.horas, codigo: M.codigo, tipo: 'falla', causa: x.causa, L: x.a, s });
      } else if (!x.fallado && x.a >= M.aCrit) {
        x.fallado = true; x.horaFalla = sim.horas; x.LFalla = x.a;
        const total = Math.max(1e-9, x.crecTiempo + x.crecSobrecarga); const frac = x.crecSobrecarga / total;
        x.causa = frac > 0.5 ? 'fatiga-sobrecarga' : 'tiempo';
        x.detalleFalla = frac > 0.5
          ? `Llegó a a_c (${M.aCrit} mm) en +${Math.round(sim.horas)} h: el ${Math.round(frac * 100)} % del crecimiento ocurrió bajo sobreesfuerzo (máx. +${Math.round(x.sMax * 100)} %, ${Math.round(x.horasSobrecarga)} h sobrecargado).`
          : `Llegó a a_c (${M.aCrit} mm) tras +${Math.round(sim.horas)} h de operación${x.crecSobrecarga > 0 ? `; solo el ${Math.round(frac * 100)} % del crecimiento se debió a sobrecargas` : ' sin sobrecargas'}.`;
        sim.eventos.push({ horas: sim.horas, codigo: M.codigo, tipo: 'falla', causa: x.causa, L: x.a });
      }
    }
  };
  /** Estado para la vista: por punto, severidad, modo, FAD y horas restantes sin sobrecarga. */
  sim.estado = () => {
    const out = {};
    for (const M of Object.values(modelos)) {
      const x = sim.puntos[M.codigo];
      const hC = x.fallado ? 0 : horasHasta(M, x.a, M.aCrit);
      const total = x.crecTiempo + x.crecSobrecarga;
      out[M.codigo] = {
        ...x, L: Math.round(x.a), aCrit: M.aCrit, severidad: severidad(M, x.a), tasa: tasaEn(M, x.a, x.s), horasCritico: hC,
        horasDanger: x.a >= M.punto.danger ? 0 : horasHasta(M, x.a, M.punto.danger), fad: evaluarFAD(M, x.a, x.s), modoInfo: MODOS[x.modo],
        esfuerzo: { horas: x.horasSobrecarga, sMedio: x.horasSobrecarga > 0 ? x.sumaS / x.horasSobrecarga : 0, sMax: x.sMax, dosis: x.dosis, crecTiempo: x.crecTiempo, crecSobrecarga: x.crecSobrecarga, fraccionSobrecarga: total > 0 ? x.crecSobrecarga / total : 0 },
        causaInfo: x.causa ? CAUSAS[x.causa] : null,
      };
    }
    return out;
  };
  /** Reporte de esfuerzo y falla por punto (filas para tabla/CSV). */
  sim.reporte = () => Object.values(sim.estado()).map((x) => ({
    codigo: x.codigo, L0: Math.round(x.a0), L: x.L, aCrit: x.aCrit, severidad: x.severidad, modo: MODOS[x.modo].corto,
    horasSobrecarga: Math.round(x.esfuerzo.horas), sMedio: x.esfuerzo.sMedio, sMax: x.esfuerzo.sMax, dosis: Math.round(x.esfuerzo.dosis),
    crecTiempo: Math.round(x.esfuerzo.crecTiempo), crecSobrecarga: Math.round(x.esfuerzo.crecSobrecarga), fraccionSobrecarga: x.esfuerzo.fraccionSobrecarga,
    fallado: x.fallado, horaFalla: x.horaFalla === null ? null : Math.round(x.horaFalla), causa: x.causa ? CAUSAS[x.causa].corto : '', detalleFalla: x.detalleFalla || '',
  }));
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
