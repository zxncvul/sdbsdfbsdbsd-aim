/*
 * utils/math.js
 *
 * Conjunto de funciones matemáticas y utilidades para transformar
 * coordenadas y normalizar valores de los ejes del gamepad.  Estas
 * funciones no mantienen estado propio, por lo que pueden ser
 * importadas y usadas en cualquier módulo sin riesgo.
 *
 * ZONA SEGURA: puedes reutilizar estas funciones en otros proyectos si
 * lo necesitas.  Mantienen la misma lógica que en la versión original.
 */

import { DEADZONE, NOISE_SNAP } from '../config.js';

/**
 * Restringe un valor `v` al rango [a, b].  Si `v` es menor que `a`,
 * devuelve `a`; si es mayor que `b`, devuelve `b`.
 * @param {number} v valor a acotar
 * @param {number} a límite inferior
 * @param {number} b límite superior
 */
export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/**
 * Elimina la zona muerta del mando.  Si el valor absoluto de `v` es
 * inferior a `DEADZONE`, se devuelve 0; en caso contrario se devuelve
 * `v`.  Esto evita movimientos involuntarios del joystick.
 * @param {number} v valor del eje del gamepad
 */
export function dz(v) {
  return Math.abs(v) < DEADZONE ? 0 : v;
}

/**
 * Elimina ruido muy pequeño que puede aparecer incluso fuera de la zona
 * muerta.  Si el valor absoluto de `v` es inferior a `NOISE_SNAP`, se
 * devuelve 0.
 * @param {number} v valor del eje del gamepad
 */
export function snap0(v) {
  return Math.abs(v) < NOISE_SNAP ? 0 : v;
}

/**
 * Limpia un valor de eje del gamepad.  Asegura que es finito, lo clampa
 * al rango [-1,1], aplica la zona muerta y elimina pequeños ruidos.
 * @param {number} v valor del eje del gamepad
 */
export function cleanAxis(v) {
  if (!Number.isFinite(v)) v = 0;
  v = clamp(v, -1, 1);
  v = dz(v);
  v = snap0(v);
  return v;
}

/**
 * Devuelve un objeto donde sólo se conserva el eje dominante.  Compara
 * las magnitudes absolutas de `x` y `y`; el eje mayor conserva su valor
 * y el otro se anula.  Esto se utiliza para evitar movimientos
 * diagonales no deseados cuando sólo se desea priorizar roll o pitch/yaw.
 * @param {number} x componente X (roll)
 * @param {number} y componente Y (pitch)
 */
export function dominantAxis(x, y) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax > ay) return { x, y: 0 };
  if (ay > ax) return { x: 0, y };
  return { x: 0, y: 0 };
}

/**
 * Convierte un desplazamiento en coordenadas de mundo (`dx`, `dy`) a
 * coordenadas de pantalla (`sx`, `sy`) aplicando la rotación actual.
 * @param {number} dx desplazamiento en X en mundo
 * @param {number} dy desplazamiento en Y en mundo
 * @param {number} cos coseno del ángulo de roll
 * @param {number} sin seno del ángulo de roll
 */
export function worldToScreen(dx, dy, cos, sin) {
  return { sx: (dx * cos) - (dy * sin), sy: (dx * sin) + (dy * cos) };
}

/**
 * Convierte un punto en pantalla (`sx`, `sy`) a desplazamiento en el
 * mundo (`dx`, `dy`) aplicando la rotación inversa (‑roll).  Se usa para
 * spawnear blancos y movers en torno al jugador teniendo en cuenta la
 * rotación.
 * @param {number} sx coordenada X en pantalla
 * @param {number} sy coordenada Y en pantalla
 * @param {number} cos coseno del ángulo de roll
 * @param {number} sin seno del ángulo de roll
 */
export function screenToWorld(sx, sy, cos, sin) {
  return { dx: (sx * cos) + (sy * sin), dy: (-sx * sin) + (sy * cos) };
}

/**
 * Aplica una curva tipo J a un valor de eje del gamepad.  Con la curva J
 * se consigue que los pequeños movimientos del mando tengan menos
 * sensibilidad (movimiento más lento) y a medida que el eje se acerca a
 * su máximo, la respuesta crece de forma exponencial.  Se controla con
 * los parámetros `cp` (curva en %) y `va` (un valor adicional).
 * @param {number} v valor del eje en el rango [‑1,1]
 * @param {number} cp punto de control (0–60)
 * @param {number} va valor adicional (1–10)
 */
export function applyJCurve(v, cp, va) {
  const sign = Math.sign(v);
  const x = Math.abs(v);
  const expo = 1.0 + (cp * 0.03) + ((10 - va) * 0.18);
  return sign * Math.pow(x, expo);
}

/**
 * Devuelve un número aleatorio en el rango [a, b].  Se utiliza para
 * spawnear elementos en posiciones aleatorias.
 * @param {number} a límite inferior
 * @param {number} b límite superior
 */
export function rand(a, b) {
  return a + Math.random() * (b - a);
}