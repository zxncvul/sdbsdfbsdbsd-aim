/*
 * systems/movers.js
 *
 * Controla los objetos amarillos llamados “movers”.  Estos objetos se
 * desplazan dentro de la ventana, evitando chocar con los blancos y
 * entre ellos.  Pueden moverse con distintos patrones: rebote (bounce),
 * órbita, curvas de Lissajous o barrido lateral (strafe).  La cantidad,
 * velocidad y comportamiento de esquiva se configuran desde `CFG`.
 */

import { CFG, MARGIN, MOVERS_MAX_HITS, HEAL_INTERVAL_MS } from '../config.js';
import * as state from '../state.js';
import { clamp, worldToScreen, screenToWorld, rand } from '../utils/math.js';
import { nowMs } from '../utils/time.js';

// Lista de patrones disponibles.  Se conserva por compatibilidad con
// código antiguo pero ya no se usa para el movimiento.  Los nuevos
// patrones se especifican más abajo.
const PATTERNS = ['bounce', 'orbit', 'lissajous', 'strafe', 'circular', 'spiral', 'figure8', 'zigzag'];

/*
 * MICRO‑PATRONES
 *
 * Los movers combinan un desplazamiento macro (anchor) con un
 * micro‑patrón local alrededor de ese anchor.  Para dotar de mayor
 * variedad y legibilidad a los movimientos se definen varios
 * micro‑patrones.  Cada uno se implementa como una función que
 * recibe el tiempo transcurrido (en segundos), un valor de ganancia
 * (`gain`) que controla la amplitud dentro de su tier (S/M/L) y
 * devuelve un desplazamiento {x, y} en coordenadas de pantalla
 * normalizadas (amplitud 1).  El desplazamiento final se escala
 * posteriormente con TIER_SCALE o SPIRAL_SCALE y con el parámetro
 * `microGain` de cada mover.
 */

// Implementación de patrones básicos y variantes.  Se aceptan los
// siguientes nombres: figure8, figure8Wide, figure8Spiral, spiral,
// spiralBurst.  Los patrones de figura de ocho se basan en curvas de
// Lissajous con distintas frecuencias.  Los patrones de espiral
// producen trayectorias que crecen radialmente con el tiempo.
const MICRO_PATTERNS = {
  figure8: (t, gain, opts) => {
    const w = opts.w * gain;
    const x = Math.sin(w * t + (opts.phase1 || 0));
    const y = Math.sin(w * 2.0 * t + (opts.phase2 || 0));
    return { x, y };
  },
  figure8Wide: (t, gain, opts) => {
    // Variante con frecuencia no entera y diferente escala entre ejes
    const w = opts.w * gain;
    const x = Math.sin(w * t + (opts.phase1 || 0));
    const y = Math.sin(w * 1.4 * t + (opts.phase2 || 0));
    return { x: x, y: y * 0.8 };
  },
  figure8Spiral: (t, gain, opts) => {
    // Combinación de figura de ocho y espiral: se incrementa la
    // amplitud lentamente a lo largo de la duración del patrón para
    // crear un efecto de “ocho” expandiéndose.
    const w = opts.w * gain;
    const cycle = opts.duration > 0 ? (opts.elapsed / opts.duration) : 0;
    const scale = 0.3 + 0.7 * cycle;
    const x = Math.sin(w * t + (opts.phase1 || 0)) * scale;
    const y = Math.sin(w * 2.0 * t + (opts.phase2 || 0)) * scale;
    return { x, y };
  },
  spiral: (t, gain, opts) => {
    // Espiral clásica: el radio crece de 0 a 1 linealmente con el
    // tiempo.  Para evitar arranques bruscos, elevamos el ciclo a
    // una potencia sub‑lineal.
    const w = opts.w * gain;
    const cycle = opts.duration > 0 ? ((opts.elapsed % opts.duration) / opts.duration) : 0;
    const r = Math.pow(cycle, 0.9);
    const a = w * t + (opts.phase1 || 0);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    return { x, y };
  },
  spiralBurst: (t, gain, opts) => {
    // Espiral con “explosiones” sucesivas.  Se divide la duración en
    // tres subciclos; cada uno genera una espiral corta.  El radio
    // aumenta rápidamente y se reinicia al final de cada subciclo.
    const w = opts.w * gain;
    const cycles = 3;
    const cycle = opts.duration > 0 ? ((opts.elapsed % opts.duration) / opts.duration) : 0;
    const sub = (cycle * cycles) % 1;
    const r = Math.pow(sub, 0.7);
    const a = w * t + (opts.phase1 || 0);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    return { x, y };
  }
  ,
  // Patrón rosette (hipotrocoide aproximado).  Combina una órbita
  // principal con una frecuencia más alta para crear pétalos.  El
  // parámetro k determina el número de lóbulos; se usa un valor no
  // entero para evitar que el patrón repita exactamente.
  rosette: (t, gain, opts) => {
    const w = opts.w * gain;
    // frecuencia principal y secundaria
    const k = 3.7;
    const a = 0.35;
    const angle1 = w * t + (opts.phase1 || 0);
    const angle2 = k * w * t + (opts.phase2 || 0);
    const x = Math.cos(angle1) + a * Math.cos(angle2);
    const y = Math.sin(angle1) - a * Math.sin(angle2);
    return { x, y };
  },
  // Patrón "swerveStop": produce un movimiento con pausas y giros
  // bruscos.  Durante la primera parte del ciclo el desplazamiento es
  // prácticamente nulo (mover parado); después realiza un semicírculo
  // rápido y vuelve a la pausa.  Este patrón ofrece un evasivo
  // stop‑and‑go para diversificar.
  swerveStop: (t, gain, opts) => {
    const w = opts.w * gain;
    const cycle = opts.duration > 0 ? ((opts.elapsed % opts.duration) / opts.duration) : 0;
    let x = 0;
    let y = 0;
    // pausa inicial
    if (cycle < 0.35) {
      x = 0;
      y = 0;
    } else {
      const p = (cycle - 0.35) / 0.65;
      const a = w * t * 1.2;
      // semicírculo con easing
      const ease = p * p * (3 - 2 * p);
      x = Math.cos(a) * ease;
      y = Math.sin(a) * 0.5 * ease;
    }
    return { x, y };
  }
};

// Listado de nombres de patrones para fácil elección.  Se usa para
// iterar y validar entradas externas.
const MICRO_PATTERN_NAMES = Object.keys(MICRO_PATTERNS);

/*
 * ROLES
 *
 * Cada mover puede adoptar un rol que sesga su elección de anchor,
 * patrón y tamaño.  Para evitar clones, se limitan a dos movers por
 * rol.  Los roles pueden cambiar dinámicamente cada ciertos
 * segundos.  Cada rol define pesos para seleccionar patrones y
 * tamaños, así como una preferencia de distancia al centro al
 * seleccionar un anchor (anchorBias).  Un valor positivo favorece
 * anchors lejanos; uno negativo favorece centros.
 */
const ROLES = {
  Runner: {
    anchorBias: 0.7,
    patternWeights: { spiral: 2, spiralBurst: 1.5, figure8: 1, figure8Wide: 0.5, figure8Spiral: 0.5 },
    tierWeights: { S: 1, M: 1.5, L: 2 }
  },
  Dancer: {
    anchorBias: -0.2,
    patternWeights: { figure8: 2, figure8Wide: 1.5, figure8Spiral: 1.2, spiral: 0.5, spiralBurst: 0.5 },
    tierWeights: { S: 1.5, M: 1, L: 0.8 }
  },
  Trickster: {
    anchorBias: 0.0,
    patternWeights: { figure8Wide: 2, figure8Spiral: 2, spiralBurst: 1, spiral: 0.8, figure8: 0.8 },
    tierWeights: { S: 1, M: 1, L: 1 }
  },
  Kiter: {
    anchorBias: 0.5,
    patternWeights: { spiral: 1.8, spiralBurst: 1.8, figure8: 1, figure8Wide: 0.5, figure8Spiral: 0.5 },
    tierWeights: { S: 0.8, M: 1.2, L: 1.8 }
  }
};

/*
 * EPISODES
 *
 * Además del rol, cada mover entra en un estado o "episodio" que
 * determina su macro‑intención actual: explorar la pantalla,
 * exhibir un patrón grande, evadir amenazas o bordear la zona.  Los
 * episodios duran unos pocos segundos y cambian aleatoriamente,
 * limitando el número de movers en el mismo episodio para evitar
 * clones.  Cada episodio define pesos para patrones y tamaños, un
 * sesgo de anchor y una velocidad de macro desplazamiento
 * (macroSpeed) que influye en la duración de la transición de
 * anchors.
 */
const EPISODES = {
  Explore: {
    anchorBias: 0.2,
    patternWeights: { figure8: 1, figure8Wide: 1, figure8Spiral: 0.7, spiral: 0.6, spiralBurst: 0.5, rosette: 0.8, swerveStop: 0.8 },
    tierWeights: { S: 1.2, M: 1.0, L: 0.8 },
    macroSpeed: 1.1
  },
  Perform: {
    anchorBias: 0.0,
    patternWeights: { figure8: 2, figure8Wide: 1.5, figure8Spiral: 1.2, spiral: 1.2, spiralBurst: 1.0, rosette: 0.7, swerveStop: 0.5 },
    tierWeights: { S: 0.8, M: 1.2, L: 1.6 },
    macroSpeed: 0.7
  },
  Evade: {
    anchorBias: 0.6,
    patternWeights: { figure8: 0.7, figure8Wide: 0.7, figure8Spiral: 0.8, spiral: 0.6, spiralBurst: 0.8, rosette: 1.0, swerveStop: 1.5 },
    tierWeights: { S: 1.6, M: 1.0, L: 0.7 },
    macroSpeed: 1.4
  },
  Kite: {
    anchorBias: 0.8,
    patternWeights: { figure8: 0.8, figure8Wide: 0.6, figure8Spiral: 0.7, spiral: 1.5, spiralBurst: 1.3, rosette: 1.2, swerveStop: 0.6 },
    tierWeights: { S: 0.9, M: 1.1, L: 1.4 },
    macroSpeed: 1.0
  }
};

// Número máximo de movers permitidos por episodio.  Limitar la
// presencia simultánea evita que todos se comporten igual.  Si se
// alcanzan estos límites, se elige el episodio con menos
// instancias.
const EPISODE_MAX_COUNT = 2;

// Registro temporal de cuántos movers hay en cada episodio.
const episodeCounts = {};

// Elige un episodio aleatorio respetando la restricción de clones.
function pickEpisode() {
  for (const e in EPISODES) {
    if (episodeCounts[e] == null) episodeCounts[e] = 0;
  }
  const candidates = Object.entries(episodeCounts).filter(([name, count]) => count < EPISODE_MAX_COUNT);
  let chosen;
  if (candidates.length > 0) {
    const idx = Math.floor(Math.random() * candidates.length);
    chosen = candidates[idx][0];
  } else {
    // elige el episodio con menos instancias
    let min = Infinity;
    for (const [name, count] of Object.entries(episodeCounts)) {
      if (count < min) {
        min = count;
        chosen = name;
      }
    }
  }
  episodeCounts[chosen]++;
  return chosen;
}

// Número máximo de movers permitidos por rol para evitar clones.
const ROLE_MAX_COUNT = 2;

// Registro temporal de cuántos movers hay en cada rol.  Se inicializa
// dinámicamente en spawn.
const roleCounts = {};

// Genera un rol aleatorio respetando la restricción de clones.  Si
// todos los roles han alcanzado el máximo, se selecciona el que
// tenga menos instancias.  Devuelve el nombre del rol.
function pickRole() {
  // Inicializa recuento
  for (const r in ROLES) {
    if (roleCounts[r] == null) roleCounts[r] = 0;
  }
  const candidates = Object.entries(roleCounts).filter(([name, count]) => count < ROLE_MAX_COUNT);
  let chosen;
  if (candidates.length > 0) {
    // Elige uno al azar entre los que no están saturados
    const idx = Math.floor(Math.random() * candidates.length);
    chosen = candidates[idx][0];
  } else {
    // Busca el rol con menos instancias
    let min = Infinity;
    for (const [name, count] of Object.entries(roleCounts)) {
      if (count < min) {
        min = count;
        chosen = name;
      }
    }
  }
  roleCounts[chosen]++;
  return chosen;
}

/*
 * A partir de aquí se definen las constantes y estructuras necesarias
 * para implementar la nueva lógica de los movers.  En lugar de
 * seleccionar un patrón global al azar, cada mover dispone de dos
 * capas de movimiento: una capa de macro‑dispersión (ancla o
 * "anchor") que se reasigna periódicamente cubriendo toda la
 * pantalla, y una capa de micro‑patrones que dibuja un desplazamiento
 * local alrededor de su ancla mediante figuras de ocho o espirales.
 * Además se mantiene un mapa de calor (heatmap) en la pantalla para
 * repartir los anchors de los distintos movers y se alternan tamaños
 * pequeño/mediano/grande con transiciones suaves.
 */

// Número de celdas del heatmap en X e Y.  Un valor de 10x6 ofrece
// suficiente resolución sin ser demasiado costoso.  Se puede ajustar
// modificando estas constantes.
// Aumentamos la resolución del heatmap a 16×9 para una distribución
// más fina en pantallas modernas.  Esto ayuda a evitar que los
// movers se asienten en la misma zona.
const HEAT_COLS = 16;
const HEAT_ROWS = 9;

// Parámetros de decaimiento e incremento del heatmap.  Cada frame los
// valores se multiplican por HEATMAP_DECAY y se incrementa 1.0 en la
// celda del anchor activo.  Los anchors se elegirán favoreciendo
// celdas con menos calor y alejadas de otros movers y blancos.
const HEATMAP_DECAY  = 0.98;
const HEATMAP_INCREMENT = 1.0;

// Intervalo de reevaluación de anchors (milisegundos).  Al expirar
// este tiempo se elige una nueva posición de anchor en pantalla.  Para
// dar variedad se emplea un rango aleatorio entre estos valores.
const ANCHOR_MIN_MS = 2500;
const ANCHOR_MAX_MS = 6000;

// Duración mínima y máxima de cada micro‑patrón (figure‑8 o espiral).
// Una vez que expira se alternará el tipo y el tamaño según una
// secuencia S→M→L→M→S…
const MICRO_MIN_MS   = 2500;
const MICRO_MAX_MS   = 5000;

// Tiempo de mezcla al cambiar de tamaño o de patrón (milisegundos).
// Se hace una interpolación lineal entre el desplazamiento anterior y
// el nuevo para evitar cortes bruscos.
const MICRO_BLEND_MS = 600;

// Secuencia de tamaños.  La secuencia incluye un retroceso para que
// después de "L" vuelva a "M" y luego a "S".
const MICRO_TIERS = ['S', 'M', 'L', 'M', 'S'];

// Factores de amplitud para los patrones de figure‑8.  Cada tamaño
// representa un porcentaje del espacio disponible en X e Y.  Al ser
// valores proporcionales al "limX" y "limY", se adaptan a la
// resolución de la ventana.
// Factores de amplitud para los patrones de figure‑8.  Ajustamos
// estos valores para aumentar la legibilidad y aprovechar mejor la
// pantalla.  Los valores anteriores (0.12, 0.25, 0.38) resultaban
// pequeños en resoluciones grandes.  Ahora S usa ~15 % del ancho,
// M ~35 % y L ~60 % del espacio horizontal (en vertical se adapta al
// alto).  L recorre gran parte de la pantalla para patrones más
// amplios.
const TIER_SCALE = { S: 0.15, M: 0.35, L: 0.60 };

// Factores de radio máximo para los patrones de espiral.  Al igual
// que TIER_SCALE se expresan como porcentaje del menor de limX y limY.
// Factores de radio máximo para los patrones de espiral.  Se elevan
// respecto a la versión anterior para que las espirales abarquen una
// porción mayor de la pantalla.  L alcanza ~75 % del semieje
// menor, creando grandes remolinos; S y M son proporciones más
// pequeñas pero igualmente legibles.
const SPIRAL_SCALE = { S: 0.25, M: 0.50, L: 0.75 };

// Heatmap global.  Cada celda almacena un valor acumulado de
// ocupación que se incrementa cuando un mover se ancla allí y decae
// lentamente con el tiempo.  Esto permite distribuir uniformemente
// las posiciones de los anchors.
let heatMap = Array.from({ length: HEAT_ROWS }, () => new Array(HEAT_COLS).fill(0));

// Decae el heatmap multiplicando cada celda por HEATMAP_DECAY.  Se
// invoca al comienzo de cada frame para evitar acumulaciones
// permanentes.
function decayHeatMap() {
  for (let r = 0; r < HEAT_ROWS; r++) {
    const row = heatMap[r];
    for (let c = 0; c < HEAT_COLS; c++) {
      row[c] *= HEATMAP_DECAY;
    }
  }
}

// Devuelve los índices de fila y columna del heatmap correspondientes
// a unas coordenadas de pantalla (sx, sy).  Se usa para acumular
// calor en la celda del anchor actual.
function getCellForPos(sx, sy, limX, limY) {
  const cellW = (limX * 2) / HEAT_COLS;
  const cellH = (limY * 2) / HEAT_ROWS;
  const cx = Math.floor((sx + limX) / cellW);
  const cy = Math.floor((sy + limY) / cellH);
  // clamp a los límites
  const col = clamp(cx, 0, HEAT_COLS - 1);
  const row = clamp(cy, 0, HEAT_ROWS - 1);
  return { row, col };
}

// Selecciona una nueva celda de anchor para el mover `m`.  Se evalúan
// varias celdas aleatorias y se calcula una puntuación basada en el
// calor, la distancia a otros movers, la distancia a los blancos y la
// preferencia de alejarse del centro si el modo de huida está activo.
function chooseNewAnchor(m, t, limX, limY, liveTargetsScr, moversList) {
  let best = null;
  // Realizamos varios intentos al azar para encontrar una celda
  // adecuada.  Cuantos más intentos, más uniforme la distribución.
  for (let attempt = 0; attempt < 20; attempt++) {
    const c = Math.floor(rand(0, HEAT_COLS));
    const r = Math.floor(rand(0, HEAT_ROWS));
    const cellHeat = heatMap[r][c];
    // Coordenada central de la celda candidate
    const cellW = (limX * 2) / HEAT_COLS;
    const cellH = (limY * 2) / HEAT_ROWS;
    const sx = -limX + (c + 0.5) * cellW;
    const sy = -limY + (r + 0.5) * cellH;
    // Distancia mínima a anchors de otros movers
    let minDistMovers = Infinity;
    for (const other of moversList) {
      if (other === m) continue;
      if (other.anchorSx === undefined || other.anchorSy === undefined) continue;
      const dxs = sx - other.anchorSx;
      const dys = sy - other.anchorSy;
      const d = Math.hypot(dxs, dys);
      if (d < minDistMovers) minDistMovers = d;
    }
    // Distancia mínima a blancos vivos
    let minDistTg = Infinity;
    for (const tg of liveTargetsScr) {
      const dxs = sx - tg.sx;
      const dys = sy - tg.sy;
      const d = Math.hypot(dxs, dys) - (tg.r + m.r + 60);
      if (d < minDistTg) minDistTg = d;
    }
    // Distancia al centro (jugador).  Se usa para favorecer posiciones
    // alejadas cuando el modo flee está activo.
    const distCenter = Math.hypot(sx, sy);
    // Cálculo de la puntuación.  Un calor bajo mejora la puntuación,
    // mayor distancia a otros movers también, mientras que estar muy
    // cerca de un blanco penaliza.  Si flee está activo se premian
    // posiciones alejadas del centro.  Además cada rol aporta un
    // sesgo hacia anchors más alejados o más cercanos según su
    // anchorBias.
    let score = 0;
    // menor calor => mejor
    score += (1 - cellHeat * 0.1);
    // distancia a otros movers normalizada
    score += (minDistMovers / Math.max(limX, limY)) * 1.2;
    // penaliza si invade un blanco
    if (minDistTg < 0) score -= 2.0;
    // distancia al centro si flee
    if (CFG.moversFlee) {
      score += (distCenter / Math.max(limX, limY)) * 0.5;
    }
    // Sesgo del rol: favorece o penaliza anchors lejanos.  Un valor
    // positivo incrementa la puntuación cuanto más lejos del centro.
    const roleBias = (m.role && ROLES[m.role]) ? ROLES[m.role].anchorBias : 0;
    score += (distCenter / Math.max(limX, limY)) * roleBias;
    if (!best || score > best.score) {
      best = { row: r, col: c, sx, sy, score };
    }
  }
  // Si se encontró una celda adecuada, actualizamos el anchor
  if (best) {
    m.anchorSx = best.sx;
    m.anchorSy = best.sy;
    m.anchorExpires = t + rand(ANCHOR_MIN_MS, ANCHOR_MAX_MS);
    heatMap[best.row][best.col] += HEATMAP_INCREMENT;
  } else {
    // Como último recurso se asigna un punto aleatorio dentro de la
    // pantalla
    m.anchorSx = rand(-limX * 0.8, limX * 0.8);
    m.anchorSy = rand(-limY * 0.8, limY * 0.8);
    m.anchorExpires = t + rand(ANCHOR_MIN_MS, ANCHOR_MAX_MS);
  }
}

/**
 * Selecciona un nuevo anchorTarget para un mover y calcula la
 * velocidad de transición hasta él.  Esta función implementa el
 * macro desplazamiento continuo sustituyendo al antiguo anchor
 * discreto.  Utiliza el heatmap para repartir objetivos, considera
 * las distancias a otros movers y a los blancos vivos e incorpora
 * los sesgos de rol y de episodio.  El anchor se moverá de forma
 * lineal hacia el nuevo destino durante un tiempo aleatorio
 * modulable por el parámetro `macroSpeed` del episodio.
 *
 * @param {Object} m mover
 * @param {number} t tiempo actual en ms
 * @param {number} limX semi‑ancho de la pantalla
 * @param {number} limY semi‑alto de la pantalla
 * @param {Array} liveTargetsScr blancos vivos en coords de pantalla
 * @param {Array} moversList lista de todos los movers
 */
function chooseNewAnchorTarget(m, t, limX, limY, liveTargetsScr, moversList) {
  let best = null;
  // determinamos el sesgo de anchor combinando rol y episodio
  let bias = 0;
  if (m.role && ROLES[m.role]) bias += ROLES[m.role].anchorBias || 0;
  if (m.episode && EPISODES[m.episode]) bias += EPISODES[m.episode].anchorBias || 0;
  // Intenta varios candidatos al azar
  for (let attempt = 0; attempt < 25; attempt++) {
    const c = Math.floor(rand(0, HEAT_COLS));
    const r = Math.floor(rand(0, HEAT_ROWS));
    const cellHeat = heatMap[r][c];
    // dimensiones de celda
    const cellW = (limX * 2) / HEAT_COLS;
    const cellH = (limY * 2) / HEAT_ROWS;
    // Jitter dentro de la celda para evitar puntos fijos
    const jitterX = (Math.random() - 0.5) * cellW * 0.8;
    const jitterY = (Math.random() - 0.5) * cellH * 0.8;
    const sx = -limX + (c + 0.5) * cellW + jitterX;
    const sy = -limY + (r + 0.5) * cellH + jitterY;
    // Distancias a otros movers
    let minDistMovers = Infinity;
    for (const other of moversList) {
      if (other === m) continue;
      if (other.anchorPosSx === undefined || other.anchorPosSy === undefined) continue;
      const dxs = sx - other.anchorPosSx;
      const dys = sy - other.anchorPosSy;
      const d = Math.hypot(dxs, dys);
      if (d < minDistMovers) minDistMovers = d;
    }
    // Distancia a blancos vivos
    let minDistTg = Infinity;
    for (const tg of liveTargetsScr) {
      const dxs = sx - tg.sx;
      const dys = sy - tg.sy;
      const d = Math.hypot(dxs, dys) - (tg.r + m.r + 60);
      if (d < minDistTg) minDistTg = d;
    }
    const distCenter = Math.hypot(sx, sy);
    let score = 0;
    // menor calor => mejor
    score += (1 - cellHeat * 0.1);
    // distancia a otros movers
    score += (minDistMovers / Math.max(limX, limY)) * 1.2;
    // penaliza invasión de blancos
    if (minDistTg < 0) score -= 2.5;
    // sesgo de flee y de rol/episodio
    if (CFG.moversFlee) {
      score += (distCenter / Math.max(limX, limY)) * 0.5;
    }
    score += (distCenter / Math.max(limX, limY)) * bias;
    if (!best || score > best.score) {
      best = { sx, sy, row: r, col: c, score };
    }
  }
  // actualizamos anchorTarget y velocidad de transición
  if (best) {
    const prevX = m.anchorPosSx != null ? m.anchorPosSx : 0;
    const prevY = m.anchorPosSy != null ? m.anchorPosSy : 0;
    const dist = Math.hypot(best.sx - prevX, best.sy - prevY) || 1;
    // duración entre 2000–5000 ms modificada por macroSpeed del episodio
    const macroSpeed = (m.episode && EPISODES[m.episode]) ? EPISODES[m.episode].macroSpeed : 1;
    const baseDur = rand(2000, 5000) / macroSpeed;
    // si la distancia es muy grande, aumentamos la duración para evitar saltos bruscos
    const dur = baseDur + dist * 0.3;
    m.anchorTargetSx = best.sx;
    m.anchorTargetSy = best.sy;
    m.anchorMoveStart = t;
    m.anchorMoveDuration = dur;
    m.anchorMoveEnd = t + dur;
    m.anchorVelSx = (best.sx - prevX) / dur;
    m.anchorVelSy = (best.sy - prevY) / dur;
    // incrementa el calor de la celda objetivo ligeramente para disuadir otros movers
    heatMap[best.row][best.col] += HEATMAP_INCREMENT;
  } else {
    // fallback a un punto aleatorio
    const sx = rand(-limX * 0.8, limX * 0.8);
    const sy = rand(-limY * 0.8, limY * 0.8);
    const prevX = m.anchorPosSx != null ? m.anchorPosSx : 0;
    const prevY = m.anchorPosSy != null ? m.anchorPosSy : 0;
    const dist = Math.hypot(sx - prevX, sy - prevY) || 1;
    const baseDur = rand(2000, 5000);
    const dur = baseDur + dist * 0.3;
    m.anchorTargetSx = sx;
    m.anchorTargetSy = sy;
    m.anchorMoveStart = t;
    m.anchorMoveDuration = dur;
    m.anchorMoveEnd = t + dur;
    m.anchorVelSx = (sx - prevX) / dur;
    m.anchorVelSy = (sy - prevY) / dur;
  }
}

// Alterna el micro‑patrón y el tamaño del mover.  Utiliza una
// secuencia de tamaños S→M→L→M→S para dar variedad y alterna entre
// figure‑8 y espiral.  Se ejecuta cuando expira el temporizador
// microNextSwitch.
function chooseNewMicro(m, t) {
  // Selección del siguiente micro‑patrón y tamaño.  Primero
  // actualizamos el índice de tier para alternar S→M→L→M→S de forma
  // cíclica.  Esto asegura que los movers no se sincronizan entre sí
  // gracias a que cada uno tiene su propio microTierIndex inicial.
  if (m.microTierIndex == null) {
    m.microTierIndex = 0;
  } else {
    m.microTierIndex = (m.microTierIndex + 1) % MICRO_TIERS.length;
  }
  const newTier = MICRO_TIERS[m.microTierIndex];
  // Determinamos el conjunto de patrones candidatos.  Si no se ha
  // producido una figura de ocho en varios ciclos se fuerza un
  // patrón de esa familia (anti‑sequía).
  let candidates = MICRO_PATTERN_NAMES;
  const forceFigure = (m.nonFigureCount != null && m.nonFigureCount >= 3);
  if (forceFigure) {
    candidates = MICRO_PATTERN_NAMES.filter(n => n.startsWith('figure8'));
  }
  // Ponderamos la elección según el rol.  Si no hay rol se usan
  // pesos uniformes.  Se calcula una distribución acumulativa para
  // seleccionar al azar.
  // Pesos combinados de rol y episodio.  Se multiplican los pesos
  // para acentuar las preferencias.  Si algún patrón no tiene peso
  // definido, se considera 1.
  const rolePat = (m.role && ROLES[m.role]) ? ROLES[m.role].patternWeights : {};
  const epiPat = (m.episode && EPISODES[m.episode]) ? EPISODES[m.episode].patternWeights : {};
  let sum = 0;
  const cum = [];
  for (let i = 0; i < candidates.length; i++) {
    const name = candidates[i];
    const wRole = rolePat[name] || 1;
    const wEpi = epiPat[name] || 1;
    const w = wRole * wEpi;
    sum += w;
    cum.push(sum);
  }
  const rPick = Math.random() * sum;
  let chosenName = candidates[0];
  for (let i = 0; i < cum.length; i++) {
    if (rPick <= cum[i]) { chosenName = candidates[i]; break; }
  }
  // Seleccionamos un nuevo nivel de tamaño (tier) con una ligera
  // ponderación por rol.  La secuencia base sigue la lista
  // MICRO_TIERS pero se puede variar ligeramente para los roles que
  // prefieren cierto tamaño.  Sumamos los pesos del rol y
  // seleccionamos el siguiente tier con esas probabilidades.
  // Pesos combinados de rol y episodio para tamaños
  const roleTier = (m.role && ROLES[m.role]) ? ROLES[m.role].tierWeights : { S: 1, M: 1, L: 1 };
  const epiTier = (m.episode && EPISODES[m.episode]) ? EPISODES[m.episode].tierWeights : { S: 1, M: 1, L: 1 };
  // Calculamos un nuevo tier index aleatorio influenciado por weights.
  // Para mantener la alternancia suavizamos la probabilidad de moverse
  // hacia el siguiente en la secuencia.
  const nextIndex = (m.microTierIndex + 1) % MICRO_TIERS.length;
  const tierCandidates = [MICRO_TIERS[nextIndex], MICRO_TIERS[(nextIndex + 1) % MICRO_TIERS.length], MICRO_TIERS[(nextIndex + 2) % MICRO_TIERS.length]];
  let tierSum = 0;
  const tierCum = [];
  for (const tName of tierCandidates) {
    const wRole = roleTier[tName] || 1;
    const wEpi = epiTier[tName] || 1;
    const w = wRole * wEpi;
    tierSum += w;
    tierCum.push(tierSum);
  }
  const trPick = Math.random() * tierSum;
  let chosenTierName = tierCandidates[0];
  for (let i = 0; i < tierCum.length; i++) {
    if (trPick <= tierCum[i]) { chosenTierName = tierCandidates[i]; break; }
  }
  // Actualizamos las propiedades del micro‑patrón
  m.microPattern = chosenName;
  m.microType = chosenName.includes('spiral') ? 'spiral' : 'figure8';
  m.microTier = chosenTierName;
  m.microTierIndex = MICRO_TIERS.indexOf(chosenTierName);
  m.microStart = t;
  // Duración aleatoria ajustada: los patrones de figuras de ocho suelen
  // durar un poco más para que se puedan leer.  Además se aplica un
  // ligero ajuste si el mover está amenazado (se gestionará en la
  // actualización principal).
  const baseDur = rand(MICRO_MIN_MS, MICRO_MAX_MS);
  // microDuration se recalculará en updateMovers según nivel de amenaza
  m.microDuration = baseDur;
  m.microBlendStart = t;
  m.microNextSwitch = t + baseDur;
  // Nueva ganancia aleatoria dentro del rango de ADN
  m.microGain = rand(m.dna.microGainMin, m.dna.microGainMax);
  // Reseteamos contadores anti‑sequía según el nuevo patrón
  if (chosenName.startsWith('figure8')) {
    m.nonFigureCount = 0;
  } else {
    m.nonFigureCount = (m.nonFigureCount || 0) + 1;
  }
  // Actualizamos lateralidad ocasionalmente para evitar sincronización
  if (Math.random() < 0.3) {
    m.fleeSide = (Math.random() < 0.5 ? 1 : -1);
  }
}

// Calcula el desplazamiento local del micro‑patrón para el mover `m`.
// Recibe el tiempo actual y los límites de pantalla.  Devuelve un
// objeto {x, y} con las coordenadas relativas en pantalla.  La
// interpolación lineal asegura transiciones suaves entre patrones y
// tamaños.
function computeMicroOffset(m, t, limX, limY) {
  // Calcula el desplazamiento del micro‑patrón usando la nueva
  // colección de patrones y parámetros personalizados.  Se obtienen
  // valores normalizados de la función de patrón y luego se escalan
  // según el tier y el microGain.
  const dtMs = t - (m.microStart || 0);
  const elapsedSec = dtMs * 0.001;
  const patternName = m.microPattern || (m.microType === 'figure8' ? 'figure8' : 'spiral');
  const fn = MICRO_PATTERNS[patternName] || MICRO_PATTERNS.figure8;
  // Factor de frecuencia actual (w) ya modulado en updateMovers
  const opts = {
    w: (m.wCurrent || 1) * (CFG.moversSpeed || 1),
    phase1: m.p1 || 0,
    phase2: m.p2 || 0,
    elapsed: dtMs,
    duration: m.microDuration || 1
  };
  // Ganancia específica del mover con modulación AM se asigna en updateMovers
  const g = (m.microGainEff != null ? m.microGainEff : m.microGain) || 1;
  // Obtenemos desplazamiento normalizado
  let pt = fn(elapsedSec, g, opts);
  // Rotación del patrón en un marco que gira lentamente
  if (m.frameAngle != null) {
    const a = m.frameAngle;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const rx = pt.x * cosA - pt.y * sinA;
    const ry = pt.x * sinA + pt.y * cosA;
    pt = { x: rx, y: ry };
  }
  // Escalado según tamaño y tipo de patrón
  let ampX = 0;
  let ampY = 0;
  if (patternName.includes('spiral')) {
    const base = SPIRAL_SCALE[m.microTier] * Math.min(limX, limY);
    ampX = base;
    ampY = base;
  } else {
    ampX = TIER_SCALE[m.microTier] * limX;
    ampY = TIER_SCALE[m.microTier] * limY;
  }
  let ox = pt.x * ampX;
  let oy = pt.y * ampY;
  // Feints: fase invertida temporal
  if (m.phaseFlipUntil && t < m.phaseFlipUntil) {
    ox = -ox;
  }
  // Pequeño zigzag cuando un feint de zigzag está activo
  if (m.zigZagUntil && t < m.zigZagUntil) {
    const zz = Math.sin(elapsedSec * 25) * 0.1;
    ox += zz * ampX * 0.3;
    oy += zz * ampY * 0.3;
  }
  // Clamp suave: calculamos factor radial para mantener el patrón dentro de pantalla sin recortar
  const anchorSx = m.anchorPosSx != null ? m.anchorPosSx : (m.anchorSx || 0);
  const anchorSy = m.anchorPosSy != null ? m.anchorPosSy : (m.anchorSy || 0);
  const buffer = m.r + 20;
  const maxDx = limX - Math.abs(anchorSx) - buffer;
  const maxDy = limY - Math.abs(anchorSy) - buffer;
  // Si sobrepasa en X o Y, escalamos ambos ejes proporcionalmente
  const maxAbs = Math.max(Math.abs(ox), Math.abs(oy), 1e-6);
  let scale = 1;
  if (maxAbs > 0) {
    const fx = (maxDx <= 0) ? 0 : (maxDx / Math.max(Math.abs(ox), 1e-6));
    const fy = (maxDy <= 0) ? 0 : (maxDy / Math.max(Math.abs(oy), 1e-6));
    scale = Math.min(1, fx, fy);
  }
  ox *= scale;
  oy *= scale;
  // Interpolación con el desplazamiento anterior para suavizar las transiciones
  let resultX = ox;
  let resultY = oy;
  if (m.prevOffset) {
    const bdt = t - (m.microBlendStart || 0);
    const alpha = Math.max(0, Math.min(1, MICRO_BLEND_MS > 0 ? bdt / MICRO_BLEND_MS : 1));
    resultX = m.prevOffset.x * (1 - alpha) + ox * alpha;
    resultY = m.prevOffset.y * (1 - alpha) + oy * alpha;
    if (alpha >= 1) {
      m.prevOffset = { x: resultX, y: resultY };
    }
  } else {
    m.prevOffset = { x: resultX, y: resultY };
  }
  return { x: resultX, y: resultY };
}

/**
 * Asegura que el número de movers en `state.movers` coincide con
 * `CFG.moversCount` siempre que estén habilitados.  Si no están
 * habilitados (`CFG.moversEnabled` es false) se vacía el array.
 */
export function ensureMoversCount() {
  const n = CFG.moversEnabled ? clamp((CFG.moversCount | 0), 0, 5) : 0;
  CFG.moversCount = n;
  if (n === 0) {
    state.movers.length = 0;
    return;
  }
  while (state.movers.length < n) state.movers.push(spawnMoverInWindow());
  while (state.movers.length > n) state.movers.pop();
}

/**
 * Reaparece todos los movers respetando la cantidad en CFG.moversCount.
 * Si algún mover está marcado como muerto (m.dead = true), se reutiliza
 * el objeto y se reposiciona mediante respawnMover.  Si el arreglo
 * actual tiene menos elementos de los configurados, se rellenará hasta
 * alcanzar CFG.moversCount.  Este método se utiliza cuando
 * `CFG.regenOnHit` está desactivado y todos los movers han sido
 * eliminados: al invocarlo vuelve a poblar la pantalla con nuevos
 * movers vivos.
 */
export function respawnAllMovers() {
  // Aseguramos que el arreglo tiene la longitud correcta
  ensureMoversCount();
  for (let i = 0; i < state.movers.length; i++) {
    const m = state.movers[i];
    // Independientemente de si está muerto, lo reseteamos
    respawnMover(m);
    m.dead = false;
    m.hits = 0;
    m.escapeBoost = 0;
    m.lastHitTime = 0;
  }
}

/**
 * Genera un nuevo mover en una posición aleatoria de la pantalla,
 * alejándolo de la mirilla central.  Se asigna un radio proporcional al
 * tamaño del target base (entre 6 y 28 px).  La velocidad inicial se
 * define en coordenadas de pantalla y luego se convierte a mundo para
 * que el movimiento se mantenga relativo a la pantalla.
 */
export function spawnMoverInWindow() {
  const canvas = state.canvas;
  const limX = canvas.width / 2 - MARGIN;
  const limY = canvas.height / 2 - MARGIN;
  const cos = Math.cos(state.rollAngle);
  const sin = Math.sin(state.rollAngle);
  // El tamaño de los movers se controla con CFG.moversR.  Aseguramos un
  // valor mínimo para evitar puntos diminutos y un máximo razonable.
  const r = clamp(CFG.moversR, 4, Math.min(limX, limY));
  // Elegimos una posición alejada de la mirilla (centro de la pantalla)
  let sx = 0;
  let sy = 0;
  const minD = 90;
  for (let tries = 0; tries < 30; tries++) {
    sx = rand(-limX + r, limX - r);
    sy = rand(-limY + r, limY - r);
    if (Math.hypot(sx, sy) >= minD) break;
  }
  const w = screenToWorld(sx, sy, cos, sin);
  // Velocidad inicial en coordenadas de pantalla
  let svx = rand(-1, 1);
  let svy = rand(-1, 1);
  const sp = Math.hypot(svx, svy) || 1;
  svx /= sp;
  svy /= sp;
  // Convertimos velocidad a mundo
  const vw = screenToWorld(svx, svy, cos, sin);
  const tNow = nowMs();
  // Elegimos un patrón inicial al azar y calculamos el momento en que
  // cambiará al siguiente.  También inicializamos contadores de vidas
  // (hits) y velocidad de huida (escapeBoost), así como la marca de
  // último disparo para poder regenerar las vidas.
  const pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
  // Calculamos la posición inicial en coordenadas de mundo.  Almacenar
  // estos valores nos permitirá definir un “centro” propio para cada
  // mover, de modo que sus patrones de movimiento no dependan del
  // origen del jugador (mirilla) sino de su punto de generación.
  const x = state.player.x + w.dx;
  const y = state.player.y + w.dy;
  // Asignamos un rol respetando las restricciones de clones.  Los
  // roles sesgan la selección de patrón y tamaño y pueden cambiar
  // dinámicamente cada cierto tiempo.
  const role = pickRole();
  // Asignamos un episodio respetando límites
  const episode = pickEpisode();
  // ADN del mover: parámetros únicos por mover que determinan la
  // velocidad base de los patrones (wBase), la probabilidad de
  // feints/amagos y la amplitud de microGain.  Esto ayuda a evitar
  // clones e incrementa la diversidad visible.
  // ADN del mover: parámetros únicos por mover que determinan la
  // frecuencia base (wBase) y la amplitud del micro patrón.  Se
  // amplían los rangos para generar curvas más pronunciadas y
  // múltiples inflexiones.  wBase abarca de 1.0 a 2.2 (antes
  // 0.8–1.6) para producir más curvas por segundo.  microGainMin y
  // microGainMax se extienden a 0.6–1.2 y 1.2–1.8 respectivamente,
  // permitiendo amplitudes más variadas.
  const dna = {
    wBase: rand(1.0, 2.2),
    microGainMin: rand(0.6, 1.2),
    microGainMax: rand(1.2, 1.8),
    feintChance: rand(0.1, 0.4)
  };
  // Inicializamos microGain para el primer patrón
  const initialMicroGain = rand(dna.microGainMin, dna.microGainMax);
  // Elegimos patrón inicial basado en el rol
  const weights = ROLES[role]?.patternWeights || {};
  const names = MICRO_PATTERN_NAMES;
  let sum = 0;
  const cumulative = [];
  for (let i = 0; i < names.length; i++) {
    const w = weights[names[i]] || 1;
    sum += w;
    cumulative.push(sum);
  }
  const rnd = Math.random() * sum;
  let chosenIndex = 0;
  for (let i = 0; i < cumulative.length; i++) {
    if (rnd <= cumulative[i]) { chosenIndex = i; break; }
  }
  const initialPattern = names[chosenIndex];
  // Inicializamos el tier
  const tierWeights = ROLES[role]?.tierWeights || { S: 1, M: 1, L: 1 };
  const tiers = Object.keys(tierWeights);
  let tierSum = 0;
  const cumT = [];
  for (let i = 0; i < tiers.length; i++) {
    tierSum += tierWeights[tiers[i]];
    cumT.push(tierSum);
  }
  const rndT = Math.random() * tierSum;
  let chosenTier = tiers[0];
  for (let i = 0; i < cumT.length; i++) {
    if (rndT <= cumT[i]) { chosenTier = tiers[i]; break; }
  }
  return {
    x,
    y,
    // Guardamos el origen para patrones clásicos, aunque la nueva
    // implementación utiliza anclas en coordenadas de pantalla y
    // desplazamientos relativos.  Estos valores se preservan para
    // compatibilidad con otras partes del juego.
    originX: x,
    originY: y,
    vx: vw.dx,
    vy: vw.dy,
    r,
    // Momento inicial y fases aleatorias para micro‑patrones.
    t0: tNow,
    p1: rand(0, Math.PI * 2),
    p2: rand(0, Math.PI * 2),
    // Contadores de disparos y regeneración
    hitUntil: 0,
    hits: 0,
    escapeBoost: 0,
    lastHitTime: 0,
    dead: false,
    deadStart: 0,
    // Patrones clásicos: se conservan los campos pattern y
    // nextPatternSwitch pero ya no se utilizan para el movimiento.  Se
    // mantienen para no romper referencias externas.
    pattern,
    nextPatternSwitch: tNow + rand(2000, 6000),
    // Nuevas propiedades para macro‑dispersión y micro‑patrones.
    anchorSx: 0,
    anchorSy: 0,
    anchorExpires: 0,
    // Micro‑patrón y tamaño actuales
    microPattern: initialPattern,
    microType: initialPattern.includes('spiral') ? 'spiral' : 'figure8',
    microTier: chosenTier,
    microTierIndex: MICRO_TIERS.indexOf(chosenTier),
    microStart: tNow,
    microDuration: rand(MICRO_MIN_MS, MICRO_MAX_MS),
    microBlendStart: tNow,
    microNextSwitch: tNow + rand(MICRO_MIN_MS, MICRO_MAX_MS),
    prevOffset: { x: 0, y: 0 },
    microGain: initialMicroGain,
    // Controla cuántos patrones seguidos no son de figura‑8 (para anti‑sequía)
    nonFigureCount: initialPattern.includes('figure8') ? 0 : 1,
    // Dirección lateral de huida: 1 o -1.  Se alterna ocasionalmente
    fleeSide: (Math.random() < 0.5 ? 1 : -1),
    // Role y tiempos de expiración
    role,
    roleExpires: tNow + rand(8000, 16000),
    // Episodio y expiración
    episode,
    episodeExpires: tNow + rand(2000, 6000),
    // ADN (parámetros únicos)
    dna,
    // Valor base de w para patrones (se actualizará dinámicamente)
    wCurrent: dna.wBase
    ,
    // Variables para macro desplazamiento continuo
    anchorPosSx: 0,
    anchorPosSy: 0,
    anchorTargetSx: 0,
    anchorTargetSy: 0,
    anchorVelSx: 0,
    anchorVelSy: 0,
    anchorMoveStart: tNow,
    anchorMoveDuration: 3000,
    anchorMoveEnd: tNow + 3000,
    // Ángulo y velocidad de rotación del patrón
    frameAngle: rand(0, Math.PI * 2),
    frameRate: rand(0.0003, 0.0009),
    // Fases de modulación para AM/FM
    amPhase: rand(0, Math.PI * 2),
    fmPhase: rand(0, Math.PI * 2)
  };
}

/**
 * Reposiciona un mover existente, reutilizando su objeto para no
 * destruirlo.  Se utiliza al golpear un mover.
 * @param {Object} m mover a reubicar
 */
export function respawnMover(m) {
  const nm = spawnMoverInWindow();
  m.x = nm.x;
  m.y = nm.y;
  m.originX = nm.originX;
  m.originY = nm.originY;
  m.vx = nm.vx;
  m.vy = nm.vy;
  m.r = nm.r;
  m.t0 = nm.t0;
  m.p1 = nm.p1;
  m.p2 = nm.p2;
  m.hitUntil = 0;
  m.hits = 0;
  m.escapeBoost = 0;
  m.lastHitTime = 0;
  m.dead = false;
  m.pattern = nm.pattern;
  m.nextPatternSwitch = nm.nextPatternSwitch;

  // Copiar las nuevas propiedades de la implementación mejorada.  El
  // respawn reutiliza el objeto existente pero resetea parámetros
  // ligados al movimiento: anchor, micro‑patrones, dna, rol, etc.
  m.anchorSx = nm.anchorSx;
  m.anchorSy = nm.anchorSy;
  m.anchorExpires = nm.anchorExpires;
  m.microPattern = nm.microPattern;
  m.microType = nm.microType;
  m.microTier = nm.microTier;
  m.microTierIndex = nm.microTierIndex;
  m.microStart = nm.microStart;
  m.microDuration = nm.microDuration;
  m.microBlendStart = nm.microBlendStart;
  m.microNextSwitch = nm.microNextSwitch;
  m.prevOffset = { x: 0, y: 0 };
  m.microGain = nm.microGain;
  m.nonFigureCount = nm.nonFigureCount;
  m.fleeSide = nm.fleeSide;
  // Actualizar rol y episodio respetando los recuentos
  const oldRole = m.role;
  const oldEpisode = m.episode;
  m.role = nm.role;
  m.roleExpires = nm.roleExpires;
  m.episode = nm.episode;
  m.episodeExpires = nm.episodeExpires;
  // Ajustar contadores
  if (oldRole && roleCounts[oldRole] != null) roleCounts[oldRole] = Math.max(0, roleCounts[oldRole] - 1);
  roleCounts[m.role] = (roleCounts[m.role] || 0) + 1;
  if (oldEpisode && episodeCounts[oldEpisode] != null) episodeCounts[oldEpisode] = Math.max(0, episodeCounts[oldEpisode] - 1);
  episodeCounts[m.episode] = (episodeCounts[m.episode] || 0) + 1;
  m.dna = nm.dna;
  m.wCurrent = nm.wCurrent;
  // Copiar variables de macro desplazamiento y rotación
  m.anchorPosSx = nm.anchorPosSx;
  m.anchorPosSy = nm.anchorPosSy;
  m.anchorTargetSx = nm.anchorTargetSx;
  m.anchorTargetSy = nm.anchorTargetSy;
  m.anchorVelSx = nm.anchorVelSx;
  m.anchorVelSy = nm.anchorVelSy;
  m.anchorMoveStart = nm.anchorMoveStart;
  m.anchorMoveDuration = nm.anchorMoveDuration;
  m.anchorMoveEnd = nm.anchorMoveEnd;
  m.frameAngle = nm.frameAngle;
  m.frameRate = nm.frameRate;
  m.amPhase = nm.amPhase;
  m.fmPhase = nm.fmPhase;
}

/**
 * Actualiza la posición de todos los movers según su patrón de
 * movimiento, esquivando blancos y otros movers.  El parámetro `dtN`
 * representa el tiempo normalizado entre frames.
 * @param {number} dtN tiempo normalizado (1 ≈ 16.6 ms)
 */
export function updateMovers(dtN, playerSpeed = 0) {
  // Nueva implementación del movimiento de los movers con anclas y
  // micro‑patrones.  Se ejecuta al inicio de la función y retorna
  // inmediatamente, de modo que el código original queda inoperativo.
  {
    // Aseguramos la cantidad de movers
    ensureMoversCount();
    if (!CFG.moversEnabled || state.movers.length === 0) return;
    const tNow = nowMs();
    const canvasRef = state.canvas;
    const limXVal = canvasRef.width / 2 - MARGIN;
    const limYVal = canvasRef.height / 2 - MARGIN;
    const cosR = Math.cos(state.rollAngle);
    const sinR = Math.sin(state.rollAngle);
    // Recolectamos blancos vivos
    const liveTargetsScr = [];
    for (const tg of state.targets) {
      if (tg.dead || tg.hitStart) continue;
      const dxT = tg.x - state.player.x;
      const dyT = tg.y - state.player.y;
      const scrT = worldToScreen(dxT, dyT, cosR, sinR);
      liveTargetsScr.push({ sx: scrT.sx, sy: scrT.sy, r: tg.r });
    }
    // Precalculamos posiciones en pantalla de movers
    const moversScr = state.movers.map(mv => {
      const dxM = mv.x - state.player.x;
      const dyM = mv.y - state.player.y;
      const scrM = worldToScreen(dxM, dyM, cosR, sinR);
      return { sx: scrM.sx, sy: scrM.sy };
    });
    // Actualizamos heatmap solo con movers vivos
    decayHeatMap();
    for (const mv of state.movers) {
      if (mv.dead) continue;
      const asx = (mv.anchorPosSx != null ? mv.anchorPosSx : mv.anchorSx);
      const asy = (mv.anchorPosSy != null ? mv.anchorPosSy : mv.anchorSy);
      if (asx !== undefined && asy !== undefined) {
        const cell = getCellForPos(asx, asy, limXVal, limYVal);
        heatMap[cell.row][cell.col] += HEATMAP_INCREMENT * 0.2;
      }
    }
    const baseSpeed = CFG.moversSpeed;
    const avoidK = CFG.moversAvoid;
    // Convertimos el dt normalizado a milisegundos.  Un dtN≈1
    // corresponde a ~16.666 ms por frame.
    const dtMs = dtN * 16.6667;
    // Actualizamos cada mover
    for (let i = 0; i < state.movers.length; i++) {
      const m = state.movers[i];
      if (m.dead) continue;
      // Regeneración de vidas.  Los movers muertos no se regeneran hasta
      // que sean reaparecidos por respawnAllMovers.
      if (m.hits > 0 && m.lastHitTime && (tNow - m.lastHitTime > HEAL_INTERVAL_MS)) {
        m.hits = 0;
        m.escapeBoost = 0;
        m.lastHitTime = 0;
      }
      // Cambio de rol periódico para evitar clones permanentes
      if (m.roleExpires != null && tNow > m.roleExpires) {
        // Reducimos el recuento del rol actual
        if (m.role && roleCounts[m.role] != null) roleCounts[m.role] = Math.max(0, roleCounts[m.role] - 1);
        m.role = pickRole();
        m.roleExpires = tNow + rand(8000, 16000);
        // Forzar cambio de anchor pronto para reflejar nuevo rol
        m.anchorExpires = tNow;
        // También actualizamos micro patrón para reflejar preferencias del nuevo rol
        chooseNewMicro(m, tNow);
      }

      // Cambio de episodio periódico para evitar clones permanentes
      if (m.episodeExpires != null && tNow > m.episodeExpires) {
        if (m.episode && episodeCounts[m.episode] != null) episodeCounts[m.episode] = Math.max(0, episodeCounts[m.episode] - 1);
        m.episode = pickEpisode();
        m.episodeExpires = tNow + rand(2000, 6000);
        episodeCounts[m.episode] = (episodeCounts[m.episode] || 0) + 1;
        // Forzamos un nuevo destino de anchor para reflejar el nuevo sesgo
        chooseNewAnchorTarget(m, tNow, limXVal, limYVal, liveTargetsScr, state.movers);
        // Reiniciamos micro patrón con preferencias del episodio
        chooseNewMicro(m, tNow);
      }
      // Actualización del macro anchor: movimiento continuo hacia el
      // destino y elección de nuevos destinos cuando expira el
      // desplazamiento.  Si no se ha definido un destino, se genera
      // uno inicial ahora.
      if (m.anchorTargetSx == null || m.anchorTargetSy == null) {
        // posicionamos el anchor en un punto aleatorio inicial y
        // definimos un objetivo
        m.anchorPosSx = rand(-limXVal * 0.6, limXVal * 0.6);
        m.anchorPosSy = rand(-limYVal * 0.6, limYVal * 0.6);
        chooseNewAnchorTarget(m, tNow, limXVal, limYVal, liveTargetsScr, state.movers);
      }
      // Avance del anchor hacia el destino
      if (m.anchorPosSx != null && m.anchorVelSx != null) {
        m.anchorPosSx += m.anchorVelSx * dtMs;
        m.anchorPosSy += m.anchorVelSy * dtMs;
      }
      // Si hemos llegado al destino o excedido el tiempo, elegimos un nuevo destino
      if (m.anchorMoveEnd != null && tNow >= m.anchorMoveEnd) {
        chooseNewAnchorTarget(m, tNow, limXVal, limYVal, liveTargetsScr, state.movers);
      }
      // Reelegir micro patrón
      if (m.microNextSwitch == null || tNow > m.microNextSwitch) {
        m.prevOffset = m.prevOffset || { x: 0, y: 0 };
        chooseNewMicro(m, tNow);
      }
      // Posición y velocidad en pantalla
      const dx = m.x - state.player.x;
      const dy = m.y - state.player.y;
      let scr = worldToScreen(dx, dy, cosR, sinR);
      let vScr = worldToScreen(m.vx, m.vy, cosR, sinR);

      // Dificultad dinámica: ajustamos la frecuencia y la ganancia en
      // función de la amenaza percibida.  La amenaza aumenta cuanto
      // más cerca está el mover del centro de la pantalla y si el
      // modo flee está activo.  Esto produce patrones más nerviosos y
      // cambia la duración de los micro‑patrones.
      const distToCenter = Math.hypot(scr.sx, scr.sy);
      const maxDist = Math.min(limXVal, limYVal) * 0.75;
      let threatAlpha = 0;
      if (CFG.moversFlee) {
        threatAlpha = Math.max(0, 1 - distToCenter / maxDist);
      }
      // Modulación de frecuencia (FM): se aplica una oscilación lenta
      const fm = 1 + 0.2 * Math.sin(tNow * 0.0004 + (m.fmPhase || 0));
      // Ajuste suave de wCurrent hacia el nuevo objetivo
      const targetW = m.dna.wBase * fm * (1 + threatAlpha * 0.8);
      m.wCurrent = m.wCurrent + (targetW - m.wCurrent) * 0.1;
      // Modulación de amplitud (AM): oscilación lenta de microGain
      const am = 1 + 0.2 * Math.sin(tNow * 0.0005 + (m.amPhase || 0));
      // Ajustamos microGain temporalmente
      m.microGainEff = (m.microGain || 1) * am * (1 + threatAlpha * 0.5);
      // Acortamos la duración del micro‑patrón durante momentos de
      // amenaza para hacer más agresivos los cambios
      if (m.microNextSwitch != null) {
        const remaining = m.microNextSwitch - tNow;
        const desiredRem = (m.microDuration || MICRO_MAX_MS) * (1 - 0.5 * threatAlpha);
        if (remaining > desiredRem) {
          m.microNextSwitch = tNow + desiredRem;
        }
      }
      // Acortamos la duración del anchor bajo amenaza para mover el
      // centro con más frecuencia
      // Ajustamos la duración del movimiento del anchor según la amenaza y el episodio
      if (m.anchorMoveEnd != null) {
        const rem = m.anchorMoveEnd - tNow;
        const macroSpeed = (m.episode && EPISODES[m.episode]) ? EPISODES[m.episode].macroSpeed : 1;
        // Duración deseada disminuye con la amenaza (más nervioso)
        const desired = m.anchorMoveDuration * (1 - 0.3 * threatAlpha) / macroSpeed;
        if (rem > desired) {
          // recalculemos vel para acabar antes
          const remainingTime = desired;
          const dxLeft = (m.anchorTargetSx - m.anchorPosSx);
          const dyLeft = (m.anchorTargetSy - m.anchorPosSy);
          m.anchorVelSx = dxLeft / remainingTime;
          m.anchorVelSy = dyLeft / remainingTime;
          m.anchorMoveEnd = tNow + remainingTime;
          m.anchorMoveDuration = remainingTime;
        }
      }
      // Posibilidad de feints/amago bajo amenaza
      if (threatAlpha > 0.45 && Math.random() < (m.dna.feintChance || 0.2) * threatAlpha * 0.3) {
        const choice = Math.floor(Math.random() * 3);
        if (choice === 0) {
          // Cambiar anchor abruptamente
          m.anchorExpires = tNow;
        } else if (choice === 1) {
          // Voltear la fase durante un breve período
          m.phaseFlipUntil = tNow + rand(200, 500);
        } else {
          // Pequeño zig‑zag
          m.zigZagUntil = tNow + rand(250, 600);
        }
      }
      // Desplazamiento micro
      // Actualizamos el ángulo del marco del patrón
      if (m.frameRate != null) {
        m.frameAngle = (m.frameAngle || 0) + m.frameRate * dtMs;
      }
      const microOff = computeMicroOffset(m, tNow, limXVal, limYVal);
      // El objetivo ahora es la posición actual del anchor más el offset micro
      const targetSx = (m.anchorPosSx || 0) + microOff.x;
      const targetSy = (m.anchorPosSy || 0) + microOff.y;
      let desVx = (targetSx - scr.sx) * 0.06;
      let desVy = (targetSy - scr.sy) * 0.06;
      let ax = 0;
      let ay = 0;
      // Repulsión contra blancos
      for (const o of liveTargetsScr) {
        const dxs = scr.sx - o.sx;
        const dys = scr.sy - o.sy;
        const dist = Math.hypot(dxs, dys) || 0.0001;
        const avoidR = (m.r + o.r + 70);
        if (dist < avoidR) {
          const p = (1 - dist / avoidR);
          ax += (dxs / dist) * (p * 1.2) * avoidK;
          ay += (dys / dist) * (p * 1.2) * avoidK;
        }
      }
      // Separación entre movers.  Ignoramos los movers muertos para que
      // no influyan en las fuerzas de repulsión.
      for (let j = 0; j < state.movers.length; j++) {
        if (j === i) continue;
        const other = state.movers[j];
        if (other.dead) continue;
        const o = moversScr[j];
        const dxs = scr.sx - o.sx;
        const dys = scr.sy - o.sy;
        const dist = Math.hypot(dxs, dys) || 0.0001;
        const avoidR = (m.r + other.r + 55);
        if (dist < avoidR) {
          const p = (1 - dist / avoidR);
          ax += (dxs / dist) * (p * 0.8) * avoidK;
          ay += (dys / dist) * (p * 0.8) * avoidK;
        }
      }
      // Evitación predictiva
      const ttcWindow = 0.5;
      for (let j = 0; j < state.movers.length; j++) {
        if (j === i) continue;
        const other = state.movers[j];
        // Ignorar movers muertos en la predicción de colisión
        if (other.dead) continue;
        const relX = scr.sx - moversScr[j].sx;
        const relY = scr.sy - moversScr[j].sy;
        const oVel = worldToScreen(other.vx, other.vy, cosR, sinR);
        const relVx = vScr.sx - oVel.sx;
        const relVy = vScr.sy - oVel.sy;
        const relSpeedSq = relVx * relVx + relVy * relVy;
        if (relSpeedSq < 1e-6) continue;
        const ttc = - (relX * relVx + relY * relVy) / relSpeedSq;
        if (ttc > 0 && ttc < ttcWindow) {
          const fx = relX + relVx * ttc;
          const fy = relY + relVy * ttc;
          const distF = Math.hypot(fx, fy);
          const safeDist = m.r + other.r + 50;
          if (distF < safeDist) {
            const p = (1 - distF / safeDist);
            const evX = fx / (distF || 0.0001);
            const evY = fy / (distF || 0.0001);
            ax += evX * p * 0.5 * avoidK;
            ay += evY * p * 0.5 * avoidK;
          }
        }
      }
      // Huida del jugador / de la mirilla con componente lateral.  Si
      // `CFG.moversFlee` está activo y el jugador se está moviendo, se
      // huye proporcionalmente a su velocidad.  Además, aunque el
      // `moversFlee` esté desactivado, los movers que han sido
      // impactados (`m.escapeBoost` > 0) intentan alejarse del centro
      // de la pantalla aunque el jugador esté quieto.  Se usa un
      // multiplicador configurable (`escapeBoost`) para aumentar la
      // velocidad en cada impacto.
      {
        // Huir de la mirilla/centro: los movers reaccionan al movimiento del
        // jugador cuando `moversFlee` está activo y su velocidad es
        // significativa.  Además, tras recibir un impacto (escapeBoost>0)
        // también deben huir aunque el jugador esté quieto.  En ese caso
        // eliminamos la restricción de radio (`fleeR`) para que el
        // comportamiento de huida se aplique desde cualquier distancia.
        // Ajustamos la activación de la huida para cumplir con la
        // configuración.  Sólo se huirá de manera radial si
        // `moversFlee` está activado.  Con ello evitamos que los
        // movers se alejen del jugador tras recibir impactos cuando
        // la huida está desactivada; en esos casos únicamente
        // aumentarán su velocidad (ver ajuste más abajo).
        const fleeActive = CFG.moversFlee && ((playerSpeed > 0) || (m.escapeBoost > 0));
        if (fleeActive) {
          const distToPlayer = Math.hypot(scr.sx, scr.sy) || 0.0001;
          // Radio de activación para la huida cuando depende del jugador.
          // Para la huida por impacto, permitimos que siempre se active.
          const fleeR = Math.min(limXVal, limYVal) * 0.7;
          const withinRadius = distToPlayer < fleeR;
          // Si hay escapeBoost (disparo) ignoramos el radio y huimos
          // siempre; de lo contrario, sólo se huye al acercarse.
          if (withinRadius || m.escapeBoost > 0) {
            // Factor inverso que determina la intensidad según la
            // proximidad al centro.  Si ignoramos el radio, asumimos
            // inv=1 para que la fuerza de huida sea máxima.
            const inv = withinRadius ? (1 - distToPlayer / fleeR) : 1;
            const boost = 1 + (m.escapeBoost || 0);
            // Velocidad base de huida: depende del movimiento del jugador
            // si `moversFlee` está activo; si no, utilizamos la
            // velocidad base de los movers como referencia.
            let baseFleeV;
            if (CFG.moversFlee && playerSpeed > 0) {
              baseFleeV = playerSpeed;
            } else {
              // Ajustamos un valor base proporcional al máximo de
              // velocidad permisible (8 * moversSpeed) para que la huida
              // sea perceptible incluso con el jugador quieto.
              baseFleeV = 8.0 * (CFG.moversSpeed || 1);
            }
            const fleeV = baseFleeV * inv * boost;
            // Dirección radial desde el centro (0,0) al mover
            const dirX = scr.sx / distToPlayer;
            const dirY = scr.sy / distToPlayer;
            // Componente lateral cambia de lado ocasionalmente
            const latX = -dirY * (m.fleeSide || 1);
            const latY = dirX * (m.fleeSide || 1);
            // Balance entre radial y lateral.  Cuando la huida se
            // origina por impacto (m.escapeBoost>0), favorecemos el
            // componente radial para salir de la mira; si es por
            // movimiento del jugador, mantenemos un balance clásico.
            let radialFactor = 0.6;
            let lateralFactor = 0.4;
            if (!CFG.moversFlee || playerSpeed === 0) {
              radialFactor = 0.8;
              lateralFactor = 0.2;
            }
            desVx += (dirX * radialFactor + latX * lateralFactor) * fleeV;
            desVy += (dirY * radialFactor + latY * lateralFactor) * fleeV;
          }
        }
      }
      // Campo de flujo suave: añadimos una pequeña turbulencia basada en
      // la posición actual y el tiempo para evitar trayectorias
      // excesivamente trigonométricas.  No afecta a la dirección de
      // huida, pero sí a la sensación visual.
      {
        const nX = Math.sin((scr.sx * 0.02 + tNow * 0.001 + m.dna.wBase)) * 0.5;
        const nY = Math.cos((scr.sy * 0.02 + tNow * 0.001 + m.dna.wBase)) * 0.5;
        desVx += nX * 0.3;
        desVy += nY * 0.3;
      }

      // ===================== Ajuste de velocidad por impactos =====================
      // Cuando la opción de huida (`CFG.moversFlee`) está desactivada, los
      // movers no deben alejarse del jugador tras recibir disparos.  En su
      // lugar incrementan su velocidad manteniendo la trayectoria de su
      // patrón.  Si `m.escapeBoost` es mayor que cero (indica cuántos
      // impactos ha recibido), multiplicamos la velocidad deseada por
      // (1 + escapeBoost) para acelerar su desplazamiento.  Esto permite
      // que los sliders de “Boost 1º impacto” y “Boost 2º impacto” en la
      // configuración surtan efecto incluso cuando el modo flee está
      // desactivado.
      if (!CFG.moversFlee && m.escapeBoost > 0) {
        const boostFactor = 1 + m.escapeBoost;
        desVx *= boostFactor;
        desVy *= boostFactor;
      }
      // Combinamos fuerzas
      let svx = desVx + ax;
      let svy = desVy + ay;
      if (Math.hypot(svx, svy) < 0.0005) {
        svx = vScr.sx * 0.7;
        svy = vScr.sy * 0.7;
      }
      const spd = Math.hypot(svx, svy) || 1;
      const maxSp = 8.0 * baseSpeed;
      if (spd > maxSp) {
        svx = (svx / spd) * maxSp;
        svy = (svy / spd) * maxSp;
      }
      scr.sx += svx * dtN;
      scr.sy += svy * dtN;
      // Contención en bordes
      const bx = limXVal - m.r;
      const by = limYVal - m.r;
      // Contención en bordes mejorada: en lugar de rebotar
      // bruscamente, aplicamos una fuerza de empuje suave y
      // deslizamos a lo largo de la pared (wall sliding).  Si se
      // alcanza el límite horizontal, anulamos la componente de
      // velocidad normal a la pared pero dejamos la tangencial.  Lo
      // mismo para el límite vertical.
      if (scr.sx < -bx) {
        scr.sx = -bx;
        if (svx < 0) svx = 0;
      } else if (scr.sx > bx) {
        scr.sx = bx;
        if (svx > 0) svx = 0;
      }
      if (scr.sy < -by) {
        scr.sy = -by;
        if (svy < 0) svy = 0;
      } else if (scr.sy > by) {
        scr.sy = by;
        if (svy > 0) svy = 0;
      }
      const wpos = screenToWorld(scr.sx, scr.sy, cosR, sinR);
      const wvel = screenToWorld(svx, svy, cosR, sinR);
      m.x = state.player.x + wpos.dx;
      m.y = state.player.y + wpos.dy;
      m.vx = wvel.dx;
      m.vy = wvel.dy;
    }
    return;
  }
  ensureMoversCount();
  if (!CFG.moversEnabled || state.movers.length === 0) return;
  const t = nowMs();
  const canvas = state.canvas;
  const limX = canvas.width / 2 - MARGIN;
  const limY = canvas.height / 2 - MARGIN;
  const cos = Math.cos(state.rollAngle);
  const sin = Math.sin(state.rollAngle);
  // Posiciones de targets vivos en pantalla para esquiva
  const liveTargetsScr = [];
  for (const tg of state.targets) {
    if (tg.dead) continue;
    if (tg.hitStart) continue;
    const dx = tg.x - state.player.x;
    const dy = tg.y - state.player.y;
    const s = worldToScreen(dx, dy, cos, sin);
    liveTargetsScr.push({ sx: s.sx, sy: s.sy, r: tg.r });
  }
  // Posiciones de movers en pantalla (para evitar recálculos)
  const moversScr = state.movers.map(m => {
    const dx = m.x - state.player.x;
    const dy = m.y - state.player.y;
    const s = worldToScreen(dx, dy, cos, sin);
    return { sx: s.sx, sy: s.sy };
  });
  const speed = CFG.moversSpeed;
  const avoidK = CFG.moversAvoid;
  for (let i = 0; i < state.movers.length; i++) {
    const m = state.movers[i];
    // Regeneración de vidas: si no ha recibido disparos recientemente
    // y ha pasado el intervalo de curación, restablecemos vidas y
    // velocidad de huida.
    if (m.hits > 0 && m.lastHitTime && (t - m.lastHitTime > HEAL_INTERVAL_MS)) {
      m.hits = 0;
      m.escapeBoost = 0;
      m.lastHitTime = 0;
    }
    // Cambio automático de patrón: cuando alcanza el tiempo de cambio se
    // selecciona uno al azar y se reinician parámetros de movimiento.
    if (t > (m.nextPatternSwitch || 0)) {
      m.pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
      m.nextPatternSwitch = t + rand(2000, 6000);
      m.t0 = t;
      m.p1 = rand(0, Math.PI * 2);
      m.p2 = rand(0, Math.PI * 2);
    }
    // Convertimos posición y velocidad a coordenadas de pantalla
    const dx = m.x - state.player.x;
    const dy = m.y - state.player.y;
    let s = worldToScreen(dx, dy, cos, sin);
    let vs = worldToScreen(m.vx, m.vy, cos, sin);
    // Calculamos la posición de referencia (base) en pantalla a partir
    // del origen de este mover.  Esto es la clave para que los
    // patrones de movimiento usen un centro propio y no el origen del
    // jugador.  El origen se conserva desde el momento del spawn.
    const baseDx = (m.originX ?? m.x) - state.player.x;
    const baseDy = (m.originY ?? m.y) - state.player.y;
    const baseScr = worldToScreen(baseDx, baseDy, cos, sin);
    // Velocidad deseada en pantalla según patrón
    let desVx = vs.sx;
    let desVy = vs.sy;
    const elapsed = (t - m.t0);
    const tt = (t - m.t0) * 0.001;
    switch (m.pattern) {
      case 'bounce':
        // rebote: simplemente mantenemos la velocidad actual
        break;
      case 'orbit': {
        const ang = (elapsed * 0.008 * speed) + m.p1;
        const rad = Math.min(limX, limY) * (0.25 + 0.25 * Math.sin(m.p2));
        // El centro de la órbita es la posición baseScr.  Sumamos el
        // desplazamiento circular a ese punto en pantalla.
        const tx = baseScr.sx + Math.cos(ang) * rad;
        const ty = baseScr.sy + Math.sin(ang) * rad;
        desVx = (tx - s.sx) * 0.06;
        desVy = (ty - s.sy) * 0.06;
        break;
      }
      case 'lissajous': {
        const A = limX * 0.85;
        const B = limY * 0.65;
        // Lissajous: sumamos el desplazamiento sinusoidal a la
        // posición base para que se desplacen alrededor de su origen
        const tx = baseScr.sx + Math.sin(tt * 1.7 * speed + m.p1) * A;
        const ty = baseScr.sy + Math.sin(tt * 2.3 * speed + m.p2) * B;
        desVx = (tx - s.sx) * 0.07;
        desVy = (ty - s.sy) * 0.07;
        break;
      }
      case 'strafe': {
        // Strafe: desplazamiento horizontal y vertical con oscilación
        // respecto al origen del mover
        const tx = baseScr.sx + Math.sin(tt * 2.8 * speed + m.p1) * (limX * 0.95);
        const ty = baseScr.sy + Math.sin(tt * 0.9 * speed + m.p2) * (limY * 0.25);
        desVx = (tx - s.sx) * 0.08;
        desVy = (ty - s.sy) * 0.08;
        break;
      }
      case 'circular': {
        // Movimiento circular con radio fijo
        const ang = (elapsed * 0.006 * speed) + m.p1;
        const rad = Math.min(limX, limY) * 0.5;
        const tx = baseScr.sx + Math.cos(ang) * rad;
        const ty = baseScr.sy + Math.sin(ang) * rad;
        desVx = (tx - s.sx) * 0.05;
        desVy = (ty - s.sy) * 0.05;
        break;
      }
      case 'spiral': {
        // Espiral: el radio aumenta y se reinicia periódicamente
        const baseRad = Math.min(limX, limY) * 0.2;
        const mod = ((elapsed * 0.00025 * speed) % 1);
        const rad = baseRad + mod * (Math.min(limX, limY) * 0.6);
        const ang = (elapsed * 0.006 * speed) + m.p1;
        const tx = baseScr.sx + Math.cos(ang) * rad;
        const ty = baseScr.sy + Math.sin(ang) * rad;
        desVx = (tx - s.sx) * 0.05;
        desVy = (ty - s.sy) * 0.05;
        break;
      }
      case 'figure8': {
        // Figura de 8: curva de Lissajous con frecuencias 1 y 2
        const A = limX * 0.7;
        const B = limY * 0.4;
        const tx = baseScr.sx + Math.sin(tt * 1.5 * speed + m.p1) * A;
        const ty = baseScr.sy + Math.sin(tt * 3.0 * speed + m.p2) * B;
        desVx = (tx - s.sx) * 0.07;
        desVy = (ty - s.sy) * 0.07;
        break;
      }
      case 'zigzag': {
        // Zigzag: desplazamiento horizontal con rebotes verticales
        const phase = ((elapsed * 0.002 * speed) % 2);
        // movimiento horizontal: ida y vuelta
        const hx = phase < 1 ? phase : 2 - phase;
        const tx = baseScr.sx + (hx * 2 - 1) * (limX * 0.95);
        const ty = baseScr.sy + Math.sin(elapsed * 0.004 * speed + m.p2) * (limY * 0.5);
        desVx = (tx - s.sx) * 0.08;
        desVy = (ty - s.sy) * 0.08;
        break;
      }
      default:
        break;
    }

    // ===================== Ajuste de velocidad por impactos =====================
    // Cuando el modo flee (`CFG.moversFlee`) está desactivado, los movers
    // no deben huir del jugador tras recibir disparos.  En su lugar,
    // aceleran su patrón de movimiento en función del número de impactos.
    // Si `m.escapeBoost` es mayor que cero, multiplicamos la velocidad
    // deseada por (1 + escapeBoost) para reflejar el incremento elegido
    // mediante los sliders de configuración.  Esto se aplica antes de
    // calcular las fuerzas de esquiva para que el incremento afecte al
    // movimiento base sin crear una fuerza radial de huida.
    if (!CFG.moversFlee && m.escapeBoost > 0) {
      const boostFactor = 1 + m.escapeBoost;
      desVx *= boostFactor;
      desVy *= boostFactor;
    }

    // Esquiva: repulsión contra blancos y otros movers
    let ax = 0;
    let ay = 0;
    for (const o of liveTargetsScr) {
      const dxs = s.sx - o.sx;
      const dys = s.sy - o.sy;
      const dist = Math.hypot(dxs, dys) || 0.0001;
      const avoidR = (m.r + o.r + 70);
      if (dist < avoidR) {
        const p = (1 - dist / avoidR);
        ax += (dxs / dist) * (p * 1.2) * avoidK;
        ay += (dys / dist) * (p * 1.2) * avoidK;
      }
    }
    for (let j = 0; j < state.movers.length; j++) {
      if (j === i) continue;
      const o = moversScr[j];
      const dxs = s.sx - o.sx;
      const dys = s.sy - o.sy;
      const dist = Math.hypot(dxs, dys) || 0.0001;
      const avoidR = (m.r + state.movers[j].r + 55);
      if (dist < avoidR) {
        const p = (1 - dist / avoidR);
        ax += (dxs / dist) * (p * 0.8) * avoidK;
        ay += (dys / dist) * (p * 0.8) * avoidK;
      }
    }
    // Huida del jugador: si la opción está activa y el jugador se acerca,
    // añadimos una componente de velocidad alejándose de la mira.  Se
    // escala con la velocidad del jugador y el número de disparos
    // acumulados sobre este mover.
    if (CFG.moversFlee && playerSpeed > 0) {
      const distToPlayer = Math.hypot(s.sx, s.sy) || 0.0001;
      // Radio a partir del cual comienzan a huir (por debajo de este
      // umbral se reduce la influencia para evitar teletransportes)
      const fleeR = Math.min(limX, limY) * 0.7;
      if (distToPlayer < fleeR) {
        const inv = (1 - distToPlayer / fleeR);
        const boost = 1 + (m.escapeBoost || 0);
        const fleeV = playerSpeed * inv * boost;
        const dirX = s.sx / distToPlayer;
        const dirY = s.sy / distToPlayer;
        desVx += dirX * fleeV;
        desVy += dirY * fleeV;
      }
    }
    // Combinamos la velocidad deseada con las fuerzas de esquiva
    let svx = desVx + ax;
    let svy = desVy + ay;
    // Si la velocidad es muy baja, conservamos parte de la anterior
    if (Math.hypot(svx, svy) < 0.0005) {
      svx = vs.sx * 0.7;
      svy = vs.sy * 0.7;
    }
    // Limitamos la velocidad máxima
    const spd = Math.hypot(svx, svy) || 1;
    const maxSp = 8.0 * speed;
    if (spd > maxSp) {
      svx = (svx / spd) * maxSp;
      svy = (svy / spd) * maxSp;
    }
    // Avanzamos posición en pantalla
    s.sx += svx * dtN;
    s.sy += svy * dtN;
    // Rebotes en los bordes de la ventana
    const bx = limX - m.r;
    const by = limY - m.r;
    if (s.sx < -bx) {
      s.sx = -bx;
      svx = Math.abs(svx);
    }
    if (s.sx > bx) {
      s.sx = bx;
      svx = -Math.abs(svx);
    }
    if (s.sy < -by) {
      s.sy = -by;
      svy = Math.abs(svy);
    }
    if (s.sy > by) {
      s.sy = by;
      svy = -Math.abs(svy);
    }
    // Convertimos de nuevo a coordenadas de mundo
    const wpos = screenToWorld(s.sx, s.sy, cos, sin);
    const wvel = screenToWorld(svx, svy, cos, sin);
    m.x = state.player.x + wpos.dx;
    m.y = state.player.y + wpos.dy;
    m.vx = wvel.dx;
    m.vy = wvel.dy;
  }
}

/**
 * Comprueba si la mirilla del jugador está sobre algún mover.  Devuelve
 * el índice del primer mover alcanzado o ‑1 si no hay colisión.
 */
export function hitTestMovers() {
  if (!CFG.moversEnabled || state.movers.length === 0) return -1;
  for (let i = 0; i < state.movers.length; i++) {
    const m = state.movers[i];
    if (m.dead) continue;
    const dx = m.x - state.player.x;
    const dy = m.y - state.player.y;
    if (Math.hypot(dx, dy) < m.r) return i;
  }
  return -1;
}