/*
 * main.js
 *
 * Punto de entrada de Sol‑R Aim Trainer.  Este módulo coordina
 * la inicialización de la aplicación, el bucle principal de
 * actualización y renderizado, y la gestión de entradas del teclado y
 * del gamepad.  Importa y conecta los distintos módulos del proyecto.
 */

import {
  TRIGGER_BUTTON,
  AXIS_ROLL,
  AXIS_PITCH,
  AXIS_YAW,
  USE_DOMINANT_MOVEMENT,
  ROLL_LOCK_THRESHOLD,
  ROLL_LOCK_FACTOR,
  SPEED_BASE,
  ROLL_SPEED_BASE,
  CROSSHAIR_FLASH_MS,
  MISS_FLASH_MS,
  HIT_FADE_MS,
  SUCCESS_DELAY_MS,
  SUCCESS_COOLDOWN_MS,
  CFG,
  MOVERS_MAX_HITS
} from './config.js';
import * as state from './state.js';
import { initCanvas } from './render/canvas.js';
import { drawBackground } from './render/background.js';
import { drawTargets } from './render/drawTargets.js';
import { drawCrosshair } from './render/crosshair.js';
import { drawDevHUD } from './render/devHud.js';
import { buildConfigUI } from './render/uiConfig.js';
import { getPad } from './input/gamepad.js';
import {
  clamp,
  cleanAxis,
  dominantAxis,
  applyJCurve
} from './utils/math.js';
import { nowMs } from './utils/time.js';
import {
  respawnAllTargets,
  applyUniformRadiusToAll
} from './systems/targets.js';
import {
  ensureMoversCount,
  updateMovers,
  respawnMover,
  hitTestMovers,
  respawnAllMovers
} from './systems/movers.js';
import { spawnTargetNearPlayer } from './systems/targets.js';
import * as flight from './systems/flight.js';

// Audio helpers
function playShot() {
  try {
    state.shotAudio.currentTime = 0;
    state.shotAudio.play().catch(() => {});
  } catch (_) {}
}
function playSuccessWithDelay() {
  const t = nowMs();
  if (t - state.lastSuccessAt < SUCCESS_COOLDOWN_MS) return;
  state.lastSuccessAt = t;
  setTimeout(() => {
    try {
      state.successAudio.currentTime = 0;
      state.successAudio.play().catch(() => {});
    } catch (_) {}
  }, SUCCESS_DELAY_MS);
}

// Disparo principal: controla la detección de hits en movers y targets
function shoot() {
  const t = nowMs();
  state.crosshairFlashUntil = t + CROSSHAIR_FLASH_MS;
  playShot();
  // Primero comprobamos movers amarillos
  const mi = hitTestMovers();
  if (mi >= 0) {
    const m = state.movers[mi];
    // Marca el tiempo del golpe para dibujar el flash
    m.hitUntil = t + 140;
    // Incrementamos contador de impactos
    m.hits = (m.hits | 0) + 1;
    m.lastHitTime = t;
    // Actualizamos el multiplicador de velocidad de huida según las
    // configuraciones definidas en `CFG`.  En lugar de sumar 1 de manera
    // incremental, calculamos una ganancia acumulativa basada en los
    // impactos:
    //   hits == 1 → m.escapeBoost = CFG.moversHit1Boost
    //   hits >= 2 → m.escapeBoost = CFG.moversHit1Boost + CFG.moversHit2Boost
    // Esto permite ajustar los incrementos con porcentajes arbitrarios.
    let esc = 0;
    if (m.hits === 1) {
      esc = CFG.moversHit1Boost || 0;
    } else if (m.hits >= 2) {
      esc = (CFG.moversHit1Boost || 0) + (CFG.moversHit2Boost || 0);
    }
    m.escapeBoost = esc;
    // Si alcanza el máximo de impactos, gestionamos la vida restante.  Si
    // `CFG.regenOnHit` está activa, respawn normal.  Si está desactivada,
    // marcamos el mover como muerto para que desaparezca hasta que
    // posteriormente se reaparezca manualmente.
    if (m.hits >= MOVERS_MAX_HITS) {
      // Reiniciamos impactos para la siguiente vida
      m.hits = MOVERS_MAX_HITS;
      if (CFG.regenOnHit) {
        respawnMover(m);
        playSuccessWithDelay();
      } else {
        // Marcar como muerto y dejar que el dibujo lo oculte
        m.dead = true;
        m.hitUntil = 0;
        m.lastHitTime = 0;
        // Ajustamos el color final (opcional)
        playSuccessWithDelay();
      }
    }
    return;
  }
  // Luego buscamos el blanco más cercano dentro de su radio
  let bestIdx = -1;
  let bestD = Infinity;
  for (let i = 0; i < state.targets.length; i++) {
    const tg = state.targets[i];
    if (tg.dead) continue;
    if (tg.hitStart) continue;
    const dx = tg.x - state.player.x;
    const dy = tg.y - state.player.y;
    const d = Math.hypot(dx, dy);
    if (d < tg.r && d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) {
    state.targets[bestIdx].hitStart = t;
    playSuccessWithDelay();
  } else {
    state.missFlashUntil = t + MISS_FLASH_MS;
  }
}

// Gestión del gatillo del gamepad
function handleTrigger(pad) {
  const v = pad.buttons[TRIGGER_BUTTON]?.value || 0;
  if (v > 0.8 && !state.triggerPressed) {
    state.triggerPressed = true;
    shoot();
  }
  if (v < 0.2) state.triggerPressed = false;
}

// Determina si el foco está en un campo de texto o similar
function isTypingInUI() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

// Actualiza la posición de los paneles cuando ambos están visibles
function updatePanelStacking() {
  const devHud = state.devHudEl;
  const cfgPanel = state.configPanelEl;
  if (!devHud || !cfgPanel) return;
  if (state.showDevHud && state.showConfig) {
    devHud.classList.add('stack-dev');
    cfgPanel.classList.add('stack-cfg');
  } else {
    devHud.classList.remove('stack-dev');
    cfgPanel.classList.remove('stack-cfg');
  }
}

// Activa o desactiva el modo FA-off desde el teclado
function setFaOff(on) {
  CFG.faOff = !!on;
  const faEl = document.getElementById('cfg_faOff');
  if (faEl) faEl.checked = CFG.faOff;
  if (!CFG.faOff) flight.reset();
}

function resetFaInertia() {
  flight.reset();
}

// Bucle de actualización lógica
function update() {
  const pad = getPad(state.activeIndex);
  if (!pad) return;
  const t = nowMs();
  let dtN = clamp((t - state.lastFrameMs) / 16.6667, 0.25, 3);
  state.lastFrameMs = t;
  let roll = cleanAxis(-(pad.axes[AXIS_ROLL] ?? 0));
  let pitch = cleanAxis(-(pad.axes[AXIS_PITCH] ?? 0));
  let yaw = cleanAxis((pad.axes[AXIS_YAW] ?? 0));
  if (CFG.useCurve) {
    roll = applyJCurve(roll, CFG.cpX, CFG.vaX);
    pitch = applyJCurve(pitch, CFG.cpY, CFG.vaY);
    if (CFG.applyCurveToX) {
      yaw = applyJCurve(yaw, CFG.cpX, CFG.vaX);
    }
  }
  if (!CFG.faOff) {
    const ar = Math.abs(roll);
    if (ar > ROLL_LOCK_THRESHOLD) {
      if (Math.abs(pitch) < ar * ROLL_LOCK_FACTOR) pitch = 0;
      if (Math.abs(yaw) < ar * ROLL_LOCK_FACTOR) yaw = 0;
    }
  }
  pitch *= CFG.sensY;
  yaw *= CFG.sensZ;
  // Rotación (roll)
  if (CFG.faOff) {
    const rollIn = clamp(roll, -1, 1);
    const angAccel = ROLL_SPEED_BASE * 1.8 * CFG.faAccX;
    const maxW = ROLL_SPEED_BASE * 10 * CFG.sensX;
    const rr = flight.stepRoll(rollIn, dtN, angAccel, maxW);
    state.rollAngle += rr.dAngle;
  } else {
    const rollSpeed = ROLL_SPEED_BASE * CFG.sensX;
    if (roll !== 0) state.rollAngle += roll * rollSpeed;
  }
  // Movimiento (pitch/yaw)
  if (CFG.faOff) {
    const yawIn = clamp(yaw, -1, 1);
    const pitchIn = clamp(pitch, -1, 1);
    const axScreen = yawIn * SPEED_BASE * 0.55 * CFG.faAccZ;
    const ayScreen = pitchIn * SPEED_BASE * 0.55 * CFG.faAccY;
    const cos = Math.cos(state.rollAngle);
    const sin = Math.sin(state.rollAngle);
    const axWorld = (axScreen * cos) + (ayScreen * sin);
    const ayWorld = (-axScreen * sin) + (ayScreen * cos);
    const sensMove = Math.max(CFG.sensY, CFG.sensZ);
    const maxV = SPEED_BASE * 12 * sensMove;
    const s = flight.stepMove(axWorld, ayWorld, dtN, maxV);
    state.player.x += s.dx;
    state.player.y += s.dy;
  } else {
    let moveX = 0;
    let moveY = 0;
    if (yaw !== 0 || pitch !== 0) {
      if (USE_DOMINANT_MOVEMENT) {
        const dom = dominantAxis(yaw, pitch);
        yaw = dom.x;
        pitch = dom.y;
      }
      const cos = Math.cos(state.rollAngle);
      const sin = Math.sin(state.rollAngle);
      moveX = (yaw * cos) + (pitch * sin);
      moveY = (-yaw * sin) + (pitch * cos);
    }
    if (moveX !== 0 || moveY !== 0) {
      state.player.x += moveX * SPEED_BASE;
      state.player.y += moveY * SPEED_BASE;
    }
  }
  // Calculamos la velocidad de la mira a partir del desplazamiento
  // del jugador desde el frame anterior.  Se usa para la función de
  // huida de los movers: cuanto más rápido te acerques, más rápido
  // escaparán.  Guardamos también la posición actual para el próximo frame.
  let playerSpeed = 0;
  {
    const dx = state.player.x - state.prevPlayerX;
    const dy = state.player.y - state.prevPlayerY;
    // dtN se normaliza a 1 ≈ 16.6 ms; calculamos la velocidad relativa
    // dividiendo por dtN para obtener unidades por frame base.
    if (dtN > 0) {
      playerSpeed = Math.hypot(dx, dy) / dtN;
    }
    state.prevPlayerX = state.player.x;
    state.prevPlayerY = state.player.y;
  }
  // Actualizar movers con la velocidad del jugador
  updateMovers(dtN, playerSpeed);
  // HITS / RESPAWNS blancos
  for (let i = 0; i < state.targets.length; i++) {
    const tg = state.targets[i];
    if (tg.dead) continue;
    if (tg.hitStart) {
      if (t - tg.hitStart >= HIT_FADE_MS) {
        if (CFG.regenOnHit) {
          state.targets[i] = spawnTargetNearPlayer();
        } else {
          tg.dead = true;
          tg.hitStart = 0;
        }
      }
    }
  }
  if (!CFG.regenOnHit) {
    const allDead = state.targets.length > 0 && state.targets.every(tt => tt.dead);
    if (allDead) respawnAllTargets();
  }
  // Respawn de movers cuando la regeneración al acertar está desactivada
  // y todos los movers han sido eliminados.  A diferencia de los
  // blancos, los movers se mantienen en el arreglo con la marca `dead`
  // para preservar su número.  Aquí comprobamos si todos están
  // muertos; si es así, reaparecemos todos para iniciar un nuevo ciclo.
  if (!CFG.regenOnHit) {
    const mDead = state.movers.length > 0 && state.movers.every(mv => mv.dead);
    if (mDead) {
      respawnAllMovers();
    }
  }
  // Gestionar el disparo
  handleTrigger(pad);
}

// Dibuja la escena completa
function draw() {
  const ctx = state.ctx;
  const canvas = state.canvas;
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawTargets();
  drawCrosshair();
  drawDevHUD();
}

// Bucle principal con requestAnimationFrame
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// Inicialización tras cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  // Referencias DOM
  const canvasEl = document.getElementById('c');
  const ctx = canvasEl.getContext('2d');
  const devHudEl = document.getElementById('devHud');
  const configPanelEl = document.getElementById('configPanel');
  const toastEl = document.getElementById('toast');
  const shotAudio = document.getElementById('shot');
  const successAudio = document.getElementById('success');
  // Inicializamos estado DOM
  state.initDomRefs(canvasEl, ctx, devHudEl, configPanelEl, toastEl, shotAudio, successAudio);
  // Configuramos canvas
  initCanvas('c');
  // Construimos UI de configuración
  buildConfigUI();
  // Ocultamos toast al cabo de un tiempo
  setTimeout(() => {
    if (state.toastEl) state.toastEl.classList.add('hide');
  }, 2600);
  // Gestión de teclado
  window.addEventListener('keydown', (e) => {
    if (isTypingInUI()) return;
    if (e.repeat) return;
    const k = (e.key || '').toLowerCase();
    if (k === 'c') {
      state.showConfig = !state.showConfig;
      if (state.configPanelEl) state.configPanelEl.classList.toggle('hidden', !state.showConfig);
      updatePanelStacking();
      e.preventDefault();
      return;
    }
    if (k === 'i') {
      state.showDevHud = !state.showDevHud;
      if (state.devHudEl) state.devHudEl.classList.toggle('hidden', !state.showDevHud);
      updatePanelStacking();
      e.preventDefault();
      return;
    }
    if (k === 'f') {
      if (e.shiftKey) {
        resetFaInertia();
      } else {
        setFaOff(!CFG.faOff);
      }
      e.preventDefault();
      return;
    }
    if (k === ' ' || e.code === 'Space') {
      state.missFlashUntil = 0;
      respawnAllTargets();
      ensureMoversCount();
      for (let i = 0; i < state.movers.length; i++) respawnMover(state.movers[i]);
      e.preventDefault();
      return;
    }
  });
  // Inicializamos blancos y movers
  respawnAllTargets();
  ensureMoversCount();
  // Iniciamos bucle
  loop();
});