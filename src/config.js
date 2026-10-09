// Configuración editable de la plataforma. Los umbrales Caution/Danger NO van aquí:
// se leen siempre de la hoja "Puntos" del Excel.

export const CONFIG = {
  equipo: { flota: 'Pala hidráulica EX3600', id: '3600-01', modelo: 'Hitachi EX3600', faena: 'Operación Minera' },

  // Componente asignado al autor: el reporte profundiza en esta zona ('BM' | 'BR' | 'CU').
  componenteFoco: 'BR',

  excelRuta: 'data/EX3600_historial_grietas.xlsx',
  storageKey: 'ex3600.v1',

  // Reglas de decisión (propuestas en docs/historial/PLAN_FASES.md §8; ajustables).
  utilizacionHDiaDefecto: 17,          // se recalcula con los datos si es posible
  intervaloInspeccionHDefecto: 750,    // se recalcula (mediana) con los datos si es posible
  toleranciaMedicionMm: 20,            // disminución ≤ tolerancia sin reparación = variación de medición
  crecimientoRapidoMmPor1000h: 80,     // tasa absoluta que dispara "crecimiento rápido"
  factorCrecimientoRapido: 2,          // o tasa del último intervalo > factor × mediana histórica del punto
  tasaMinimaRelevante: 40,             // mm/1000 h; por debajo no se alerta por factor relativo
  horizonteProximidadIntervalos: 2,    // alerta si cruza un umbral en ≤ N intervalos de inspección
  niRepetidoVentana: 6,                // inspecciones recientes revisadas para N/I repetido
  niRepetidoMinimo: 2,
  fotoAntiguedadMaxInspecciones: 2,    // fotos más viejas que esto ⇒ advertencia de registro fotográfico
  mejoraR2Exponencial: 0.05,           // usar modelo exponencial solo si mejora R² en esta cantidad

  zonas: {
    BM: { nombre: 'Boom (pluma)', corto: 'Boom', esquema: '3600_BM_boom.png' },
    BR: { nombre: 'Brazo (stick)', corto: 'Brazo', esquema: '3600_BR_brazo.png' },
    CU: { nombre: 'Cucharón', corto: 'Cucharón', esquema: '3600_CU_cucharon.png' },
  },

  // Ubicación de cada punto sobre su esquema (fracción del ancho/alto de la imagen),
  // tomada de la punta de la flecha rotulada en assets/esquemas.
  hotspots: {
    'BM-01': { x: 0.420, y: 0.672 },
    'BM-02': { x: 0.700, y: 0.212 },
    'BM-03': { x: 0.602, y: 0.215 },
    'BM-04': { x: 0.235, y: 0.588 },
    'BR-01': { x: 0.375, y: 0.322 },
    'BR-02': { x: 0.221, y: 0.246 },
    'BR-03': { x: 0.770, y: 0.528 },
    'BR-04': { x: 0.888, y: 0.393 },
    'CU-01': { x: 0.262, y: 0.718 },
    'CU-02': { x: 0.112, y: 0.478 },
    'CU-03': { x: 0.153, y: 0.796 },
    'CU-04': { x: 0.870, y: 0.452 },
  },

  // Posición de cada punto en el modelo 3D: pieza, fracción a lo largo de la pieza (t) y desplazamiento.
  pos3d: {
    'BM-01': { pieza: 'boom', t: 0.45, off: [0, -0.35, 0.55] },
    'BM-02': { pieza: 'boom', t: 0.85, off: [0, 0.45, 0] },
    'BM-03': { pieza: 'boom', t: 0.70, off: [0, 0.55, -0.25] },
    'BM-04': { pieza: 'boom', t: 0.25, off: [0, 0.1, -0.55] },
    'BR-01': { pieza: 'brazo', t: 0.12, off: [0, 0.4, 0.3] },
    'BR-02': { pieza: 'brazo', t: 0.45, off: [0, 0.35, 0] },
    'BR-03': { pieza: 'brazo', t: 0.22, off: [0, 0, -0.45] },
    'BR-04': { pieza: 'brazo', t: 0.60, off: [0, 0, 0.45] },
    'CU-01': { pieza: 'cucharon', t: 0.95, off: [0, 0, 0] },
    'CU-02': { pieza: 'cucharon', t: 0.5, off: [0, 0, 1.15] },
    'CU-03': { pieza: 'cucharon', t: 0.85, off: [0, -0.2, 1.05] },
    'CU-04': { pieza: 'cucharon', t: 0.5, off: [0, 0, -1.15] },
  },

  // Archivos de imagen del repo. Las fotos que no están referenciadas en el Excel se asocian aquí (hallazgo D7).
  esquemasDir: 'assets/esquemas/',
  fotosDir: 'assets/fotos/',
  fotosConocidas: [
    '3600_BM_2024-03-01_a.jpg',
    '3600_BM_2024-03-01_b.jpg',
    '3600_BR_2024-03-01.jpg',
    '3600_CU_2024-03-01_cucharon_nuevo.jpg',
  ],
  fotosExtra: [
    { codigo: 'BM-04', fecha: '2024-03-01', archivo: '3600_BM_2024-03-01_b.jpg', nota: 'Segunda foto del boom, no referenciada en la columna Imagen del Excel' },
  ],

  colores: { Normal: '#2e9e5b', Alerta: '#e0a020', 'Crítico': '#d64545', 'N/I': '#7a8599', sospechoso: '#9b6bd6' },

  // Simulador de falla (src/falla.js; fundamentos en docs/MANTENIMIENTO_Y_FALLA.md).
  falla: {
    m: 3,                      // exponente de Paris (aceros estructurales soldados: 2,5–3,5)
    factorCritico: 1.6,        // a_crítica = factor × Danger: longitud de fractura inestable / colapso del ligamento
    aNucleacion: 5,            // mm con los que «nace» una grieta en un punto sano bajo sobrecarga
    sNucleacion: 0.3,          // sobreesfuerzo relativo mínimo (Δσ extra / Δσ nominal) para iniciarla
    tasaRefDefecto: 15,        // mm/1000 h a L = Caution/2 cuando el punto no tiene historia de crecimiento
    LrNominal: 0.45,           // relación de carga nominal σ_ref/σ_y del FAD simplificado
    sMax: 2,                   // sobreesfuerzo máximo que aplica el mouse
    radioInfluenciaM: 1.6,     // m: alcance del esfuerzo del mouse sobre la estructura
    pxPorS: 220,               // píxeles de arrastre por unidad de sobreesfuerzo
    velocidades: [10, 50, 200, 1000], // horas simuladas por segundo real
  },
};
