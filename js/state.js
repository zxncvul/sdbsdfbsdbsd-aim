/*
 * state.js
 *
 * Este módulo almacena todas las variables globales de estado necesarias
 * durante la ejecución del juego.  Separar el estado facilita que
 * distintos módulos (como `targets.js`, `movers.js` o `drawTargets.js`)
 * puedan acceder y modificar los mismos datos sin recrearlos.  Aquí no se
 * implementa lógica; sólo se exponen valores que otros módulos pueden
 * leer o actualizar.
 *
 * ZONA SEGURA: puedes leer y modificar las propiedades exportadas desde
 * cualquier otro módulo.  Por ejemplo, `player.x` o `targets.length`.
 * ZONA PELIGROSA: no renombres ni elimines estas variables, ya que el
 * comportamiento del juego depende de ellas.
 */

// Índice del gamepad activo (por si conectas varios mandos)
export let activeIndex = 0;

// Ángulo actual de roll (rotación) en radianes
export let rollAngle = 0;

// Posición del jugador en el mundo 2D
export const player = { x: 0, y: 0 };

// Posición del jugador en el frame anterior.  Se utiliza para calcular
// la velocidad (magnitud) de la mira entre frames, necesaria para la
// función de huida de los movers.  Estos valores se actualizan en
// `main.js` en cada ciclo de actualización.
export let prevPlayerX = 0;
export let prevPlayerY = 0;

// Lista de blancos activos.  Cada objeto tiene { x, y, r, hitStart, dead }
export let targets = [];

// Lista de movers (amarillos).  Los objetos tienen { x, y, vx, vy, r, t0, p1, p2, hitUntil }
export const movers = [];

// Flag para el estado del disparo: true mientras se mantiene pulsado el gatillo
export let triggerPressed = false;

// Temporizadores para los flashes de la mirilla y el fallo (en ms futuros)
export let crosshairFlashUntil = 0;
export let missFlashUntil = 0;

// Control de reproducir el sonido de éxito: última vez que se reprodujo
export let lastSuccessAt = 0;

// Marca temporal del último frame renderizado (ms).  Se usa para calcular dtN
export let lastFrameMs = performance.now();

// Flags para mostrar u ocultar paneles de UI
export let showConfig = false;
export let showDevHud = false;

// Elementos DOM que se rellenan en `main.js` tras cargarse la página.  Se
// exportan aquí para que otros módulos puedan manipular el HUD o la
// configuración sin volver a consultarlos en el DOM.
export let canvas = null;
export let ctx = null;
export let devHudEl = null;
export let configPanelEl = null;
export let toastEl = null;
export let shotAudio = null;
export let successAudio = null;

/**
 * Inicializa las referencias a los elementos DOM.  Este método se llama
 * desde `main.js` al iniciar la aplicación.  Pasar null provocará
 * problemas en los módulos que los necesiten, así que asegúrate de
 * invocarlo con los elementos correctos.
 * @param {HTMLCanvasElement} c canvas principal
 * @param {CanvasRenderingContext2D} context contexto 2D del canvas
 * @param {HTMLElement} devHud nodo del HUD de desarrollo
 * @param {HTMLElement} cfgPanel nodo del panel de configuración
 * @param {HTMLElement} toast nodo del mensaje inicial
 * @param {HTMLAudioElement} shot sonido de disparo
 * @param {HTMLAudioElement} success sonido de acierto
 */
export function initDomRefs(c, context, devHud, cfgPanel, toast, shot, success) {
  canvas = c;
  ctx = context;
  devHudEl = devHud;
  configPanelEl = cfgPanel;
  toastEl = toast;
  shotAudio = shot;
  successAudio = success;
}

/**
 * Permite actualizar la posición y rotación del jugador desde FA‑off o
 * desde la lógica clásica sin inercia.  Se define aquí para centralizar
 * las asignaciones (no estrictamente necesario, pero mejora la claridad).
 * @param {number} dx desplazamiento en el eje X del mundo
 * @param {number} dy desplazamiento en el eje Y del mundo
 * @param {number} dAngle incremento del ángulo de roll en radianes
 */
export function movePlayer(dx, dy, dAngle = 0) {
  player.x += dx;
  player.y += dy;
  rollAngle += dAngle;
}