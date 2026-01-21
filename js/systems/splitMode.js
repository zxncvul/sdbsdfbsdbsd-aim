/*
 * systems/splitMode.js
 *
 * Lógica del modo Split: pelotas grandes que rebotan en pantalla y se
 * dividen al recibir disparos.
 */

import { CFG } from '../config.js';
import * as state from '../state.js';
import { clamp, screenToWorld } from '../utils/math.js';
import { nowMs } from '../utils/time.js';
import { rand } from '../utils/math.js';

function randomDirection() {
  const a = Math.random() * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a) };
}

function createBallAt(sx, sy, r, vxs, vys) {
  const cos = Math.cos(state.rollAngle);
  const sin = Math.sin(state.rollAngle);
  const wPos = screenToWorld(sx, sy, cos, sin);
  return {
    sx,
    sy,
    x: state.player.x + wPos.dx,
    y: state.player.y + wPos.dy,
    r,
    vxs,
    vys,
    hitUntil: 0
  };
}

export function clearSplitBalls() {
  state.splitBalls = [];
}

export function ensureSplitBallsCount() {
  const canvas = state.canvas;
  if (!canvas) return;
  const desired = clamp(CFG.splitBallCount | 0, 0, 3);
  CFG.splitBallCount = desired;
  if (state.splitBalls.length > desired) {
    state.splitBalls.length = desired;
  }
  while (state.splitBalls.length < desired) {
    const r = Math.max(30, CFG.splitBallStartR);
    const halfW = canvas.width / 2 - r;
    const halfH = canvas.height / 2 - r;
    const sx = rand(-halfW, halfW);
    const sy = rand(-halfH, halfH);
    const dir = randomDirection();
    const speed = Math.max(0.2, CFG.splitBallSpeed);
    state.splitBalls.push(createBallAt(sx, sy, r, dir.x * speed, dir.y * speed));
  }
}

export function updateSplitBalls(dtN) {
  const canvas = state.canvas;
  if (!canvas) return;
  const halfW = canvas.width / 2;
  const halfH = canvas.height / 2;
  for (const ball of state.splitBalls) {
    ball.sx += ball.vxs * dtN;
    ball.sy += ball.vys * dtN;
    const maxX = halfW - ball.r;
    const maxY = halfH - ball.r;
    if (ball.sx < -maxX) {
      ball.sx = -maxX;
      ball.vxs = Math.abs(ball.vxs);
    } else if (ball.sx > maxX) {
      ball.sx = maxX;
      ball.vxs = -Math.abs(ball.vxs);
    }
    if (ball.sy < -maxY) {
      ball.sy = -maxY;
      ball.vys = Math.abs(ball.vys);
    } else if (ball.sy > maxY) {
      ball.sy = maxY;
      ball.vys = -Math.abs(ball.vys);
    }
    const cos = Math.cos(state.rollAngle);
    const sin = Math.sin(state.rollAngle);
    const wPos = screenToWorld(ball.sx, ball.sy, cos, sin);
    ball.x = state.player.x + wPos.dx;
    ball.y = state.player.y + wPos.dy;
  }
}

export function hitTestSplitBalls() {
  let bestIdx = -1;
  let bestD = Infinity;
  for (let i = 0; i < state.splitBalls.length; i++) {
    const ball = state.splitBalls[i];
    const dx = ball.x - state.player.x;
    const dy = ball.y - state.player.y;
    const d = Math.hypot(dx, dy);
    if (d < ball.r && d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function splitBallAt(index) {
  const ball = state.splitBalls[index];
  if (!ball) return;
  const minR = Math.max(4, CFG.splitBallMinR, CFG.targetR);
  const nextR = ball.r * 0.5;
  state.splitBalls.splice(index, 1);
  if (nextR < minR) {
    return;
  }
  const baseSpeed = Math.max(0.2, Math.hypot(ball.vxs, ball.vys));
  const angle = Math.atan2(ball.vys, ball.vxs);
  const spread = 0.55;
  const speed = baseSpeed * 1.05;
  const v1 = { x: Math.cos(angle + spread) * speed, y: Math.sin(angle + spread) * speed };
  const v2 = { x: Math.cos(angle - spread) * speed, y: Math.sin(angle - spread) * speed };
  state.splitBalls.push(createBallAt(ball.sx, ball.sy, nextR, v1.x, v1.y));
  state.splitBalls.push(createBallAt(ball.sx, ball.sy, nextR, v2.x, v2.y));
}

export function flashSplitBall(index) {
  const ball = state.splitBalls[index];
  if (!ball) return;
  ball.hitUntil = nowMs() + 120;
}
