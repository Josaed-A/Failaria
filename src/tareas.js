// Planificación y programación de mantenimiento: tareas tipo tablero (Trello) + calendario.
// Lógica PURA (sin DOM): sugerencias desde el análisis, validación, movimientos y CSV.
import { sumarDias } from './reglas.js';

export const COLUMNAS = [
  { id: 'planificar', nombre: 'Por planificar', desc: 'Detectado: falta definir fecha, recursos y responsable.' },
  { id: 'programada', nombre: 'Programada', desc: 'Con fecha y responsable; esperando la ventana de intervención.' },
  { id: 'ejecucion', nombre: 'En ejecución', desc: 'Trabajo en curso en terreno.' },
  { id: 'hecha', nombre: 'Hecha', desc: 'Terminada y verificada; registrar la inspección posterior si aplica.' },
];
export const TIPOS = {
  reparacion: { nombre: 'Reparación por soldadura', icono: '🔧', dur: 12 },
  inspeccion: { nombre: 'Inspección / NDT', icono: '🔍', dur: 2 },
  remedicion: { nombre: 'Re-medición / confirmar dato', icono: '📏', dur: 1 },
  foto: { nombre: 'Registro fotográfico', icono: '📷', dur: 1 },
  parada: { nombre: 'Parada programada', icono: '⛔', dur: 24 },
  cambio: { nombre: 'Cambio de componente', icono: '🔩', dur: 36 },
  otra: { nombre: 'Otra', icono: '📝', dur: 4 },
};
export const PRIORIDADES = ['alta', 'media', 'baja'];

export const nuevaId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Tarea con valores por defecto. */
export function nuevaTarea(base = {}) {
  const ahora = new Date().toISOString();
  return {
    id: nuevaId(), titulo: '', tipo: 'otra', codigo: '', zonaId: '', prioridad: 'media', estado: 'planificar',
    fecha: null, horas: null, duracionH: null, responsable: '', descripcion: '', checklist: [], notas: '',
    origen: 'manual', clave: null, creada: ahora, actualizada: ahora, historial: [{ fecha: ahora, estado: base.estado || 'planificar' }],
    ...base,
  };
}

export function validarTarea(t) {
  const err = [];
  if (!t.titulo?.trim()) err.push('Falta el título.');
  if (!TIPOS[t.tipo]) err.push('Tipo no válido.');
  if (!COLUMNAS.some((c) => c.id === t.estado)) err.push('Estado no válido.');
  if (t.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(t.fecha)) err.push('Fecha no válida.');
  if (t.estado !== 'planificar' && !t.fecha) err.push('Una tarea programada necesita fecha.');
  return err;
}

/** Mueve una tarea de columna registrando el cambio. */
export function mover(t, estado) {
  if (!COLUMNAS.some((c) => c.id === estado) || t.estado === estado) return t;
  const ahora = new Date().toISOString();
  return { ...t, estado, actualizada: ahora, terminada: estado === 'hecha' ? ahora : t.terminada ?? null, historial: [...(t.historial || []), { fecha: ahora, estado }] };
}

export const vencida = (t, hoy) => !!t.fecha && t.estado !== 'hecha' && t.fecha < hoy;
export const progreso = (t) => (t.checklist?.length ? t.checklist.filter((c) => c.ok).length / t.checklist.length : null);

/**
 * Sugiere tareas a partir del análisis vigente: plan priorizado, parada, alertas de N/I, datos sospechosos y fotos.
 * Cada sugerencia lleva `clave` para no duplicarla si ya existe en el tablero.
 */
export function sugerir(A, existentes = [], hoyReal = null) {
  const claves = new Set(existentes.map((t) => t.clave).filter(Boolean));
  const out = [];
  const hoy = hoyReal && hoyReal > A.ultimaInsp.fecha ? hoyReal : A.ultimaInsp.fecha;
  // Las fechas salen de las horas proyectadas con la utilización histórica (misma regla que Equipo y Alertas).
  // Si una fecha calculada ya pasó, se conserva: la tarea queda vencida en vez de moverse a hoy y perder el plazo.
  const add = (t) => { if (!claves.has(t.clave)) { out.push(nuevaTarea({ origen: 'auto', ...t })); claves.add(t.clave); } };
  const fechaInsp = A.fechaDeHoras(A.horasActuales + A.intervalo);

  if (A.parada.requerida) {
    add({ clave: 'parada', tipo: 'parada', prioridad: A.parada.horas === 0 ? 'alta' : 'alta', titulo: A.parada.horas === 0 ? 'Detener el equipo y reparar' : 'Parada de reparación programada',
      fecha: A.parada.fecha ?? hoy, horas: Math.round(A.horasActuales + (A.parada.horas ?? 0)), duracionH: 24 + 10 * A.parada.incluir.length,
      descripcion: `${A.parada.texto} Límite por Danger: ${A.parada.fechaLimite ?? '—'}. Incluir: ${A.parada.incluir.join(', ')}.`,
      checklist: A.parada.incluir.map((c) => ({ texto: `Intervenir ${c}`, ok: false })) });
  }
  for (const f of A.plan) {
    const a = A.puntos[f.codigo]; const base = { codigo: f.codigo, zonaId: f.zonaId };
    if (a.pendientes.some((r) => r === a.ultimo)) add({ ...base, clave: `remedir|${f.codigo}`, tipo: 'remedicion', prioridad: 'alta', titulo: `Re-medir ${f.codigo} y confirmar el dato`, fecha: hoy, descripcion: f.accion, checklist: [{ texto: 'Medir en terreno', ok: false }, { texto: 'Registrar decisión en Calidad de datos', ok: false }] });
    else if (f.estado === 'Crítico') add({ ...base, clave: `reparar|${f.codigo}`, tipo: 'reparacion', prioridad: 'alta', titulo: `Reparar ${f.codigo} antes de operar`, fecha: hoy, horas: Math.round(A.horasActuales), duracionH: TIPOS.reparacion.dur, descripcion: `${f.descripcion}. L = ${f.L} mm ≥ Danger ${a.punto.danger} mm.`, checklist: listaReparacion(f.codigo) });
    else if (f.estado === 'Alerta') add({ ...base, clave: `reparar|${f.codigo}`, tipo: 'reparacion', prioridad: 'alta', titulo: `Programar reparación de ${f.codigo}`, fecha: f.plazoFecha ?? A.parada.fecha ?? fechaInsp, horas: f.plazoH !== null && Number.isFinite(f.plazoH) ? Math.round(A.horasActuales + f.plazoH) : null, duracionH: TIPOS.reparacion.dur, descripcion: `${f.descripcion}. L = ${f.L} mm (Caution ${a.punto.caution}, Danger ${a.punto.danger}); tasa ${Math.round(f.tasa1000 ?? 0)} mm/1000 h. ${f.accion}`, checklist: listaReparacion(f.codigo) });
    else if (f.plazoFecha && /frecuencia|intervalo/i.test(f.accion)) add({ ...base, clave: `inspeccionar|${f.codigo}`, tipo: 'inspeccion', prioridad: 'media', titulo: `Inspección adicional de ${f.codigo}`, fecha: f.plazoFecha < fechaInsp ? f.plazoFecha : fechaInsp, duracionH: TIPOS.inspeccion.dur, descripcion: `${f.descripcion}. ${f.accion}`, checklist: [{ texto: 'Limpiar y medir la grieta', ok: false }, { texto: 'Foto rotulada', ok: false }, { texto: 'Registrar en la plataforma', ok: false }] });
    else if (a.niUltima) add({ ...base, clave: `ni|${f.codigo}`, tipo: 'inspeccion', prioridad: 'media', titulo: `Inspeccionar ${f.codigo} (sin dato reciente)`, fecha: fechaInsp, duracionH: 1, descripcion: 'No inspeccionado en la última inspección: asegurar acceso y limpieza.', checklist: [{ texto: 'Acceso / limpieza', ok: false }, { texto: 'Medir y registrar', ok: false }] });
  }
  for (const al of A.alertas) {
    if (al.tipo === 'foto') add({ clave: `foto|${al.zonaId}`, zonaId: al.zonaId, tipo: 'foto', prioridad: 'baja', titulo: `Fotos actuales de ${A.cfg.zonas[al.zonaId]?.corto ?? al.zonaId}`, fecha: fechaInsp, duracionH: 1, descripcion: al.detalle, checklist: [{ texto: 'Foto de cada punto con grieta, rotulada con fecha', ok: false }] });
  }
  add({ clave: 'inspeccion-periodica', tipo: 'inspeccion', prioridad: 'media', titulo: 'Inspección estructural periódica (12 puntos)', fecha: fechaInsp, horas: Math.round(A.horasActuales + A.intervalo), duracionH: 4, descripcion: `Intervalo típico ${Math.round(A.intervalo)} h. Registrar en la plataforma al terminar.`, checklist: Object.keys(A.puntos).map((c) => ({ texto: c, ok: false })) });
  return out;
}

const listaReparacion = (c) => [
  { texto: `Esmerilar ${c} hasta eliminar la grieta (verificar con MT/PT)`, ok: false },
  { texto: 'Precalentar y soldar con procedimiento calificado', ok: false },
  { texto: 'Inspección NDT posterior a la soldadura', ok: false },
  { texto: 'Registrar inspección con L = 0 y comentario «Zona reparada por soldadura»', ok: false },
];

/** Tareas de un mes (aaaa-mm) agrupadas por día, y resumen de vencidas / próximas. */
export function agenda(tareas, hoy, dias = 14) {
  const limite = sumarDias(hoy, dias);
  const pend = tareas.filter((t) => t.estado !== 'hecha');
  return {
    vencidas: pend.filter((t) => vencida(t, hoy)).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)),
    proximas: pend.filter((t) => t.fecha && t.fecha >= hoy && t.fecha <= limite).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)),
    sinFecha: pend.filter((t) => !t.fecha),
  };
}

export function porDia(tareas, mes /* 'aaaa-mm' */) {
  const g = {};
  for (const t of tareas) if (t.fecha && t.fecha.startsWith(mes)) (g[t.fecha] = g[t.fecha] || []).push(t);
  return g;
}

export function tareasCSV(tareas) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cols = ['id', 'titulo', 'tipo', 'codigo', 'zonaId', 'prioridad', 'estado', 'fecha', 'horas', 'duracionH', 'responsable', 'descripcion', 'checklist', 'notas', 'origen', 'creada', 'actualizada', 'terminada'];
  return [cols.map(q).join(';'), ...tareas.map((t) => cols.map((c) => q(c === 'checklist' ? (t.checklist || []).map((x) => `${x.ok ? '[x]' : '[ ]'} ${x.texto}`).join(' | ') : t[c])).join(';'))].join('\r\n');
}

/** Indicadores del tablero. */
export function kpisTareas(tareas, hoy) {
  const pend = tareas.filter((t) => t.estado !== 'hecha');
  return { total: tareas.length, pendientes: pend.length, vencidas: pend.filter((t) => vencida(t, hoy)).length, hechas: tareas.filter((t) => t.estado === 'hecha').length, altas: pend.filter((t) => t.prioridad === 'alta').length, porColumna: Object.fromEntries(COLUMNAS.map((c) => [c.id, tareas.filter((t) => t.estado === c.id).length])) };
}

/**
 * Plan inicial de mantenimiento construido con los datos del historial: las reparaciones y cambios
 * registrados quedan como tareas hechas (agrupadas por parada), las recomendaciones vigentes se
 * programan con responsable y quedan algunas en ejecución. Se siembra una sola vez (store.planSembrado).
 */
export function planInicial(A, hoyReal = null) {
  const hoy = hoyReal && hoyReal > A.ultimaInsp.fecha ? hoyReal : A.ultimaInsp.fecha;
  const out = [];
  // 1) Historial: eventos de reparación / cambio por fecha.
  const porFecha = {};
  for (const a of Object.values(A.puntos)) for (const r of a.registros) if (r.evento) (porFecha[r.fecha] = porFecha[r.fecha] || []).push({ codigo: a.codigo, evento: r.evento, comentario: r.comentario, zonaId: a.punto.zonaId, horas: r.horas });
  for (const [fecha, evs] of Object.entries(porFecha).sort()) {
    const insp = A.inspecciones.find((i) => i.fecha === fecha);
    const hecho = (base) => out.push(nuevaTarea({ ...base, origen: 'historial', estado: 'hecha', fecha, horas: Math.round(insp?.horas ?? evs[0].horas ?? 0), responsable: 'Taller estructural', creada: fecha + 'T08:00:00.000Z', actualizada: fecha + 'T18:00:00.000Z', terminada: fecha + 'T18:00:00.000Z', historial: [{ fecha: fecha + 'T08:00:00.000Z', estado: 'programada' }, { fecha: fecha + 'T18:00:00.000Z', estado: 'hecha' }] }));
    const cambios = evs.filter((e) => e.evento === 'cambio'); const reps = evs.filter((e) => e.evento === 'reparacion');
    if (cambios.length) { const z = cambios[0].zonaId; hecho({ clave: `hist|cambio|${fecha}`, tipo: 'cambio', zonaId: z, prioridad: 'alta', titulo: `Cambio de ${A.cfg.zonas[z]?.corto?.toLowerCase() ?? 'componente'} (${cambios[0].comentario || 'componente nuevo'})`, duracionH: TIPOS.cambio.dur, descripcion: `Registrado en la inspección del ${fecha}: ${[...new Set(cambios.map((e) => e.codigo))].join(', ')} reiniciados a 0 mm.`, checklist: [{ texto: 'Desmontar componente', ok: true }, { texto: 'Montar componente nuevo', ok: true }, { texto: 'Inspección inicial de puntos', ok: true }] }); }
    if (reps.length >= 2) hecho({ clave: `hist|parada|${fecha}`, tipo: 'parada', prioridad: 'alta', titulo: `Parada de reparación (${reps.length} puntos)`, duracionH: 24 + 10 * reps.length, descripcion: `Reparaciones por soldadura registradas el ${fecha}: ${reps.map((e) => e.codigo).join(', ')}.`, checklist: reps.map((e) => ({ texto: `Reparar ${e.codigo}${e.comentario ? ' · ' + e.comentario : ''}`, ok: true })) });
    else for (const e of reps) hecho({ clave: `hist|rep|${fecha}|${e.codigo}`, tipo: 'reparacion', codigo: e.codigo, zonaId: e.zonaId, prioridad: 'alta', titulo: `Reparación por soldadura de ${e.codigo}`, duracionH: TIPOS.reparacion.dur, descripcion: e.comentario || 'Zona reparada por soldadura (registrada con L = 0).', checklist: listaReparacion(e.codigo).map((c) => ({ ...c, ok: true })) });
  }
  // 2) Recomendaciones vigentes, programadas con responsable.
  const resp = { parada: 'Jefe de mantenimiento', reparacion: 'Taller estructural', inspeccion: A.ultimaInsp.inspector || 'Inspector', remedicion: A.ultimaInsp.inspector || 'Inspector', foto: A.ultimaInsp.inspector || 'Inspector' };
  for (const t of sugerir(A, [], hoy)) {
    const programar = ['parada', 'reparacion'].includes(t.tipo) || t.clave === 'inspeccion-periodica';
    out.push(programar ? mover({ ...t, responsable: resp[t.tipo] || '' }, 'programada') : { ...t, responsable: resp[t.tipo] || '' });
  }
  // 3) Trabajo en curso derivado de los hallazgos.
  const reinc = Object.values(A.puntos).filter((a) => a.reincidencias).map((a) => a.codigo);
  if (reinc.length) out.push(mover(nuevaTarea({ clave: 'causa-raiz-soldadura', tipo: 'otra', prioridad: 'media', titulo: 'Revisar procedimiento de soldadura (reincidencias)', fecha: hoy, responsable: 'Ingeniero de confiabilidad', duracionH: 8, descripcion: `Grietas reaparecidas tras reparar en ${reinc.join(', ')}. Verificar WPS, precalentamiento, material de aporte y preparación de junta.`, checklist: [{ texto: 'Recopilar registros de reparación', ok: true }, { texto: 'Comparar con WPS vigente', ok: true }, { texto: 'Ensayo de dureza / macrografía en una reparación', ok: false }, { texto: 'Emitir recomendación', ok: false }] }), 'ejecucion'));
  const sosp = Object.values(A.puntos).flatMap((a) => a.registros.filter((r) => r.calidad?.sospechoso).map((r) => `${a.codigo} ${r.fecha} (${r.L} mm)`));
  if (sosp.length) out.push(mover(nuevaTarea({ clave: 'calidad-datos', tipo: 'remedicion', prioridad: 'media', titulo: 'Confirmar datos sospechosos del historial', fecha: hoy, responsable: A.ultimaInsp.inspector || 'Inspector', duracionH: 2, descripcion: `Revisar con el inspector: ${sosp.join('; ')}. Decidir en Calidad de datos (es real / descartar / corregir).`, checklist: sosp.map((x) => ({ texto: x, ok: false })) }), 'ejecucion'));
  return out;
}
