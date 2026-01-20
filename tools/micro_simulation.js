/*
 * tools/micro_simulation.js
 *
 * Este script ejecuta una micro‑simulación de los patrones de
 * movimiento disponibles en los movers.  No tiene dependencias con
 * otros módulos del juego y puede ejecutarse con Node.js.  Su
 * propósito es muestrear las funciones de patrones para distintos
 * tamaños (tiers) y roles, registrando métricas sencillas como el
 * bounding box (mínimo y máximo desplazamiento en X/Y) y la
 * amplitud efectiva.  Al ejecutarlo se imprime por consola un
 * resumen que permite verificar que las variantes son visibles y
 * diferentes entre sí.
 */

// Definición de micro‑patrones idéntica a la usada en el juego.
const MICRO_PATTERNS = {
  figure8: (t, gain, opts) => {
    const w = opts.w * gain;
    const x = Math.sin(w * t + (opts.phase1 || 0));
    const y = Math.sin(w * 2.0 * t + (opts.phase2 || 0));
    return { x, y };
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
    const x = Math.sin(w * t + (opts.phase1 || 0)) * scale;
    const y = Math.sin(w * 2.0 * t + (opts.phase2 || 0)) * scale;
    return { x, y };
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
  }
  ,
  // Patrón rosette (hipotrocoide aproximado) para medir su bounding box
  rosette: (t, gain, opts) => {
    const w = opts.w * gain;
    const k = 3.7;
    const a = 0.35;
    const angle1 = w * t + (opts.phase1 || 0);
    const angle2 = k * w * t + (opts.phase2 || 0);
    return { x: Math.cos(angle1) + a * Math.cos(angle2), y: Math.sin(angle1) - a * Math.sin(angle2) };
  },
  // Patrón swerveStop para bounding box
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

const TIER_SCALE = { S: 0.12, M: 0.25, L: 0.38 };
const SPIRAL_SCALE = { S: 0.18, M: 0.35, L: 0.50 };

const ROLES = {
  Runner: {
    patternWeights: { spiral: 2, spiralBurst: 1.5, figure8: 1, figure8Wide: 0.5, figure8Spiral: 0.5 },
    tierWeights: { S: 1, M: 1.5, L: 2 }
  },
  Dancer: {
    patternWeights: { figure8: 2, figure8Wide: 1.5, figure8Spiral: 1.2, spiral: 0.5, spiralBurst: 0.5 },
    tierWeights: { S: 1.5, M: 1, L: 0.8 }
  },
  Trickster: {
    patternWeights: { figure8Wide: 2, figure8Spiral: 2, spiralBurst: 1, spiral: 0.8, figure8: 0.8 },
    tierWeights: { S: 1, M: 1, L: 1 }
  },
  Kiter: {
    patternWeights: { spiral: 1.8, spiralBurst: 1.8, figure8: 1, figure8Wide: 0.5, figure8Spiral: 0.5 },
    tierWeights: { S: 0.8, M: 1.2, L: 1.8 }
  }
};

/**
 * Simula un patrón durante unos segundos devolviendo estadísticas
 * sencillas.  Retorna un objeto con bounding boxes y amplitud
 * efectiva.
 */
function simulatePattern(name, tier, durationMs = 4000, gain = 1.0) {
  const fn = MICRO_PATTERNS[name];
  const limX = 1000; // valores arbitrarios para escala
  const limY = 1000;
  const ampX = name.includes('spiral') ? SPIRAL_SCALE[tier] * Math.min(limX, limY) : TIER_SCALE[tier] * limX;
  const ampY = name.includes('spiral') ? SPIRAL_SCALE[tier] * Math.min(limX, limY) : TIER_SCALE[tier] * limY;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const start = 0;
  const dur = durationMs;
  const dt = 16; // ~60fps
  for (let ms = 0; ms < dur; ms += dt) {
    const t = ms / 1000;
    const opts = { w: 1, phase1: 0, phase2: 0, elapsed: ms, duration: dur };
    const p = fn(t, gain, opts);
    const x = p.x * ampX;
    const y = p.y * ampY;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { name, tier, minX, maxX, minY, maxY, ampX, ampY };
}

function run() {
  const results = [];
  const gains = { S: 1, M: 1, L: 1 };
  for (const roleName of Object.keys(ROLES)) {
    const role = ROLES[roleName];
    const patterns = Object.keys(MICRO_PATTERNS);
    const tiers = ['S', 'M', 'L'];
    console.log(`\nRole: ${roleName}`);
    for (const tier of tiers) {
      console.log(`  Tier ${tier}:`);
      for (const pName of patterns) {
        // seleccionamos una ganancia moderada para la simulación
        const g = 1.0;
        const r = simulatePattern(pName, tier, 4000, g);
        const width = (r.maxX - r.minX).toFixed(1);
        const height = (r.maxY - r.minY).toFixed(1);
        console.log(`    ${pName.padEnd(14)} → width ${width}, height ${height}`);
      }
    }
  }
}

if (require.main === module) {
  run();
}