/*
 * systems/targets.js
 *
 * Lógica relacionada con los blancos (targets).  Este módulo se encarga
 * de crear blancos alrededor del jugador, asignarles un radio y
 * regenerarlos cuando sea necesario.  Los blancos existen en el mundo
 * 2D (coordenadas `x,y`) y se convierten a pantalla en el renderizado.
 */

import { CFG, MARGIN } from '../config.js';
import * as state from '../state.js';
import { clamp, screenToWorld } from '../utils/math.js';
import { rand } from '../utils/math.js';

/**
 * Devuelve un radio para un nuevo target.  Si la opción
 * `CFG.randomTargetSize` está activada, se genera un valor aleatorio
 * alrededor de `CFG.targetR`.  De lo contrario se utiliza el valor fijo.
 */
export function pickTargetRadius() {
  if (!CFG.randomTargetSize) return CFG.targetR;
  const base = CFG.targetR;
  const r = base * (0.6 + Math.random() * 1.4); // 0.6x .. 2.0x
  return clamp(r, 4, 200);
}

/**
 * Genera un nuevo blanco cerca del jugador.  El blanco se spawnea en
 * coordenadas de mundo, a una distancia aleatoria dentro de un margen
 * definido por `MARGIN`, teniendo en cuenta la rotación del jugador.
 *
 * @returns {Object} nuevo blanco con { x, y, r, hitStart, dead }
 */
export function spawnTargetNearPlayer() {
  const canvas = state.canvas;
  const limX = canvas.width / 2 - MARGIN;
  const limY = canvas.height / 2 - MARGIN;
  // Offset aleatorio en pantalla
  const sx = (Math.random() * 2 - 1) * limX;
  const sy = (Math.random() * 2 - 1) * limY;
  const cos = Math.cos(state.rollAngle);
  const sin = Math.sin(state.rollAngle);
  // Convertimos a desplazamiento en mundo teniendo en cuenta la rotación
  const w = screenToWorld(sx, sy, cos, sin);
  return {
    x: state.player.x + w.dx,
    y: state.player.y + w.dy,
    r: pickTargetRadius(),
    hitStart: 0,
    dead: false
  };
}

/**
 * Reaparece todos los blancos según `CFG.targetCount`.  Si se
 * establecen 0 o más de 20 blancos, se clampa al rango 1..20.  El
 * arreglo `state.targets` se reemplaza por completo.
 */
export function respawnAllTargets() {
  // Permitimos cero targets cuando así se configura en `CFG.targetCount`.
  // Se clampa al rango 0..20 en lugar de 1..20, de modo que el usuario
  // pueda practicar sólo con movers.  Si `n` es 0 se asigna un arreglo
  // vacío y no se spawnean targets.
  const n = clamp(Math.round(CFG.targetCount), 0, 20);
  state.targets = [];
  for (let i = 0; i < n; i++) {
    state.targets.push(spawnTargetNearPlayer());
  }
}

/**
 * Aplica un radio uniforme a todos los blancos activos.  Se utiliza
 * cuando se desactiva el tamaño aleatorio y se quiere igualar todos los
 * targets al valor de `CFG.targetR`.
 */
export function applyUniformRadiusToAll() {
  for (const t of state.targets) {
    t.r = CFG.targetR;
  }
}