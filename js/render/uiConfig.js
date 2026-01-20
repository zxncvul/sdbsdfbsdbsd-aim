/*
 * render/uiConfig.js
 *
 * Construye el panel de configuración que permite modificar dinámicamente
 * los parámetros de `CFG`.  El panel se muestra al pulsar `C` y se
 * oculta al volver a pulsar la misma tecla.  Este módulo no exporta
 * valores de configuración; sólo genera el HTML y conecta los eventos
 * de los controles con el objeto `CFG`.
 */

import { CFG } from '../config.js';
import * as state from '../state.js';
import { respawnAllTargets, applyUniformRadiusToAll, pickTargetRadius } from '../systems/targets.js';
import { ensureMoversCount, respawnMover } from '../systems/movers.js';
import * as flight from '../systems/flight.js';
import { nowMs } from '../utils/time.js';

/**
 * Activa o desactiva el modo FA‑off.  Cuando se desactiva, se llama a
 * `flight.reset()` para poner a cero las velocidades internas.
 * @param {boolean} on true para activar FA‑off
 */
function setFaOff(on) {
  CFG.faOff = !!on;
  const faEl = document.getElementById('cfg_faOff');
  if (faEl) faEl.checked = CFG.faOff;
  if (!CFG.faOff) flight.reset();
}

/**
 * Construye el HTML del panel de configuración y añade listeners a los
 * controles.  Se recomienda llamar a esta función una vez, después de
 * inicializar las referencias del DOM en `state.initDomRefs()`.  Si se
 * invoca de nuevo, reconstruirá el panel desde cero.
 */
export function buildConfigUI() {
  const id = s => `cfg_${s}`;
  const panel = state.configPanelEl;
  if (!panel) return;
  // Construimos el panel con secciones plegables (<details>) para que
  // no crezca en exceso.  Cada bloque agrupa controles relacionados.
  panel.innerHTML = `
    <div class="h">
      <div class="title">CONFIG</div>
      <div class="pill">C</div>
    </div>
    <div class="controls">
      <details open>
        <summary>Sensibilidades</summary>
        <div class="control">
          <label for="${id('sensX')}"><span class="k">Sens X</span> (roll)</label>
          <div class="val" id="${id('sensX_val')}">${CFG.sensX.toFixed(2)}</div>
          <input type="range" min="0.10" max="3.00" step="0.01" value="${CFG.sensX}" id="${id('sensX')}" style="grid-column:1 / span 2">
        </div>
        <div class="control">
          <label for="${id('sensY')}"><span class="k">Sens Y</span> (pitch)</label>
          <div class="val" id="${id('sensY_val')}">${CFG.sensY.toFixed(2)}</div>
          <input type="range" min="0.10" max="3.00" step="0.01" value="${CFG.sensY}" id="${id('sensY')}" style="grid-column:1 / span 2">
        </div>
        <div class="control">
          <label for="${id('sensZ')}"><span class="k">Sens Z</span> (yaw)</label>
          <div class="val" id="${id('sensZ_val')}">${CFG.sensZ.toFixed(2)}</div>
          <input type="range" min="0.10" max="3.00" step="0.01" value="${CFG.sensZ}" id="${id('sensZ')}" style="grid-column:1 / span 2">
        </div>
      </details>
      <details open>
        <summary>Targets</summary>
        <div class="control">
          <label for="${id('targetR')}"><span class="k">Target</span> tamaño</label>
          <div class="val" id="${id('targetR_val')}">${CFG.targetR.toFixed(0)} px</div>
          <input type="range" min="4" max="200" step="1" value="${CFG.targetR}" id="${id('targetR')}" style="grid-column:1 / span 2">
        </div>
        <div class="control">
          <label for="${id('targetCount')}"><span class="k">Targets</span> cantidad</label>
          <div class="val" id="${id('targetCount_val')}">${CFG.targetCount}</div>
          <input type="range" min="0" max="20" step="1" value="${CFG.targetCount}" id="${id('targetCount')}" style="grid-column:1 / span 2">
        </div>
        <div class="check">
          <label><input type="checkbox" id="${id('regenOnHit')}" ${CFG.regenOnHit ? 'checked' : ''}> Regenerar al <span class="k">acertar</span></label>
          <span class="mini">si OFF: mata todos</span>
        </div>
        <div class="check">
          <label><input type="checkbox" id="${id('randomTargetSize')}" ${CFG.randomTargetSize ? 'checked' : ''}> Tamaño <span class="k">aleatorio</span> por target</label>
          <span class="mini">si OFF: uniforme</span>
        </div>
      </details>
      <details open>
        <summary>Curvas</summary>
        <div class="check">
          <label><input type="checkbox" id="${id('useCurve')}" ${CFG.useCurve ? 'checked' : ''}> <span class="k">Curva</span> activa</label>
          <span class="mini">J-like</span>
        </div>
        <div class="check">
          <label><input type="checkbox" id="${id('applyCurveToX')}" ${CFG.applyCurveToX ? 'checked' : ''}> Aplicar curva también a <span class="k">Z</span> (yaw)</label>
          <span class="mini">delicado</span>
        </div>
        <div class="row">
          <div class="box">
            <div class="mini"><span class="k">Curva X</span> (roll): CP / VA</div>
            <div class="control" style="grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <div class="mini">CP: <span id="${id('cpX_val')}">${CFG.cpX}</span></div>
                <input type="range" min="0" max="60" step="1" value="${CFG.cpX}" id="${id('cpX')}">
              </div>
              <div>
                <div class="mini">VA: <span id="${id('vaX_val')}">${CFG.vaX}</span></div>
                <input type="range" min="1" max="10" step="1" value="${CFG.vaX}" id="${id('vaX')}">
              </div>
            </div>
          </div>
          <div class="box">
            <div class="mini"><span class="k">Curva Y</span> (pitch): CP / VA</div>
            <div class="control" style="grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <div class="mini">CP: <span id="${id('cpY_val')}">${CFG.cpY}</span></div>
                <input type="range" min="0" max="60" step="1" value="${CFG.cpY}" id="${id('cpY')}">
              </div>
              <div>
                <div class="mini">VA: <span id="${id('vaY_val')}">${CFG.vaY}</span></div>
                <input type="range" min="1" max="10" step="1" value="${CFG.vaY}" id="${id('vaY')}">
              </div>
            </div>
          </div>
        </div>
      </details>
      <details>
        <summary>Display</summary>
        <div class="check">
          <label><input type="checkbox" id="${id('showGrid')}" ${CFG.showGrid ? 'checked' : ''}> Mostrar <span class="k">malla</span></label>
          <span class="mini">cuadrados</span>
        </div>
        <div class="check">
          <label><input type="checkbox" id="${id('blackBg')}" ${CFG.blackBg ? 'checked' : ''}> Fondo <span class="k">negro</span> total</label>
          <span class="mini">sin textura</span>
        </div>
      </details>
      <details>
        <summary>FA‑off (inercia)</summary>
        <div class="check">
          <label><input type="checkbox" id="${id('faOff')}" ${CFG.faOff ? 'checked' : ''}> <span class="k">FA-off</span></label>
          <span class="mini">F / Shift+F</span>
        </div>
        <div class="control">
          <label for="${id('faAccX')}"><span class="k">FA Accel X</span> (roll)</label>
          <div class="val" id="${id('faAccX_val')}">${CFG.faAccX.toFixed(2)}</div>
          <input type="range" min="0.10" max="3.00" step="0.01" value="${CFG.faAccX}" id="${id('faAccX')}" style="grid-column:1 / span 2">
        </div>
        <div class="control">
          <label for="${id('faAccY')}"><span class="k">FA Accel Y</span> (pitch)</label>
          <div class="val" id="${id('faAccY_val')}">${CFG.faAccY.toFixed(2)}</div>
          <input type="range" min="0.10" max="3.00" step="0.01" value="${CFG.faAccY}" id="${id('faAccY')}" style="grid-column:1 / span 2">
        </div>
        <div class="control">
          <label for="${id('faAccZ')}"><span class="k">FA Accel Z</span> (yaw)</label>
          <div class="val" id="${id('faAccZ_val')}">${CFG.faAccZ.toFixed(2)}</div>
          <input type="range" min="0.10" max="3.00" step="0.01" value="${CFG.faAccZ}" id="${id('faAccZ')}" style="grid-column:1 / span 2">
        </div>
      </details>
      <details open>
        <summary>Movers</summary>
        <div class="check">
          <label><input type="checkbox" id="${id('moversEnabled')}" ${CFG.moversEnabled ? 'checked' : ''}> <span class="k">Activos</span></label>
          <span class="mini">extra</span>
        </div>
        <div class="control">
          <label for="${id('moversCount')}"><span class="k">Cantidad</span></label>
          <div class="val" id="${id('moversCount_val')}">${CFG.moversCount}</div>
          <input type="range" min="0" max="5" step="1" value="${CFG.moversCount}" id="${id('moversCount')}" style="grid-column:1 / span 2">
        </div>
        <div class="control">
          <label for="${id('moversR')}"><span class="k">Tamaño</span></label>
          <div class="val" id="${id('moversR_val')}">${CFG.moversR.toFixed(0)} px</div>
          <input type="range" min="4" max="60" step="1" value="${CFG.moversR}" id="${id('moversR')}" style="grid-column:1 / span 2">
        </div>
        <div class="check">
          <label><input type="checkbox" id="${id('moversFlee')}" ${CFG.moversFlee ? 'checked' : ''}> <span class="k">Huir del jugador</span></label>
          <span class="mini">reacciona a la velocidad</span>
        </div>
        <div class="control">
          <label for="${id('moversSpeed')}"><span class="k">Velocidad</span></label>
          <div class="val" id="${id('moversSpeed_val')}">${CFG.moversSpeed.toFixed(2)}</div>
          <input type="range" min="0.10" max="3.00" step="0.01" value="${CFG.moversSpeed}" id="${id('moversSpeed')}" style="grid-column:1 / span 2">
        </div>
        <div class="control">
          <label for="${id('moversAvoid')}"><span class="k">Esquiva</span></label>
          <div class="val" id="${id('moversAvoid_val')}">${CFG.moversAvoid.toFixed(2)}</div>
          <input type="range" min="0.00" max="3.00" step="0.01" value="${CFG.moversAvoid}" id="${id('moversAvoid')}" style="grid-column:1 / span 2">
        </div>
        <div class="control">
          <label for="${id('moversHit1Boost')}"><span class="k">Boost 1º impacto</span></label>
          <div class="val" id="${id('moversHit1Boost_val')}">${(CFG.moversHit1Boost * 100).toFixed(0)}%</div>
          <!--
            Permite seleccionar el incremento de velocidad de huida tras el primer
            impacto.  Los boosters se expresan como multiplicadores (1.0=100%,
            2.0=200%, …).  Para evitar valores desorbitados, el rango se limita
            a 7 (700 %) y el paso se mantiene en 0.05 para permitir ajustes
            finos.
          -->
          <input type="range" min="0.00" max="7.00" step="0.05" value="${CFG.moversHit1Boost}" id="${id('moversHit1Boost')}" style="grid-column:1 / span 2">
        </div>
        <div class="control">
          <label for="${id('moversHit2Boost')}"><span class="k">Boost 2º impacto</span></label>
          <div class="val" id="${id('moversHit2Boost_val')}">${(CFG.moversHit2Boost * 100).toFixed(0)}%</div>
          <!--
            Permite seleccionar el incremento acumulado de velocidad de huida
            tras el segundo impacto.  Al igual que con el primer impacto, se
            limita el rango a 7 (700 %) para mantener la jugabilidad.  El paso
            de 0.05 permite incrementos de 5 %.
          -->
          <input type="range" min="0.00" max="7.00" step="0.05" value="${CFG.moversHit2Boost}" id="${id('moversHit2Boost')}" style="grid-column:1 / span 2">
        </div>
      </details>
      <div class="mini">Cierra con <span class="k">C</span>. <span class="k">Espacio</span> respawnea targets.</div>
    </div>
  `;
  // Helper para range inputs.  Actualiza CFG y la etiqueta de valor
  const bindRange = (key, fmtVal, after) => {
    const el = document.getElementById(id(key));
    const valEl = document.getElementById(id(key + '_val'));
    if (!el) return;
    el.addEventListener('input', () => {
      CFG[key] = parseFloat(el.value);
      if (valEl) valEl.textContent = fmtVal(CFG[key]);
      if (after) after();
    });
  };
  bindRange('sensX', v => v.toFixed(2));
  bindRange('sensY', v => v.toFixed(2));
  bindRange('sensZ', v => v.toFixed(2));
  bindRange('faAccX', v => v.toFixed(2));
  bindRange('faAccY', v => v.toFixed(2));
  bindRange('faAccZ', v => v.toFixed(2));
  bindRange('targetR', v => `${v.toFixed(0)} px`, () => {
    if (!CFG.randomTargetSize) applyUniformRadiusToAll();
  });
  bindRange('targetCount', v => `${Math.round(v)}`, () => {
    CFG.targetCount = Math.round(CFG.targetCount);
    respawnAllTargets();
    ensureMoversCount();
    for (let i = 0; i < state.movers.length; i++) respawnMover(state.movers[i]);
  });
  bindRange('moversCount', v => `${v | 0}`, () => {
    CFG.moversCount = (CFG.moversCount | 0);
    ensureMoversCount();
    // Al cambiar la cantidad de movers, reposicionamos los existentes
    for (let i = 0; i < state.movers.length; i++) respawnMover(state.movers[i]);
  });
  // Tamaño de movers: actualiza CFG y reposiciona todos los movers
  bindRange('moversR', v => `${Math.round(v)} px`, () => {
    CFG.moversR = Math.round(CFG.moversR);
    // Ajustamos el radio de todos los movers actuales.  Para evitar
    // solapamiento con los bordes, los respawneamos.
    for (let i = 0; i < state.movers.length; i++) {
      state.movers[i].r = CFG.moversR;
      respawnMover(state.movers[i]);
    }
  });
  bindRange('moversSpeed', v => v.toFixed(2));
  bindRange('moversAvoid', v => v.toFixed(2));
  // Boosts de velocidad tras impactos.  Mostramos el valor como
  // porcentaje multiplicando por 100.
  bindRange('moversHit1Boost', v => `${(v * 100).toFixed(0)}%`);
  bindRange('moversHit2Boost', v => `${(v * 100).toFixed(0)}%`);
  // mini ranges (con CP/VA) guardan valores enteros
  const bindMini = (key, outId) => {
    const el = document.getElementById(id(key));
    const out = document.getElementById(outId);
    if (!el) return;
    el.addEventListener('input', () => {
      CFG[key] = parseInt(el.value, 10);
      if (out) out.textContent = CFG[key];
    });
  };
  bindMini('cpX', id('cpX_val'));
  bindMini('vaX', id('vaX_val'));
  bindMini('cpY', id('cpY_val'));
  bindMini('vaY', id('vaY_val'));
  // Checkboxes
  const bindCheck = (key, after) => {
    const el = document.getElementById(id(key));
    if (!el) return;
    el.addEventListener('change', () => {
      CFG[key] = !!el.checked;
      if (after) after();
    });
  };
  bindCheck('useCurve');
  bindCheck('applyCurveToX');
  bindCheck('showGrid');
  bindCheck('blackBg');
  bindCheck('regenOnHit', () => respawnAllTargets());
  bindCheck('randomTargetSize', () => {
    if (CFG.randomTargetSize) {
      for (const t of state.targets) t.r = pickTargetRadius();
    } else {
      applyUniformRadiusToAll();
    }
  });
  // Vaciar movers al desactivarlos
  bindCheck('moversEnabled', () => {
    ensureMoversCount();
    if (!CFG.moversEnabled) return;
    for (let i = 0; i < state.movers.length; i++) respawnMover(state.movers[i]);
  });
  // Toggle FA-off
  const faEl = document.getElementById(id('faOff'));
  if (faEl) {
    faEl.addEventListener('change', () => setFaOff(!!faEl.checked));
  }
  // Flee de movers
  bindCheck('moversFlee');
}