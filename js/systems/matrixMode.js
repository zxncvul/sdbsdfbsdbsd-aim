/*
 * systems/matrixMode.js
 *
 * Lógica del modo Matrix: genera targets que se desplazan en línea
 * recta desde los bordes de la ventana, formando columnas o filas.
 */

import { CFG, HIT_FADE_MS, MARGIN } from '../config.js';
import * as state from '../state.js';
import { clamp, screenToWorld, worldToScreen } from '../utils/math.js';
import { nowMs } from '../utils/time.js';

export function pickMatrixRadius() {
  if (!CFG.matrixRandomSize) return CFG.matrixTargetR;
  const base = CFG.matrixTargetR;
  const r = base * (0.6 + Math.random() * 1.4);
  return clamp(r, 4, 200);
}

function getEnabledDirections() {
  const dirs = [];
  if (CFG.matrixFromTop) dirs.push('top');
  if (CFG.matrixFromBottom) dirs.push('bottom');
  if (CFG.matrixFromLeft) dirs.push('left');
  if (CFG.matrixFromRight) dirs.push('right');
  return dirs;
}

function getLaneStep() {
  const base = Math.max(4, CFG.matrixTargetR);
  return base * 2.4;
}

function lanePosition(canvas, dir, index) {
  const step = getLaneStep();
  const span = (dir === 'top' || dir === 'bottom')
    ? canvas.width - MARGIN * 2
    : canvas.height - MARGIN * 2;
  const laneCount = Math.max(1, Math.floor(span / step));
  const offset = -span / 2 + step * 0.5 + (index % laneCount) * step;
  return offset;
}

function spawnMatrixTarget(dir) {
  const canvas = state.canvas;
  if (!canvas) return;
  const cos = Math.cos(state.rollAngle);
  const sin = Math.sin(state.rollAngle);
  const r = pickMatrixRadius();
  const laneIndex = state.matrixSpawner.laneIndex[dir] || 0;
  state.matrixSpawner.laneIndex[dir] = laneIndex + 1;
  let sx = 0;
  let sy = 0;
  let vxs = 0;
  let vys = 0;
  const speed = Math.max(0.1, CFG.matrixSpeed);
  if (dir === 'top') {
    sx = lanePosition(canvas, dir, laneIndex);
    sy = -canvas.height / 2 - MARGIN;
    vxs = 0;
    vys = speed;
  } else if (dir === 'bottom') {
    sx = lanePosition(canvas, dir, laneIndex);
    sy = canvas.height / 2 + MARGIN;
    vxs = 0;
    vys = -speed;
  } else if (dir === 'left') {
    sx = -canvas.width / 2 - MARGIN;
    sy = lanePosition(canvas, dir, laneIndex);
    vxs = speed;
    vys = 0;
  } else if (dir === 'right') {
    sx = canvas.width / 2 + MARGIN;
    sy = lanePosition(canvas, dir, laneIndex);
    vxs = -speed;
    vys = 0;
  }
  const wPos = screenToWorld(sx, sy, cos, sin);
  const wVel = screenToWorld(vxs, vys, cos, sin);
  state.matrixTargets.push({
    x: state.player.x + wPos.dx,
    y: state.player.y + wPos.dy,
    r,
    vx: wVel.dx,
    vy: wVel.dy,
    hitStart: 0,
    dead: false
  });
}

export function clearMatrixTargets() {
  state.matrixTargets = [];
  state.matrixSpawner.lastSpawnAt = 0;
  state.matrixSpawner.laneIndex.top = 0;
  state.matrixSpawner.laneIndex.bottom = 0;
  state.matrixSpawner.laneIndex.left = 0;
  state.matrixSpawner.laneIndex.right = 0;
}

export function updateMatrixTargets(dtN) {
  const canvas = state.canvas;
  if (!canvas) return;
  const t = nowMs();
  const dirs = getEnabledDirections();
  const interval = clamp(CFG.matrixSpawnMs, 80, 5000);
  if (dirs.length > 0 && t - state.matrixSpawner.lastSpawnAt >= interval) {
    state.matrixSpawner.lastSpawnAt = t;
    for (const dir of dirs) spawnMatrixTarget(dir);
  }
  const cos = Math.cos(state.rollAngle);
  const sin = Math.sin(state.rollAngle);
  const maxX = canvas.width / 2 + MARGIN * 2;
  const maxY = canvas.height / 2 + MARGIN * 2;
  for (let i = state.matrixTargets.length - 1; i >= 0; i--) {
    const tg = state.matrixTargets[i];
    if (tg.dead) {
      state.matrixTargets.splice(i, 1);
      continue;
    }
    if (tg.hitStart && t - tg.hitStart >= HIT_FADE_MS) {
      state.matrixTargets.splice(i, 1);
      continue;
    }
    tg.x += tg.vx * dtN;
    tg.y += tg.vy * dtN;
    const relx = tg.x - state.player.x;
    const rely = tg.y - state.player.y;
    const scr = worldToScreen(relx, rely, cos, sin);
    if (Math.abs(scr.sx) > maxX + tg.r || Math.abs(scr.sy) > maxY + tg.r) {
      state.matrixTargets.splice(i, 1);
    }
  }
}

export function hitTestMatrixTargets() {
  const t = nowMs();
  let bestIdx = -1;
  let bestD = Infinity;
  for (let i = 0; i < state.matrixTargets.length; i++) {
    const tg = state.matrixTargets[i];
    if (tg.dead || tg.hitStart) continue;
    const dx = tg.x - state.player.x;
    const dy = tg.y - state.player.y;
    const d = Math.hypot(dx, dy);
    if (d < tg.r && d < bestD) {
      bestIdx = i;
      bestD = d;
    }
  }
  if (bestIdx >= 0) {
    state.matrixTargets[bestIdx].hitStart = t;
    return true;
  }
  return false;
}
