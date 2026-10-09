// Piezas de interfaz compartidas entre vistas.
import { esc, fFecha, fMm } from '../ui/formato.js';

export function galeriaHTML(fotos) {
  if (!fotos.length) return '<p class="tenue">Sin fotos registradas.</p>';
  return `<div class="galeria">${fotos.map((f) => `<figure><img src="${esc(f.src)}" alt="${esc(f.pie)}" loading="lazy" data-zoom><figcaption>${esc(f.pie)}</figcaption></figure>`).join('')}</div>`;
}

export function activarGaleria(root) {
  root.querySelectorAll('img[data-zoom]').forEach((img) => img.addEventListener('click', () => {
    const v = document.createElement('div');
    v.className = 'visor'; v.innerHTML = `<img src="${img.src}" alt="${esc(img.alt)}">`;
    v.addEventListener('click', () => v.remove());
    document.addEventListener('keydown', function f(e) { if (e.key === 'Escape') { v.remove(); document.removeEventListener('keydown', f); } });
    document.body.appendChild(v);
  }));
}

/** Botones de decisión para un dato marcado (aceptar / descartar como N/I / corregir). */
export function decisionHTML(r) {
  const q = r.calidad;
  const d = r.decision;
  const estadoTxt = d ? { aceptar: 'Confirmado como real', descartar: 'Descartado (tratado como N/I)', corregir: `Corregido a ${fMm(r.Lef)}` }[d] : (q?.sospechoso ? 'Pendiente de revisión' : 'Informativo');
  return `<div class="decision" data-id="${esc(r.id)}">
    <div class="fila"><b>${estadoTxt}</b></div>
    <div class="fila no-print" style="margin-top:6px">
      <button class="btn chico" data-acc="aceptar" title="El valor es real: usarlo en tendencias y estado">Es real</button>
      <button class="btn chico" data-acc="descartar" title="No es una medición válida: tratar como N/I">Descartar (N/I)</button>
      <span class="fila" style="gap:4px"><input type="number" min="0" step="1" value="${q?.sugerido ?? r.L ?? ''}" style="width:80px" aria-label="Valor corregido (mm)"><button class="btn chico" data-acc="corregir">Corregir</button></span>
      ${d ? '<button class="btn chico" data-acc="reset" title="Volver a marcar como pendiente">Deshacer</button>' : ''}
    </div></div>`;
}

export function activarDecisiones(root, app) {
  root.querySelectorAll('.decision').forEach((box) => box.querySelectorAll('button[data-acc]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = box.dataset.id; const acc = b.dataset.acc;
    if (acc === 'reset') delete app.store.decisiones[id];
    else {
      const dec = { accion: acc, fecha: new Date().toISOString() };
      if (acc === 'corregir') {
        const v = Number(box.querySelector('input').value);
        if (!Number.isFinite(v) || v < 0) { app.toast('Ingrese un valor corregido válido (mm).', true); return; }
        dec.valor = v;
      }
      app.store.decisiones[id] = dec;
    }
    app.guardar(); app.recalcular(); app.render();
    app.toast(acc === 'reset' ? 'Decisión deshecha.' : 'Decisión registrada; tendencias y alertas recalculadas.');
  })));
}

export const linkPunto = (c) => `<a href="#/punto/${c}">${c}</a>`;
export const fechaCorta = fFecha;
