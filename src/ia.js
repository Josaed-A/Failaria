// Integración con IA: prompt estructurado con el estado del equipo + llamada opcional a la API de Claude.
// La clave de API la ingresa el usuario y se guarda (si lo pide) solo en su navegador; nunca en el repo.

export const MODELO_IA = 'claude-opus-5-5';

const r1 = (x) => (Number.isFinite(x) ? Math.round(x) : null);

/** Resumen compacto del análisis para enviar a la IA. */
export function estadoParaIA(A) {
  const pts = Object.values(A.puntos).map((a) => ({
    codigo: a.codigo, zona: a.punto.zona, descripcion: a.punto.descripcion, caution_mm: a.punto.caution, danger_mm: a.punto.danger,
    estado_actual: a.estadoActual, L_ultima_mm: a.ultimoValido?.Lef ?? null, fecha_ultima: a.ultimoValido?.fecha ?? null, ni_en_ultima: a.niUltima,
    tasa_mm_1000h: r1(a.tendencia.tasa1000), modelo_tendencia: a.tendencia.modelo ?? a.tendencia.tipo, r2: a.tendencia.r2 ? Math.round(a.tendencia.r2 * 100) / 100 : null,
    horas_hasta_caution: r1(a.proyeccion.restanteCaution), horas_hasta_danger: r1(a.proyeccion.restanteDanger),
    reparaciones: a.reparaciones, cambios_componente: a.cambios, reincidencias: a.reincidencias,
    ciclo_actual: a.cicloActual.registros.filter((r) => r.Lef !== null && r.Lef !== undefined && !r.excluido).map((r) => [r.fecha, r.horas, r.Lef]),
    exposicion_sobre_umbral: a.episodios.map((e) => ({ nivel: e.nivel, desde: e.desde.fecha, hasta: e.hasta?.fecha ?? 'vigente', horas: r1(e.horas), L_max: e.maxL })),
  }));
  return {
    equipo: { flota: A.modelo.equipo.flota, id: A.modelo.equipo.id },
    ultima_inspeccion: { fecha: A.ultimaInsp.fecha, horas: A.horasActuales, inspector: A.ultimaInsp.inspector },
    historial: { inspecciones: A.inspecciones.length, desde: A.inspecciones[0].fecha },
    utilizacion_h_dia: Math.round(A.utilizacion * 10) / 10, intervalo_inspeccion_h: r1(A.intervalo),
    criterio: 'Normal L<Caution; Alerta Caution≤L<Danger (aumentar frecuencia y programar reparación); Crítico L≥Danger (reparar antes de operar); N/I no inspeccionado',
    puntos: pts,
    alertas: A.alertas.map((x) => ({ severidad: x.severidad, tipo: x.tipo, titulo: x.titulo })),
    proxima_parada: { requerida: A.parada.requerida, fecha: A.parada.fecha, fecha_limite: A.parada.fechaLimite, incluir: A.parada.incluir },
    calidad_datos: Object.values(A.puntos).flatMap((a) => a.registros.filter((r) => r.calidad).map((r) => ({ codigo: a.codigo, fecha: r.fecha, L: r.L, tipo: r.calidad.tipo, decision: r.decision ?? (r.calidad.sospechoso ? 'pendiente' : 'informativo') }))),
    kpis: { reparaciones: A.kpis.reparaciones, reincidencias: A.kpis.reincidencias, horas_en_critico: r1(A.kpis.horasCritico), cobertura: Math.round(A.kpis.cobertura * 1000) / 10 },
  };
}

export function construirPrompt(A, foco) {
  return `Eres un ingeniero de confiabilidad especializado en integridad estructural de palas hidráulicas mineras (Hitachi EX3600).
A continuación está el estado del equipo calculado por nuestra plataforma de gestión de grietas (JSON). Las longitudes están en mm y las horas son horas de horómetro. Las tasas y proyecciones se calculan solo con el ciclo actual de cada grieta (una reparación o cambio de componente reinicia el ciclo). Los datos marcados como sospechosos están excluidos de las tendencias hasta que se confirmen.

<estado_equipo>
${JSON.stringify(estadoParaIA(A))}
</estado_equipo>

Redacta en español, para el jefe de mantenimiento, un diagnóstico breve y accionable con estas secciones:
1. Diagnóstico ejecutivo (3–5 frases): estado del equipo y riesgo principal.
2. Prioridades de mantenimiento: tabla con punto, acción, plazo (horas y fecha estimada) y justificación, coherente con el criterio Normal/Alerta/Crítico.
3. Patrones y causas probables: agrupa por zona (crecimientos simultáneos, reincidencias tras reparación, zonas con más actividad) y sugiere causas raíz a verificar (operación, carga, procedimiento de soldadura, material).
4. Frecuencia de inspección: ¿el intervalo actual es suficiente? Recomienda ajustes por zona o punto.
5. Calidad de los datos: qué datos o vacíos limitan las conclusiones y qué debe corregir el equipo de terreno (incluye el registro fotográfico).
6. Preguntas para el equipo de terreno.
${foco ? `Profundiza especialmente en la zona ${foco}.` : ''}
Usa solo la información entregada; cuando una conclusión dependa de supuestos (p. ej. crecimiento lineal), dilo explícitamente. La decisión final corresponde al ingeniero responsable.`;
}

/** Llama a la API de Claude directamente desde el navegador con la clave del usuario. */
export async function analizarConClaude({ clave, modelo, prompt, signal }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': clave,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model: modelo || MODELO_IA,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ? `${r.status}: ${d.error.message}` : `Error HTTP ${r.status}`);
  if (d.stop_reason === 'refusal') throw new Error('El modelo declinó la solicitud' + (d.stop_details?.explanation ? `: ${d.stop_details.explanation}` : '.'));
  const texto = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (!texto) throw new Error('La respuesta no trajo texto.');
  return { texto, modelo: d.model, truncado: d.stop_reason === 'max_tokens', uso: d.usage };
}

/** Markdown mínimo y seguro (escapa todo antes de dar formato). */
export function mdSeguro(md) {
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = []; let lista = null; let tabla = null;
  const cerrar = () => { if (lista) { out.push(`</${lista}>`); lista = null; } if (tabla) { out.push('</tbody></table></div>'); tabla = null; } };
  for (const l of md.split(/\r?\n/)) {
    const t = l.trim();
    if (/^\|.*\|$/.test(t)) {
      if (/^\|[\s:|-]+\|$/.test(t)) continue;
      const celdas = t.slice(1, -1).split('|').map((c) => inline(c.trim()));
      if (!tabla) { cerrar(); tabla = true; out.push(`<div class="tabla-wrap"><table><thead><tr>${celdas.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>`); }
      else out.push(`<tr>${celdas.map((c) => `<td>${c}</td>`).join('')}</tr>`);
      continue;
    }
    if (tabla) { out.push('</tbody></table></div>'); tabla = null; }
    let m;
    if ((m = t.match(/^(#{1,4})\s+(.*)/))) { cerrar(); out.push(`<h${Math.min(4, m[1].length + 1)}>${inline(m[2])}</h${Math.min(4, m[1].length + 1)}>`); }
    else if ((m = t.match(/^[-*]\s+(.*)/))) { if (lista !== 'ul') { cerrar(); lista = 'ul'; out.push('<ul class="lista-simple">'); } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = t.match(/^\d+[.)]\s+(.*)/))) { if (lista !== 'ol') { cerrar(); lista = 'ol'; out.push('<ol class="lista-simple">'); } out.push(`<li>${inline(m[1])}</li>`); }
    else if (!t) cerrar();
    else { cerrar(); out.push(`<p>${inline(t)}</p>`); }
  }
  cerrar();
  return out.join('');
}
