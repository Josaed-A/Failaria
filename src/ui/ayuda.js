// Icono ⓘ con información adicional: el texto largo sale de la vista y aparece solo al pulsar.
// Uso: `${info('Explicación…')}` dentro de cualquier plantilla; activarInfo() se instala una vez en app.js.
const textos = [];

/** Devuelve el botón ⓘ. El contenido admite HTML simple propio (no de usuario). */
export function info(html, etiqueta = 'Más información') {
  const id = textos.push(html) - 1;
  return `<button type="button" class="info no-print" data-info="${id}" aria-label="${etiqueta}" title="${etiqueta}">i</button>`;
}

let pop = null;
function cerrar() { if (pop) { pop.remove(); pop = null; } }

export function activarInfo() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button.info');
    if (!b) { if (pop && !e.target.closest('.popover')) cerrar(); return; }
    e.preventDefault(); e.stopPropagation();
    if (pop && pop.dataset.de === b.dataset.info) { cerrar(); return; }
    cerrar();
    pop = document.createElement('div');
    pop.className = 'popover'; pop.dataset.de = b.dataset.info; pop.setAttribute('role', 'dialog');
    pop.innerHTML = `<div class="popover-cuerpo">${textos[+b.dataset.info] ?? ''}</div><button class="popover-x" aria-label="Cerrar">×</button>`;
    document.body.appendChild(pop);
    const r = b.getBoundingClientRect(); const W = Math.min(360, window.innerWidth - 24);
    pop.style.width = W + 'px';
    let x = r.left + r.width / 2 - W / 2; x = Math.max(12, Math.min(x, window.innerWidth - W - 12));
    const abajo = r.bottom + 8 + pop.offsetHeight < window.innerHeight;
    pop.style.left = x + 'px';
    pop.style.top = (abajo ? r.bottom + 8 : Math.max(8, r.top - pop.offsetHeight - 8)) + window.scrollY + 'px';
    pop.querySelector('.popover-x').addEventListener('click', cerrar);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
  window.addEventListener('hashchange', cerrar);
}
