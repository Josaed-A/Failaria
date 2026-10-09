# PLAN — Plataforma inteligente de integridad estructural · Pala Hitachi EX3600

**Entrega:** Teams, vence 09-oct-2026 12:00 · 5 puntos · rúbrica "Plataforma gestión estructural".
**Principio rector del enunciado:** *una herramienta sofisticada que no ayuda a tomar mejores decisiones de mantenimiento no resuelve el problema.* Cada vista debe responder una pregunta de decisión.

---

## 1. Datos disponibles (ya en el repo)

| Fuente | Contenido |
|---|---|
| `data/EX3600_historial_grietas.xlsx` → `Historial` | 276 filas = 23 inspecciones × 12 puntos. Columnas: Fecha, Equipo, Horas (h), Inspector, Zona, Código, Descripción, L actual (mm), Comentario, Imagen |
| `… → Puntos` | 12 puntos con Caution/Danger y esquema. Boom 250/500 · Brazo 300/600 · Cucharón 400/800 mm |
| `… → Léame` | Criterio: Normal L<Caution · Alerta Caution≤L<Danger · Crítico L≥Danger · vacío = N/I |
| `docs/referencia/EX3600_formato_inspeccion.docx` | Formato de inspección (cabecera, tabla por zona con L anterior/L actual/Estado, fotos). **Es la plantilla del formulario "Registrar inspección" y del reporte.** |
| `assets/esquemas/` | Esquemas de boom, brazo y cucharón con la ubicación rotulada de cada punto (extraídos del Word) |
| `assets/fotos/` | 4 fotos del 01-mar-2024 (las que referencia el Excel). Falta `_b` en el Excel: la 2.ª foto del boom se agregó aparte |

Periodo 18-ene-2023 → 11-oct-2025, 48 310 → 65 703 h. Intervalo típico entre inspecciones ≈ 42 días ≈ 750 h. Utilización ≈ **17 h/día**.

## 2. Hallazgos de calidad de datos ("revísenlos antes de confiar")

La plataforma debe detectarlos automáticamente (`datos.js → validar()`), mostrarlos en una vista "Calidad de datos" y excluirlos de tendencias hasta que el usuario los confirme.

| # | Punto · fecha | Dato | Diagnóstico | Regla de detección |
|---|---|---|---|---|
| D1 | CU-01 · 2025-04-22 | **1010 mm** | 46 días después de reparación (0) y luego 100 → casi seguro dígito extra (≈100). Dispararía un Crítico falso | Salto > Danger o tasa > 3× la mediana del punto, y el siguiente valor vuelve a la tendencia |
| D2 | CU-02 · 2025-04-22 | **0 mm** | Entre 840 y 1040 sin comentario de reparación → probable N/I registrado como 0 | Caída a 0 sin comentario "repar"/"nuevo" y valor siguiente ≈ tendencia previa |
| D3 | BR-01 · 2025-10-11 | 420→410 | Disminución sin reparación: error de medición | Disminución sin comentario ≤ tolerancia (20 mm) → "variación de medición" |
| D4 | CU-03 · 2025-08-26 | 220→200 | Igual que D3 | Igual que D3 |
| D5 | 8 celdas vacías | — | N/I legítimos (BM-03, BR-01×2, BR-04×2, CU-01, CU-02, CU-03) | Vacío → N/I, nunca 0 |
| D6 | Formato Word 11-oct-2025 | Fotos rotuladas 01-Mar-2024 | Se reutilizan fotos viejas: no hay registro fotográfico actual | Advertencia: foto más reciente de cada punto con antigüedad > 2 inspecciones |
| D7 | Columna Imagen | Solo un archivo por fila | La 2.ª foto del boom no está referenciada | Permitir N fotos por punto/fecha en el modelo |

**Reparaciones (no son errores):** caídas a 0 con comentario "Zona reparada por soldadura" o "Cucharón nuevo" ⇒ **reinician el ciclo** de la grieta. Las tendencias y proyecciones se calculan **solo sobre el ciclo actual**.

## 3. Hallazgos de mantenimiento (lo que la plataforma debe hacer evidente)

1. **CU-02 operó en Crítico ≈ 4 meses**: 600 (dic-24) → 840 (mar-25, > Danger 800) → 1040 (jun-25) y se reparó hasta 19-jul-2025. Es el caso estrella para justificar las alertas: con la plataforma se habría detenido en mar-2025.
2. **CU-02 reaparece rápido**: 0 (26-ago-25) → 70 (11-oct-25) ≈ 88 mm/1000 h, la tasa más alta del equipo.
3. **BR-01 está en Alerta** (410 mm, Caution 300) desde ≈ abr-2025; tasa ≈ 48 mm/1000 h → Danger en ≈ 4000 h (≈ 8 meses). Requiere reparación programada.
4. **BM-01 llega a Caution en ≈ 1200 h** (≈ 70 días, ~2 inspecciones). BM-02/03 crecen en paralelo desde mar-2025 → patrón de zona en el boom (posible causa común: carga/operación).
5. **Reincidencia en BM-04** ("zona reparada"): 160 mm ya en la 1.ª inspección, reparado nov-23, reaparece mar-24 ("grieta sobre reparación anterior"), reparado otra vez oct-24. Indicador de calidad de reparación.
6. **Cucharón** acumula la mayor actividad (cambio de componente mar-24, 2 reparaciones en 2025) → candidato a revisar procedimiento de soldadura / material / operación.
7. Evento mayor 01-mar-2024: 6 reparaciones + cucharón nuevo, tras el intervalo más largo (67 días).

## 4. Requisitos → cómo se cumplen

| # | Requisito mínimo | Implementación | Vista |
|---|---|---|---|
| R1 | Cargar datos sin transcribir | SheetJS lee las 3 hojas; botón "Cargar Excel" acepta un historial nuevo; carga automática de `data/` | Inicio |
| R2 | Historial completo | Inspecciones nuevas se agregan (merge por Fecha+Código) y persisten; exportar Excel con el mismo formato de hojas | Registrar / Exportar |
| R3 | Tendencia por punto | L vs fecha **y** L vs horas (toggle), bandas Caution/Danger, ciclos de reparación marcados, puntos sospechosos destacados | Punto |
| R4 | Imágenes | Esquema de zona con **hotspots clicables** sobre cada punto (coloreados por estado) + galería de fotos por fecha; subir foto nueva (dataURL) | Zona / Punto |
| R5 | Alertas | (a) Alerta/Crítico por umbral; (b) **proximidad**: proyección cruza Caution/Danger antes de la próxima inspección (750 h); (c) **crecimiento rápido**: tasa > 2× mediana del punto o > 80 mm/1000 h; (d) N/I repetido ≥ 2 veces; (e) dato sospechoso | Centro de alertas + badge global |
| R6 | Registrar y consultar | Formulario estilo formato Word (cabecera + 12 filas con L anterior autollenada, estado calculado en vivo); tabla con filtros zona/punto/fecha/estado/inspector | Registrar / Historial |

**Diferenciadores ("Sorpréndannos")**
- **Modelo 3D** esquemático de la pala (Three.js, primitivas: tornamesa, boom, brazo, cucharón) con esferas en los 12 puntos coloreadas por estado; clic → vista del punto.
- **Proyección de la progresión**: regresión lineal en horas sobre el ciclo actual (opción exponencial si R² mejora), con banda de incertidumbre y "horas/fecha estimada a Caution y Danger" (fecha = horas / 17 h·día).
- **Simulador "¿qué pasa si?"** (el toque GARDIAN): slider de horas futuras y de intervalo de inspección → la pala 3D y el esquema se recolorean con el estado proyectado; muestra qué puntos cruzan umbrales y cuándo conviene la próxima parada.
- **Priorización / plan de mantenimiento**: ranking de puntos por riesgo = f(estado, h a Danger, tasa, reincidencia) con acción recomendada (seguir / aumentar frecuencia / programar reparación / reparar antes de operar), alineada al criterio del formato.
- **KPIs**: % puntos por estado, nº reparaciones por zona, MTBR (horas medias entre reparaciones por punto), tasa media por zona, reincidencias, cobertura de inspección (% N/I), antigüedad de fotos.
- **Reporte automático** imprimible (CSS print → PDF) con el mismo orden del formato de inspección + resumen ejecutivo + plan priorizado.
- **IA integrada** (requisito obligatorio del curso): botón "Analizar con IA" que arma un prompt estructurado con el estado del equipo (JSON compacto) → (a) copiar al portapapeles para Copilot/Claude, o (b) llamada directa a la API de Anthropic con clave que el usuario pega (guardada solo en su navegador; nunca en el repo). La respuesta se muestra como "Diagnóstico IA" en el reporte. Documentar también en `docs/USO_IA.md` cómo se usó IA en el desarrollo.

## 5. Modelo de datos (normalizado en memoria)

```js
equipo   = { flota:'Pala hidráulica EX3600', id:'3600-01', utilizacion_h_dia:17 }
puntos[] = { codigo:'BM-01', zona:'Boom (pluma)', zonaId:'BM', descripcion, caution, danger,
             esquema:'3600_BM_boom.png', hotspot:{x:0.52,y:0.68} /*fracción de la imagen*/, pos3d:[x,y,z] }
inspecciones[] = { id, fecha:'2025-10-11', horas:65703.2, inspector:'INSP-01', origen:'excel'|'app' }
mediciones[] = { inspeccionId, codigo, L:number|null /*null=N/I*/, comentario, imagenes:[...],
                 estado:'Normal'|'Alerta'|'Crítico'|'N/I', evento:null|'reparacion'|'cambio',
                 calidad:{ sospechoso:bool, motivo, confirmado:null|bool } , ciclo:n }
```
Las coordenadas `hotspot` se toman de las flechas rotuladas en los esquemas (`assets/esquemas`); dejarlas en `src/config.js` editables.

## 6. Navegación (de lo global a la grieta)

`Flota` (tarjeta del equipo 3600-01 con semáforo; preparado para N equipos aunque haya 1) → `Equipo` (3D + KPIs + alertas + plan priorizado) → `Zona` (esquema con hotspots + mini-tendencias de sus 4 puntos) → `Punto` (tendencia, ciclos, proyección, fotos, tabla de historial, comentarios).
Rutas por hash: `#/flota`, `#/equipo/3600-01`, `#/zona/BM`, `#/punto/BM-01`, `#/registrar`, `#/historial`, `#/alertas`, `#/calidad`, `#/reporte`. Breadcrumb siempre visible.

## 7. Fases para Claude Code (cada una con criterio de aceptación)

| Fase | Entregable | Aceptación |
|---|---|---|
| **0. Esqueleto** | `index.html`, router hash, tema, vendor descargado, `python -m http.server` funciona | Navega entre vistas vacías con breadcrumb |
| **1. Datos + reglas** | `datos.js`, `reglas.js`, `tests/verify.cjs` | `node tests/verify.cjs` pasa: 276 mediciones, 8 N/I, D1–D4 detectados, ciclos de reparación correctos, estado actual BR-01 = Alerta, resto Normal |
| **2. Vistas núcleo** | Equipo (KPIs + tabla de estado), Zona (esquema + hotspots), Punto (Chart.js con bandas, fecha/horas, fotos), Historial filtrable | R1, R3, R4, R6-consulta cumplidos |
| **3. Registro + alertas** | Formulario estilo Word, merge + localStorage, export Excel, centro de alertas, vista Calidad de datos | R2, R5, R6 cumplidos; registrar una inspección de prueba actualiza todo |
| **4. Diferenciadores** | 3D, proyección, simulador "qué pasa si", plan priorizado | Clic en esfera 3D abre el punto; slider de horas recolorea |
| **5. IA + reporte** | Prompt/llamada IA, reporte imprimible, `docs/USO_IA.md` | PDF del reporte con resumen, estado por zona, plan y diagnóstico IA |
| **6. Despliegue** | GitHub Pages + README con link y capturas | Abre desde el link público en PC y tablet |

**Si el tiempo aprieta (entrega mañana 12:00):** fases 0–3 cubren los 6 requisitos mínimos; de la 4 priorizar proyección + plan priorizado (aportan decisión) antes que el 3D; la 5 en versión "copiar prompt".

## 8. Pendiente de decidir por el autor
- Componente individual asignado (Boom / Brazo / Cucharón): la plataforma cubre las 3 zonas, pero el reporte y la presentación pueden profundizar en el componente propio (config `componenteFoco` en `src/config.js`).
- Tolerancia de medición (propuesta 20 mm) y umbral de "crecimiento rápido" (propuesta 80 mm/1000 h o 2× mediana).
- ¿Se reportan los datos D1/D2 corregidos (≈100 y N/I) o solo marcados? Propuesta: marcados + corrección sugerida, el usuario decide.
