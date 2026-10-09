// Persistencia local (localStorage) + importación/exportación. Todos los accesos van en try/catch.

const vacio = () => ({
  version: 1,
  base: null,                                   // modelo de un Excel cargado por el usuario (si reemplaza al del repo)
  agregados: { inspecciones: [], mediciones: [] }, // inspecciones registradas en la plataforma
  fotos: [],                                    // fotos agregadas: { medicionId, codigo, fecha, src(dataURL) }
  decisiones: {},                               // idMedicion → { accion: 'aceptar'|'descartar'|'corregir', valor, fecha }
  ia: null,                                     // último diagnóstico IA { texto, fecha, modelo }
  tareas: [],                                   // planificación de mantenimiento (tablero/calendario)
});

export function cargar(clave) {
  try {
    const s = localStorage.getItem(clave);
    if (s) {
      const d = JSON.parse(s);
      return { ...vacio(), ...d, agregados: { ...vacio().agregados, ...(d.agregados || {}) } };
    }
  } catch (e) { console.warn('No se pudo leer el almacenamiento local', e); }
  return vacio();
}

/** Devuelve null si guardó, o un mensaje de error (p. ej. cuota excedida por fotos). */
export function guardar(clave, datos) {
  try { localStorage.setItem(clave, JSON.stringify(datos)); return null; }
  catch (e) { return e?.name === 'QuotaExceededError' ? 'El almacenamiento del navegador está lleno (fotos muy pesadas). Exporte un respaldo JSON y elimine fotos.' : String(e?.message || e); }
}

export function borrar(clave) { try { localStorage.removeItem(clave); } catch { /* sin almacenamiento */ } }

export function leerPref(clave, def = null) { try { return localStorage.getItem(clave) ?? def; } catch { return def; } }
export function guardarPref(clave, v) { try { if (v === null) localStorage.removeItem(clave); else localStorage.setItem(clave, v); } catch { /* sin almacenamiento */ } }

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
