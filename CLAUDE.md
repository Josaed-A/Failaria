# CLAUDE.md — Failaria (integridad estructural, pala EX3600)

Índice de documentación en **[docs/README.md](docs/README.md)**; plan original por fases en [docs/historial/PLAN_FASES.md](docs/historial/PLAN_FASES.md).

## Qué es
**Failaria**: plataforma web de integridad estructural y mantenimiento basado en condición. Sitio estático tipo "simulador"
(mismo estilo que `simulador_web_original` de GARDIAN), sin backend ni servicios externos obligatorios.
Monitorea grietas de la pala Hitachi EX3600 (equipo 3600-01): flota → equipo → zona → punto → historial de la grieta.
Curso: Taller en Énfasis II — Gestión de Mantenimiento (Grupo 5). Idioma de UI, código y comentarios: **español**.

## Stack (no cambiar sin preguntar)
- HTML + CSS + **JavaScript vanilla con ES modules**. Sin framework, sin bundler, sin npm en runtime.
  esbuild se usa **solo al construir** la versión entregable (`herramientas/empaquetar.mjs`, vía npx, versión fija).
- Librerías **vendorizadas** en `vendor/` (versiones fijas, sin CDN en producción):
  - `xlsx.full.min.js` (SheetJS) → leer/escribir Excel en el navegador.
  - `chart.umd.min.js` (Chart.js 4) + `chartjs-plugin-annotation` → tendencias con bandas Caution/Danger.
  - `three.module.min.js` (Three.js) → modelo 3D esquemático (fase 4).
- Persistencia: `localStorage` (clave `ex3600.v1`) + exportar/importar Excel/JSON. Envolver accesos en try/catch.
- Entrega: `node herramientas/empaquetar.mjs` → `Failaria.html` en la raíz (versionado; un solo archivo con código, vendor, CSS, historial ya leído en `window.__DATOS` (JSON, sin Excel ni fetch al abrir) e imágenes embebidas; abre con doble clic en `file://`) y `dist/Failaria_entrega.zip` (`dist/` en .gitignore). Regenerar tras cada cambio y antes de cada push. Detalle en `docs/ENTREGA.md`.
- Desarrollo: `python -m http.server` (o `iniciar.bat`). GitHub Pages / Netlify son opcionales para un link público.

## Estructura
```
index.html            shell de la app (navegación por vistas)
src/datos.js          lectura Excel → modelo normalizado; validación de calidad
src/reglas.js         estado (Normal/Alerta/Crítico/N/I), tasas, proyección, alertas  ← lógica PURA, sin DOM
src/falla.js          ley de Paris, a_crítica, modos de falla, FAD, simulación, causa de falla y reporte de esfuerzo ← PURA
src/tareas.js         planificación: sugerencias desde el análisis, columnas, mover, agenda, CSV ← PURA
src/almacen.js        localStorage, merge de inspecciones nuevas, export/import
src/vistas/*.js       flota, equipo, simulador, planificacion (tablero/calendario), zona, punto, registrar, historial, alertas, calidad, reporte, ia
src/ui/ayuda.js       icono ⓘ: info(html) devuelve el botón; el texto didáctico va aquí, no en la vista
src/ui/pala3d.js      pala paramétrica: construirPieza(boom|brazo|cucharon) según assets/esquemas, construirPala, crearEsferas, escenaBase
src/ui/simulador3d.js mapa de daño FEA por vértice, grietas a escala, tirar con el mouse, modo pieza (op.pieza) y enfocar()
src/ui/lupa.js        lupa de grieta 2D (campo de Irwin, zona plástica, evolución con/sin carga, arrastrar = esfuerzo)
assets/esquemas|fotos imágenes referenciadas por la columna "Imagen" del Excel
data/                 Excel original (fuente de verdad; NO editarlo)
src/diagnostico_ia.js diagnóstico IA incluido (se usa si store.ia es null; false = borrado por el usuario)
tests/verify.cjs      verificación de la lógica pura con node (sin dependencias, 95 checks)
herramientas/         empaquetar.mjs: versión entregable en un solo archivo (dist/)
```

## Reglas de trabajo
- `reglas.js`, `datos.js`, `falla.js` y `tareas.js` no tocan el DOM: así se prueban con `node tests/verify.cjs`. Correr tests tras cada cambio en lógica.
- **Poco texto en pantalla**: títulos y datos a la vista; explicaciones, reglas y supuestos dentro de `info('…')` (ⓘ). No volver a poner párrafos explicativos en las vistas.
- Cuidado con el nombre `info`: no declarar variables locales con ese nombre en las vistas (sombrea la importación).
- Nombre de la plataforma en la interfaz: **Failaria** (subtítulo «Integridad estructural · Pala Hitachi EX3600»).
- Toda ruta a un archivo local (imagen) pasa por `recurso()` o `rutaImagen()` de `src/ui/formato.js`: en `Failaria.html` las imágenes están embebidas en `window.__RECURSOS`. Un `src` directo funciona en el servidor pero falla en la entrega. El historial original en la entrega viene de `window.__DATOS`; no volver a leerlo con `fetch` (hay visores con CSP que lo bloquean). Tras cambios, regenerar y probar `dist/Failaria.html` abierto por `file://`.
- Fechas del plan = horas proyectadas → `fechaDeHoras` (igual que Equipo); no adelantarlas a hoy: si ya pasaron, la tarea queda vencida.
- El diagnóstico incluido (`src/diagnostico_ia.js`) debe coincidir con el análisis del Excel; si cambian datos o reglas y la prueba falla, regenerarlo con el prompt de la vista IA.
- El plan de mantenimiento se siembra una vez desde el historial (`tareas.planInicial`, flag `store.planSembrado`).
- Prueba visual: `python -m http.server 8765` + Playwright (chromium headless con `--use-angle=swiftshader`) recorre las rutas y comprueba 0 errores de consola.
- Nunca convertir celda vacía en 0: vacío = **N/I**. 0 = sin grieta detectable.
- Umbrales siempre desde la hoja `Puntos`, nunca hardcodeados.
- Cada dato sospechoso se **marca**, no se borra; la UI lo muestra y permite al usuario confirmarlo o descartarlo.
- Unidades: mm y horas de horómetro (h). Fechas ISO internamente, `dd-mmm-aaaa` en UI.
- Diseño: tema oscuro industrial como GARDIAN (`#0c1320`), colores de estado fijos:
  Normal `#2e9e5b`, Alerta `#e0a020`, Crítico `#d64545`, N/I `#7a8599`, Dato sospechoso: borde punteado violeta `#9b6bd6`.
- Responsive: usable en tablet (inspector en campo).
- Commits pequeños por fase; no avanzar de fase sin cumplir sus criterios de aceptación.
