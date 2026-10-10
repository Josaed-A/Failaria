# Entrega de Failaria

Cómo se entrega la plataforma sin depender de GitHub ni de un servidor local, cómo se genera el archivo y cómo comprobarlo antes de enviarlo.

## Qué se entrega

| Archivo | Uso |
|---|---|
| `Failaria.html` | La plataforma completa en un solo archivo. Se abre con doble clic en Chrome, Edge o Firefox. |
| `Failaria_entrega.zip` | `Failaria.html` + `LEEME.txt`. Para aulas virtuales o correos que bloquean adjuntos `.html`. |

El archivo trae adentro el código, las librerías (SheetJS, Chart.js, Three.js), los estilos, los datos del historial y las imágenes de inspección. No hace falta el archivo Excel: el historial va dentro del HTML ya leído, como datos. No necesita internet, Python, servidor, GitHub ni instalación. Pesa ≈ 6 MB, casi todo por los esquemas de inspección.

Para entregar en Teams o en el aula virtual se adjunta `Failaria.html` o el ZIP, no el link del repositorio.

**Historial fijo.** `Failaria.html` siempre usa el historial que trae adentro: no muestra «Cargar Excel…» y, al importar un respaldo JSON, ignora el Excel que ese respaldo pudiera traer. Las inspecciones registradas, decisiones y tareas sí se importan. Para cambiar el historial hay que reemplazar `data/EX3600_historial_grietas.xlsx` y regenerar el archivo. El sitio normal (`index.html` con servidor) conserva el botón.

**Diagnóstico IA incluido.** El archivo trae un diagnóstico ya generado con el prompt de la vista IA y los datos hasta el 11-oct-2025, así la vista IA y el Reporte no llegan vacíos a quien lo abre. Está en `src/diagnostico_ia.js`. Si el usuario guarda otro diagnóstico, ese reemplaza al incluido en su navegador.

Solo dos funciones dependen de algo externo:

- **IA con llamada directa a la API de Claude:** requiere internet y una clave propia. Sin clave, la vista arma el prompt para copiarlo en cualquier asistente.
- **Datos registrados:** se guardan en el navegador del equipo donde se abre el archivo. Para llevarlos a otro equipo se usa **Historial → Respaldo JSON**. En las vistas previas de plataformas o del correo, que abren la página aislada, el navegador no deja guardar: la plataforma funciona igual, los cambios duran mientras esté abierta y el pie de Flota lo indica («cambios sin guardar en este visor»). Antes eso mostraba el error «Failed to read the 'localStorage' property…». **Exportar Excel** descarga el historial para revisarlo en una hoja de cálculo.

## Cómo generarla

Desde la raíz del repositorio:

```bash
node herramientas/empaquetar.mjs
```

Salida:

```text
Failaria.html               raíz del repositorio, se versiona
dist/Failaria_entrega.zip   carpeta ignorada por git
```

Requisitos: Node 18 o superior. La primera vez se necesita internet, porque `npx` descarga esbuild (versión fija en el script). Hay que volver a generar el archivo después de cada cambio en `src/`, `index.html`, `assets/` o `data/`. El comentario al inicio del HTML y `LEEME.txt` indican el commit y la fecha de la versión.

## Cómo funciona el empaquetado

Abrir `index.html` como archivo no sirve, porque los navegadores bloquean los módulos JavaScript y la lectura de archivos vecinos en `file://`. El script resuelve las dos cosas:

1. **Código.** Agrupa `src/app.js` y todo lo que importa, incluidos Three.js y OrbitControls, en un script clásico con esbuild. Los `import()` dinámicos quedan dentro del mismo archivo.
2. **Librerías y estilos.** Incrusta `vendor/*.js` y `src/estilos.css` dentro del HTML.
3. **Datos.** Lee el Excel de `data/` con la misma función de la plataforma (`leerLibro` de `src/datos.js`) y escribe el historial ya leído como JSON en `window.__DATOS`. Al abrir el archivo, la app toma esos datos directamente: no lee ningún Excel ni hace `fetch`. Así funciona también en visores que bloquean lecturas internas, como las vistas previas de Drive, Teams o el correo, y en navegadores con políticas de seguridad estrictas.
4. **Imágenes.** Embebe las imágenes de `assets/` como data URL en `window.__RECURSOS`. La función `recurso()` de `src/ui/formato.js` busca ahí antes de usar la ruta relativa, así el mismo código sirve para el sitio normal y para la versión entregable.

Reglas para cambios futuros: toda ruta a una imagen u otro archivo local debe pasar por `recurso()` o `rutaImagen()`; si no, funcionará en el servidor local pero no en `Failaria.html`. El historial de la entrega sale de `window.__DATOS`; no volver a leerlo con `fetch`.

## Comprobar antes de entregar

1. Copiar `Failaria.html` a una carpeta vacía o a un pendrive, sin nada al lado.
2. Abrirlo con doble clic y recorrer Flota, Equipo, Simulador, Plan, Zona, Punto, Calidad de datos y Reporte.
3. Revisar que se vean los esquemas con sus puntos, el modelo 3D y los gráficos.
4. En **Calidad de datos → Archivos de imagen referenciados**, todas las imágenes deben decir «✓ disponible».

La prueba automática equivalente se hizo con Chromium headless abriendo el archivo por `file://` desde una carpeta aislada: todas las vistas cargaron con datos, imágenes y 3D, sin errores de consola. En Firefox se comprobó que abre y carga el historial desde el archivo.

## Link público (opcional)

Si además se quiere una URL, cualquiera de estas opciones publica la plataforma tal como está en el repositorio, sin construir nada:

| Opción | Pasos |
|---|---|
| GitHub Pages | En GitHub: **Settings → Pages → Deploy from a branch → `main` / root**. Queda en `https://<usuario>.github.io/Failaria/`. |
| Netlify Drop | Entrar a `app.netlify.com/drop` y arrastrar la carpeta del repositorio. Entrega una URL sin usar GitHub. |

El archivo `Failaria.html` también se puede subir tal cual a cualquier hosting estático o a una carpeta compartida de Google Drive u OneDrive para descargarlo.
