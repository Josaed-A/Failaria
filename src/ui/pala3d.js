// Modelo 3D de la pala Hitachi EX3600 (backhoe) construido con geometría paramétrica:
// vigas lofteadas (boom curvo y brazo ahusados, cucharón con concha curva), cilindros hidráulicos,
// tren de rodaje con zapatas y superestructura. Esferas en los 12 puntos coloreadas por estado.
import { COLOR, fMm } from './formato.js';

// Trayectorias de las piezas estructurales (unidades ≈ metros). x: adelante, y: arriba, z: lateral.
// Los pivotes coinciden con la versión esquemática anterior para no mover los puntos de config.pos3d.
const PIVOTES = {
  boom: [[2.4, 3.6], [7.0, 8.6], [10.2, 7.9]],
  brazo: [[10.2, 7.9], [11.6, 1.9]],
  cucharon: [[11.6, 1.9], [13.7, 0.35]],
};
export const G = PIVOTES;

// Curva del boom: Bézier cuadrática que pasa por los tres pivotes (control = 2·P1 − (P0+P2)/2).
const BZ = (() => { const [P0, P1, P2] = PIVOTES.boom; return { P0, C: [2 * P1[0] - (P0[0] + P2[0]) / 2, 2 * P1[1] - (P0[1] + P2[1]) / 2], P2 }; })();
const bezier = (u) => [(1 - u) ** 2 * BZ.P0[0] + 2 * (1 - u) * u * BZ.C[0] + u * u * BZ.P2[0], (1 - u) ** 2 * BZ.P0[1] + 2 * (1 - u) * u * BZ.C[1] + u * u * BZ.P2[1]];
// Reparametrización por longitud de arco (t ∈ [0,1] proporcional a la distancia recorrida).
const ARCO = (() => { const pts = []; let L = 0; let prev = bezier(0); for (let i = 0; i <= 200; i++) { const p = bezier(i / 200); L += Math.hypot(p[0] - prev[0], p[1] - prev[1]); pts.push([L, i / 200]); prev = p; } return { L, pts }; })();
const uDeT = (t) => { const d = Math.max(0, Math.min(1, t)) * ARCO.L; let i = 1; while (i < ARCO.pts.length - 1 && ARCO.pts[i][0] < d) i++; const [d0, u0] = ARCO.pts[i - 1], [d1, u1] = ARCO.pts[i]; return u0 + (u1 - u0) * ((d - d0) / Math.max(1e-9, d1 - d0)); };

/** Punto [x,y] y tangente unitaria [tx,ty] de una pieza en la fracción t de su longitud. */
export function puntoEnPieza(pieza, t) {
  if (pieza === 'boom') {
    const u = uDeT(t); const p = bezier(u); const q = bezier(Math.min(1, u + 1e-3)); const r = bezier(Math.max(0, u - 1e-3));
    const tg = [q[0] - r[0], q[1] - r[1]]; const n = Math.hypot(...tg) || 1;
    return { p, tg: [tg[0] / n, tg[1] / n] };
  }
  const [a, b] = PIVOTES[pieza]; const tg = [b[0] - a[0], b[1] - a[1]]; const n = Math.hypot(...tg) || 1;
  return { p: [a[0] + tg[0] * t, a[1] + tg[1] * t], tg: [tg[0] / n, tg[1] / n] };
}

// Sección (alto h, ancho w) de cada pieza a lo largo de su longitud.
export const PERFIL = {
  boom: (t) => ({ h: 1.45 + 0.6 * Math.sin(Math.PI * Math.min(1, t / 0.9)) - 0.35 * t, w: 1.35 - 0.25 * t }),
  brazo: (t) => ({ h: 1.5 - 0.65 * t, w: 1.0 - 0.15 * t }),
  cucharon: () => ({ h: 1.4, w: 2.7 }),
};

/**
 * Posición 3D de un punto de inspección según config.pos3d: se apoya sobre la superficie de la pieza.
 * off = [a lo largo, normal (arriba +), lateral]: la componente dominante decide la cara (lateral o superior/inferior).
 */
export function posicionPunto(THREE, pc) {
  const { p, tg } = puntoEnPieza(pc.pieza, pc.t); const { h, w } = PERFIL[pc.pieza](pc.t);
  const nrm = [-tg[1], tg[0]]; const [oa, on, oz] = pc.off;
  let y = on, z = oz, cara;
  if (Math.abs(oz) >= Math.abs(on)) { cara = 'lado'; z = Math.sign(oz || 1) * (w / 2 + 0.12); y = Math.max(-h / 2 * 0.75, Math.min(h / 2 * 0.75, on)); }
  else { cara = on >= 0 ? 'arriba' : 'abajo'; y = Math.sign(on) * (h / 2 + 0.12); z = Math.max(-w / 2 * 0.7, Math.min(w / 2 * 0.7, oz)); }
  const v = new THREE.Vector3(p[0] + tg[0] * oa + nrm[0] * y, p[1] + tg[1] * oa + nrm[1] * y, z);
  v.cara = cara; v.angulo = Math.atan2(tg[1], tg[0]);
  return v;
}

/** Viga lofteada: sección rectangular (h,w)(t) barrida a lo largo de una trayectoria; caras planas, subdividida. */
function vigaGeometria(THREE, camino, perfil, N = 48, fea = false) {
  const pos = []; const nor = [];
  const quad = (a, b, c, d) => { // a,b,c,d en sentido antihorario visto desde fuera
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const v of [a, b, c, a, c, d]) { pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); }
  };
  const esquinas = (i) => {
    const t = i / N; const { p, tg } = camino(t); const { h, w } = perfil(t); const nrm = [-tg[1], tg[0]];
    const c = (sy, sz) => new THREE.Vector3(p[0] + nrm[0] * sy * h / 2, p[1] + nrm[1] * sy * h / 2, sz * w / 2);
    return { TL: c(1, 1), TR: c(1, -1), BR: c(-1, -1), BL: c(-1, 1) };
  };
  let prev = esquinas(0);
  for (let i = 1; i <= N; i++) {
    const e = esquinas(i);
    quad(prev.TL, e.TL, e.TR, prev.TR);   // arriba
    quad(prev.BR, e.BR, e.BL, prev.BL);   // abajo
    quad(prev.BL, e.BL, e.TL, prev.TL);   // lado +z
    quad(prev.TR, e.TR, e.BR, prev.BR);   // lado −z
    prev = e;
  }
  const e0 = esquinas(0), e1 = esquinas(N);
  quad(e0.TR, e0.BR, e0.BL, e0.TL); quad(e1.TL, e1.BL, e1.BR, e1.TR); // tapas
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (fea) { const n = pos.length / 3; const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = 0.11; col[i * 3 + 1] = 0.18; col[i * 3 + 2] = 0.54; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  return g;
}

/**
 * Construye la pala dentro de `scene`. Con `op.fea` las piezas estructurales (boom, brazo, cucharón)
 * usan colores por vértice para el mapa de daño y el resto va en gris. Devuelve { estructura, G }.
 */
export function construirPala(THREE, scene, op = {}) {
  const fea = !!op.fea;
  const amarillo = 0xd9a21b;
  const metal = fea ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.6 }) : new THREE.MeshStandardMaterial({ color: amarillo, metalness: 0.35, roughness: 0.55 });
  const carroceria = new THREE.MeshStandardMaterial({ color: fea ? 0x4a5566 : amarillo, metalness: 0.35, roughness: 0.55 });
  const oscuro = new THREE.MeshStandardMaterial({ color: 0x2b3240, metalness: 0.4, roughness: 0.7 });
  const negro = new THREE.MeshStandardMaterial({ color: 0x1a1e26, metalness: 0.2, roughness: 0.9 });
  const acero = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.8, roughness: 0.3 });
  const cromo = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.15 });
  const vidrio = new THREE.MeshStandardMaterial({ color: 0x7fb8e0, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.7 });
  const estructura = [];
  const add = (m, parent = scene) => { parent.add(m); return m; };
  const caja = (sx, sy, sz, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); return add(m, parent); };
  const cil = (p1, p2, r, mat, z = 0, parent = scene, z2 = z) => {
    const a = new THREE.Vector3(p1[0], p1[1], z), b = new THREE.Vector3(p2[0], p2[1], z2);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 18), mat);
    m.position.copy(a.clone().add(b).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return add(m, parent);
  };
  const eje = (x, y, r, largo, mat, parent = scene) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, largo, 24), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, 0); return add(m, parent); };
  const hidraulico = (p1, p2, r, z = 0, carrera = 0.55) => { // camisa + vástago cromado
    const m = [p1[0] + (p2[0] - p1[0]) * carrera, p1[1] + (p2[1] - p1[1]) * carrera];
    cil(p1, m, r, acero, z); cil(m, p2, r * 0.55, cromo, z); cil(p1, [p1[0] + (p2[0] - p1[0]) * 0.06, p1[1] + (p2[1] - p1[1]) * 0.06], r * 1.25, oscuro, z);
  };

  // --- Piso ---
  const piso = new THREE.Mesh(new THREE.CircleGeometry(26, 48), new THREE.MeshStandardMaterial({ color: 0x1a2232, roughness: 1 }));
  piso.rotation.x = -Math.PI / 2; add(piso);
  const grid = new THREE.GridHelper(40, 40, 0x2a3850, 0x1f2a3d); grid.position.y = 0.01; add(grid);

  // --- Tren de rodaje: bastidores, zapatas alrededor de un óvalo, rueda motriz, tensora y rodillos ---
  for (const z of [-2.35, 2.35]) {
    caja(6.6, 0.75, 0.9, oscuro, 0, 0.78, z);
    eje(-3.55, 0.72, 0.6, 1.0, oscuro).position.z = z; eje(3.55, 0.72, 0.6, 1.0, oscuro).position.z = z;
    for (let x = -2.8; x <= 2.8; x += 0.8) { const r = eje(x, 0.26, 0.2, 1.05, negro); r.position.z = z; }
    for (let x = -2; x <= 2; x += 2) { const r = eje(x, 1.28, 0.16, 0.9, negro); r.position.z = z; }
    const L = 7.1, R = 0.68, n = 64; const per = 2 * L + 2 * Math.PI * R; // óvalo de las zapatas
    for (let i = 0; i < n; i++) {
      const d = (i / n) * per; let x, y, ang;
      if (d < L) { x = -L / 2 + d; y = 0.72 - R; ang = 0; }
      else if (d < L + Math.PI * R) { const a = (d - L) / R; x = L / 2 + R * Math.sin(a); y = 0.72 - R * Math.cos(a); ang = a; }
      else if (d < 2 * L + Math.PI * R) { x = L / 2 - (d - L - Math.PI * R); y = 0.72 + R; ang = Math.PI; }
      else { const a = (d - 2 * L - Math.PI * R) / R; x = -L / 2 - R * Math.sin(a); y = 0.72 + R * Math.cos(a); ang = Math.PI + a; }
      const z1 = new THREE.Mesh(new THREE.BoxGeometry(per / n * 0.9, 0.13, 1.4), negro); z1.position.set(x, y, z); z1.rotation.z = ang; add(z1);
      const garra = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 1.3), oscuro); garra.position.set(x, y + (ang > Math.PI / 2 && ang < 3 * Math.PI / 2 ? 0.1 : -0.1) * Math.cos(ang), z); garra.rotation.z = ang; add(garra);
    }
  }
  caja(4.0, 1.1, 3.9, oscuro, 0, 1.55, 0);                     // carro central
  eje(0, 2.12, 2.1, 0.32, acero).rotation.x = 0;              // corona de giro
  const corona = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.32, 48), acero); corona.position.set(0, 2.12, 0); add(corona);

  // --- Superestructura: plataforma, casa de máquinas, contrapeso, cabina, pasarelas ---
  caja(7.6, 0.35, 5.2, carroceria, -0.8, 2.45, 0);            // plataforma
  caja(4.9, 2.3, 4.6, carroceria, -1.9, 3.75, 0);             // casa de máquinas
  caja(1.7, 2.4, 4.8, oscuro, -5.2, 3.75, 0);                 // contrapeso
  caja(1.2, 0.08, 3.6, carroceria, -1.9, 4.95, 0);            // techo
  for (const z of [-1.2, 1.2]) cil([-2.6, 4.9], [-2.6, 5.9], 0.12, oscuro, z); // escapes
  caja(1.95, 2.1, 1.8, carroceria, 1.9, 3.7, 1.55);           // cabina
  caja(0.05, 1.3, 1.5, vidrio, 2.9, 3.95, 1.55);              // parabrisas
  caja(1.5, 1.1, 0.05, vidrio, 1.95, 4.05, 2.47);             // ventana lateral
  caja(0.05, 1.1, 1.5, vidrio, 0.9, 4.05, 1.55);              // ventana trasera
  caja(1.5, 0.6, 1.8, carroceria, 1.9, 2.95, -1.6);           // tanque hidráulico
  for (const [x, z] of [[-4.3, 2.7], [-4.3, -2.7], [2.6, -2.7], [0.5, -2.7], [-2, -2.7], [2.6, 2.8]]) { cil([x, 2.6], [x, 3.6], 0.03, acero, z); } // postes de barandas
  cil([-4.3, 3.6], [2.6, 3.6], 0.03, acero, -2.7); cil([-4.3, 3.6], [-4.3, 3.6], 0.03, acero, 2.7, scene, -2.7); cil([-4.3, 3.1], [2.6, 3.1], 0.03, acero, -2.7);
  // Pie del boom (soporte en A)
  for (const z of [-0.85, 0.85]) caja(1.3, 1.2, 0.35, carroceria, 2.0, 3.1, z);
  eje(2.4, 3.6, 0.3, 2.1, acero);

  // --- Boom curvo (viga lofteada) con refuerzos y orejas ---
  const vigaMesh = (pieza, camino, perfil, N) => { const m = new THREE.Mesh(vigaGeometria(THREE, camino, perfil, N, fea), metal); m.userData.pieza = pieza; estructura.push(m); return add(m); };
  vigaMesh('boom', (t) => puntoEnPieza('boom', t), PERFIL.boom, 64);
  { const { p } = puntoEnPieza('boom', 0.5); eje(p[0], p[1] + 0.95, 0.22, 1.6, acero); } // orejas del cilindro del brazo
  { const { p, tg } = puntoEnPieza('boom', 0.42); const n = [-tg[1], tg[0]]; for (const z of [-1.05, 1.05]) { const o = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.18), carroceria); o.position.set(p[0] - n[0] * 0.95, p[1] - n[1] * 0.95, z); o.rotation.z = Math.atan2(tg[1], tg[0]); add(o); } } // orejas de los cilindros del boom
  eje(10.2, 7.9, 0.3, 1.5, acero);                             // pasador boom–brazo

  // --- Brazo (stick): se prolonga detrás del pivote para el cilindro del brazo ---
  const B0 = PIVOTES.brazo[0], B1 = PIVOTES.brazo[1]; const dB = [B1[0] - B0[0], B1[1] - B0[1]]; const LB = Math.hypot(...dB); const uB = [dB[0] / LB, dB[1] / LB];
  const ext = 1.25; const atras = [B0[0] - uB[0] * ext, B0[1] - uB[1] * ext];
  vigaMesh('brazo', (t) => ({ p: [atras[0] + (B1[0] - atras[0]) * t, atras[1] + (B1[1] - atras[1]) * t], tg: uB }), (t) => PERFIL.brazo(Math.max(0, (t * (LB + ext) - ext) / LB)), 48);
  eje(atras[0], atras[1], 0.2, 1.3, acero);
  eje(B1[0], B1[1], 0.25, 2.2, acero);                         // pasador brazo–cucharón
  { const m = [B0[0] + uB[0] * 2.9, B0[1] + uB[1] * 2.9]; const n = [-uB[1], uB[0]]; const o = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.9), carroceria); o.position.set(m[0] + n[0] * 0.7, m[1] + n[1] * 0.7, 0); o.rotation.z = Math.atan2(uB[1], uB[0]); add(o); } // oreja del balancín

  // --- Cucharón: concha curva + placas laterales + dientes, en un grupo orientado pivote → labio ---
  const C = PIVOTES.cucharon[0], D = PIVOTES.cucharon[1];
  const cu = new THREE.Group(); add(cu);
  const ang = Math.atan2(D[1] - C[1], D[0] - C[0]); const Lc = Math.hypot(D[0] - C[0], D[1] - C[1]);
  cu.position.set(C[0], C[1], 0); cu.rotation.z = ang;
  const concha = [[0.15, 0.6], [-0.3, 0.25], [-0.42, -0.3], [-0.1, -0.8], [0.6, -1.08], [1.4, -1.12], [Lc, -0.75]]; // camino local de la concha
  const seg = concha.slice(1).map((q, i) => Math.hypot(q[0] - concha[i][0], q[1] - concha[i][1])); const Lcon = seg.reduce((a, b) => a + b, 0);
  const enConcha = (t) => { let d = t * Lcon; for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const k = Math.min(1, d / seg[i]); const a = concha[i], b = concha[i + 1]; const tg = [(b[0] - a[0]) / seg[i], (b[1] - a[1]) / seg[i]]; return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], tg }; } d -= seg[i]; } };
  { const m = new THREE.Mesh(vigaGeometria(THREE, enConcha, () => ({ h: 0.16, w: 2.6 }), 40, fea), metal); m.userData.pieza = 'cucharon'; estructura.push(m); cu.add(m); }
  const lado = new THREE.Shape(); [[0.15, 0.6], [-0.3, 0.25], [-0.42, -0.3], [-0.1, -0.8], [0.6, -1.08], [1.4, -1.12], [Lc, -0.75], [Lc - 0.1, -0.1], [1.3, 0.35]].forEach(([x, y], i) => (i ? lado.lineTo(x, y) : lado.moveTo(x, y)));
  for (const z of [-1.37, 1.37]) { const g = new THREE.ExtrudeGeometry(lado, { depth: 0.14, bevelEnabled: false }); if (fea) { const n = g.attributes.position.count; const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = 0.11; col[i * 3 + 1] = 0.18; col[i * 3 + 2] = 0.54; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); } const m = new THREE.Mesh(g, metal); m.position.z = z - 0.07; m.userData.pieza = 'cucharon'; estructura.push(m); cu.add(m); }
  for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 4), acero); d.rotation.z = -Math.PI / 2 - 0.25; d.position.set(Lc + 0.22, -0.82, -1.05 + i * 0.42); cu.add(d); }
  caja(0.5, 0.5, 2.0, carroceria, 0.1, 0.1, 0, cu);           // bujes de pivote
  caja(0.5, 0.45, 1.2, carroceria, 0.55, 0.55, 0, cu);         // oreja del balancín

  // --- Cilindros hidráulicos ---
  for (const z of [-1.05, 1.05]) { const { p, tg } = puntoEnPieza('boom', 0.42); const n = [-tg[1], tg[0]]; hidraulico([2.4, 2.75], [p[0] - n[0] * 0.95, p[1] - n[1] * 0.95], 0.24, z, 0.58); }
  { const { p } = puntoEnPieza('boom', 0.5); hidraulico([p[0], p[1] + 0.95], atras, 0.22, 0, 0.6); }                       // cilindro del brazo
  { const m = [B0[0] + uB[0] * 2.9, B0[1] + uB[1] * 2.9]; const n = [-uB[1], uB[0]]; const o = [m[0] + n[0] * 0.75, m[1] + n[1] * 0.75]; hidraulico([B0[0] + uB[0] * 0.35 + n[0] * 0.95, B0[1] + uB[1] * 0.35 + n[1] * 0.95], o, 0.19, 0, 0.58);
    const lab = [C[0] + Math.cos(ang) * 0.55 - Math.sin(ang) * 0.55, C[1] + Math.sin(ang) * 0.55 + Math.cos(ang) * 0.55]; cil(o, lab, 0.07, acero, 0.35); cil(o, lab, 0.07, acero, -0.35); } // balancín del cucharón

  scene.updateMatrixWorld(true);
  return { estructura, G: PIVOTES, materiales: { metal, acero, oscuro } };
}

/** Esferas de los 12 puntos (coloreadas luego por estado). */
export function crearEsferas(THREE, scene, A) {
  const esferas = [];
  for (const a of Object.values(A.puntos)) {
    const pc = a.punto.pos3d || A.cfg.pos3d[a.codigo];
    if (!pc) continue;
    const pos = posicionPunto(THREE, pc);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000, roughness: 0.3, metalness: 0.1 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), mat);
    m.position.copy(pos); m.userData = { codigo: a.codigo }; scene.add(m);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
    halo.position.copy(pos); scene.add(halo);
    const et = etiquetaSprite(THREE, a.codigo); et.position.copy(pos).add(new THREE.Vector3(0, 0.7, 0)); scene.add(et);
    esferas.push({ m, halo, et, codigo: a.codigo, estado: a.estadoActual, pos, pieza: pc.pieza, cara: pos.cara, angulo: pos.angulo });
  }
  return esferas;
}

/** Etiqueta flotante (sprite) con el código del punto. */
export function etiquetaSprite(THREE, txt) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 48; const g = c.getContext('2d');
  g.fillStyle = 'rgba(12,19,32,.85)'; g.beginPath(); g.roundRect(4, 6, 120, 36, 8); g.fill();
  g.fillStyle = '#e6ebf3'; g.font = 'bold 22px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 64, 25);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.5, 0.56, 1); s.renderOrder = 10; return s;
}

/** Luces y cámara comunes a los visores 3D. */
export function escenaBase(THREE, OrbitControls, cont, op = {}) {
  const w = () => cont.clientWidth || 600; const h = () => cont.clientHeight || 400;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w(), h());
  cont.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(38, w() / h(), 0.1, 200);
  cam.position.set(...(op.camara || [15, 11, 27]));
  const ctrl = new OrbitControls(cam, renderer.domElement);
  ctrl.target.set(5.5, 4, 0); ctrl.enableDamping = true; ctrl.maxDistance = 45; ctrl.minDistance = 6; ctrl.maxPolarAngle = Math.PI * 0.49;
  ctrl.update();
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x202833, 1.1));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6); sol.position.set(10, 18, 12); scene.add(sol);
  const ro = new ResizeObserver(() => { renderer.setSize(w(), h()); cam.aspect = w() / h(); cam.updateProjectionMatrix(); });
  ro.observe(cont);
  return { renderer, scene, cam, ctrl, ro, w, h };
}

export async function crearPala3D(cont, A, op = {}) {
  const THREE = await import('three');
  const { OrbitControls } = await import('../../vendor/OrbitControls.js');
  const { renderer, scene, cam, ctrl, ro } = escenaBase(THREE, OrbitControls, cont);
  construirPala(THREE, scene, {});

  // Esferas de los puntos
  const esferas = crearEsferas(THREE, scene, A);

  function actualizar(estados) {
    for (const e of esferas) {
      const est = estados?.[e.codigo]?.estado ?? A.puntos[e.codigo].estadoActual;
      e.estado = est;
      const col = new THREE.Color(COLOR[est]);
      e.m.material.color.copy(col); e.m.material.emissive.copy(col).multiplyScalar(est === 'Normal' || est === 'N/I' ? 0.15 : 0.45);
      e.halo.material.color.copy(col); e.halo.visible = est === 'Alerta' || est === 'Crítico';
      e.L = estados?.[e.codigo]?.L ?? A.puntos[e.codigo].ultimoValido?.Lef;
    }
  }
  actualizar(null);

  // Interacción
  const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2();
  const tip = document.createElement('div'); tip.className = 'tip'; cont.appendChild(tip);
  const pick = (ev) => {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, cam);
    const hit = ray.intersectObjects(esferas.map((e) => e.m))[0];
    return hit ? { e: esferas.find((x) => x.m === hit.object), x: ev.clientX - r.left, y: ev.clientY - r.top } : null;
  };
  const onMove = (ev) => {
    const p = pick(ev);
    renderer.domElement.style.cursor = p ? 'pointer' : 'grab';
    if (p) {
      const pt = A.puntos[p.e.codigo].punto;
      tip.innerHTML = `<b>${p.e.codigo}</b> · ${pt.descripcion}<br>${fMm(p.e.L)} · <span style="color:${COLOR[p.e.estado]}">${p.e.estado}</span>`;
      tip.style.display = 'block'; tip.style.left = Math.min(p.x + 14, cont.clientWidth - 260) + 'px'; tip.style.top = (p.y + 12) + 'px';
    } else tip.style.display = 'none';
  };
  let down = null;
  const onDown = (ev) => { down = [ev.clientX, ev.clientY]; };
  const onUp = (ev) => {
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 5) return;
    const p = pick(ev); if (p && op.onClick) op.onClick(p.e.codigo);
  };
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);


  let vivo = true; const t0 = performance.now();
  (function loop() {
    if (!vivo) return;
    const t = (performance.now() - t0) / 1000;
    for (const e of esferas) if (e.halo.visible) { const k = 1 + ((t * (e.estado === 'Crítico' ? 1.6 : 0.9)) % 1) * 1.6; e.halo.scale.setScalar(k); e.halo.material.opacity = 0.35 * (1 - (k - 1) / 1.6); }
    ctrl.update(); renderer.render(scene, cam);
    requestAnimationFrame(loop);
  })();

  return {
    actualizar,
    destruir() { vivo = false; ro.disconnect(); ctrl.dispose(); renderer.dispose(); scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.map?.dispose?.(); o.material?.dispose?.(); }); cont.innerHTML = ''; },
  };
}
