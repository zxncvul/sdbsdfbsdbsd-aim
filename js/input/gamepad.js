/*
 * input/gamepad.js
 *
 * Este módulo encapsula la lectura del gamepad a través de la API
 * `navigator.getGamepads()`.  En la mayoría de navegadores, el array
 * devuelto puede contener `null` en algunas posiciones, por lo que
 * siempre comprobamos que existe un objeto antes de usarlo.  También se
 * exporta una pequeña función de formateo utilizada en el HUD de
 * desarrollo.
 */

/**
 * Devuelve el gamepad activo en la posición `index`.  Si no existe
 * gamepad conectado en ese índice, se devuelve `null`.
 * @param {number} index índice del mando (por defecto 0)
 */
export function getPad(index = 0) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  return pads[index] || null;
}

/**
 * Formatea un número a tres decimales y con signo.  Se utiliza en el
 * HUD de desarrollo para mostrar valores de los ejes.
 * @param {number} n número a formatear
 */
export function fmt(n) {
  return (n >= 0 ? '+' : '') + n.toFixed(3);
}