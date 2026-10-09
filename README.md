# Failaria · Plataforma de integridad estructural de la pala Hitachi EX3600

Taller en Énfasis II — Gestión de Mantenimiento · Grupo 5

Sitio web estático que convierte el historial de inspecciones de grietas de la pala **EX3600 (equipo 3600-01)** en decisiones de mantenimiento: qué punto reparar primero, cuándo detener el equipo, qué datos de campo no son confiables y **cuándo y cómo fallaría cada pieza** si no se interviene.

**Link público:** _(pendiente: URL de GitHub Pages)_

![Vista del equipo](docs/capturas/equipo.jpg)

## Cómo abrirla

| Opción | Pasos |
|---|---|
| GitHub Pages | Abrir el link público (PC o tablet). |
| Local (Windows) | Doble clic en `iniciar.bat` (requiere Python) → abre `http://localhost:8000`. |
| Local (cualquier SO) | `python -m http.server 8000` en esta carpeta → `http://localhost:8000`. |

Abrir `index.html` con doble clic no funciona (los navegadores bloquean módulos en `file://`); la página lo avisa. Los datos se cargan solos desde `data/EX3600_historial_grietas.xlsx`; **Flota → Cargar Excel…** acepta otro historial con las mismas hojas.

## Cómo está pensada la interfaz

Cada vista muestra solo lo necesario para decidir. Las explicaciones (reglas, supuestos, cómo leer un gráfico) están detrás del icono **ⓘ** junto a cada título o control: pulsarlo abre una ventana con el detalle y `Esc` la cierra. Así la pantalla sirve en una tablet en terreno y el texto didáctico sigue disponible.

## Qué decisión responde cada vista

| Vista | Pregunta | Qué hay |
|---|---|---|
| **Flota** | ¿Qué equipo necesita atención primero? | Semáforo por equipo, lo más urgente, carga de Excel |
| **Equipo** | ¿En qué estado está la pala, qué reparo primero y cuándo paro? | KPIs, 3D por estado, «¿qué pasa si…?», plan priorizado, próxima parada |
| **Simulador** | ¿Cuándo y cómo fallaría cada pieza según la gravedad de su grieta? | Tiempo real con ley de Paris, mapa de daño tipo FEA, grietas a escala, FAD, **tirar de la estructura con el mouse** |
| **Zona** | ¿Dónde están las grietas y cuál requiere acción? | Esquema con puntos clicables por estado, mini-tendencias, fotos |
| **Punto** | ¿Cómo evoluciona esta grieta y cuándo cruza los umbrales? | Tendencia vs fecha/horas, bandas, ciclos de reparación, proyección, fotos |
| **Alertas** | ¿Qué requiere acción hoy? | Umbral, proximidad, crecimiento rápido, N/I, dato sospechoso, fotos; «¿qué habría advertido la plataforma?» |
| **Registrar** | Formulario con la estructura del formato Word | L anterior automática, estado en vivo, avisos de digitación, fotos |
| **Historial** | Consulta y exportación | Filtros, Excel/CSV/JSON |
| **Calidad de datos** | ¿Qué datos de campo no son confiables? | Marcados, no borrados; el usuario decide |
| **Reporte** | PDF en el orden del formato | Resumen, plan, zonas, alertas, diagnóstico IA |
| **IA** | Diagnóstico asistido | Prompt estructurado o llamada a la API de Claude |

## Simulador de falla

![Simulador](docs/capturas/simulador.jpg)

- ▶ hace avanzar las 12 grietas con la **ley de Paris** calibrada con la tasa medida de cada punto, hasta la longitud crítica `a_c = 1,6 × Danger`.
- El color de la estructura (azul → rojo) muestra **dónde y cuánto se agrava** el daño.
- **Mantener pulsado sobre el boom, brazo o cucharón y arrastrar** aplica un sobreesfuerzo: la cámara queda fija, aparece la flecha, los puntos cercanos crecen `(1+s)^m` veces más rápido y la zona queda con daño permanente. Un punto sano puede iniciar grieta.
- Panel: pieza en riesgo por zona, tabla por gravedad y modo de falla, diagrama FAD y eventos.

Uso detallado: [docs/SIMULADOR.md](docs/SIMULADOR.md). Fundamentos (supervisión de grietas, Paris, FAD, límites): [docs/MANTENIMIENTO_Y_FALLA.md](docs/MANTENIMIENTO_Y_FALLA.md).

## Hallazgos que la plataforma hace evidentes

| Hallazgo | Dato |
|---|---|
| CU-02 operó ≈ 4 meses en Crítico | 840 mm el 07-mar-2025 → reparado 19-jul-2025 (2 219 h). La alerta habría salido el mismo día |
| BR-01 en Alerta | 410 mm, 48 mm/1000 h → Danger en ≈ 3 750 h (lineal) o ≈ 2 970 h (Paris); parada ≈ abr-2026 |
| BM-01 llega a Caution en ≈ 1 200 h | BM-01/02/03 crecen en paralelo desde mar-2025 |
| Primera pieza en fallar sin intervención | Cucharón por CU-02: la grieta más rápida (88 mm/1000 h) alcanza `a_c` en ≈ 4 200 h |
| Reincidencias tras reparación | BM-02, BM-03, BM-04, BR-03, CU-01, CU-02 → revisar soldadura |
| Calidad de datos | CU-01 = 1010 mm (dígito extra, sugerido 101), CU-02 = 0 sin reparación (probable N/I), fotos de 2024 reutilizadas |

## Reglas de decisión

- Estado según la hoja **Puntos**: Normal L < Caution · Alerta Caution ≤ L < Danger · Crítico L ≥ Danger · vacío = **N/I** (nunca 0).
- Reparación o cambio de componente **reinicia el ciclo**; tendencias y proyecciones usan solo el ciclo actual.
- Proyección: regresión sobre horas (exponencial solo si mejora R² en 0,05), banda ±2σ; fechas = horas / utilización histórica (≈ 17,4 h/día).
- Falla: ley de Paris por tramos (régimen de grieta corta hasta `max(L, Caution/2)`), `a_c = 1,6 × Danger`, FAD circular. Parámetros en [`src/config.js`](src/config.js) (`falla`).

## Estructura

```text
index.html            shell (navegación por vistas)
src/config.js         parámetros, hotspots, posiciones 3D, parámetros de falla
src/datos.js          Excel → modelo normalizado, validación de calidad, exportación   (sin DOM)
src/reglas.js         estado, ciclos, tasas, proyección, alertas, plan, KPIs          (sin DOM)
src/falla.js          ley de Paris, longitud crítica, modos, FAD, simulación           (sin DOM)
src/almacen.js        localStorage, respaldo JSON, fotos
src/ia.js             prompt estructurado + API de Claude
src/vistas/*.js       flota, equipo, simulador, zona, punto, registrar, historial, alertas, calidad, reporte, ia
src/ui/ayuda.js       icono ⓘ con información adicional
src/ui/pala3d.js      pala 3D (geometría reutilizable)  ·  src/ui/simulador3d.js  mapa FEA + tirar con el mouse
src/ui/grafico.js     Chart.js  ·  src/ui/esquema.js  esquemas con hotspots
vendor/               SheetJS, Chart.js + annotation, Three.js, OrbitControls (versiones fijas)
docs/                 README (índice), MANTENIMIENTO_Y_FALLA, SIMULADOR, USO_IA, historial/, referencia/, capturas/
tests/verify.cjs      69 verificaciones de datos.js, reglas.js y falla.js
```

## Verificación

```bash
node tests/verify.cjs
```

## Persistencia y privacidad

Inspecciones registradas, fotos y decisiones se guardan en el navegador (`localStorage`, clave `ex3600.v1`). Respaldo: **Historial → Respaldo JSON** o **Exportar Excel**. La clave de API para la IA solo se guarda si el usuario lo pide, y solo en su navegador.

Documentación completa: [docs/README.md](docs/README.md). Uso de IA en el desarrollo: [docs/USO_IA.md](docs/USO_IA.md).
