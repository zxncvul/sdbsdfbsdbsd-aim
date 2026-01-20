/*
 * render/drawTargets.js
 *
 * Encargado de dibujar los blancos (círculos blancos) y los movers
 * amarillos en el canvas.  Aplica la rotación actual para que todo se
 * vea coherente con el ángulo de roll del jugador.  También gestiona
 * animaciones de golpeo y respawn (cambiando alfa y color al acertar).
 */

import { CFG, HIT_FADE_MS } from '../config.js';
import * as state from '../state.js';
import { nowMs } from '../utils/time.js';

/**
 * Dibuja todos los blancos y movers en el canvas.  Los blancos
 * desaparecen lentamente al ser golpeados y reaparecen en verde.  Los
 * movers se dibujan en amarillo y en verde cuando se les impacta.
 */
export function drawTargets() {
  const ctx = state.ctx;
  const canvas = state.canvas;
  if (!ctx || !canvas) return;
  const t = nowMs();
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(state.rollAngle);
  // Dibujar blancos
  for (const tg of state.targets) {
    if (tg.dead) continue;
    const tx = tg.x - state.player.x;
    const ty = tg.y - state.player.y;
    let color = '#ffffff';
    let alpha = 1;
    if (tg.hitStart) {
      color = '#22cc66';
      const p = Math.max(0, Math.min(1, (t - tg.hitStart) / HIT_FADE_MS));
      alpha = 1 - p;
    }
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(tx, ty, tg.r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Dibujar movers (amarillos)
  if (CFG.moversEnabled && state.movers.length > 0) {
    for (const m of state.movers) {
      if (m.dead) continue;
      // Posición relativa del mover al jugador
      const tx = m.x - state.player.x;
      const ty = m.y - state.player.y;
      ctx.beginPath();
      ctx.arc(tx, ty, m.r, 0, Math.PI * 2);
      // Seleccionamos el color según el número de impactos recibidos.
      // 0 hits → verde; 1 hit → amarillo; 2 hits → naranja; 3 hits o más → rojo.
      let color;
      if (m.hits >= 3) {
        color = '#ff4444';
      } else if (m.hits === 2) {
        color = '#ff8800';
      } else if (m.hits === 1) {
        color = '#ffd200';
      } else {
        color = '#22cc66';
      }
      // Si el mover acaba de ser golpeado, usamos un verde brillante para
      // destacarlo independientemente de su estado.
      const isHit = nowMs() < (m.hitUntil || 0);
      ctx.fillStyle = isHit ? '#22ff88' : color;
      ctx.fill();
    }
  }
  ctx.restore();
}