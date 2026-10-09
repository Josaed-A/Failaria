# Plataforma de integridad estructural · Pala Hitachi EX3600

Taller en Énfasis II — Gestión de Mantenimiento · Grupo 5

Sitio web estático que convierte el historial de inspecciones de grietas de la pala **EX3600 (equipo 3600-01)** en decisiones de mantenimiento: qué punto reparar primero, cuándo detener el equipo y qué datos de campo no son confiables.

**Link público:** _(pendiente: agregar la URL de GitHub Pages al publicar)_

![Vista del equipo](docs/capturas/equipo.jpg)

## Cómo abrirla

| Opción | Pasos |
|---|---|
| GitHub Pages | Abrir el link público (PC o tablet). |
| Local (Windows) | Doble clic en `iniciar.bat` (requiere Python) → se abre `http://localhost:8000`. |
| Local (cualquier SO) | `python -m http.server 8000` en esta carpeta y abrir `http://localhost:8000`. |

> Abrir `index.html` con doble clic no funciona: los navegadores bloquean los módulos JavaScript en `file://`. La página lo detecta y muestra estas instrucciones.

Los datos se cargan automáticamente desde `data/EX3600_historial_grietas.xlsx`. Con **Flota → Cargar Excel…** se puede cargar otro historial con el mismo formato de hojas (Historial, Puntos, Léame).

## Qué decisión responde cada vista

| Vista | Pregunta de decisión | Requisito |
|---|---|---|
| **Flota** | ¿Qué equipo necesita atención primero? | R1 |
| **Equipo** | ¿En qué estado está la pala, qué reparo primero y cuándo debo parar? KPIs, modelo 3D, simulador «¿qué pasa si?», plan priorizado y próxima parada. | R5, extras |
| **Zona** | ¿Dónde están las grietas y cuál requiere acción? Esquema con puntos clicables coloreados por estado. | R4 |
| **Punto** | ¿Cómo evoluciona esta grieta y cuándo cruzará los umbrales? Tendencia vs fecha u horas, bandas Caution/Danger, ciclos de reparación, proyección con incertidumbre, fotos. | R3, R4 |
| **Registrar** | Formulario con la estructura del formato de inspección (Word): L anterior automática, estado en vivo, avisos de digitación, fotos. | R2, R6 |
| **Historial** | Consulta filtrable (zona, punto, fecha, estado, inspector) y exportación Excel/CSV/JSON. | R2, R6 |
| **Alertas** | ¿Qué requiere acción hoy? Umbral, proximidad, crecimiento rápido, N/I, dato sospechoso, fotos. Incluye «¿qué habría advertido la plataforma?» repitiendo el análisis en cada fecha. | R5 |
| **Calidad de datos** | ¿Qué datos de campo no son confiables? Se marcan (no se borran) y el usuario decide: es real / descartar / corregir. | «revísenlos» |
| **Reporte** | Reporte imprimible (PDF) en el orden del formato de inspección + resumen ejecutivo, plan y diagnóstico IA. | extra |
| **IA** | Diagnóstico asistido: prompt estructurado para copiar en Copilot/Claude, o llamada directa a la API de Claude con la clave del usuario. | IA del curso |

## Hallazgos que la plataforma hace evidentes

- **CU-02 operó ≈ 4 meses en Crítico** (840 mm el 07-mar-2025 → reparado el 19-jul-2025: 2 219 h). Con la plataforma, la alerta crítica habría salido el mismo día de la inspección.
- **BR-01 en Alerta** (410 mm, 48 mm/1000 h) → alcanza Danger en ≈ 3 750 h; parada recomendada ≈ abr-2026 incluyendo BM-01, BM-02, BM-03, CU-01 y CU-02.
- **BM-01 alcanza Caution en ≈ 1 200 h**; BM-01/02/03 crecen en paralelo desde mar-2025 (posible causa común en el boom).
- **Reincidencias** tras reparación en BM-02, BM-03, BM-04, BR-03, CU-01 y CU-02 → revisar el procedimiento de soldadura.
- **Calidad de datos:** CU-01 = 1010 mm (probable dígito extra, corrección sugerida 101), CU-02 = 0 mm sin reparación (probable N/I), dos disminuciones dentro de la tolerancia y fotos de 01-mar-2024 reutilizadas en el formato de oct-2025.

![Tendencia CU-02](docs/capturas/punto_CU-02.jpg)

## Reglas de decisión

- Estado según la hoja **Puntos** (nunca hardcodeado): Normal L < Caution · Alerta Caution ≤ L < Danger · Crítico L ≥ Danger · celda vacía = **N/I** (nunca 0).
- Una reparación («reparada», «soldadura») o un cambio de componente («nuevo») **reinicia el ciclo** de la grieta. Tendencias y proyecciones usan solo el ciclo actual.
- Proyección: regresión lineal sobre horas desde el inicio de la grieta (modelo exponencial solo si mejora R² en 0,05), banda de incertidumbre de ±2σ, base = mayor de las dos últimas mediciones. Fechas = horas / utilización histórica (≈ 17,4 h/día).
- Parámetros ajustables en [`src/config.js`](src/config.js): tolerancia de medición (20 mm), crecimiento rápido (80 mm/1000 h o 2× la mediana), horizonte de proximidad (2 inspecciones), componente asignado (`componenteFoco`), coordenadas de los puntos en esquemas y en 3D.

## Estructura

```
index.html            shell de la app
src/config.js         parámetros, hotspots y posiciones 3D
src/datos.js          Excel → modelo normalizado, validación de calidad, exportación (sin DOM)
src/reglas.js         estado, ciclos, tasas, proyección, alertas, plan, KPIs, simulador (sin DOM)
src/almacen.js        localStorage, respaldo JSON, fotos
src/ia.js             prompt estructurado + llamada a la API de Claude
src/vistas/*.js       flota, equipo, zona, punto, registrar, historial, alertas, calidad, reporte, ia
src/ui/*.js           gráficos (Chart.js), esquema con hotspots, modelo 3D (Three.js)
vendor/               SheetJS 0.18.5, Chart.js 4.4.1, chartjs-plugin-annotation 3.0.1, Three.js 0.160.0
tests/verify.cjs      50 verificaciones de datos.js y reglas.js
```

## Verificación

```bash
node tests/verify.cjs
```

Comprueba lectura (276 mediciones, 8 N/I), detección D1–D4, ciclos de reparación, estado actual (BR-01 Alerta, resto Normal), proyecciones, alertas, simulador, fusión de inspecciones nuevas, exportación ida y vuelta y el historial de alertas.

## Persistencia y privacidad

Las inspecciones registradas, fotos y decisiones de calidad se guardan en el navegador (`localStorage`, clave `ex3600.v1`). Para no perderlas: **Historial → Respaldo JSON** o **Exportar Excel**. La clave de API para la IA solo se guarda si el usuario lo pide, y solo en su navegador.

Uso de IA en el desarrollo: [docs/USO_IA.md](docs/USO_IA.md).
