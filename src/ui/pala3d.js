// Modelo 3D esquemático de la pala (primitivas) con esferas en los 12 puntos coloreadas por estado.
import { COLOR, fMm } from './formato.js';

// Geometría base (unidades ≈ metros). x: hacia adelante, y: arriba, z: lateral.
const G = {
  boom: [[2.4, 3.6], [7.0, 8.6], [10.2, 7.9]],
  brazo: [[10.2, 7.9], [11.6, 1.9]],
  cucharon: [[11.6, 1.9], [13.7, 0.35]],
};

function puntoEnPolilinea(pts, t) {
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let r = t * total;
  for (let i = 0; i < seg.length; i++) {
    if (r <= seg[i] || i === seg.length - 1) { const k = Math.min(1, r / seg[i]); return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]; }
    r -= seg[i];
  }
  return pts.at(-1);
}

/**
 * Construye la pala (primitivas) dentro de `scene`. Con `op.fea` las piezas estructurales
 * (boom, brazo, cucharón) se subdividen y usan colores por vértice para el mapa de daño.
 * Devuelve { estructura: [meshes con pieza], G, materiales }.
 */
export function construirPala(THREE, scene, op = {}) {
  const fea = !!op.fea; const seg = op.segmentos ?? 20;
  const metal = fea
    ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.6 })
    : new THREE.MeshStandardMaterial({ color: 0xd9a21b, metalness: 0.35, roughness: 0.55 });   // amarillo Hitachi
  const carroceria = new THREE.MeshStandardMaterial({ color: fea ? 0x4a5566 : 0xd9a21b, metalness: 0.35, roughness: 0.55 });
  const oscuro = new THREE.MeshStandardMaterial({ color: 0x2b3240, metalness: 0.4, roughness: 0.7 });
  const acero = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.8, roughness: 0.3 });
  const vidrio = new THREE.MeshStandardMaterial({ color: 0x7fb8e0, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.75 });
  const estructura = [];
  const boxGeo = (sx, sy, sz, estructural) => (estructural && fea ? new THREE.BoxGeometry(sx, sy, sz, Math.max(2, Math.round(seg * sx / 4)), 2, 2) : new THREE.BoxGeometry(sx, sy, sz));
  const pintarBase = (geo) => { if (fea) { const n = geo.attributes.position.count; const c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = 0.11; c[i * 3 + 1] = 0.18; c[i * 3 + 2] = 0.54; } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); } };
  const caja = (sx, sy, sz, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); scene.add(m); return m; };
  const barra = (p1, p2, alto, ancho, mat, z = 0, pieza = null) => {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1]; const L = Math.hypot(dx, dy);
    const geo = boxGeo(L, alto, ancho, !!pieza); if (pieza) pintarBase(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, z); m.rotation.z = Math.atan2(dy, dx); scene.add(m);
    if (pieza) { m.userData.pieza = pieza; estructura.push(m); }
    return m;
  };
  const cilindro = (p1, p2, r, mat, z = 0) => {
    const a = new THREE.Vector3(p1[0], p1[1], z), b = new THREE.Vector3(p2[0], p2[1], z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 14), mat);
    m.position.copy(a.clone().add(b).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); scene.add(m); return m;
  };

  // Piso
  const piso = new THREE.Mesh(new THREE.CircleGeometry(26, 48), new THREE.MeshStandardMaterial({ color: 0x1a2232, roughness: 1 }));
  piso.rotation.x = -Math.PI / 2; scene.add(piso);
  const grid = new THREE.GridHelper(40, 40, 0x2a3850, 0x1f2a3d); grid.position.y = 0.01; scene.add(grid);

  // Tren de rodado y tornamesa
  caja(8.4, 1.3, 1.5, oscuro, 0, 0.65, 2.3); caja(8.4, 1.3, 1.5, oscuro, 0, 0.65, -2.3);
  caja(3.2, 0.9, 3.2, oscuro, 0, 1.4, 0);
  const torn = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.4, 32), acero); torn.position.set(0, 2.0, 0); scene.add(torn);
  // Superestructura
  caja(6.6, 2.4, 4.6, carroceria, -0.6, 3.4, 0);
  caja(1.4, 2.0, 4.4, oscuro, -4.4, 3.2, 0); // contrapeso
  caja(1.8, 1.7, 1.6, carroceria, 1.9, 5.45, 1.45); // cabina
  caja(0.05, 1.1, 1.3, vidrio, 2.82, 5.6, 1.45);
  // Boom (dos placas laterales + alma)
  for (const z of [-0.55, 0.55]) { barra(G.boom[0], G.boom[1], 1.2, 0.35, metal, z, 'boom'); barra(G.boom[1], G.boom[2], 1.0, 0.35, metal, z, 'boom'); }
  barra(G.boom[0], G.boom[1], 1.2, 1.1, metal, 0, 'boom'); barra(G.boom[1], G.boom[2], 1.0, 1.1, metal, 0, 'boom');
  // Brazo y cucharón
  barra(G.brazo[0], [G.brazo[0][0] - 0.6, G.brazo[0][1] + 1.0], 0.9, 0.9, metal, 0, 'brazo');
  barra(G.brazo[0], G.brazo[1], 0.95, 0.95, metal, 0, 'brazo');
  const C = G.cucharon[0], D = G.cucharon[1];
  const cu = new THREE.Group(); scene.add(cu);
  const ang = Math.atan2(D[1] - C[1], D[0] - C[0]); const Lc = Math.hypot(D[0] - C[0], D[1] - C[1]);
  const parteCu = (geo, x, y, z) => { pintarBase(geo); const m = new THREE.Mesh(geo, metal); m.position.set(x, y, z); m.userData.pieza = 'cucharon'; cu.add(m); estructura.push(m); return m; };
  parteCu(boxGeo(Lc, 0.18, 2.6, true), Lc / 2, -0.7, 0);          // fondo
  parteCu(boxGeo(0.18, 1.5, 2.6, true), 0, 0, 0);                  // espalda
  for (const z of [-1.3, 1.3]) parteCu(boxGeo(Lc, 1.5, 0.14, true), Lc / 2, 0, z); // lados
  for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.55, 4), acero); d.rotation.z = -Math.PI / 2; d.position.set(Lc + 0.25, -0.7, -1.05 + i * 0.42); cu.add(d); }
  cu.position.set(C[0], C[1], 0); cu.rotation.z = ang;
  // Cilindros hidráulicos
  for (const z of [-1.0, 1.0]) cilindro([2.6, 2.6], [5.6, 6.6], 0.2, acero, z);
  cilindro([5.4, 8.6], [9.6, 9.0], 0.22, acero);
  cilindro([10.0, 8.6], [11.2, 3.1], 0.18, acero, 0.6);
  scene.updateMatrixWorld(true);
  return { estructura, G, materiales: { metal, acero, oscuro } };
}

/** Posición 3D de un punto de inspección según config.pos3d. */
export function posicionPunto(THREE, pc) {
  const base = puntoEnPolilinea(G[pc.pieza], pc.t);
  return new THREE.Vector3(base[0] + pc.off[0], base[1] + pc.off[1], pc.off[2]);
}

/** Etiqueta flotante (sprite) con el código del punto. */
export function etiquetaSprite(THREE, txt) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 48; const g = c.getContext('2d');
  g.fillStyle = 'rgba(12,19,32,.85)'; g.beginPath(); g.roundRect(4, 6, 120, 36, 8); g.fill();
  g.fillStyle = '#e6ebf3'; g.font = 'bold 22px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 64, 25);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.5, 0.56, 1); s.renderOrder = 10; return s;
}

/** Esferas de los 12 puntos (coloreadas luego por estado). */
export function crearEsferas(THREE, scene, A) {
  const esferas = [];
  for (const a of Object.values(A.puntos)) {
    const pc = a.punto.pos3d || A.cfg.pos3d[a.codigo];
    if (!pc) continue;
    const pos = posicionPunto(THREE, pc);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000, roughness: 0.3, metalness: 0.1 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 16), mat);
    m.position.copy(pos); m.userData = { codigo: a.codigo }; scene.add(m);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
    halo.position.copy(pos); scene.add(halo);
    const et = etiquetaSprite(THREE, a.codigo); et.position.copy(pos).add(new THREE.Vector3(0, 0.75, 0)); scene.add(et);
    esferas.push({ m, halo, et, codigo: a.codigo, estado: a.estadoActual, pos, pieza: pc.pieza });
  }
  return esferas;
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
