// Lectura del Excel → modelo normalizado, validación de calidad y exportación.
// Lógica PURA: no toca el DOM. La librería SheetJS se inyecta (navegador: window.XLSX; node: require).

const COLUMNAS_HISTORIAL = ['Fecha', 'Equipo', 'Horas (h)', 'Inspector', 'Zona', 'Código', 'Descripción', 'L actual (mm)', 'Comentario', 'Imagen'];
const COLUMNAS_PUNTOS = ['Código', 'Zona', 'Descripción', 'Caution (mm)', 'Danger (mm)', 'Esquema'];

// Expresiones para interpretar comentarios del inspector.
export const RE_CAMBIO = /(nuevo|cambio de componente|reemplaz)/i;
export const RE_REPARACION = /(reparad[ao]|reparaci[oó]n realizada|soldadura de reparaci)/i;

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function buscarColumna(cabecera, ...candidatos) {
  const c = cabecera.map(norm);
  for (const cand of candidatos) {
    const i = c.findIndex((x) => x.startsWith(norm(cand)));
    if (i >= 0) return i;
  }
  return -1;
}

/** Convierte un valor de celda (serial Excel, Date o texto) a 'aaaa-mm-dd'. */
export function fechaISO(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const ms = Math.round((Math.floor(v) - 25569) * 864e5);
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (v instanceof Date) {
    // SheetJS crea fechas locales; se toma la fecha local para no correr un día.
    const d = new Date(v.getTime() + 12 * 3600e3);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function numero(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === '' || s === '-' || s === '—' || /^n\/?i$/i.test(s)) return null;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export const idInspeccion = (equipo, fecha) => `${equipo}|${fecha}`;
export const idMedicion = (equipo, fecha, codigo) => `${equipo}|${fecha}|${codigo}`;

/**
 * Lee el libro (ArrayBuffer/Buffer) y devuelve el modelo normalizado.
 * @returns {{equipo, puntos, inspecciones, mediciones, leame, avisos}}
 */
export function leerLibro(XLSX, datos, cfg) {
  const tipo = typeof Buffer !== 'undefined' && Buffer.isBuffer?.(datos) ? 'buffer' : 'array';
  const wb = XLSX.read(datos, { type: tipo });
  const avisos = [];
  const hoja = (nombre) => {
    const n = wb.SheetNames.find((s) => norm(s) === norm(nombre));
    return n ? XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, raw: true }) : null;
  };

  // --- Léame (metadatos) ---
  const leame = {};
  (hoja('Léame') || []).forEach((f) => { if (f && f[0] && f[1] !== null && f[1] !== undefined) leame[String(f[0]).trim()] = f[1]; });

  // --- Puntos ---
  const filasP = hoja('Puntos');
  if (!filasP) throw new Error('El libro no tiene la hoja "Puntos" (umbrales Caution/Danger).');
  const cabP = filasP[0] || [];
  const iP = {
    codigo: buscarColumna(cabP, 'codigo'), zona: buscarColumna(cabP, 'zona'), desc: buscarColumna(cabP, 'descrip'),
    caution: buscarColumna(cabP, 'caution'), danger: buscarColumna(cabP, 'danger'), esquema: buscarColumna(cabP, 'esquema', 'imagen'),
  };
  const puntos = filasP.slice(1).filter((f) => f && f[iP.codigo]).map((f) => {
    const codigo = String(f[iP.codigo]).trim();
    const zonaId = codigo.split('-')[0];
    return {
      codigo, zonaId, zona: f[iP.zona] ? String(f[iP.zona]).trim() : (cfg?.zonas?.[zonaId]?.nombre ?? zonaId),
      descripcion: f[iP.desc] ? String(f[iP.desc]).trim() : '',
      caution: numero(f[iP.caution]), danger: numero(f[iP.danger]),
      esquema: f[iP.esquema] ? String(f[iP.esquema]).trim() : (cfg?.zonas?.[zonaId]?.esquema ?? null),
      hotspot: cfg?.hotspots?.[codigo] ?? null,
      pos3d: cfg?.pos3d?.[codigo] ?? null,
    };
  });
  puntos.forEach((p) => {
    if (p.caution === null || p.danger === null) avisos.push(`Punto ${p.codigo} sin umbrales Caution/Danger.`);
  });

  // --- Historial ---
  const filasH = hoja('Historial');
  if (!filasH) throw new Error('El libro no tiene la hoja "Historial".');
  const cab = filasH[0] || [];
  const iH = {
    fecha: buscarColumna(cab, 'fecha'), equipo: buscarColumna(cab, 'equipo'), horas: buscarColumna(cab, 'horas'),
    inspector: buscarColumna(cab, 'inspector'), codigo: buscarColumna(cab, 'codigo'), L: buscarColumna(cab, 'l actual', 'l (mm)', 'longitud'),
    comentario: buscarColumna(cab, 'comentario'), imagen: buscarColumna(cab, 'imagen'),
  };
  for (const k of ['fecha', 'horas', 'codigo', 'L']) if (iH[k] < 0) throw new Error(`Columna "${k}" no encontrada en la hoja Historial.`);

  const equipoDef = String(leame.Equipo ?? cfg?.equipo?.id ?? '3600-01');
  const inspecciones = new Map();
  const mediciones = [];
  filasH.slice(1).forEach((f, n) => {
    if (!f || f[iH.codigo] === null || f[iH.codigo] === undefined) return;
    const fecha = fechaISO(f[iH.fecha]);
    if (!fecha) { avisos.push(`Fila ${n + 2}: fecha no válida, se omite.`); return; }
    const equipo = iH.equipo >= 0 && f[iH.equipo] ? String(f[iH.equipo]).trim() : equipoDef;
    const codigo = String(f[iH.codigo]).trim();
    const horas = numero(f[iH.horas]);
    const idI = idInspeccion(equipo, fecha);
    if (!inspecciones.has(idI)) {
      inspecciones.set(idI, { id: idI, equipo, fecha, horas, inspector: iH.inspector >= 0 ? (f[iH.inspector] ?? '') : '', origen: 'excel', observaciones: '' });
    }
    const img = iH.imagen >= 0 && f[iH.imagen] ? String(f[iH.imagen]).trim() : '';
    mediciones.push({
      id: idMedicion(equipo, fecha, codigo), inspeccionId: idI, equipo, fecha, horas, codigo,
      L: numero(f[iH.L]),
      comentario: iH.comentario >= 0 && f[iH.comentario] ? String(f[iH.comentario]).trim() : '',
      imagenes: img ? [img] : [],
      origen: 'excel',
    });
  });

  // Fotos del repo no referenciadas en el Excel (D7): se asocian por configuración.
  (cfg?.fotosExtra || []).forEach((x) => {
    const m = mediciones.find((m) => m.codigo === x.codigo && m.fecha === x.fecha);
    if (m && !m.imagenes.includes(x.archivo)) m.imagenes.push(x.archivo);
  });

  const equipo = {
    flota: String(leame.Flota ?? cfg?.equipo?.flota ?? ''), id: equipoDef,
    faena: cfg?.equipo?.faena ?? '',
  };

  return { equipo, puntos, inspecciones: [...inspecciones.values()].sort(cmpInsp), mediciones: mediciones.sort(cmpMed), leame, avisos };
}

export const cmpInsp = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
export const cmpMed = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0);

/**
 * Fusiona el modelo base (Excel) con las inspecciones registradas en la app.
 * Clave: Fecha + Código (los registros de la app reemplazan a los del Excel con la misma clave).
 */
export function fusionar(base, agregados) {
  const insp = new Map(base.inspecciones.map((i) => [i.id, { ...i }]));
  const med = new Map(base.mediciones.map((m) => [m.id, { ...m, imagenes: [...m.imagenes] }]));
  (agregados?.inspecciones || []).forEach((i) => insp.set(i.id, { ...i }));
  (agregados?.mediciones || []).forEach((m) => {
    const previa = med.get(m.id);
    const imgs = [...new Set([...(previa?.imagenes || []), ...(m.imagenes || [])])];
    med.set(m.id, { ...m, imagenes: imgs });
  });
  return { ...base, inspecciones: [...insp.values()].sort(cmpInsp), mediciones: [...med.values()].sort(cmpMed) };
}

/**
 * Validación de calidad de datos (hallazgos D1–D4). Marca, no borra.
 * Devuelve un mapa idMedicion → { tipo, sospechoso, motivo, sugerido }.
 *  - 'cero-sin-reparacion' (D2): caída a 0 sin comentario de reparación y el valor siguiente vuelve a la tendencia.
 *  - 'atipico' (D1): salto ≥ Caution en un intervalo que luego vuelve a la tendencia, o salto ≥ Danger sin dato posterior.
 *  - 'variacion' (D3/D4): disminución ≤ tolerancia sin reparación → variación de medición (informativo).
 *  - 'disminucion' : disminución > tolerancia sin reparación documentada.
 */
export function validar(modelo, cfg) {
  const tol = cfg?.toleranciaMedicionMm ?? 20;
  const calidad = {};
  const porPunto = agrupar(modelo.mediciones);
  for (const p of modelo.puntos) {
    const serie = (porPunto[p.codigo] || []).filter((m) => m.L !== null && m.L !== undefined);
    const flag = new Set();
    const esEvento = (m) => RE_CAMBIO.test(m.comentario) || RE_REPARACION.test(m.comentario);
    const vecino = (i, paso) => { for (let j = i + paso; j >= 0 && j < serie.length; j += paso) if (!flag.has(j)) return { m: serie[j], j }; return null; };

    // 1) Caídas a 0 sin reparación documentada.
    serie.forEach((m, i) => {
      if (m.L !== 0 || esEvento(m) || i === 0) return;
      const prev = serie[i - 1];
      if (!(prev.L > 0)) return;
      const sig = serie[i + 1];
      if (!sig) {
        calidad[m.id] = { tipo: 'cero-sin-reparacion', sospechoso: true, motivo: `Caída de ${prev.L} a 0 mm sin comentario de reparación. Confirmar si hubo reparación o si el punto no fue inspeccionado.`, sugerido: null };
        flag.add(i);
      } else if (sig.L >= prev.L - tol && !esEvento(sig)) {
        calidad[m.id] = { tipo: 'cero-sin-reparacion', sospechoso: true, motivo: `Registrado 0 mm entre ${prev.L} y ${sig.L} mm sin comentario de reparación: probable punto no inspeccionado (N/I) registrado como 0.`, sugerido: null };
        flag.add(i);
      }
    });

    // 2) Valores atípicos (saltos que no siguen la tendencia).
    serie.forEach((m, i) => {
      if (flag.has(i) || !(m.L > 0)) return;
      const ant = vecino(i, -1); const sig = vecino(i, +1);
      const base = ant ? ant.m.L : 0;
      const salto = m.L - base;
      if (sig) {
        if (salto >= p.caution && sig.m.L <= m.L - p.caution && !esEvento(sig.m)) {
          const cand = Math.round(m.L / 10);
          const sugerido = cand >= base - tol && cand <= sig.m.L + tol ? cand : Math.round((base + sig.m.L) / 2);
          calidad[m.id] = { tipo: 'atipico', sospechoso: true, motivo: `Salto de ${base} a ${m.L} mm y luego ${sig.m.L} mm: el valor no sigue la tendencia (posible dígito extra). Dispararía un Crítico falso.`, sugerido };
          flag.add(i);
        }
      } else if (salto >= p.danger) {
        calidad[m.id] = { tipo: 'atipico', sospechoso: true, motivo: `Salto de ${base} a ${m.L} mm en un solo intervalo (mayor que Danger). Re-medir antes de concluir.`, sugerido: null };
        flag.add(i);
      }
    });

    // 3) Disminuciones sin reparación.
    serie.forEach((m, i) => {
      if (flag.has(i) || !(m.L > 0) || esEvento(m)) return;
      const ant = vecino(i, -1);
      if (!ant || !(ant.m.L > m.L)) return;
      const d = ant.m.L - m.L;
      if (d <= tol) {
        calidad[m.id] = { tipo: 'variacion', sospechoso: false, motivo: `Disminución de ${ant.m.L} a ${m.L} mm (−${d} mm ≤ tolerancia ${tol} mm) sin reparación: variación de medición. Se conserva el valor.`, sugerido: null };
      } else {
        calidad[m.id] = { tipo: 'disminucion', sospechoso: true, motivo: `Disminución de ${ant.m.L} a ${m.L} mm sin comentario de reparación (mayor que la tolerancia de ${tol} mm).`, sugerido: null };
        flag.add(i);
      }
    });
  }
  return calidad;
}

export function agrupar(mediciones) {
  const g = {};
  for (const m of mediciones) (g[m.codigo] = g[m.codigo] || []).push(m);
  for (const k in g) g[k].sort(cmpMed);
  return g;
}

/** Exporta el modelo a un libro con las mismas hojas que el original (Léame, Historial, Puntos). */
export function exportarLibro(XLSX, modelo, extra = {}) {
  const wb = XLSX.utils.book_new();
  const leame = [
    ['HISTORIAL DE GRIETAS – INSPECCIÓN ESTRUCTURAL', null],
    [modelo.equipo.faena || 'Operación Minera – Mantenimiento', null], [null, null],
    ['Flota', modelo.equipo.flota], ['Equipo', modelo.equipo.id],
    ['Periodo', `${modelo.inspecciones[0]?.fecha ?? ''} a ${modelo.inspecciones.at(-1)?.fecha ?? ''}`],
    ['Inspecciones', modelo.inspecciones.length],
    ['Zonas', `${new Set(modelo.puntos.map((p) => p.zonaId)).size} zonas, ${modelo.puntos.length} puntos de inspección (ver hoja Puntos)`],
    [null, null],
    ['Exportado', `Plataforma de integridad estructural EX3600 · ${new Date().toISOString().slice(0, 10)}`],
    ['L actual (mm)', 'Longitud de grieta medida en la inspección. 0 = sin grieta detectable.'],
    ['Celda vacía', 'Punto no inspeccionado en esa fecha (N/I).'],
    ['Criterio de estado', 'Normal: L < Caution  |  Alerta: Caution ≤ L < Danger  |  Crítico: L ≥ Danger'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(leame), 'Léame');

  const desc = Object.fromEntries(modelo.puntos.map((p) => [p.codigo, p]));
  const inspPorId = Object.fromEntries(modelo.inspecciones.map((i) => [i.id, i]));
  const filas = [COLUMNAS_HISTORIAL];
  for (const m of modelo.mediciones) {
    const p = desc[m.codigo] || {};
    const i = inspPorId[m.inspeccionId] || {};
    const imgs = (m.imagenes || []).map((x) => (String(x).startsWith('data:') ? '(foto cargada en la plataforma)' : x));
    const [a, mth, d] = m.fecha.split('-').map(Number);
    filas.push([Date.UTC(a, mth - 1, d) / 864e5 + 25569, m.equipo, m.horas, i.inspector ?? '', p.zona ?? '', m.codigo, p.descripcion ?? '',
      m.L === null ? null : m.L, m.comentario || null, imgs.join('; ') || p.esquema || null]);
  }
  const wsH = XLSX.utils.aoa_to_sheet(filas);
  // Fecha como serial de Excel (independiente de la zona horaria) con formato legible.
  for (let r = 1; r < filas.length; r++) { const c = wsH[XLSX.utils.encode_cell({ r, c: 0 })]; if (c) c.z = 'yyyy-mm-dd'; }
  XLSX.utils.book_append_sheet(wb, wsH, 'Historial');

  const filasP = [COLUMNAS_PUNTOS, ...modelo.puntos.map((p) => [p.codigo, p.zona, p.descripcion, p.caution, p.danger, p.esquema])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filasP), 'Puntos');

  if (extra.calidad) {
    const fc = [['Fecha', 'Código', 'L (mm)', 'Tipo', 'Motivo', 'Decisión del usuario']];
    for (const m of modelo.mediciones) {
      const q = extra.calidad[m.id];
      if (q) fc.push([m.fecha, m.codigo, m.L, q.tipo, q.motivo, extra.decisiones?.[m.id]?.accion ?? (q.sospechoso ? 'pendiente' : '—')]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fc), 'Calidad');
  }
  return wb;
}
