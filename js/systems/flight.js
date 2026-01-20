/*
 * systems/flight.js
 *
 * Implementa el modo FA‑off (Flight Assist off), que añade inercia a los
 * movimientos del jugador.  Sin FA‑off, el movimiento es inmediato y se
 * detiene al soltar el mando.  Con FA‑off activado, el jugador tiene
 * velocidad y aceleración, pudiendo mantener movimiento aunque no se
 * accione el stick y rotando con más suavidad.
 *
 * Las funciones `stepMove` y `stepRoll` calculan el desplazamiento en
 * función de la aceleración entrada y el tiempo normalizado `dtN`.  La
 * velocidad máxima se limita para evitar que el jugador salga disparado.
 */

import { clamp } from '../utils/math.js';

// Velocidades internas.  Se mantienen entre frames mientras FA‑off
// permanezca activado.
let vx = 0;
let vy = 0;
let w  = 0;

/**
 * Resetea las velocidades de FA‑off a cero.  Útil cuando se desactiva
 * FA‑off o se pulsa Shift+F.
 */
export function reset() {
  vx = 0;
  vy = 0;
  w  = 0;
}

/**
 * Aplica una aceleración en los ejes X e Y del mundo y devuelve el
 * desplazamiento correspondiente.  La velocidad se actualiza para el
 * siguiente frame.  Si la magnitud supera `maxV`, se normaliza al
 * límite especificado.
 *
 * @param {number} ax aceleración en X en el mundo
 * @param {number} ay aceleración en Y en el mundo
 * @param {number} dtN tiempo normalizado (1 ≈ 16.6 ms) entre frames
 * @param {number} maxV velocidad máxima permitida
 * @returns {{dx:number, dy:number, vx:number, vy:number}} desplazamiento en X/Y y velocidades actuales
 */
export function stepMove(ax, ay, dtN, maxV) {
  vx += ax * dtN;
  vy += ay * dtN;
  const sp = Math.hypot(vx, vy);
  if (sp > maxV && sp > 0) {
    vx = (vx / sp) * maxV;
    vy = (vy / sp) * maxV;
  }
  return { dx: vx * dtN, dy: vy * dtN, vx, vy };
}

/**
 * Aplica una aceleración angular para el roll.  La velocidad angular
 * acumulada se limita al valor `maxW`.  Devuelve cuánto debe rotarse en
 * este frame (`dAngle`) y la nueva velocidad angular.
 *
 * @param {number} rollIn entrada de roll (‑1..1) del gamepad
 * @param {number} dtN tiempo normalizado
 * @param {number} angAccel aceleración angular máxima
 * @param {number} maxW velocidad angular máxima
 * @returns {{dAngle:number, w:number}} incremento del ángulo y velocidad actual
 */
export function stepRoll(rollIn, dtN, angAccel, maxW) {
  w += rollIn * angAccel * dtN;
  w = clamp(w, -maxW, maxW);
  return { dAngle: w * dtN, w };
}

/**
 * Devuelve las velocidades internas actuales.  Útil para mostrarlas en
 * el HUD de desarrollo.
 */
export function getVel() {
  return { vx, vy, w };
}