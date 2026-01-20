/*
 * render/background.js
 *
 * Dibuja el fondo de la escena.  Puede ser negro, gris sólido o una
 * malla cuadriculada que rota con el jugador.  La malla se dibuja
 * extralarge para cubrir toda la pantalla incluso cuando el jugador se
 * desplaza.
 */

import { CFG } from '../config.js';
import * as state from '../state.js';

/**
 * Dibuja el fondo completo del canvas.  Según la configuración, puede
 * mostrar un fondo negro, gris oscuro o una malla que gira con el
 * jugador.
 */
export function drawBackground() {
  const ctx = state.ctx;
  const canvas = state.canvas;
  if (!ctx || !canvas) return;
  // Fondo negro simple
  if (CFG.blackBg) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  // Fondo gris simple sin malla
  if (!CFG.showGrid) {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  // Malla cuadriculada
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(state.rollAngle);
  const size = 40;
  const w = canvas.width * 1.6;
  const h = canvas.height * 1.6;
  // Coordenada base en múltiplos de `size` relativa al jugador
  const baseX = Math.floor(state.player.x / size) * size;
  const baseY = Math.floor(state.player.y / size) * size;
  for (let x = baseX - w; x <= baseX + w; x += size) {
    for (let y = baseY - h; y <= baseY + h; y += size) {
      const ix = Math.floor(x / size);
      const iy = Math.floor(y / size);
      ctx.fillStyle = ((ix + iy) % 2 === 0) ? '#1a1a1a' : '#141414';
      ctx.fillRect(x - state.player.x, y - state.player.y, size, size);
    }
  }
  ctx.restore();
}