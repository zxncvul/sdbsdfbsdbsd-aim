/*
 * render/crosshair.js
 *
 * Dibuja la mirilla en el centro de la pantalla.  Cuando el jugador
 * dispara, la mirilla hace un pequeño flash y se amplía durante unos
 * milisegundos.  No depende de la rotación ni del estado del mundo.
 */

import { CROSSHAIR_FLASH_MS } from '../config.js';
import * as state from '../state.js';
import { nowMs } from '../utils/time.js';

/**
 * Dibuja la mirilla.  Si `state.crosshairFlashUntil` es mayor que el
 * tiempo actual, se aplica un escalado y un trazo más grueso para
 * simular un destello de disparo.
 */
export function drawCrosshair() {
  const ctx = state.ctx;
  const canvas = state.canvas;
  if (!ctx || !canvas) return;
  const t = nowMs();
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const flashing = t < state.crosshairFlashUntil;
  const scale = flashing ? 1.35 : 1.0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#00ffcc';
  ctx.lineWidth = flashing ? 2 : 1;
  // Cruces
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(10, 0);
  ctx.moveTo(0, -10);
  ctx.lineTo(0, 10);
  ctx.stroke();
  if (flashing) {
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}