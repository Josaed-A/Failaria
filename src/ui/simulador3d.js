// Visor 3D del simulador de falla: mapa de daño tipo FEA (colores por vértice), grietas a escala
// real sobre la estructura y «tirar» con el mouse para aplicar un sobreesfuerzo local.
import { COLOR, fMm } from './formato.js';
import { construirPala, construirPieza, crearEsferas, envolvente, escenaBase } from './pala3d.js';

// Rampa de color tipo FEA: azul (sin daño) → cian → verde → amarillo → naranja → rojo (crítico).
const RAMPA = [[0, 0x1b2f8a], [0.2, 0x1ea7d8], [0.4, 0x2ec46a], [0.6, 0xf2d23a], [0.8, 0xff7a1a], [1, 0xd61f1f]].map(([t, c]) => [t, [(c >> 16) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]]);
function colorFEA(v, out, i) {
  v = v < 0 ? 0 : v > 1 ? 1 : v;
  let k = 1; while (k < RAMPA.length - 1 && RAMPA[k][0] < v) k++;
  const [t0, c0] = RAMPA[k - 1]; const [t1, c1] = RAMPA[k]; const f = (v - t0) / (t1 - t0);
  out[i] = c0[0] + (c1[0] - c0[0]) * f; out[i + 1] = c0[1] + (c1[1] - c0[1]) * f; out[i + 2] = c0[2] + (c1[2] - c0[2]) * f;
}

/**
 * @param {HTMLElement} cont
 * @param {object} A análisis del equipo
 * @param {{radio:number, sMax:number, pxPorS:number, pieza?:'general'|'boom'|'brazo'|'cucharon', onClick?:(codigo)=>void}} op
 */
export async function crearSimulador3D(cont, A, op = {}) {
  const THREE = await import('three');
  const { OrbitControls } = await import('../../vendor/OrbitControls.js');
  const pieza = op.pieza && op.pieza !== 'general' ? op.pieza : null;
  const { renderer, scene, cam, ctrl, ro } = escenaBase(THREE, OrbitControls, cont, { camara: [14, 9, 24] });
  const pala = pieza ? construirPieza(THREE, scene, pieza, { fea: true }) : construirPala(THREE, scene, { fea: true });
  const esferas = crearEsferas(THREE, scene, A, pieza ? { pieza, radio: 0.24 } : {});
  // Modo pieza: encuadrar la pieza sola (sin piso) y una rejilla tenue debajo.
  const env = envolvente(THREE, pala.estructura);
  const DIR = { boom: [0.35, 0.5, 1], brazo: [1, 0.35, 0.9], cucharon: [1, 0.7, 0.9] };
  const dirGeneral = () => new THREE.Vector3(...(DIR[pieza] || [0.55, 0.5, 1])).normalize();
  const distGeneral = () => (pieza ? (env.radio * 1.1) / Math.sin((cam.fov * Math.PI) / 360) * Math.max(1, (cam.aspect < 1 ? 1 / cam.aspect : 1)) : 30);
  if (pieza) {
    const grid = new THREE.GridHelper(Math.ceil(env.radio * 3), Math.ceil(env.radio * 3), 0x2a3850, 0x1f2a3d); grid.position.set(env.centro.x, env.box.min.y - 0.4, env.centro.z); scene.add(grid);
    ctrl.target.copy(env.centro); ctrl.minDistance = 1.5; ctrl.maxDistance = env.radio * 6; ctrl.maxPolarAngle = Math.PI;
    cam.position.copy(env.centro).add(dirGeneral().multiplyScalar(distGeneral())); ctrl.update();
  }
  // Enfoque suave hacia un punto (cámara y objetivo interpolados en el bucle).
  let enfoque = null;
  const radio = op.radio ?? 1.6; const sMax = op.sMax ?? 2; const pxPorS = op.pxPorS ?? 220;

  // Posiciones de vértices en coordenadas del mundo + daño permanente acumulado por el mouse.
  const mallas = pala.estructura.map((m) => {
    const pos = m.geometry.attributes.position; const n = pos.count;
    const mundo = new Float32Array(n * 3); const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); mundo[i * 3] = v.x; mundo[i * 3 + 1] = v.y; mundo[i * 3 + 2] = v.z; }
    return { m, n, mundo, dano: new Float32Array(n), color: m.geometry.attributes.color };
  });

  // Grietas a escala real (1 mm = 0,001 m) perpendiculares al eje de la pieza.
  const grietas = {};
  for (const e of esferas) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(1, 0.07, 0.07), new THREE.MeshStandardMaterial({ color: 0x120404, emissive: 0x3a0000, roughness: 0.9 }));
    g.position.copy(e.pos);
    if (e.cara === 'lado') g.rotation.z = e.angulo + Math.PI / 2; // en la placa lateral, transversal al eje de la pieza
    else { g.rotation.y = Math.PI / 2; g.rotation.x = 0; }      // en la cara superior/inferior, a lo ancho
    g.visible = false; g.renderOrder = 5; scene.add(g);
    grietas[e.codigo] = g;
  }

  // Flecha del esfuerzo aplicado con el mouse.
  const flecha = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, 0xff3b3b, 0.45, 0.28);
  flecha.visible = false; scene.add(flecha);
  const marca = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3b3b })); marca.visible = false; scene.add(marca);

  const estado = { sev: {}, fallado: {}, L: {}, carga: { s: 0, punto: null, dir: null } };
  let tirarActivo = true;

  function actualizar(est) {
    for (const e of esferas) {
      const x = est?.[e.codigo]; if (!x) continue;
      estado.sev[e.codigo] = x.severidad; estado.fallado[e.codigo] = x.fallado; estado.L[e.codigo] = x.L; e.estado = x.estado; e.L = x.L; e.fallado = x.fallado;
      const col = new THREE.Color(x.fallado ? '#000000' : COLOR[x.estado]);
      e.m.material.color.copy(col); e.m.material.emissive.set(x.fallado ? '#ff2020' : COLOR[x.estado]).multiplyScalar(x.fallado ? 0.9 : x.estado === 'Normal' || x.estado === 'N/I' ? 0.15 : 0.45);
      e.halo.material.color.set(x.fallado ? '#ff2020' : COLOR[x.estado]); e.halo.visible = x.estado === 'Alerta' || x.estado === 'Crítico' || x.fallado;
      const g = grietas[e.codigo]; const L = Math.max(0, x.L) / 1000;
      g.visible = L > 0.02; g.scale.x = Math.max(0.05, L); g.material.emissive.setRGB(0.25 + 0.75 * x.severidad, 0, 0);
    }
    pintar();
  }

  function pintar(dt = 0) {
    const c = estado.carga; const r2 = 2 * radio * radio;
    for (const M of mallas) {
      const col = M.color.array; const w = M.mundo;
      for (let i = 0; i < M.n; i++) {
        const x = w[i * 3], y = w[i * 3 + 1], z = w[i * 3 + 2];
        let v = M.dano[i];
        for (const e of esferas) {
          const s = estado.sev[e.codigo] || 0; if (s <= 0.01) continue;
          const ri = 0.7 + 1.4 * s; const d2 = (x - e.pos.x) ** 2 + (y - e.pos.y) ** 2 + (z - e.pos.z) ** 2;
          const g = s * Math.exp(-d2 / (2 * ri * ri)); if (g > v) v = g;
        }
        if (c.s > 0 && c.punto) {
          const d2 = (x - c.punto.x) ** 2 + (y - c.punto.y) ** 2 + (z - c.punto.z) ** 2;
          const g = Math.exp(-d2 / r2);
          v += 0.5 * c.s * g;
          if (dt > 0) M.dano[i] = Math.min(0.85, M.dano[i] + 0.05 * c.s * g * dt); // daño permanente por sobrecarga
        }
        colorFEA(v, col, i * 3);
      }
      M.color.needsUpdate = true;
    }
  }

  // --- Interacción: hover/clic en esferas, tirar de la estructura ---
  const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2();
  const tip = document.createElement('div'); tip.className = 'tip'; cont.appendChild(tip);
  const aNDC = (ev) => { const r = renderer.domElement.getBoundingClientRect(); ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, cam); return r; };
  let agarre = null; let down = null;
  const onDown = (ev) => {
    const r = aNDC(ev); down = [ev.clientX, ev.clientY];
    if (!tirarActivo || ev.button !== 0) return;
    const hitEsf = ray.intersectObjects(esferas.map((e) => e.m))[0];
    if (hitEsf) return; // clic en esfera = seleccionar punto
    const hit = ray.intersectObjects(pala.estructura)[0];
    if (!hit) return;
    agarre = { punto: hit.point.clone(), x0: ev.clientX, y0: ev.clientY, pieza: hit.object.userData.pieza };
    ctrl.enabled = false; cont.classList.add('tirando');
    renderer.domElement.setPointerCapture?.(ev.pointerId);
    marca.position.copy(agarre.punto); marca.visible = true;
    estado.carga = { s: 0, punto: agarre.punto, dir: null, pieza: agarre.pieza };
  };
  const onMove = (ev) => {
    if (agarre) {
      const dx = ev.clientX - agarre.x0, dy = ev.clientY - agarre.y0;
      const s = Math.min(sMax, Math.hypot(dx, dy) / pxPorS);
      const der = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0); const arr = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const dir = der.multiplyScalar(dx).add(arr.multiplyScalar(-dy)); if (dir.lengthSq() > 0) dir.normalize();
      estado.carga = { s, punto: agarre.punto, dir, pieza: agarre.pieza };
      flecha.visible = s > 0.02; flecha.position.copy(agarre.punto); if (s > 0.02) flecha.setDirection(dir); flecha.setLength(0.6 + 2.2 * s, 0.45, 0.28);
      flecha.setColor(new THREE.Color().setHSL(0.02 - 0.02 * (s / sMax), 1, 0.5));
      return;
    }
    const r = aNDC(ev);
    const hit = ray.intersectObjects(esferas.map((e) => e.m))[0];
    renderer.domElement.style.cursor = hit ? 'pointer' : tirarActivo ? 'grab' : 'move';
    if (hit) {
      const e = esferas.find((x) => x.m === hit.object); const pt = A.puntos[e.codigo].punto;
      tip.innerHTML = `<b>${e.codigo}</b> · ${pt.descripcion}<br>${fMm(e.L)} · <span style="color:${e.fallado ? '#ff8080' : COLOR[e.estado]}">${e.fallado ? 'FALLA' : e.estado}</span>`;
      tip.style.display = 'block'; tip.style.left = Math.min(ev.clientX - r.left + 14, cont.clientWidth - 260) + 'px'; tip.style.top = (ev.clientY - r.top + 12) + 'px';
    } else tip.style.display = 'none';
  };
  const soltar = () => {
    if (!agarre) return;
    agarre = null; estado.carga = { s: 0, punto: null, dir: null }; ctrl.enabled = true; cont.classList.remove('tirando');
    flecha.visible = false; marca.visible = false; pintar();
  };
  const onUp = (ev) => {
    const eraAgarre = !!agarre; soltar();
    if (eraAgarre || !down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 5) return;
    aNDC(ev); const hit = ray.intersectObjects(esferas.map((e) => e.m))[0];
    if (hit && op.onClick) op.onClick(esferas.find((x) => x.m === hit.object).codigo);
  };
  const el = renderer.domElement;
  el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', soltar); el.addEventListener('pointerleave', (e) => { if (!agarre) tip.style.display = 'none'; });
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  // Bucle de render: halos y daño permanente mientras se tira.
  let vivo = true; let tPrev = performance.now(); const t0 = tPrev;
  (function loop() {
    if (!vivo) return;
    const now = performance.now(); const dt = Math.min(0.1, (now - tPrev) / 1000); tPrev = now; const t = (now - t0) / 1000;
    for (const e of esferas) if (e.halo.visible) { const k = 1 + ((t * (e.fallado ? 2.4 : e.estado === 'Crítico' ? 1.6 : 0.9)) % 1) * 1.6; e.halo.scale.setScalar(k); e.halo.material.opacity = 0.35 * (1 - (k - 1) / 1.6); }
    if (estado.carga.s > 0) pintar(dt);
    if (enfoque) { const k = Math.min(1, dt * 4); ctrl.target.lerp(enfoque.objetivo, k); cam.position.lerp(enfoque.camara, k); if (cam.position.distanceTo(enfoque.camara) < 0.05) enfoque = null; }
    ctrl.update(); renderer.render(scene, cam);
    requestAnimationFrame(loop);
  })();

  return {
    actualizar,
    /** Sobreesfuerzo actual del mouse y distancia a cada punto (m). */
    carga() {
      const c = estado.carga; if (!(c.s > 0) || !c.punto) return { s: 0, distancias: {} };
      const distancias = {}; for (const e of esferas) distancias[e.codigo] = e.pos.distanceTo(c.punto);
      return { s: c.s, pieza: c.pieza, distancias };
    },
    tirar(on) { tirarActivo = on; if (!on) soltar(); },
    /** Lleva la cámara a un punto (distancia en m) o, sin código, al encuadre general. */
    enfocar(codigo, distancia = 4.5) {
      const e = esferas.find((x) => x.codigo === codigo);
      if (!e) { enfoque = { objetivo: pieza ? env.centro.clone() : new THREE.Vector3(5.5, 4, 0), camara: (pieza ? env.centro.clone() : new THREE.Vector3(5.5, 4, 0)).add(dirGeneral().multiplyScalar(distGeneral())) }; return; }
      const dir = new THREE.Vector3(e.cara === 'lado' ? 0.35 : 0.6, e.cara === 'abajo' ? -0.6 : 0.55, e.cara === 'lado' ? Math.sign(e.pos.z || 1) * 1 : 0.7).normalize();
      enfoque = { objetivo: e.pos.clone(), camara: e.pos.clone().add(dir.multiplyScalar(distancia)) };
    },
    puntos: esferas.map((e) => e.codigo),
    limpiarDano() { for (const M of mallas) M.dano.fill(0); pintar(); },
    destruir() { vivo = false; ro.disconnect(); ctrl.dispose(); renderer.dispose(); scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.map?.dispose?.(); o.material?.dispose?.(); }); cont.innerHTML = ''; },
  };
}
