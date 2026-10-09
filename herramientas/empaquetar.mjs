// Genera la versión entregable de Failaria: UN solo archivo HTML que se abre con doble clic,
// sin servidor, sin Python, sin internet y sin GitHub.
//
//   node herramientas/empaquetar.mjs
//
// Salida:
//   Failaria.html               (raíz del repo, versionado) plataforma completa en un archivo: código, librerías, estilos, Excel e imágenes
//   dist/Failaria_entrega.zip   (ignorado por git) Failaria.html + LEEME.txt, para adjuntar donde no se aceptan .html
//
// Cómo funciona: los módulos ES no cargan desde file://, así que src/app.js se agrupa con esbuild
// en un script clásico (IIFE) y se incrusta en el HTML junto con vendor/ y src/estilos.css.
// El Excel y las imágenes de assets/ se embeben como data URL en window.__RECURSOS, que
// src/ui/formato.js (recurso, rutaImagen) consulta antes de usar la ruta relativa.
// esbuild se usa solo para construir (npx lo descarga la primera vez); la plataforma sigue sin npm.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const ESBUILD = 'esbuild@0.25.0';
const leer = (p) => readFileSync(join(RAIZ, p), 'utf8');
const FECHA = new Date().toISOString().slice(0, 10);

// Texto incrustado en <script>/<style>: que no cierre la etiqueta antes de tiempo.
const seguroScript = (js) => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const seguroStyle = (css) => css.replace(/<\/(style)/gi, '<\\/$1');

function git(...args) {
  try { return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' }).trim(); } catch { return ''; }
}

// 1. Código: src/app.js + módulos importados (incluidos Three.js y OrbitControls) en un IIFE.
function agrupar() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return execFileSync(npx, ['--yes', ESBUILD, 'src/app.js',
    '--bundle', '--format=iife', '--target=es2020', '--charset=utf8', '--minify', '--legal-comments=none',
    '--alias:three=./vendor/three.module.min.js', '--banner:js="use strict";', '--log-level=warning'],
  { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' });
}

// 2. Recursos: Excel de data/ e imágenes de assets/, con la misma ruta que usa el código.
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
function archivos(dir) {
  const abs = join(RAIZ, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((n) => {
    const p = join(abs, n);
    return statSync(p).isDirectory() ? archivos(relative(RAIZ, p)) : [relative(RAIZ, p)];
  });
}
function recursos() {
  const lista = [...archivos('assets'), 'data/EX3600_historial_grietas.xlsx'].filter((p) => MIME[extname(p).toLowerCase()]);
  const mapa = {};
  for (const p of lista) {
    const clave = p.split(sep).join('/');
    mapa[clave] = `data:${MIME[extname(p).toLowerCase()]};base64,${readFileSync(join(RAIZ, p)).toString('base64')}`;
  }
  return mapa;
}

// 3. HTML: index.html con todo incrustado.
function construirHTML(bundle, mapa) {
  let html = leer('index.html');
  const reemplazar = (re, fn, desc) => {
    const antes = html; html = html.replace(re, fn);
    if (html === antes) throw new Error(`index.html cambió: no se encontró ${desc}`);
  };
  reemplazar(/<link rel="stylesheet" href="src\/estilos\.css">/, () => `<style>\n${seguroStyle(leer('src/estilos.css'))}\n</style>`, 'la hoja de estilos');
  reemplazar(/<script src="(vendor\/[^"]+)"><\/script>/g, (_, p) => `<script>${seguroScript(leer(p))}</script>`, 'las librerías de vendor/');
  reemplazar(/\s*<script type="importmap">[\s\S]*?<\/script>/, () => '', 'el importmap');
  reemplazar(/\s*<script>\s*\/\/ Si se abre como archivo local[\s\S]*?<\/script>/, () => '', 'el aviso de file://');
  const commit = git('describe', '--always', '--dirty').replace(/-dirty$/, ' con cambios sin commit');
  const version = [commit, FECHA].filter(Boolean).join(' · ');
  reemplazar(/<script type="module" src="src\/app\.js"><\/script>/, () =>
    `<script>window.__FAILARIA_VERSION = ${JSON.stringify(version)};\nwindow.__RECURSOS = ${seguroScript(JSON.stringify(mapa))};</script>\n  <script>${seguroScript(bundle)}</script>`,
  'el módulo src/app.js');
  html = html.replace('<head>', `<head>\n  <!-- Failaria · versión entregable en un solo archivo (${version}). Generado con herramientas/empaquetar.mjs; el código fuente está en el repositorio. -->`);
  return { html, version };
}

// 4. ZIP mínimo (deflate) sin dependencias.
const TABLA_CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(entradas) {
  const partes = []; const central = []; let off = 0;
  const d = new Date(); const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const { nombre, datos } of entradas) {
    const n = Buffer.from(nombre, 'utf8'); const comp = deflateRawSync(datos, { level: 9 }); const crc = crc32(datos);
    const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6); loc.writeUInt16LE(8, 8);
    loc.writeUInt16LE(hora, 10); loc.writeUInt16LE(fecha, 12); loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(datos.length, 22); loc.writeUInt16LE(n.length, 26);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(hora, 12); cen.writeUInt16LE(fecha, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(datos.length, 24); cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(off, 42);
    partes.push(loc, n, comp); central.push(cen, n); off += loc.length + n.length + comp.length;
  }
  const tc = Buffer.concat(central); const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10); fin.writeUInt32LE(tc.length, 12); fin.writeUInt32LE(off, 16);
  return Buffer.concat([...partes, tc, fin]);
}

const LEEME = () => `FAILARIA - Plataforma web de integridad estructural y gestión de mantenimiento
Pala Hitachi EX3600 (equipo 3600-01) · Taller en Énfasis II - Gestión de Mantenimiento · Grupo 5
Versión: ${FECHA}

CÓMO ABRIRLA
  Doble clic en Failaria.html. Se abre en el navegador (Chrome, Edge o Firefox) y funciona
  sin instalar nada, sin internet y sin servidor. Todo está dentro del archivo: código,
  librerías, el historial de inspecciones (Excel) y las imágenes de inspección.

QUÉ SE GUARDA
  Las inspecciones registradas, fotos, decisiones y tareas del plan se guardan en el navegador
  del equipo donde se abre. Para llevarlas a otro equipo: Historial > Respaldo JSON o Exportar Excel.

OPCIONAL
  - Vista IA con llamada directa a la API de Claude: requiere internet y una clave de API propia.
    Sin clave, la vista genera el prompt para copiar en cualquier asistente.
  - Flota > Cargar Excel... acepta otro historial con las mismas hojas (Historial y Puntos).
`;

const t0 = Date.now();
console.log(`Agrupando src/app.js con ${ESBUILD}…`);
const bundle = agrupar();
const mapa = recursos();
const { html, version } = construirHTML(bundle, mapa);
mkdirSync(DIST, { recursive: true });
writeFileSync(join(RAIZ, 'Failaria.html'), html);
writeFileSync(join(DIST, 'Failaria_entrega.zip'), zip([
  { nombre: 'Failaria/Failaria.html', datos: Buffer.from(html, 'utf8') },
  { nombre: 'Failaria/LEEME.txt', datos: Buffer.from(LEEME().replace(/\n/g, '\r\n'), 'utf8') },
]));
const mb = (p) => (statSync(join(RAIZ, p)).size / 1048576).toFixed(1) + ' MB';
console.log(`Versión ${version}: ${Object.keys(mapa).length} recursos embebidos.`);
console.log(`  Failaria.html               ${mb('Failaria.html')}`);
console.log(`  dist/Failaria_entrega.zip   ${mb('dist/Failaria_entrega.zip')}`);
console.log(`Listo en ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
