/*
 * tools/macro_simulation.js
 *
 * Este script ejecuta una simulación simplificada de los movers para
 * evaluar la cobertura de pantalla, la diversidad de patrones y
 * episodios y la tasa de revisita.  Se modela el macro desplazamiento
 * continuo (anchor que se mueve entre waypoints) y los micro‑patrones
 * implementados en el juego.  Al finalizar, imprime métricas para
 * comprobar que los movers exploran gran parte del espacio y que
 * utilizan una variedad de patrones y tamaños.
 */

// Definición de micro‑patrones similar a la del juego.  Cada
// función devuelve un desplazamiento normalizado.
const MICRO_PATTERNS = {
  figure8: (t, gain, opts) => {
    const w = opts.w * gain;
    return { x: Math.sin(w * t + (opts.phase1 || 0)), y: Math.sin(w * 2.0 * t + (opts.phase2 || 0)) };
  },
  figure8Wide: (t, gain, opts) => {
    const w = opts.w * gain;
    const x = Math.sin(w * t + (opts.phase1 || 0));
    const y = Math.sin(w * 1.4 * t + (opts.phase2 || 0));
    return { x: x, y: y * 0.8 };
  },
  figure8Spiral: (t, gain, opts) => {
    const w = opts.w * gain;
    const cycle = opts.duration > 0 ? (opts.elapsed / opts.duration) : 0;
    const scale = 0.3 + 0.7 * cycle;
    return { x: Math.sin(w * t + (opts.phase1 || 0)) * scale, y: Math.sin(w * 2.0 * t + (opts.phase2 || 0)) * scale };
  },
  spiral: (t, gain, opts) => {
    const w = opts.w * gain;
    const cycle = opts.duration > 0 ? ((opts.elapsed % opts.duration) / opts.duration) : 0;
    const r = Math.pow(cycle, 0.9);
    const a = w * t + (opts.phase1 || 0);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  },
  spiralBurst: (t, gain, opts) => {
    const w = opts.w * gain;
    const cycles = 3;
    const cycle = opts.duration > 0 ? ((opts.elapsed % opts.duration) / opts.duration) : 0;
    const sub = (cycle * cycles) % 1;
    const r = Math.pow(sub, 0.7);
    const a = w * t + (opts.phase1 || 0);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  },
  rosette: (t, gain, opts) => {
    const w = opts.w * gain;
    const k = 3.7;
    const a = 0.35;
    const angle1 = w * t + (opts.phase1 || 0);
    const angle2 = k * w * t + (opts.phase2 || 0);
    return { x: Math.cos(angle1) + a * Math.cos(angle2), y: Math.sin(angle1) - a * Math.sin(angle2) };
  },
  swerveStop: (t, gain, opts) => {
    const w = opts.w * gain;
    const cycle = opts.duration > 0 ? ((opts.elapsed % opts.duration) / opts.duration) : 0;
    let x = 0, y = 0;
    if (cycle < 0.35) {
      x = 0; y = 0;
    } else {
      const p = (cycle - 0.35) / 0.65;
      const a = w * t * 1.2;
      const ease = p * p * (3 - 2 * p);
      x = Math.cos(a) * ease;
      y = Math.sin(a) * 0.5 * ease;
    }
    return { x, y };
  }
};

const PATTERN_NAMES = Object.keys(MICRO_PATTERNS);

// Escalas de tamaños (tier) similares a las del juego.  Se usan
// valores arbitrarios de limX/limY en la simulación para medir
// amplitudes relativas.
const TIER_SCALE = { S: 0.12, M: 0.25, L: 0.38 };
const SPIRAL_SCALE = { S: 0.18, M: 0.35, L: 0.50 };

const HEAT_COLS = 16;
const HEAT_ROWS = 9;

// Parametrización de micro y macro movimientos
const MICRO_MIN_MS = 2500;
const MICRO_MAX_MS = 5000;

// Crea un mover con estado inicial aleatorio
function createMover(limX, limY) {
  const now = 0;
  const m = {};
  // posición inicial del anchor
  m.anchorPosSx = (Math.random() * 2 - 1) * limX * 0.5;
  m.anchorPosSy = (Math.random() * 2 - 1) * limY * 0.5;
  // define un objetivo inicial y velocidad
  chooseNewAnchorTargetSim(m, now, limX, limY);
  // micro patrón inicial aleatorio
  chooseNewMicroSim(m, now);
  // base de frecuencia y modulación
  m.wBase = 0.8 + Math.random() * 0.8;
  m.wCurrent = m.wBase;
  m.amPhase = Math.random() * Math.PI * 2;
  m.fmPhase = Math.random() * Math.PI * 2;
  // rotación del patrón
  m.frameAngle = Math.random() * Math.PI * 2;
  m.frameRate = 0.0003 + Math.random() * 0.0006;
  // microGain inicial
  m.microGain = 0.9 + Math.random() * 0.5;
  m.microGainEff = m.microGain;
  m.prevOffset = { x: 0, y: 0 };
  return m;
}

// Elige un nuevo objetivo de anchor para la simulación
function chooseNewAnchorTargetSim(m, t, limX, limY) {
  const sx = (Math.random() * 2 - 1) * limX * 0.8;
  const sy = (Math.random() * 2 - 1) * limY * 0.8;
  const prevX = m.anchorPosSx;
  const prevY = m.anchorPosSy;
  const dist = Math.hypot(sx - prevX, sy - prevY) || 1;
  // duración aleatoria 2–4s incrementada por distancia
  const dur = 2000 + Math.random() * 2000 + dist * 0.25;
  m.anchorTargetSx = sx;
  m.anchorTargetSy = sy;
  m.anchorMoveStart = t;
  m.anchorMoveDuration = dur;
  m.anchorMoveEnd = t + dur;
  m.anchorVelSx = (sx - prevX) / dur;
  m.anchorVelSy = (sy - prevY) / dur;
}

// Elige un nuevo micro patrón y tamaño para la simulación
function chooseNewMicroSim(m, t) {
  // Elegimos patrón y tamaño al azar
  const pName = PATTERN_NAMES[Math.floor(Math.random() * PATTERN_NAMES.length)];
  const tierNames = ['S', 'M', 'L'];
  const tier = tierNames[Math.floor(Math.random() * tierNames.length)];
  m.microPattern = pName;
  m.microType = pName.includes('spiral') ? 'spiral' : 'figure8';
  m.microTier = tier;
  m.microStart = t;
  const dur = MICRO_MIN_MS + Math.random() * (MICRO_MAX_MS - MICRO_MIN_MS);
  m.microDuration = dur;
  m.microNextSwitch = t + dur;
  m.microGain = 0.8 + Math.random() * 0.6;
  m.nonFigureCount = pName.startsWith('figure8') ? 0 : 1;
  m.prevOffset = { x: 0, y: 0 };
}

// Calcula el desplazamiento del micro‑patrón y aplica rotación y
// modulación.  Similar a computeMicroOffset en el juego.
function computeMicroOffsetSim(m, t, limX, limY) {
  const dtMs = t - m.microStart;
  const elapsedSec = dtMs * 0.001;
  const fn = MICRO_PATTERNS[m.microPattern] || MICRO_PATTERNS.figure8;
  const opts = {
    w: m.wCurrent,
    phase1: 0,
    phase2: 0,
    elapsed: dtMs,
    duration: m.microDuration
  };
  const g = m.microGainEff || m.microGain;
  let pt = fn(elapsedSec, g, opts);
  // rotación
  const a = m.frameAngle;
  const cosA = Math.cos(a);
  const sinA = Math.sin(a);
  pt = { x: pt.x * cosA - pt.y * sinA, y: pt.x * sinA + pt.y * cosA };
  // escala
  let ampX, ampY;
  if (m.microPattern.includes('spiral')) {
    const base = SPIRAL_SCALE[m.microTier] * Math.min(limX, limY);
    ampX = base;
    ampY = base;
  } else {
    ampX = TIER_SCALE[m.microTier] * limX;
    ampY = TIER_SCALE[m.microTier] * limY;
  }
  let ox = pt.x * ampX;
  let oy = pt.y * ampY;
  // clamp radial con suavizado
  const buffer = 20;
  const maxDx = limX - Math.abs(m.anchorPosSx) - buffer;
  const maxDy = limY - Math.abs(m.anchorPosSy) - buffer;
  const fx = maxDx <= 0 ? 0 : maxDx / Math.max(Math.abs(ox), 1e-6);
  const fy = maxDy <= 0 ? 0 : maxDy / Math.max(Math.abs(oy), 1e-6);
  const scale = Math.min(1, fx, fy);
  ox *= scale;
  oy *= scale;
  // blending (omitir para simulación abreviada)
  return { x: ox, y: oy };
}

function run() {
  const simDuration = 30000; // 30s
  const dt = 16; // ms por paso (~60fps)
  const movers = [];
  const N = 4;
  const limX = 500;
  const limY = 300;
  // grids para cobertura
  const cellW = (limX * 2) / HEAT_COLS;
  const cellH = (limY * 2) / HEAT_ROWS;
  // métricas
  const cellVisits = new Set();
  const cellVisitsByMover = Array.from({ length: N }, () => new Set());
  const lastVisitTime = Array.from({ length: N }, () => ({}));
  const revisits = Array.from({ length: N }, () => 0);
  const patternTime = {};
  PATTERN_NAMES.forEach(n => { patternTime[n] = 0; });
  const speeds = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) movers.push(createMover(limX, limY));
  // simulación principal
  for (let ms = 0; ms < simDuration; ms += dt) {
    for (let i = 0; i < N; i++) {
      const m = movers[i];
      const t = ms;
      // cambio de micro patrón
      if (t >= m.microNextSwitch) {
        chooseNewMicroSim(m, t);
      }
      // cambio de anchor
      if (t >= m.anchorMoveEnd) {
        chooseNewAnchorTargetSim(m, t, limX, limY);
      }
      // actualizar wCurrent con modulación simple
      const threatAlpha = 0; // no se calcula amenaza en la simulación
      const fm = 1 + 0.2 * Math.sin(t * 0.0004 + m.fmPhase);
      const targetW = m.wBase * fm;
      m.wCurrent += (targetW - m.wCurrent) * 0.1;
      const am = 1 + 0.2 * Math.sin(t * 0.0005 + m.amPhase);
      m.microGainEff = m.microGain * am;
      // actualizar frameAngle
      m.frameAngle += m.frameRate * dt;
      // actualizar anchor posición
      m.anchorPosSx += m.anchorVelSx * dt;
      m.anchorPosSy += m.anchorVelSy * dt;
      // calcular micro offset
      const off = computeMicroOffsetSim(m, t, limX, limY);
      const sx = m.anchorPosSx + off.x;
      const sy = m.anchorPosSy + off.y;
      // determinar celda
      const cx = Math.floor((sx + limX) / cellW);
      const cy = Math.floor((sy + limY) / cellH);
      const cellKey = `${cx}_${cy}`;
      cellVisits.add(cellKey);
      cellVisitsByMover[i].add(cellKey);
      // revisita si visitó la misma celda en los últimos 5000 ms
      const last = lastVisitTime[i][cellKey];
      if (last !== undefined && (t - last) < 5000) {
        revisits[i]++;
      }
      lastVisitTime[i][cellKey] = t;
      // acumular tiempo por patrón
      patternTime[m.microPattern] += dt;
      // velocidad
      if (m.prevSX !== undefined) {
        const dx = sx - m.prevSX;
        const dy = sy - m.prevSY;
        const speed = Math.hypot(dx, dy) / (dt / 1000);
        speeds[i].push(speed);
      }
      m.prevSX = sx;
      m.prevSY = sy;
    }
  }
  // calcular cobertura
  const totalCells = HEAT_COLS * HEAT_ROWS;
  const totalCoverage = (cellVisits.size / totalCells) * 100;
  // calcular cobertura por mover
  const coverageByMover = cellVisitsByMover.map(s => (s.size / totalCells) * 100);
  // calcular distribución de patrones
  const totalPatternTime = Object.values(patternTime).reduce((a, b) => a + b, 0);
  const patternDistribution = {};
  for (const key of Object.keys(patternTime)) {
    patternDistribution[key] = (patternTime[key] / totalPatternTime) * 100;
  }
  // revisitas promedio
  const avgRevisits = revisits.reduce((a, b) => a + b, 0) / N;
  // velocidad media y varianza
  const speedStats = speeds.map(arr => {
    const n = arr.length;
    const mean = arr.reduce((a, b) => a + b, 0) / (n || 1);
    const variance = arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n || 1);
    return { mean, variance };
  });
  console.log('Resultados de simulación de macro movers (30s):');
  console.log(`Cobertura total de celdas visitadas: ${totalCoverage.toFixed(1)}%`);
  coverageByMover.forEach((c, idx) => {
    console.log(`  Mover ${idx + 1}: cobertura ${c.toFixed(1)}%`);
  });
  console.log('Distribución de patrones (por tiempo de uso):');
  Object.entries(patternDistribution).forEach(([name, pct]) => {
    console.log(`  ${name.padEnd(12)}: ${pct.toFixed(1)}%`);
  });
  console.log(`Promedio de revisitas a la misma celda (<5s): ${avgRevisits.toFixed(2)} por mover`);
  speedStats.forEach((st, idx) => {
    console.log(`  Mover ${idx + 1}: velocidad media ${st.mean.toFixed(2)}, varianza ${st.variance.toFixed(2)}`);
  });
}

if (require.main === module) {
  run();
}