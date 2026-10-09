// Lupa de grieta: vista cercana en 2D de una grieta en el talón de soldadura, con el campo de tensión
// alrededor de las puntas (Irwin), la zona plástica, la longitud crítica y la evolución prevista.
// Arrastrar sobre la lupa aplica un sobreesfuerzo local (igual que tirar de la estructura en 3D).
import { tensionLocal, zonaPlastica, evolucionLocal } from '../falla.js';

const RAMPA = [[0, [27, 47, 138]], [0.2, [30, 167, 216]], [0.4, [46, 196, 106]], [0.6, [242, 210, 58]], [0.8, [255, 122, 26]], [1, [214, 31, 31]]];
function color(v) {
  v = v < 0 ? 0 : v > 1 ? 1 : v; let k = 1; while (k < RAMPA.length - 1 && RAMPA[k][0] < v) k++;
  const [t0, c0] = RAMPA[k - 1]; const [t1, c1] = RAMPA[k]; const f = (v - t0) / (t1 - t0);
  return `rgb(${Math.round(c0[0] + (c1[0] - c0[0]) * f)},${Math.round(c0[1] + (c1[1] - c0[1]) * f)},${Math.round(c0[2] + (c1[2] - c0[2]) * f)})`;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{sMax:number, pxPorS:number, onCarga:(s:number)=>void}} op
 */
export function crearLupa(canvas, op = {}) {
  const g = canvas.getContext('2d');
  const sMax = op.sMax ?? 1.5; const pxPorS = op.pxPorS ?? 160;
  let agarre = null; let sLocal = 0; let ultimo = null;

  canvas.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; agarre = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture?.(e.pointerId); canvas.classList.add('tirando'); });
  canvas.addEventListener('pointermove', (e) => { if (!agarre) return; sLocal = Math.min(sMax, Math.hypot(e.clientX - agarre.x, e.clientY - agarre.y) / pxPorS); agarre.dx = e.clientX - agarre.x; agarre.dy = e.clientY - agarre.y; op.onCarga?.(sLocal); if (ultimo) dibujar(...ultimo); });
  const soltar = () => { if (!agarre) return; agarre = null; sLocal = 0; canvas.classList.remove('tirando'); op.onCarga?.(0); if (ultimo) dibujar(...ultimo); };
  canvas.addEventListener('pointerup', soltar); canvas.addEventListener('pointercancel', soltar);

  /**
   * @param {object} M modelo del punto (falla.modeloPunto)
   * @param {number} a longitud actual (mm)
   * @param {number} s sobreesfuerzo aplicado (del 3D o de la lupa)
   * @param {{Kr:number, Lr:number, falla:boolean}} fad
   * @param {number} horizonteH horas para la evolución prevista
   * @param {boolean} fallado
   */
  function dibujar(M, a, s, fad, horizonteH, fallado) {
    ultimo = [M, a, s, fad, horizonteH, fallado];
    const W = canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1) | 0; const H = canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1) | 0;
    const dpr = window.devicePixelRatio || 1; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = W / dpr, h = H / dpr;
    // Escala: la longitud crítica ocupa el 78 % del ancho; la grieta crece desde el centro.
    const mmPx = (w * 0.78) / M.aCrit; const cx = w / 2, cy = h * 0.56;
    const ev = evolucionLocal(M, Math.max(a, M.aNucleacion), horizonteH, s);
    const aVis = Math.max(a, 0);

    // Placa + campo de tensión por celdas
    g.fillStyle = '#1e2633'; g.fillRect(0, 0, w, h);
    const celda = 6; const tips = [[cx - (aVis * mmPx) / 2, cy], [cx + (aVis * mmPx) / 2, cy]];
    const Kr = Math.max(fad.Kr, 0.05 + 0.6 * s); const rp = zonaPlastica(fad.Kr) * Math.max(aVis, M.aNucleacion) * mmPx;
    for (let y = 0; y < h; y += celda) for (let x = 0; x < w; x += celda) {
      let v = 0.06 + 0.25 * s; // tensión de fondo (nominal + sobreesfuerzo)
      if (aVis > 0) for (const [tx, ty] of tips) { const dx = x + celda / 2 - tx, dy = y + celda / 2 - ty; const r = Math.hypot(dx, dy) / Math.max(1, (aVis * mmPx) / 2); const th = Math.atan2(dy, Math.sign(tx - cx || 1) * dx); v = Math.max(v, tensionLocal(r, th, Kr, 0.03 + 0.05 * s)); }
      g.fillStyle = color(v); g.fillRect(x, y, celda, celda);
    }
    // Cordón de soldadura (horizontal, detrás de la grieta)
    g.fillStyle = 'rgba(70,78,92,.85)'; g.fillRect(0, cy - 9, w, 18);
    g.strokeStyle = 'rgba(120,130,150,.6)'; g.lineWidth = 1; for (let x = 0; x < w; x += 10) { g.beginPath(); g.arc(x, cy, 8, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
    // Zona plástica
    if (aVis > 0 && rp > 2) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.setLineDash([3, 3]); for (const [tx, ty] of tips) { g.beginPath(); g.arc(tx, ty, rp, 0, Math.PI * 2); g.stroke(); } g.setLineDash([]); }
    // Evolución prevista (con y sin carga)
    const ext = (L, col, dash) => { if (L <= aVis) return; g.strokeStyle = col; g.lineWidth = 3; g.setLineDash(dash); g.beginPath(); g.moveTo(cx - (L * mmPx) / 2, cy); g.lineTo(cx - (aVis * mmPx) / 2, cy); g.moveTo(cx + (aVis * mmPx) / 2, cy); g.lineTo(cx + (L * mmPx) / 2, cy); g.stroke(); g.setLineDash([]); };
    ext(Math.min(ev.conCarga, M.aCrit), 'rgba(255,90,90,.9)', [6, 4]); ext(Math.min(ev.sinCarga, M.aCrit), 'rgba(255,255,255,.7)', [2, 4]);
    // Grieta (línea dentada negra)
    if (aVis > 0) {
      g.strokeStyle = fallado ? '#ff2a2a' : '#070707'; g.lineWidth = fallado ? 4 : 2.5; g.beginPath();
      const x0 = cx - (aVis * mmPx) / 2, x1 = cx + (aVis * mmPx) / 2; const n = Math.max(6, Math.round((x1 - x0) / 7));
      for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; const y = cy + (i === 0 || i === n ? 0 : Math.sin(i * 2.7) * 2.5); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    // Marcas de longitud crítica y umbrales
    const marca = (L, col, txt, yy) => { const x0 = cx - (L * mmPx) / 2, x1 = cx + (L * mmPx) / 2; g.strokeStyle = col; g.lineWidth = 1; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x0, yy - 8); g.lineTo(x0, yy + 8); g.moveTo(x1, yy - 8); g.lineTo(x1, yy + 8); g.stroke(); g.setLineDash([]); g.fillStyle = col; g.font = '10px system-ui'; g.textAlign = 'center'; g.fillText(txt, x1, yy - 10); };
    marca(M.punto.caution, '#f2bd4c', `Caution ${M.punto.caution}`, h * 0.2); marca(M.punto.danger, '#ff8080', `Danger ${M.punto.danger}`, h * 0.3); marca(M.aCrit, '#ffffff', `a_c ${M.aCrit}`, h * 0.4);
    // Regla
    const paso = M.aCrit >= 800 ? 200 : 100; g.strokeStyle = 'rgba(255,255,255,.6)'; g.fillStyle = 'rgba(255,255,255,.8)'; g.font = '10px system-ui'; g.textAlign = 'center';
    g.beginPath(); g.moveTo(cx - (M.aCrit * mmPx) / 2, h - 16); g.lineTo(cx + (M.aCrit * mmPx) / 2, h - 16); g.stroke();
    for (let L = -M.aCrit; L <= M.aCrit + 1; L += paso) { const x = cx + (L * mmPx) / 2; g.beginPath(); g.moveTo(x, h - 20); g.lineTo(x, h - 12); g.stroke(); g.fillText(`${Math.abs(L / 2)}`, x, h - 3); }
    // Flecha del esfuerzo local
    if (agarre && sLocal > 0.02) { g.strokeStyle = '#ff3b3b'; g.fillStyle = '#ff3b3b'; g.lineWidth = 3; const L = 20 + 60 * sLocal; const ang = Math.atan2(agarre.dy, agarre.dx); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang) * L, cy + Math.sin(ang) * L); g.stroke(); g.beginPath(); g.arc(cx + Math.cos(ang) * L, cy + Math.sin(ang) * L, 5, 0, Math.PI * 2); g.fill(); }
    // Rótulos
    g.fillStyle = '#e6ebf3'; g.font = 'bold 12px system-ui'; g.textAlign = 'left';
    g.fillText(`${M.codigo} · L = ${Math.round(aVis)} mm${fallado ? ' · FALLA' : ''}`, 8, 16);
    g.font = '11px system-ui'; g.fillStyle = '#cfe3ff';
    g.fillText(`Kr ${fad.Kr.toFixed(2)} · Lr ${fad.Lr.toFixed(2)}${s > 0.02 ? ` · sobreesfuerzo +${Math.round(s * 100)} %` : ''}`, 8, 31);
    g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText(`en +${Math.round(horizonteH)} h: ${Math.round(Math.min(ev.sinCarga, M.aCrit))} mm sin carga`, 8, h - 42);
    if (s > 0.02) { g.fillStyle = '#ff9a9a'; g.fillText(`con +${Math.round(s * 100)} %: ${Math.round(Math.min(ev.conCarga, M.aCrit))} mm · falla en ${Number.isFinite(ev.horasFalla) ? Math.round(ev.horasFalla) + ' h' : '∞'}`, 8, h - 29); }
    g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '10px system-ui'; g.fillText('arrastre aquí para aplicar esfuerzo', w - 8, 16);
  }
  return { dibujar, carga: () => sLocal, destruir() { ultimo = null; } };
}
