/*
 * render/devHud.js
 *
 * Construye el contenido del HUD de desarrollo, mostrando información
 * detallada sobre el gamepad, la configuración y el estado actual del
 * juego.  Este panel se muestra al pulsar `I` y se oculta al volver a
 * pulsar la misma tecla.  No se dibuja en el canvas, sino que se
 * actualiza el contenido HTML del elemento `devHudEl`.
 */

import * as state from '../state.js';
import { CFG, AXIS_ROLL, AXIS_PITCH, AXIS_YAW, TRIGGER_BUTTON } from '../config.js';
import { getPad, fmt } from '../input/gamepad.js';
import { getVel } from '../systems/flight.js';

/**
 * Actualiza el contenido del HUD de desarrollo en cada frame.  Cuando no
 * hay gamepad activo, muestra un mensaje de error.  Si hay gamepad,
 * muestra valores de ejes, botones activos, configuración y velocidades.
 */
export function drawDevHUD() {
  if (!state.showDevHud) return;
  const devHud = state.devHudEl;
  if (!devHud) return;
  const pad = getPad(state.activeIndex);
  if (!pad) {
    devHud.innerHTML = `
      <div class="h">
        <div class="title">HUD DEV</div><div class="pill">I</div>
      </div>
      <div class="bad">No hay gamepad activo. Haz click y mueve el stick.</div>
    `;
    return;
  }
  const axesLine = pad.axes.map((v, i) => `a${i}=${fmt(v)}`).join('  ');
  const btns = pad.buttons
    .map((b, i) => (b.value > 0.05 ? `b${i}=${b.value.toFixed(2)}` : ''))
    .filter(Boolean)
    .join('  ');
  const vel = getVel();
  const alive = state.targets.filter(tg => !tg.dead).length;
  devHud.innerHTML = `
    <div class="h">
      <div class="title">HUD DEV</div>
      <div class="pill">I</div>
    </div>
    <div class="row">
      <div class="box">
        <div><span class="k">Activo:</span> ${state.activeIndex + 1} - ${pad.id}</div>
        <div><span class="k">Ejes:</span> roll=a${AXIS_ROLL} (inv), pitch=a${AXIS_PITCH} (inv), yaw=a${AXIS_YAW}</div>
        <div><span class="k">Disparo:</span> b${TRIGGER_BUTTON}</div>
        <div><span class="k">FA-off:</span> ${CFG.faOff ? 'ON' : 'OFF'} (F / Shift+F)</div>
        <div><span class="k">Targets:</span> ${alive}/${state.targets.length} | regenOnHit=${CFG.regenOnHit ? 'ON' : 'OFF'} | randomSize=${CFG.randomTargetSize ? 'ON' : 'OFF'}</div>
        <div><span class="k">Movers:</span> ${CFG.moversEnabled ? 'ON' : 'OFF'} | n=${(CFG.moversCount | 0)} | ${CFG.moversPattern} | sp=${CFG.moversSpeed.toFixed(2)} | avoid=${CFG.moversAvoid.toFixed(2)}</div>
        <div><span class="k">Sens:</span> X=${CFG.sensX.toFixed(2)} Y=${CFG.sensY.toFixed(2)} Z=${CFG.sensZ.toFixed(2)} | baseR=${CFG.targetR}px</div>
        <div><span class="k">FA accel:</span> X=${CFG.faAccX.toFixed(2)} Y=${CFG.faAccY.toFixed(2)} Z=${CFG.faAccZ.toFixed(2)}</div>
        <div><span class="k">Vel:</span> vx=${vel.vx.toFixed(2)} vy=${vel.vy.toFixed(2)} w=${vel.w.toFixed(4)}</div>
        <div><span class="k">Malla:</span> ${CFG.showGrid ? 'ON' : 'OFF'}</div>
        <div><span class="k">Botones activos:</span> ${btns || '(ninguno)'}</div>
      </div>
      <div class="box">
        <div><span class="k">Ejes (${pad.axes.length}):</span></div>
        <div style="word-break:break-word">${axesLine}</div>
      </div>
    </div>
  `;
}