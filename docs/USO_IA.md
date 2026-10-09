# Uso de inteligencia artificial

El curso exige usar IA. Se usó en dos niveles: **para construir la plataforma** y **dentro de la plataforma** como apoyo al diagnóstico.

## 1. IA en el desarrollo

| Etapa | Herramienta | Uso | Control humano |
|---|---|---|---|
| Análisis de datos | Claude | Revisión del Excel (276 mediciones) y del formato Word: identificación de reparaciones, N/I y datos sospechosos (D1–D7) y de los hallazgos de mantenimiento (CU-02 en Crítico, BR-01 en Alerta, reincidencias). | Cada hallazgo se verificó contra el Excel original; ver [historial/PLAN_FASES.md](historial/PLAN_FASES.md). |
| Diseño | Claude | Plan por fases con criterios de aceptación y modelo de datos normalizado (historial/PLAN_FASES.md, CLAUDE.md). | El equipo definió los requisitos, el stack y las reglas de decisión. |
| Programación | Claude Code | Escritura del código (`src/`), pruebas (`tests/verify.cjs`) y revisión visual en el navegador. | Reglas de negocio separadas del DOM y verificadas con 95 pruebas automáticas; commits por fase. |
| Mecánica de fractura | Claude + búsqueda web | Síntesis de ley de Paris, intervalos de inspección (BS 7910 / API 579) y FAD para el simulador de falla; fuentes citadas en [MANTENIMIENTO_Y_FALLA.md](MANTENIMIENTO_Y_FALLA.md). | Modelo simplificado y parametrizable; sus límites se declaran en la misma página. |
| Diagnóstico incluido | Claude Code | Respuesta al prompt de la vista IA con los datos hasta el 11-oct-2025 (`src/diagnostico_ia.js`), para que la versión entregable no llegue sin diagnóstico. | Sus cifras se contrastaron con el estado calculado por la plataforma y una prueba automática avisa si dejan de coincidir; el usuario puede reemplazarlo desde la vista IA. |
| Entrega | Claude Code | Empaquetado en un solo archivo (`herramientas/empaquetar.mjs`), prueba del archivo abierto sin servidor y capturas del README. | El archivo se revisa abriéndolo en un equipo sin el repositorio ([ENTREGA.md](ENTREGA.md)). |
| Ubicación de puntos | Claude (visión) | Lectura de los esquemas para ubicar las flechas de cada punto (`hotspots` en `src/config.js`). | Coordenadas editables y revisadas sobre la imagen. |

**Criterios que se mantuvieron:** los umbrales vienen siempre de la hoja Puntos; una celda vacía nunca se convierte en 0; los datos sospechosos se marcan pero no se borran, y decide el usuario.

## 2. IA dentro de la plataforma (vista «IA»)

1. La plataforma arma un **prompt estructurado** con el estado calculado del equipo: puntos, tendencias del ciclo actual, horas hasta Caution y Danger, alertas, próxima parada, calidad de datos y KPIs, en un JSON compacto (≈ 4 000 tokens de entrada).
2. Hay dos formas de obtener el diagnóstico:
   - **Opción A:** copiar el prompt en Copilot o Claude y pegar la respuesta en la plataforma.
   - **Opción B:** llamar directamente a la API de Claude (`claude-opus-5-5`) con la clave del usuario. La solicitud sale del navegador hacia `api.anthropic.com`; la clave no se guarda en el repositorio y solo queda en el navegador si el usuario marca «Recordar».
3. El diagnóstico se guarda y aparece en el **Reporte** con su origen, su fecha y la fecha de los datos usados.
4. Mientras no haya uno guardado, la plataforma muestra un **diagnóstico incluido**, generado con el mismo prompt y rotulado como tal. Así el reporte no llega vacío a quien abre la versión entregable.

Se le pide a la IA: diagnóstico ejecutivo, prioridades con plazo, patrones y causas probables por zona, frecuencia de inspección, limitaciones de los datos y preguntas para terreno. También se le pide usar solo la información entregada y explicitar sus supuestos.

**Límite:** la IA apoya el análisis. Las alertas, el plan y la parada se calculan con reglas deterministas y verificables (`src/reglas.js`), y la decisión de mantenimiento la toma el ingeniero responsable.
