# Sol‑R Aim Trainer

Este proyecto es una reorganización en módulos ES de la versión original de **Sol‑R Aim Trainer**.  Todo el código HTML, CSS y JavaScript se ha dividido en archivos más pequeños y claros.  Los módulos están escritos en JavaScript estándar sin dependencias externas.  Además se han incorporado algunas mejoras solicitadas:

- Los movers (los puntos móviles que antes eran amarillos) empiezan de color **verde** y tienen **tres vidas**.  Al primer disparo se vuelven amarillos, al segundo naranjas y al tercero rojos; tras el tercer impacto desaparecen y vuelven a spawnearse, reproduciendo el sonido de éxito.
- Los movers seleccionan patrones de movimiento al azar y cambian de patrón cada pocos segundos.  Además se han añadido nuevos patrones como círculo, espiral, figura de ocho y zig‑zag.
- Se puede activar un modo de **huida** para que los movers se alejen del jugador: al acercarte a ellos huyen a mayor velocidad, y cada disparo aumenta temporalmente esa velocidad.  Pasados cuatro segundos sin ser disparados recuperan su tamaño y color original.
- El tamaño de los movers es configurable mediante un slider en el panel de configuración.
- Para evitar un menú interminable, los grupos de controles se han organizado en secciones plegables (`<details>`), que puedes abrir o cerrar haciendo clic en el título.

## Cómo ejecutar

### Opción recomendada (servidor local)

Debido a que los navegadores modernos aplican restricciones de seguridad al cargar módulos ES desde archivos locales (`file://`), se recomienda levantar un pequeño servidor estático y visitar la aplicación a través de `http://localhost`.  No es necesario instalar dependencias externas; basta con Python (incluido en la mayoría de sistemas) o cualquier otra herramienta similar.

1. Abre una terminal en la carpeta del proyecto `solr‑aim‑trainer`.
2. Ejecuta el siguiente comando para lanzar un servidor web local en el puerto 8000:

```sh
python3 -m http.server 8000
```

3. Abre tu navegador y visita `http://localhost:8000/index.html`.  `index.html` es el punto de entrada canónico y funciona tanto en Live Server como con `python -m http.server`.

### Opción sin servidor (modo build‑free)

Para entornos donde no es posible lanzar un servidor local existe **`index.offline.html`** como alternativa.  La versión recomendada sigue siendo `index.html` con un servidor estático (Live Server o `python -m http.server`), que evita problemas de CORS y garantiza que los módulos ES se carguen sin restricciones.

### Problemas comunes y soluciones

- **No se escucha el sonido**: Asegúrate de que el navegador tiene permiso para reproducir audio.  Algunos navegadores no reproducen sonido hasta que el usuario interactúa con la página (por ejemplo, haciendo clic o pulsando una tecla).
  Ten en cuenta además que esta refactorización no incluye los archivos MP3 originales por cuestiones de tamaño.  Si deseas sonidos, coloca tus propios `shot.mp3` y `succes.mp3` en la carpeta `sounds/`.
- **No se detecta el gamepad**: Conecta el mando antes de abrir la página.  Si no aparece nada en el HUD Dev, haz clic en la ventana del juego y mueve algún joystick para que el navegador lo reconozca.
- **Los sliders o botones no responden**: Comprueba que no tienes ningún elemento del panel de configuración seleccionado.  Pulsa `C` para abrir/cerrar el panel de configuración y `I` para el HUD de desarrollo.
- **La página no carga**: Si abres `index.html` sin servidor y el navegador indica errores de CORS o de módulos, utiliza la opción del servidor local o abre `index.offline.html`.

## Estructura de carpetas

```
solr‑aim‑trainer/
├── index.html            — Versión modular que utiliza ES Modules.  Requiere servidor local.
├── index.offline.html    — Versión «todo en uno» para abrir con doble clic, sin servidor.
├── css/
│   └── styles.css        — Estilos de la interfaz.
├── js/
│   ├── main.js           — Punto de entrada del juego y bucle principal.
│   ├── config.js         — Constantes base y objeto de configuración mutable (CFG).
│   ├── state.js          — Estado global (jugador, blancos, movers, timers, flags UI...).
│   ├── utils/
│   │   ├── math.js       — Funciones matemáticas de apoyo (clamp, rotaciones, etc.).
│   │   └── time.js       — Función para obtener el tiempo actual en milisegundos.
│   ├── input/
│   │   └── gamepad.js    — Lectura del mando y sus ejes/botones.
│   ├── systems/
│   │   ├── flight.js     — Gestión de inercia (FA‑off) y movimiento con aceleración.
│   │   ├── targets.js    — Lógica de blancos: aparición, respawn y tamaño.
│   │   └── movers.js     — Lógica de los movers amarillos: spawn, actualización, colisiones.
│   ├── render/
│   │   ├── canvas.js     — Inicialización del canvas y contexto.
│   │   ├── background.js — Dibujo del fondo y la malla.
│   │   ├── drawTargets.js— Dibujo de blancos y movers.
│   │   ├── crosshair.js  — Dibujo de la mirilla y flash.
│   │   ├── devHud.js     — HUD de desarrollo (muestra info del mando y estados).
│   │   └── uiConfig.js   — Creación y bindings del panel de configuración.
├── sounds/
│   ├── shot.mp3          — Sonido del disparo (no incluido; coloca tu propio archivo aquí).
│   └── succes.mp3        — Sonido al acertar un blanco o mover (no incluido; coloca tu propio archivo aquí).
└── README.md             — Este archivo.
```

## Dónde cambiar cosas

- **Sensibilidades y aceleraciones**: Están en `js/config.js` dentro del objeto `CFG`.  Puedes ajustar `sensX`, `sensY`, `sensZ` o las aceleraciones `faAccX`, `faAccY`, `faAccZ` para modificar la respuesta del mando.
- **Ejes del mando**: Los índices de los ejes (roll, pitch, yaw) y del botón de disparo están definidos al inicio de `js/config.js`.  Modifica `AXIS_ROLL`, `AXIS_PITCH`, `AXIS_YAW` o `TRIGGER_BUTTON` si tu mando tiene un mapeo diferente.
- **Cantidad y tamaño de los targets**: Los valores iniciales de `CFG.targetCount` y `CFG.targetR` definen cuántos blancos aparecen y su tamaño base.  También puedes activar el tamaño aleatorio con `CFG.randomTargetSize`.
- **Movers**: `CFG.moversEnabled` activa o desactiva los movers.  `CFG.moversCount` establece cuántos hay, `CFG.moversR` su tamaño (radio en píxeles), `CFG.moversSpeed` su velocidad base y `CFG.moversAvoid` la fuerza con la que evitan los blancos y entre ellos.
  - `CFG.moversFlee` activa el comportamiento de huida: con ON se alejan radialmente del jugador con un componente lateral y reaccionan al movimiento del jugador; con OFF nunca aplican fuerza de huida y sólo aceleran su patrón al recibir impactos.
  - `CFG.moversHit1Boost` y `CFG.moversHit2Boost` incrementan la velocidad al primer y segundo impacto (boost acumulativo).  El límite de velocidad escala con ese boost para que el cambio sea visible.
  - Los movers ya no tienen un patrón fijo (`CFG.moversPattern` se mantiene sólo por compatibilidad); en su lugar seleccionan patrones aleatorios y los encadenan automáticamente.
- **Curvas y deadzone**: Las curvas J y otros ajustes de deadzone están en `js/config.js`.  Cambia `useCurve`, `cpX`, `vaX`, `cpY`, `vaY` o `DEADZONE` y `NOISE_SNAP` para adaptar la curva de respuesta del mando.

Lee los comentarios al principio de cada archivo JavaScript para comprender qué hace cada módulo y qué zonas son seguras (pueden modificarse) o peligrosas (mejor no tocarlas si no estás seguro).
