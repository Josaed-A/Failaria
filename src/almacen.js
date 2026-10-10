// Persistencia local (localStorage) + importación/exportación. Todos los accesos van en try/catch.
// En visores aislados (iframe sandbox sin allow-same-origin: vistas previas de plataformas o del correo)
// el navegador prohíbe localStorage y solo leerlo lanza un error; ahí se guarda en memoria mientras
// la página esté abierta, sin mostrar errores.

let _ls;
function ls() {
  if (_ls === undefined) {
    try { _ls = window.localStorage; _ls.getItem('ex3600.v1'); }
    catch { const m = new Map(); _ls = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), enMemoria: true }; }
  }
  return _ls;
}
/** false en visores que no permiten guardar en el navegador (los cambios duran mientras la página esté abierta). */
export const persistente = () => !ls().enMemoria;

const vacio = () => ({
  version: 1,
  base: null,                                   // modelo de un Excel cargado por el usuario (si reemplaza al del repo)
  agregados: { inspecciones: [], mediciones: [] }, // inspecciones registradas en la plataforma
  fotos: [],                                    // fotos agregadas: { medicionId, codigo, fecha, src(dataURL) }
  decisiones: {},                               // idMedicion → { accion: 'aceptar'|'descartar'|'corregir', valor, fecha }
  ia: null,                                     // último diagnóstico IA { texto, fecha, modelo }; null = usar el incluido, false = borrado
  tareas: [],                                   // planificación de mantenimiento (tablero/calendario)
  planSembrado: false,                          // true cuando ya se generó el plan inicial desde el historial
});

export function cargar(clave) {
  try {
    const s = ls().getItem(clave);
    if (s) {
      const d = JSON.parse(s);
      return { ...vacio(), ...d, agregados: { ...vacio().agregados, ...(d.agregados || {}) } };
    }
  } catch (e) { console.warn('No se pudo leer el almacenamiento local', e); }
  return vacio();
}

/** Devuelve null si guardó, o un mensaje de error (p. ej. cuota excedida por fotos). */
export function guardar(clave, datos) {
  try { ls().setItem(clave, JSON.stringify(datos)); return null; }
  catch (e) { return e?.name === 'QuotaExceededError' ? 'El almacenamiento del navegador está lleno (fotos muy pesadas). Exporte un respaldo JSON y elimine fotos.' : String(e?.message || e); }
}

export function borrar(clave) { try { ls().removeItem(clave); } catch { /* sin almacenamiento */ } }

export function leerPref(clave, def = null) { try { return ls().getItem(clave) ?? def; } catch { return def; } }
export function guardarPref(clave, v) { try { if (v === null) ls().removeItem(clave); else ls().setItem(clave, v); } catch { /* sin almacenamiento */ } }

export function descargar(nombre, contenido, tipo = 'application/octet-stream') {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function respaldoJSON(datos) {
  return JSON.stringify({ tipo: 'respaldo-ex3600', exportado: new Date().toISOString(), ...datos }, null, 1);
}

export function leerRespaldo(texto) {
  const d = JSON.parse(texto);
  if (d.tipo !== 'respaldo-ex3600') throw new Error('El archivo no es un respaldo de la plataforma EX3600.');
  const { tipo, exportado, ...resto } = d;
  return { ...vacio(), ...resto };
}

/** Reduce una foto a JPEG ≤ max px para que quepa en localStorage. */
export function reducirImagen(file, max = 1280, calidad = 0.72) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('No se pudo leer la imagen'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error('Formato de imagen no soportado'));
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', calidad));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
