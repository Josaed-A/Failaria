// Vista IA: diagnóstico asistido por IA a partir del estado calculado por la plataforma.
import { analizarConClaude, construirPrompt, mdSeguro, MODELO_IA } from '../ia.js';
import { leerPref, guardarPref } from '../almacen.js';
import { esc, fFecha } from '../ui/formato.js';

const CLAVE_PREF = 'ex3600.apikey';

export function render(root, app) {
  const A = app.A; const cfg = app.cfg;
  app.migas([{ t: 'Flota', h: '#/flota' }, { t: `Equipo ${A.modelo.equipo.id}`, h: `#/equipo/${A.modelo.equipo.id}` }, { t: 'Análisis con IA' }]);
  let foco = '';
  const prompt = () => construirPrompt(A, foco);
  const guardada = leerPref(CLAVE_PREF, '');
  const ia = app.store.ia;

  root.innerHTML = `
  <div class="cabecera"><div><h1>Análisis con IA</h1><p>La plataforma arma un prompt estructurado con el estado del equipo (JSON compacto: puntos, tendencias, alertas, calidad de datos). Úselo en Copilot/Claude o llame directamente a la API de Claude.</p></div></div>
  <div class="rejilla c2">
    <div class="panel">
      <h2>1 · Prompt generado</h2>
      <div class="fila" style="margin-bottom:8px"><label class="campo" style="flex-direction:row;align-items:center;gap:8px">Profundizar en
        <select id="foco"><option value="">Todo el equipo</option>${Object.values(cfg.zonas).map((z) => `<option>${esc(z.nombre)}</option>`).join('')}</select></label>
        <button class="btn" id="bCopiar">Copiar prompt</button></div>
      <textarea id="txtPrompt" readonly style="min-height:340px;font-family:ui-monospace,Consolas,monospace;font-size:.78rem"></textarea>
      <small class="tenue" id="largo"></small>
    </div>
    <div class="panel">
      <h2>2 · Obtener el diagnóstico</h2>
      <p style="font-size:.9rem"><b>Opción A:</b> copie el prompt en Copilot, Claude u otro asistente y pegue la respuesta aquí:</p>
      <textarea id="txtManual" placeholder="Pegue aquí la respuesta del asistente…" style="min-height:90px"></textarea>
      <div class="fila" style="margin-top:6px"><button class="btn" id="bManual">Guardar como diagnóstico</button></div>
      <hr style="border:0;border-top:1px solid var(--borde);margin:16px 0">
      <p style="font-size:.9rem"><b>Opción B:</b> llamada directa a la API de Claude con su propia clave.</p>
      <div class="rejilla c2">
        <label class="campo">Clave de API (Anthropic)<input type="password" id="clave" value="${esc(guardada)}" placeholder="sk-ant-…" autocomplete="off"></label>
        <label class="campo">Modelo<input type="text" id="modelo" value="${MODELO_IA}"></label>
      </div>
      <label class="fila" style="gap:6px;font-size:.85rem;margin-top:6px"><input type="checkbox" id="recordar" ${guardada ? 'checked' : ''}> Recordar la clave en este navegador (localStorage; no se sube a ningún servidor ni al repositorio)</label>
      <div class="fila" style="margin-top:10px"><button class="btn prim" id="bLlamar">Analizar con IA</button><span id="estadoIA" class="tenue"></span></div>
      <div class="aviso azul" style="font-size:.82rem">La solicitud va directo desde su navegador a api.anthropic.com con el estado del equipo (sin fotos). La IA apoya el análisis; la decisión de mantenimiento la toma el ingeniero responsable.</div>
    </div>
  </div>
  <div class="espacio"></div>
  <div class="panel" id="panelDiag">
    <div class="fila entre"><h2 style="margin:0">Diagnóstico IA</h2>${ia ? `<span class="tenue">${esc(ia.origen)} · ${fFecha(ia.fecha.slice(0, 10))}${ia.modelo ? ' · ' + esc(ia.modelo) : ''}</span>` : ''}</div>
    <div id="diag">${ia ? mdSeguro(ia.texto) : '<p class="tenue">Aún no hay diagnóstico. Se incluirá en el reporte automáticamente.</p>'}</div>
    ${ia ? '<div class="fila no-print"><a class="btn" href="#/reporte">Ver en el reporte</a><button class="btn chico peligro" id="bBorrar">Borrar diagnóstico</button></div>' : ''}
  </div>`;

  const $ = (id) => root.querySelector('#' + id);
  const pintarPrompt = () => { const p = prompt(); $('txtPrompt').value = p; $('largo').textContent = `${p.length.toLocaleString('es-CL')} caracteres (≈ ${Math.round(p.length / 3.5).toLocaleString('es-CL')} tokens)`; };
  pintarPrompt();
  $('foco').addEventListener('change', (e) => { foco = e.target.value; pintarPrompt(); });
  $('bCopiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('txtPrompt').value); app.toast('Prompt copiado al portapapeles.'); }
    catch { $('txtPrompt').select(); document.execCommand('copy'); app.toast('Prompt copiado.'); }
  });
  const guardarDiag = (d) => { app.store.ia = d; app.guardar(); app.render(); };
  $('bManual').addEventListener('click', () => {
    const t = $('txtManual').value.trim();
    if (!t) { app.toast('Pegue primero la respuesta del asistente.', true); return; }
    guardarDiag({ texto: t, fecha: new Date().toISOString(), origen: 'Asistente externo (copiar/pegar)', datosHasta: A.ultimaInsp.fecha });
  });
  $('bBorrar')?.addEventListener('click', () => { if (confirm('¿Borrar el diagnóstico IA guardado?')) guardarDiag(null); });

  let ctrl = null;
  app.alLimpiar(() => ctrl?.abort());
  $('bLlamar').addEventListener('click', async () => {
    const clave = $('clave').value.trim();
    if (!clave) { app.toast('Ingrese su clave de API o use la opción A.', true); return; }
    guardarPref(CLAVE_PREF, $('recordar').checked ? clave : null);
    const b = $('bLlamar'); b.disabled = true; $('estadoIA').textContent = 'Analizando… (puede tardar un minuto)';
    ctrl = new AbortController();
    try {
      const r = await analizarConClaude({ clave, modelo: $('modelo').value.trim(), prompt: prompt(), signal: ctrl.signal });
      guardarDiag({ texto: r.texto + (r.truncado ? '\n\n(Respuesta truncada por longitud.)' : ''), fecha: new Date().toISOString(), origen: 'API de Claude', modelo: r.modelo, datosHasta: A.ultimaInsp.fecha });
      app.toast('Diagnóstico IA generado.');
    } catch (e) {
      if (e.name === 'AbortError') return;
      $('estadoIA').textContent = ''; b.disabled = false;
      app.toast('No se pudo completar el análisis: ' + e.message, true);
    }
  });
}
