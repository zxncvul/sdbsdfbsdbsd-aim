/*
 * config.js
 *
 * Este módulo define todas las constantes de configuración base y el objeto
 * de configuración mutable (`CFG`).  Las constantes determinan el mapeo de
 * ejes del gamepad, la zona muerta y otros parámetros que rara vez se
 * cambian.  El objeto `CFG` contiene los parámetros que se pueden ajustar
 * desde el panel de configuración (sensibilidades, tamaño de los blancos,
 * cantidad de movers, etc.).
 *
 * ZONA SEGURA: puedes modificar los valores de `CFG` para ajustar la
 * experiencia.  Los nombres son autoexplicativos.
 * ZONA PELIGROSA: evita cambiar los nombres de las constantes o eliminar
 * propiedades, ya que otros módulos dependen de ellas.
 */

// Botón de disparo (índice en el arreglo de botones del gamepad)
export const TRIGGER_BUTTON = 23;

// Mapeo de ejes del gamepad: roll (alabeo), pitch (cabeceo), yaw (guiñada)
export const AXIS_ROLL  = 0; // alabeo
export const AXIS_PITCH = 1; // cabeceo (invertido)
export const AXIS_YAW   = 5; // guiñada (twist)

// Deadzones y ruido en los ejes: valores pequeños se descartan para evitar
// que el mando se mueva solo cuando está en reposo.
export const DEADZONE   = 0.12;
export const NOISE_SNAP = 0.02;

// Cuando no hay FA‑off (inercia), se puede bloquear el movimiento en
// pitch/yaw si el roll domina.  Estos valores controlan ese bloqueo.
export const USE_DOMINANT_MOVEMENT = true;
export const ROLL_LOCK_THRESHOLD   = 0.35;
export const ROLL_LOCK_FACTOR      = 0.70;

// Velocidad base de desplazamiento y de rotación (roll)
export const SPEED_BASE      = 6;
export const ROLL_SPEED_BASE = 0.035;

// Margen en pantalla para spawnear blancos y movers (en píxeles)
export const MARGIN = 140;

// Tiempos de animación (en milisegundos) para la mirilla, aciertos y fallos
export const CROSSHAIR_FLASH_MS   = 90;
export const MISS_FLASH_MS        = 140;
export const HIT_FADE_MS          = 220;
export const SUCCESS_DELAY_MS     = 220;
export const SUCCESS_COOLDOWN_MS  = 160;

// Número máximo de impactos que puede recibir un mover antes de desaparecer.
// Los movers arrancan con este número de vidas y cambian de color cada vez
// que reciben un disparo.  Cuando se agotan las vidas se reproducirá el
// sonido de éxito y se volverán a spawnear en otra posición.
export const MOVERS_MAX_HITS = 3;

// Intervalo (ms) tras el último disparo en que un mover regenera todas sus
// vidas, vuelve a su color original y restablece su velocidad de huida.
// Si se dispara de nuevo antes de que transcurra este tiempo, el contador
// se reinicia.
export const HEAL_INTERVAL_MS = 4000;

// Objeto de configuración runtime.  Se puede modificar en caliente a
// través del panel de configuración (`uiConfig.js`).
export const CFG = {
  // Sensibilidades: X = roll, Y = pitch, Z = yaw
  sensX: 1.0,
  sensY: 1.0,
  sensZ: 0.20,

  // Tamaño base del target (blanco)
  targetR: 10,

  // Número de blancos en pantalla (0..20)
  targetCount: 1,

  // Si es true, al acertar un blanco éste reaparece inmediatamente.
  // Si es false, sólo reaparecerán cuando se eliminen todos.
  regenOnHit: true,

  // Si es true, cada blanco tendrá un tamaño aleatorio al aparecer.
  randomTargetSize: false,

  // Uso de la curva J para la respuesta del stick.
  useCurve: true,
  applyCurveToX: false,
  cpX: 25,
  vaX: 8,
  cpY: 25,
  vaY: 8,

  // Mostrar la malla de fondo y el modo de fondo negro total
  showGrid: false,
  blackBg: false,

  // FA‑off: modo de inercia.  Cuando está activado se usa el módulo
  // flight.js para gestionar aceleraciones.
  faOff: false,

  // FA‑off: aceleración máxima por eje (roll, pitch, yaw)
  faAccX: 0.05,
  faAccY: 0.05,
  faAccZ: 0.05,

  // Movers (amarillos)
  moversEnabled: true,
  // Ajustamos el número predeterminado de movers a un valor mayor
  // que cero para facilitar las pruebas de la nueva lógica.  El panel
  // de configuración sigue permitiendo cambiar esta cantidad.
  moversCount: 3,
  // Patrón de movimiento se ignora en la nueva versión.  Los movers
  // seleccionan patrones aleatorios y los encadenan automáticamente.  Este
  // campo se conserva por compatibilidad pero no se usa.
  moversPattern: "random",
  moversSpeed: 1.00,
  moversAvoid: 1.00,
  // Radio (tamaño) de los movers.  Se puede ajustar mediante el panel
  // de configuración.  Valores recomendados entre 6 y 60 px.
  moversR: 14,
  // Si es true, los movers huirán del jugador cuando éste se acerque.  La
  // velocidad de huida aumenta con cada disparo recibido y se regenera con
  // el tiempo.  Si es false, no reaccionarán al jugador salvo por las
  // fuerzas de esquiva clásicas.
  moversFlee: false,
  // Incrementos de velocidad de huida al recibir impactos.  Cada
  // mover tiene tres vidas; al primer impacto su velocidad de huida
  // aumenta un porcentaje especificado por `moversHit1Boost`.  Al
  // segundo impacto se suma el porcentaje de `moversHit2Boost`.
  // Ambos valores son proporciones (0.0 = sin incremento, 0.5 = +50 %)
  // que se suman para obtener el multiplicador total.  Por ejemplo,
  // un valor de 0.40 y 0.60 dará como resultado un multiplicador de
  // 1.0 + 0.40 + 0.60 = 2.0 al segundo impacto.
  moversHit1Boost: 0.40,
  moversHit2Boost: 0.60,

  // Modo de juego: classic | matrix | split
  gameMode: 'classic',

  // Modo Matrix: targets en línea recta desde los bordes
  matrixSpawnMs: 700,
  matrixSpeed: 4.0,
  matrixTargetR: 14,
  matrixRandomSize: false,
  matrixFromTop: true,
  matrixFromBottom: false,
  matrixFromLeft: false,
  matrixFromRight: false,

  // Modo Split: pelotas grandes que se dividen
  splitBallCount: 1,
  splitBallSpeed: 3.0,
  splitBallStartR: 140,
  splitBallMinR: 10
};
