/*
 * render/canvas.js
 *
 * Gestiona la inicialización del canvas y su redimensionado.  El juego
 * utiliza un canvas 2D a pantalla completa.  Este módulo expone una
 * función para inicializar el canvas y ajustar su tamaño cada vez que
 * cambia el tamaño de la ventana.
 */

/**
 * Inicializa el canvas con el id proporcionado.  Ajusta su tamaño a
 * `innerWidth` e `innerHeight` y registra un listener para mantenerlo a
 * pantalla completa.
 *
 * @param {string} id identificador del elemento `<canvas>`
 */
export function initCanvas(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  function resize() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();
  return { canvas, ctx, resize };
}
