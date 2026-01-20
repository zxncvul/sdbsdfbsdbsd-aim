/*
 * utils/time.js
 *
 * Función auxiliar para obtener el tiempo actual en milisegundos.
 * Encapsular `performance.now()` facilita su sustitución en tests o
 * futuros cambios.  Todos los módulos que necesitan tiempos deben
 * importar `nowMs()` en lugar de llamar directamente a `performance.now()`.
 */

/**
 * Devuelve el tiempo actual en milisegundos desde que se carga la
 * página.  Internamente usa `performance.now()` para mayor precisión.
 */
export function nowMs() {
  return performance.now();
}