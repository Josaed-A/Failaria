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
  boom: (t) => ({ h: 1.55 + 0.6 * Math.sin(Math.PI * Math.min(1, t / 0.95)) - 0.45 * t, w: 1.9 - 0.8 * t }),
  brazo: (t) => ({ h: 1.75 - 0.85 * t, w: 1.15 - 0.3 * t }),
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

const BASE_COLOR = [0.11, 0.18, 0.54];
function pintarBase(THREE, geo, fea) {
  if (!fea) return geo;
  const n = geo.attributes.position.count; const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = BASE_COLOR[0]; col[i * 3 + 1] = BASE_COLOR[1]; col[i * 3 + 2] = BASE_COLOR[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo;
}

/** Materiales compartidos por la pala y las piezas sueltas. */
export function materiales(THREE, fea) {
  const amarillo = 0xd9a21b;
  return {
    metal: fea ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.6 }) : new THREE.MeshStandardMaterial({ color: amarillo, metalness: 0.35, roughness: 0.55 }),
    carroceria: new THREE.MeshStandardMaterial({ color: fea ? 0x4a5566 : amarillo, metalness: 0.35, roughness: 0.55 }),
    oscuro: new THREE.MeshStandardMaterial({ color: 0x2b3240, metalness: 0.4, roughness: 0.7 }),
    negro: new THREE.MeshStandardMaterial({ color: 0x1a1e26, metalness: 0.2, roughness: 0.9 }),
    acero: new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.8, roughness: 0.3 }),
    cromo: new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.15 }),
    vidrio: new THREE.MeshStandardMaterial({ color: 0x7fb8e0, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.7 }),
    soldadura: new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.5, roughness: 0.8 }),
  };
}

/**
 * Construye UNA pieza estructural (boom | brazo | cucharon) modelada según los esquemas de assets/esquemas:
 * boom con pie bifurcado, orejas de los cilindros, soporte del cilindro del brazo, horquilla de punta y mamparos;
 * brazo ahusado con orejas en abanico, bujes y horquilla del cucharón; cucharón con concha, placas laterales,
 * rejillas de desgaste, labio, dientes, cuchillas laterales, bujes y orejas del balancín.
 * Devuelve { estructura: meshes con userData.pieza (coloreables por vértice), decor: resto }.
 */
export function construirPieza(THREE, scene, pieza, op = {}) {
  const fea = !!op.fea; const M = op.mat || materiales(THREE, fea);
  const estructura = []; const decor = [];
  const add = (m, parent = scene, est = false) => { parent.add(m); (est ? estructura : decor).push(m); if (est) m.userData.pieza = pieza; return m; };
  const cajaE = (sx, sy, sz, x, y, z, rz = 0, parent = scene, mat = M.metal) => { const m = new THREE.Mesh(pintarBase(THREE, new THREE.BoxGeometry(sx, sy, sz), fea && mat === M.metal), mat); m.position.set(x, y, z); m.rotation.z = rz; return add(m, parent, mat === M.metal); };
  const ejeZ = (x, y, r, largo, mat = M.acero, parent = scene) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, largo, 24), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, 0); return add(m, parent); };
  const bujeE = (x, y, r, largo, parent = scene) => { const m = new THREE.Mesh(pintarBase(THREE, new THREE.CylinderGeometry(r, r, largo, 24), fea), M.metal); m.rotation.x = Math.PI / 2; m.position.set(x, y, 0); return add(m, parent, true); };
  const anillo = (p, tg, h, w, parent = scene) => { // mamparo / cordón transversal
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, h + 0.03, w + 0.03), M.soldadura); m.position.set(p[0], p[1], 0); m.rotation.z = Math.atan2(tg[1], tg[0]); return add(m, parent);
  };

  // Líneas de soldadura: aristas longitudinales de una viga y costuras transversales (mamparos).
  const bordes = (mesh) => { const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), new THREE.LineBasicMaterial({ color: 0x0e1219, transparent: true, opacity: 0.85 })); l.position.copy(mesh.position); l.rotation.copy(mesh.rotation); return add(l, mesh.parent || scene); };
  const costura = (p, tg, h, w, parent = scene) => {
    const n = [-tg[1], tg[0]]; const q = (sy, sz) => new THREE.Vector3(p[0] + n[0] * sy * (h / 2 + 0.012), p[1] + n[1] * sy * (h / 2 + 0.012), sz * (w / 2 + 0.012));
    const g = new THREE.BufferGeometry().setFromPoints([q(1, 1), q(1, -1), q(-1, -1), q(-1, 1), q(1, 1)]);
    return add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x0e1219, transparent: true, opacity: 0.7 })), parent);
  };
  const vigaE = (camino, perfil, N, parent = scene, z = 0) => { const m = new THREE.Mesh(vigaGeometria(THREE, camino, perfil, N, fea), M.metal); m.position.z = z; add(m, parent, true); bordes(m); return m; };
  const bujeDoble = (x, y, r, largo, parent = scene) => { bujeE(x, y, r, largo, parent); const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, largo + 0.3, 24), M.oscuro); m.rotation.x = Math.PI / 2; m.position.set(x, y, 0); add(m, parent); return m; }; // buje con agujero oscuro

  if (pieza === 'boom') {
    // Cuerpo: viga curva desde donde se unen las dos piernas del pie hasta la punta
    const t0 = 0.14;
    vigaE((t) => puntoEnPieza('boom', t0 + (1 - t0) * t), (t) => PERFIL.boom(t0 + (1 - t0) * t), 64);
    for (const t of [0.22, 0.31, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) { const { p, tg } = puntoEnPieza('boom', t); const { h, w } = PERFIL.boom(t); costura(p, tg, h, w); }
    // Pie bifurcado: dos piernas con buje grande cada una (pasadores al bastidor) y un puente entre ellas
    for (const z of [-0.62, 0.62]) {
      vigaE((t) => puntoEnPieza('boom', t * (t0 + 0.02)), (t) => ({ h: PERFIL.boom(t * t0).h * 0.92, w: 0.62 }), 10, scene, z);
      const f = puntoEnPieza('boom', 0.01); const bj = bujeDoble(f.p[0] - 0.1, f.p[1] - 0.25, 0.55, 0.78); bj.position.z = z;
      const anilloPie = new THREE.Mesh(pintarBase(THREE, new THREE.CylinderGeometry(0.55, 0.55, 0.78, 28), fea), M.metal); anilloPie.rotation.x = Math.PI / 2; anilloPie.position.set(f.p[0] - 0.1, f.p[1] - 0.25, z); add(anilloPie, scene, true);
    }
    { const f = puntoEnPieza('boom', 0.06); const af = Math.atan2(f.tg[1], f.tg[0]); cajaE(0.9, PERFIL.boom(0.06).h * 0.55, 0.7, f.p[0], f.p[1] + 0.2, 0, af); }
    // Orejas de los cilindros del boom (bajo el cuerpo, a los lados) con buje pasante
    { const { p, tg } = puntoEnPieza('boom', 0.4); const n = [-tg[1], tg[0]]; const a = Math.atan2(tg[1], tg[0]); const { h, w } = PERFIL.boom(0.4);
      for (const z of [-(w / 2 + 0.1), w / 2 + 0.1]) cajaE(1.3, 0.9, 0.2, p[0] - n[0] * (h / 2 + 0.25), p[1] - n[1] * (h / 2 + 0.25), z, a);
      bujeDoble(p[0] - n[0] * (h / 2 + 0.5), p[1] - n[1] * (h / 2 + 0.5), 0.3, w + 0.45); }
    // Soporte del cilindro del brazo sobre el codo: dos placas inclinadas con buje
    { const { p, tg } = puntoEnPieza('boom', 0.5); const n = [-tg[1], tg[0]]; const a = Math.atan2(tg[1], tg[0]); const { h } = PERFIL.boom(0.5);
      for (const z of [-0.4, 0.4]) cajaE(1.25, 1.05, 0.16, p[0] + n[0] * (h / 2 + 0.45), p[1] + n[1] * (h / 2 + 0.45), z, a + 0.4);
      bujeDoble(p[0] + n[0] * (h / 2 + 0.85), p[1] + n[1] * (h / 2 + 0.85), 0.26, 1.05);
      cajaE(0.4, 0.25, 0.5, p[0] + n[0] * (h / 2 + 0.1) - tg[0] * 1.2, p[1] + n[1] * (h / 2 + 0.1) - tg[1] * 1.2, 0, a); } // soporte de mangueras
    // Punta: horquilla con dos mejillas y buje del pasador del brazo
    { const { p, tg } = puntoEnPieza('boom', 1); const a = Math.atan2(tg[1], tg[0]); const { w } = PERFIL.boom(1);
      for (const z of [-(w / 2 - 0.1), w / 2 - 0.1]) cajaE(1.3, 1.1, 0.22, p[0] + 0.3, p[1] - 0.15, z, a);
      bujeDoble(p[0] + 0.55, p[1] - 0.25, 0.42, w + 0.35); }
  }

  if (pieza === 'brazo') {
    const B0 = PIVOTES.brazo[0], B1 = PIVOTES.brazo[1]; const dB = [B1[0] - B0[0], B1[1] - B0[1]]; const LB = Math.hypot(...dB); const uB = [dB[0] / LB, dB[1] / LB]; const nB = [-uB[1], uB[0]]; const aB = Math.atan2(uB[1], uB[0]);
    // Cuerpo ahusado desde la cabeza (pivote) hasta la horquilla del cucharón
    const cab = [B0[0] - uB[0] * 0.55, B0[1] - uB[1] * 0.55];
    const camino = (t) => ({ p: [cab[0] + (B1[0] - cab[0]) * t, cab[1] + (B1[1] - cab[1]) * t], tg: uB });
    const perfil = (t) => PERFIL.brazo(Math.max(0, (t * (LB + 0.55) - 0.55) / LB));
    vigaE(camino, perfil, 56);
    for (const t of [0.2, 0.34, 0.48, 0.62, 0.76, 0.9]) { const { p } = camino(t); const { h, w } = perfil(t); costura(p, uB, h, w); }
    // Nariz trasera inclinada (anclaje del cilindro del brazo)
    const incl = 0.5; const dN = [Math.cos(aB + Math.PI - incl), Math.sin(aB + Math.PI - incl)]; const nariz = [cab[0] + dN[0] * 1.3, cab[1] + dN[1] * 1.3];
    vigaE((t) => ({ p: [cab[0] + dN[0] * 1.35 * t + uB[0] * 0.1, cab[1] + dN[1] * 1.35 * t + uB[1] * 0.1], tg: dN }), (t) => ({ h: 1.25 - 0.55 * t, w: 1.05 - 0.2 * t }), 12);
    bujeDoble(nariz[0], nariz[1], 0.28, 1.15);
    // Buje del pivote boom–brazo (grande, a ambos lados)
    bujeDoble(B0[0], B0[1], 0.55, 1.5);
    // Abanico de cuatro orejas sobre la placa superior (base del cilindro del cucharón)
    { const m = [B0[0] + uB[0] * 0.9, B0[1] + uB[1] * 0.9]; const { h } = PERFIL.brazo(0.1);
      for (const z of [-0.48, -0.16, 0.16, 0.48]) cajaE(1.2, 0.95, 0.09, m[0] + nB[0] * (h / 2 + 0.4), m[1] + nB[1] * (h / 2 + 0.4), z, aB + 0.3);
      bujeDoble(m[0] + nB[0] * (h / 2 + 0.75) + uB[0] * 0.25, m[1] + nB[1] * (h / 2 + 0.75) + uB[1] * 0.25, 0.2, 1.2); }
    // Orejas del balancín (lado del cucharón) y horquilla con buje del pasador
    { const m = [B0[0] + uB[0] * 3.2, B0[1] + uB[1] * 3.2]; const { h } = PERFIL.brazo(0.55); for (const z of [-0.4, 0.4]) cajaE(0.8, 0.7, 0.12, m[0] + nB[0] * (h / 2 + 0.25), m[1] + nB[1] * (h / 2 + 0.25), z, aB); bujeDoble(m[0] + nB[0] * (h / 2 + 0.5), m[1] + nB[1] * (h / 2 + 0.5), 0.18, 1.0); }
    { const { w } = PERFIL.brazo(1); for (const z of [-(w / 2 + 0.02), w / 2 + 0.02]) cajaE(1.1, 1.0, 0.2, B1[0] - uB[0] * 0.15, B1[1] - uB[1] * 0.15, z, aB); bujeDoble(B1[0], B1[1], 0.4, w + 0.6); }
  }

  if (pieza === 'cucharon') {
    const C = PIVOTES.cucharon[0], D = PIVOTES.cucharon[1];
    const cu = new THREE.Group(); scene.add(cu);
    const ang = Math.atan2(D[1] - C[1], D[0] - C[0]); const Lc = Math.hypot(D[0] - C[0], D[1] - C[1]);
    cu.position.set(C[0], C[1], 0); cu.rotation.z = ang;
    const concha = [[0.15, 0.6], [-0.3, 0.25], [-0.42, -0.3], [-0.1, -0.8], [0.6, -1.08], [1.4, -1.12], [Lc, -0.75]];
    const seg = concha.slice(1).map((q, i) => Math.hypot(q[0] - concha[i][0], q[1] - concha[i][1])); const Lcon = seg.reduce((a, b) => a + b, 0);
    const enConcha = (t) => { let d = t * Lcon; for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const k = Math.min(1, d / seg[i]); const a = concha[i], b = concha[i + 1]; const tg = [(b[0] - a[0]) / seg[i], (b[1] - a[1]) / seg[i]]; return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], tg }; } d -= seg[i]; } };
    add(new THREE.Mesh(vigaGeometria(THREE, enConcha, () => ({ h: 0.16, w: 2.6 }), 44, fea), M.metal), cu, true);
    // Rejillas de desgaste: barras longitudinales sobre la concha, a lo ancho
    for (let z = -1.1; z <= 1.11; z += 0.44) for (let i = 0; i < seg.length; i++) { const a = concha[i], b = concha[i + 1]; const tg = [(b[0] - a[0]) / seg[i], (b[1] - a[1]) / seg[i]]; const n = [tg[1], -tg[0]]; const m = new THREE.Mesh(new THREE.BoxGeometry(seg[i], 0.06, 0.1), M.soldadura); m.position.set((a[0] + b[0]) / 2 + n[0] * 0.1, (a[1] + b[1]) / 2 + n[1] * 0.1, z); m.rotation.z = Math.atan2(tg[1], tg[0]); add(m, cu); }
    // Placas laterales y placas de desgaste laterales
    const lado = new THREE.Shape(); [[0.15, 0.6], [-0.3, 0.25], [-0.42, -0.3], [-0.1, -0.8], [0.6, -1.08], [1.4, -1.12], [Lc, -0.75], [Lc - 0.1, -0.1], [1.3, 0.35]].forEach(([x, y], i) => (i ? lado.lineTo(x, y) : lado.moveTo(x, y)));
    for (const z of [-1.37, 1.37]) { const m = new THREE.Mesh(pintarBase(THREE, new THREE.ExtrudeGeometry(lado, { depth: 0.14, bevelEnabled: false }), fea), M.metal); m.position.z = z - 0.07; add(m, cu, true); bordes(m); }
    for (const z of [-1.5, 1.5]) for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9 - 0.2 * k, 0.05), M.soldadura); m.position.set(0.25 + 0.6 * k, -0.45 - 0.1 * k, z); add(m, cu); }
    // Labio reforzado, dientes y cuchillas laterales
    cajaE(0.3, 0.22, 2.75, Lc - 0.05, -0.75, 0, 0, cu);
    for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.62, 4), M.acero); d.rotation.z = -Math.PI / 2 - 0.25; d.position.set(Lc + 0.24, -0.84, -1.05 + i * 0.42); add(d, cu); }
    for (const z of [-1.42, 1.42]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.08), M.acero); m.position.set(Lc + 0.05, -0.55, z); m.rotation.z = -0.3; add(m, cu); }
    // Bujes de pivote y orejas del balancín (tres pares)
    for (const z of [-0.85, 0.85]) { const b1 = bujeE(0, 0.05, 0.34, 0.5, cu); b1.position.z = z; const e = ejeZ(0, 0.05, 0.22, 0.5, M.acero, cu); e.position.z = z; }
    ejeZ(0, 0.05, 0.2, 2.4, M.acero, cu);
    for (const z of [-0.5, 0, 0.5]) for (const dz of [-0.09, 0.09]) cajaE(0.6, 0.55, 0.1, 0.55, 0.6, z + dz, 0.2, cu);
    bujeE(0.75, 0.8, 0.14, 1.3, cu); ejeZ(0.75, 0.8, 0.09, 1.5, M.acero, cu);
  }
  scene.updateMatrixWorld(true);
  return { estructura, decor };
}

/**
 * Construye la pala completa dentro de `scene`: tren de rodaje, superestructura, las tres piezas
 * estructurales (construirPieza) y los cilindros hidráulicos. Devuelve { estructura, G }.
 */
export function construirPala(THREE, scene, op = {}) {
  const fea = !!op.fea; const M = materiales(THREE, fea);
  const { carroceria, oscuro, negro, acero, cromo, vidrio } = M;
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
  for (const z of [-1.0, 1.0]) caja(1.4, 1.3, 0.3, carroceria, 1.9, 3.05, z); // soporte del pie del boom

  // --- Piezas estructurales ---
  for (const pieza of ['boom', 'brazo', 'cucharon']) estructura.push(...construirPieza(THREE, scene, pieza, { fea, mat: M }).estructura);

  // --- Cilindros hidráulicos ---
  const B0 = PIVOTES.brazo[0], B1 = PIVOTES.brazo[1]; const dB = [B1[0] - B0[0], B1[1] - B0[1]]; const LB = Math.hypot(...dB); const uB = [dB[0] / LB, dB[1] / LB]; const nB = [-uB[1], uB[0]];
  const aB = Math.atan2(uB[1], uB[0]); const cab = [B0[0] - uB[0] * 0.55, B0[1] - uB[1] * 0.55]; const dN = [Math.cos(aB + Math.PI - 0.5), Math.sin(aB + Math.PI - 0.5)]; const nariz = [cab[0] + dN[0] * 1.3, cab[1] + dN[1] * 1.3];
  { const { p, tg } = puntoEnPieza('boom', 0.4); const n = [-tg[1], tg[0]]; const { h, w } = PERFIL.boom(0.4); for (const z of [-(w / 2 + 0.22), w / 2 + 0.22]) hidraulico([2.4, 2.75], [p[0] - n[0] * (h / 2 + 0.5), p[1] - n[1] * (h / 2 + 0.5)], 0.24, z, 0.58); }
  { const { p, tg } = puntoEnPieza('boom', 0.5); const n = [-tg[1], tg[0]]; const { h } = PERFIL.boom(0.5); hidraulico([p[0] + n[0] * (h / 2 + 0.85), p[1] + n[1] * (h / 2 + 0.85)], nariz, 0.22, 0, 0.6); } // cilindro del brazo
  { const m = [B0[0] + uB[0] * 3.2, B0[1] + uB[1] * 3.2]; const hb = PERFIL.brazo(0.55).h; const o = [m[0] + nB[0] * (hb / 2 + 0.5), m[1] + nB[1] * (hb / 2 + 0.5)]; const b0 = [B0[0] + uB[0] * 0.9, B0[1] + uB[1] * 0.9]; const h0 = PERFIL.brazo(0.1).h; hidraulico([b0[0] + nB[0] * (h0 / 2 + 0.75) + uB[0] * 0.25, b0[1] + nB[1] * (h0 / 2 + 0.75) + uB[1] * 0.25], o, 0.19, 0, 0.58);
    const C = PIVOTES.cucharon[0]; const ang = Math.atan2(PIVOTES.cucharon[1][1] - C[1], PIVOTES.cucharon[1][0] - C[0]);
    const lab = [C[0] + Math.cos(ang) * 0.75 - Math.sin(ang) * 0.8, C[1] + Math.sin(ang) * 0.75 + Math.cos(ang) * 0.8]; cil(o, lab, 0.07, acero, 0.35); cil(o, lab, 0.07, acero, -0.35); } // balancín del cucharón

  scene.updateMatrixWorld(true);
  return { estructura, G: PIVOTES, materiales: M };
}

/** Caja envolvente y centro de un conjunto de meshes (coordenadas del mundo). */
export function envolvente(THREE, meshes) {
  const box = new THREE.Box3(); for (const m of meshes) box.expandByObject(m);
  const centro = new THREE.Vector3(); box.getCenter(centro); const tam = new THREE.Vector3(); box.getSize(tam);
  return { box, centro, tam, radio: tam.length() / 2 };
}

/** Esferas de los 12 puntos (coloreadas luego por estado). */
export function crearEsferas(THREE, scene, A, op = {}) {
  const esferas = []; const r = op.radio ?? 0.3;
  for (const a of Object.values(A.puntos)) {
    const pc = a.punto.pos3d || A.cfg.pos3d[a.codigo];
    if (!pc || (op.pieza && pc.pieza !== op.pieza)) continue;
    const pos = posicionPunto(THREE, pc);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000, roughness: 0.3, metalness: 0.1 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat);
    m.position.copy(pos); m.userData = { codigo: a.codigo }; scene.add(m);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
    halo.position.copy(pos); scene.add(halo);
    const et = etiquetaSprite(THREE, a.codigo); et.position.copy(pos).add(new THREE.Vector3(0, r * 2.3, 0)); if (op.pieza) et.scale.multiplyScalar(0.75); scene.add(et);
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
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x202833, 1.0));
  const sol = new THREE.DirectionalLight(0xffffff, 1.7); sol.position.set(10, 18, 12); scene.add(sol);
  const relleno = new THREE.DirectionalLight(0x9fc3ff, 0.55); relleno.position.set(-12, 6, -14); scene.add(relleno);
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
