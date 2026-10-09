# CLAUDE.md — Plataforma de integridad estructural EX3600

Contexto completo, requisitos y fases en **[PLAN.md](PLAN.md)**. Léelo antes de cualquier tarea.

## Qué es
Sitio web estático tipo "simulador" (mismo estilo que `simulador_web_original` de GARDIAN):
abre `index.html` y funciona, sin backend ni servicios externos obligatorios.
Monitorea grietas de la pala Hitachi EX3600 (equipo 3600-01): flota → equipo → zona → punto → historial de la grieta.
Curso: Taller en Énfasis II — Gestión de Mantenimiento (Grupo 5). Idioma de UI, código y comentarios: **español**.

## Stack (no cambiar sin preguntar)
- HTML + CSS + **JavaScript vanilla con ES modules**. Sin framework, sin bundler, sin npm en runtime.
- Librerías **vendorizadas** en `vendor/` (versiones fijas, sin CDN en producción):
  - `xlsx.full.min.js` (SheetJS) → leer/escribir Excel en el navegador.
  - `chart.umd.min.js` (Chart.js 4) + `chartjs-plugin-annotation` → tendencias con bandas Caution/Danger.
  - `three.module.min.js` (Three.js) → modelo 3D esquemático (fase 4).
- Persistencia: `localStorage` (clave `ex3600.v1`) + exportar/importar Excel/JSON. Envolver accesos en try/catch.
- Despliegue: GitHub Pages (carpeta raíz). Debe funcionar también abriendo el archivo local; si `fetch` de archivos locales falla por `file://`, permitir cargar el Excel con `<input type=file>` o servir con `python -m http.server`.

## Estructura
```
index.html            shell de la app (navegación por vistas)
src/datos.js          lectura Excel → modelo normalizado; validación de calidad
src/reglas.js         estado (Normal/Alerta/Crítico/N/I), tasas, proyección, alertas  ← lógica PURA, sin DOM
src/almacen.js        localStorage, merge de inspecciones nuevas, export/import
src/vistas/*.js       flota, equipo, zona, punto, registrar, alertas, reporte
src/ui/*.js           componentes (tabla filtrable, gráfico, visor de esquema con hotspots, 3D)
assets/esquemas|fotos imágenes referenciadas por la columna "Imagen" del Excel
data/                 Excel original (fuente de verdad; NO editarlo)
tests/verify.cjs      verificación de reglas.js con node (sin dependencias)
```

## Reglas de trabajo
- `reglas.js` y `datos.js` no tocan el DOM: así se prueban con `node tests/verify.cjs`. Correr tests tras cada cambio en lógica.
- Nunca convertir celda vacía en 0: vacío = **N/I**. 0 = sin grieta detectable.
- Umbrales siempre desde la hoja `Puntos`, nunca hardcodeados.
- Cada dato sospechoso se **marca**, no se borra; la UI lo muestra y permite al usuario confirmarlo o descartarlo.
- Unidades: mm y horas de horómetro (h). Fechas ISO internamente, `dd-mmm-aaaa` en UI.
- Diseño: tema oscuro industrial como GARDIAN (`#0c1320`), colores de estado fijos:
  Normal `#2e9e5b`, Alerta `#e0a020`, Crítico `#d64545`, N/I `#7a8599`, Dato sospechoso: borde punteado violeta `#9b6bd6`.
- Responsive: usable en tablet (inspector en campo).
- Commits pequeños por fase; no avanzar de fase sin cumplir sus criterios de aceptación.
