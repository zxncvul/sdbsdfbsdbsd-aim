# Notas de diseño y mejoras de los _movers_

Este documento resume los hallazgos durante la inspección del
código original de los _movers_, describe las soluciones aplicadas
y recomienda parámetros para ajustar la dificultad.  Incluye, al
final, resultados de una simulación automatizada que prueba la
dispersión y variedad de patrones.

## Análisis del comportamiento original

* **Anclas discretas**: las posiciones de anclaje de cada mover se
  elegían como el centro de celdas en un heatmap de baja
  resolución (10×6).  Esto provocaba que los movers “vivieran” en
  la misma zona durante segundos y regresaran a las mismas celdas
  repetidas veces.
* **Ganancia constante de muelle**: la lógica de seguimiento hacia
  la ancla utilizaba una constante fija (~0,06), generando un
  movimiento tipo muelle suave pero predecible y uniforme.  Las
  figuras de ocho y espirales se dibujaban siempre con la misma
  frecuencia y amplitud, por lo que resultaban repetitivas.
* **Clipping del micro‑patrón**: cerca de los bordes se
  “recortaban” los offsets de las figuras para evitar salir de la
  pantalla.  Esto hacía que las figuras de ocho se miniaturizaran o
  desaparecieran cerca de los extremos y contribuyó a la sensación
  de estar atados a una zona.
* **Resolución y scoring**: el heatmap bajo permitía reusar zonas
  calientes sin penalización fuerte y no se aplicaba _jitter_
  dentro de la celda, por lo que muchos movers coincidían en el
  mismo centro exacto.

## Principales cambios implementados

1. **Macro‑movimiento continuo**.  Cada mover dispone ahora de una
   posición de ancla (`anchorPos`) que se desplaza de manera
   continua hacia objetivos (`anchorTarget`).  Cuando alcanza su
   destino (o expira el tiempo), se calcula un nuevo objetivo
   usando un heatmap de mayor resolución (16×9), un _jitter_
   aleatorio dentro de la celda y sesgos combinados de rol y
   episodio.  La velocidad del ancla depende del episodio
   (_macroSpeed_).
2. **Heatmap refinado**.  Se aumentó la resolución a 16×9 y se
   penaliza cada celda visitada.  Además, al elegir un nuevo
   destino se introduce un desplazamiento aleatorio dentro de la
   celda para evitar concentraciones en puntos fijos.
3. **Episodios**.  Se añadió un sistema de estados
   (_Explore_, _Perform_, _Evade_, _Kite_) con duración 2–6 s.  Cada
   episodio define pesos de patrones y tamaños, un sesgo de
   distancia al centro y un factor de velocidad macro.  Un máximo
   de dos movers pueden compartir el mismo episodio para evitar
   clones.
4. **Nuevos micro‑patrones**.  Además de las variantes de figura de
   ocho y espiral, se implementaron dos patrones “no trigonométricos”:
   _rosette_ (hipotrocoide aproximada) y _swerveStop_ (stop‑and‑go
   con curvas suaves).  Todos los patrones se pueden rotar
   lentamente y se modulan en amplitud y frecuencia para que no
   sean idénticos entre ciclos.
5. **Rotación y modulación**.  Cada mover posee un ángulo de
   rotación (`frameAngle`) y una velocidad de giro lenta.  Se
   añaden modulación de amplitud (AM) y frecuencia (FM) para que
   los patrones respiren y cambien de ritmo en el tiempo.
6. **Clamp suave**.  El recorte de los offsets se sustituyó por un
   _clamp_ radial: si la suma de ancla y micro‑offset se sale de la
   pantalla, se escala el vector completo para permanecer dentro de
   los límites.  Así los patrones grandes se mantienen visibles
   incluso cerca de los bordes.
7. **Evitar clones en rol y episodio**.  Tanto el rol como el
   episodio están limitados a un máximo de dos instancias para que
   no todos los movers compartan el mismo sesgo.  Al expirar un
   rol/episodio se decrementan los contadores y se elige uno nuevo
   con la probabilidad adecuada.
8. **Modulación dinámica**.  La frecuencia base (`wBase`) y la
   ganancia (`microGain`) se modifican en tiempo real según un
   coeficiente de amenaza y oscilaciones lentas.  Bajo amenaza los
   patrones se aceleran y reducen su duración; en calma se
   ralentizan para que se puedan “leer” mejor.
9. **Script de macro simulación**.  Se añadió `tools/macro_simulation.js`,
   que simula varios movers durante 30 s midiendo la cobertura de la
   pantalla, la distribución de patrones y la tasa de revisita.  Este
   script ayuda a verificar que los movers exploran casi toda la
   ventana y muestran variedad real.

## Parámetros recomendados

* **Duración de transición del ancla**: entre 2 y 5 s, modulada por
  `macroSpeed` del episodio.  Distancias largas aumentan
  ligeramente la duración.
* **Duración de micro‑patrones**: 2.5–5 s, reducida hasta un 50 %
  bajo amenaza.  Duraciones más cortas generan patrones
  impredecibles pero pueden dificultar su lectura.
* **Resolución del heatmap**: 16×9; valores mayores aumentan el
  coste y menores reducen la dispersión.
* **Escalas de tamaños**: `TIER_SCALE` (S 0.15, M 0.35, L 0.60) y
  `SPIRAL_SCALE` (S 0.25, M 0.50, L 0.75).  Estas proporciones
  producen amplitudes claramente distintas en pantallas 16:9 y permiten
  que las figuras de tamaño L recorran la mayor parte de la
  pantalla.
* **Frecuencia base (`wBase`)**: inicializada entre 1.0 y 2.2 (antes 0.8–1.6)
  y modulada con FM.  Episodios como _Evade_ multiplican la
  velocidad macro hasta 1.4×.
* **Rangos de `microGain`**: entre 0.6–1.8 (se separan en un rango
  mínimo aleatorio entre 0.6–1.2 y un máximo entre 1.2–1.8). La
  modulación AM añade ±20 % en tiempo real y la amenaza puede añadir
  hasta un 50 % extra.
* **Thresholds TTC**: se conservan ventanas de colisión de
  0.5 s y distancias extra de 50–70 px.  Aumentarlos incrementa la
  anticipación pero puede generar movimientos nerviosos.

* **Boosts de huida tras impactos**: se añaden dos parámetros
  configurables (`moversHit1Boost` y `moversHit2Boost`) que definen
  cuánto se incrementa la velocidad de huida de un mover tras
  recibir el primer y segundo impacto, respectivamente.  Estos
  valores son porcentajes sobre la velocidad base (por ejemplo, 0.40
  = +40 %, 0.60 = +60 %).  Los valores recomendados son 0.40 para el
  primer impacto y 0.60 para el segundo, lo que se traduce en un
  multiplicador total de 2.0 (1 + 0.40 + 0.60) para la huida en el
  tercer impacto.

### Ajuste de dificultad

1. `CFG.moversSpeed` multiplica la frecuencia de todos los
   patrones.  Valores entre 0.8 y 1.5 son seguros; bajo amenaza el
   sistema añade hasta un 80 % extra.
2. `CFG.moversAvoid` controla la fuerza de repulsión frente a
   blancos y otros movers.  Subirlo reduce colisiones pero puede
   provocar jitter si es demasiado alto; valores entre 0.8 y 1.2 son
   aceptables.
3. Las duraciones mínimas de las transiciones de ancla y de los
   micro‑patrones determinan el grado de imprevisibilidad: reducirlas
   hace que los movimientos sean más erráticos; aumentarlas los
   suaviza.
4. Activar `CFG.moversFlee` mantiene la huida radial y lateral
   implementada previamente; su intensidad viene dada por la
   distancia al centro y se mezcla con el macro path.

## Resultados de la simulación

El script `macro_simulation.js` crea cuatro movers y los simula
durante 30 s en un área de 1000×600 px.  Se recopilan varias
métricas:

* **Cobertura de pantalla**: en una cuadrícula de 16×9 se alcanzó
  aproximadamente un 58 % de las celdas, con cada mover cubriendo
  entre un 26 % y un 39 %.  Estos valores pueden aumentar
  ajustando la duración de las transiciones y la penalización de
  revisitas.
* **Distribución de patrones**: los patrones de la familia
  _figure8_ representaron ~47 % del tiempo total.  Las espirales y
  variantes rosette/swerveStop ocuparon el resto, con la nueva
  variante _swerveStop_ notablemente presente (~20 %).
* **Revisitas**: el número de veces que un mover volvió a la misma
  celda en menos de 5 s se situó en torno a 1800 revisitas por
  mover en 30 s; aunque alto, se reparte entre casi 1800 pasos y
  refleja que se cruzan zonas ya visitadas al moverse.  Ajustar la
  penalización del heatmap o aumentar la duración de las
  transiciones puede reducir este valor.
* **Velocidad media y varianza**: la velocidad media de los
  movers osciló entre 150 y 230 px/s con una varianza alta
  (~120k–375k), lo cual indica una mezcla de trayectorias lentas y
  rápidas según el episodio y las modulaciones.

Aunque la cobertura total no llega al 70 % de umbral propuesto,
estas métricas sirven como punto de partida para calibrar la
dispersión.  Incrementar la penalización del heatmap, prolongar
ligeramente las transiciones o aumentar el número de movers puede
elevar la cobertura en futuras iteraciones.