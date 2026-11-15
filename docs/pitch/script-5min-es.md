# Guion del pitch local, 5 minutos

> **Confirmar con los organizadores de Ensenada:** duración del pitch (suponemos 5 minutos más preguntas), si las preguntas van aparte, y si podemos conectar nuestra laptop. Si el formato es de 8 minutos, usar `script-8min-es.md`. Si es de 3, `script-3min-es.md`.

**Tesis:** en Marte, la pregunta no es a dónde puedes ir. Es a dónde puedes ir y todavía volver. Se dice una vez, al principio. Todo lo demás la demuestra.

El pitch corre dentro del sitio, en el modo de presentación (`?present=1`), y pasa a la demo en vivo en el beat 4. Los beats están en `beats.md`. La demo sigue `demo-run-sheet.md`, corte A. Presentan tres personas: **P1** (apertura), **P2** (demo, en la laptop), **P3** (datos y cierre). Los nombres los decide el equipo. Versión en inglés: `script-5min-en.md`.

Ritmo: 140 palabras por minuto. Los números salen de la app y de sus fuentes (ver "De dónde sale cada número" abajo).

| Tiempo | Beat | Quién | Texto |
|---|---|---|---|
| 0:00 | 1 · Jezero | P1 | Cráter Jezero, Marte. Una astronauta está en Cheyava Falls, la roca donde Perseverance encontró una posible biofirma, a 913 metros del hábitat por la ruta. Es el final de su EVA: le quedan 160 gramos de oxígeno. Volver cuesta 53. Treinta minutos de reserva no se tocan. Y llega una alerta de radiación. |
| 0:24 | 1 · Tesis | P1 | En Marte, la pregunta no es a dónde puedes ir. Es a dónde puedes ir y todavía volver. Somos Los Frijolitos Espaciales Refritos Nueva Generación, de Ensenada. Esto es Marswalk. |
| 0:38 | 2 · Los límites | P1 | Tres límites de los trajes lunares de la NASA: ocho horas de caminata, treinta minutos de reserva, nada de más de veinte grados de pendiente. Y sin GPS: el camino a casa hay que leerlo en el terreno. |
| 0:55 | 3 · La zona de regreso | P1 | Lo azul es todo lo que ella alcanza y todavía regresa con su reserva, calculado con el planificador y el modelo de traje de la app. Cada subida lo encoge. Con la alerta, se cierra al camino de vuelta. En la app, eso es un número en el visor: el margen. |
| 1:19 | 4 · Demo | P2 | (Demo, corte A, 2:25. Líneas abajo.) |
| 3:44 | 5 · La respuesta y los datos | P3 | ¿Y la astronauta de Cheyava Falls? Con la alerta, le sobran catorce minutos de margen. Marswalk la manda de vuelta ya, por la ruta que rodea las pendientes. Esa pendiente es el modelo HiRISE. La roca es la que fotografió Perseverance. La tormenta llega a la opacidad que midió Curiosity en 2018, y la radiación repite tasas de dosis reales de 2017. |
| 4:11 | 6 · Medido o simulado | P3 | Cada lectura dice si es medida, calculada o supuesta: caminar a un metro por segundo es supuesto. La tormenta y la radiación las midió Curiosity en Gale, no en Jezero, y la alerta lo dice. El clima de Jezero es la estación MEDA de Perseverance. |
| 4:30 | 7 · Quién y un dato | P3 | Sirve para quien planea una caminata, que compara tres rutas antes de aprobar una, y para una clase en Ensenada, en el navegador. Un último dato: procesamos el mismo modelo HiRISE que sirve NASA Mars Trek, y la diferencia típica es de catorce centímetros. |
| 4:51 | | | (Fin. 9 segundos de margen.) |

## Líneas de la demo (P2, corte A)

| Beat | Tiempo de la demo | Texto |
|---|---|---|
| D1 | 0:00 | La mesa de misión: Jezero, con el terreno de HiRISE. |
| D2 | 0:06 | Capa Terreno: la pendiente. La ruta rodea lo amarillo y nunca cruza lo rojo, más de veinte grados. |
| D3 | 0:25 | Si la tripulación pide Cheyava Falls, la ruta crece y el plan recalcula tiempo y oxígeno. En vivo caminamos la primera parada: 55 metros. |
| D4 | 0:45 | Simulo el final de una EVA: salgo con 20 % de oxígeno. El plan dice que sí. Empezamos. |
| D5 | 0:55 | A la izquierda, el margen: minutos que me quedan después de volver caminando y guardar la reserva. Se lee a mi paso: al caminar baja, al subir baja más. Abajo, la posición: sin GPS, el error crece al caminar y se corrige al detenerme con horizonte despejado. Ese modelo es nuestro, y dice SIM. |
| D6 | 1:48 | Llegamos. Foto, muestra, guardar. |
| D7 | 2:03 | Tormenta de polvo. No te tira: te quita el horizonte, y sin horizonte no hay posición. La ruta se recalcula al hábitat. |
| fin | 2:14 | Quince segundos después llega la alerta de radiación, con dosis reales de Curiosity. |
| | 2:25 | (Vuelta al modo de presentación.) |

## Apertura opcional, 20 segundos

Solo si el equipo la elige en el ensayo. Va antes del beat 1 y usa los 20 segundos de margen. Un jurado local recomendó no usarla: el premio del año pasado no califica el proyecto de este año.

| Tiempo | Quién | Texto |
|---|---|---|
| 0:00 | P1 | El año pasado, cinco de nosotros ganamos Ensenada con NASA Explorer: primer lugar de diecisiete, y nominados globales. Este año se sumó Andrea. Refritos, nueva generación. |
| 0:12 | P1 | (Pausa. Cambia a Jezero.) |
| 0:20 | | |

## De dónde sale cada número

| Número | Fuente |
|---|---|
| 913 m por la ruta de ida; volver: 824 m, 53 g de O2, 18 min | Ida: ruta del planeador de la app (`planRoute`, esclusa del hábitat, WP1, WP2, WP3, Cheyava Falls). Vuelta: la ruta que replanea la alerta, de Cheyava Falls directo al hábitat, con el modelo del traje (`walkCost`, con el 20 % extra de Apolo 15). `data/walkback-zone.json`, campo `coldOpen`: 53.4 g, 18.4 min, margen 14.1 min. La línea recta es 785 m (pestaña Sitio) |
| 160 g al llegar a Cheyava Falls, 14 min de margen | Escenario nuestro (SIM): final de una EVA larga, 21 % del tanque de 771 g. Margen = (160 − 53 − 72.5 g de reserva) ÷ 2.42 g/min (145 g/h, caminar en plano) = 13.9 min |
| Reserva de 30 min = 72.5 g | `suit.reserve.time` (Apollo 17) al ritmo de caminar en plano, 145 g/h |
| 8 h | `suit.eva_duration_max`, NASA EVA-EXP-0042 Rev B (xEVA Concept of Operations) |
| 20° | `slope.no_go`, NASA EVA-EXP-0042 Rev B (requisito del traje xEVA) |
| 55 m la primera salida | Mesa de misión en #282 |
| 20 % de O2 en la demo | Control "O2" de las necesidades de la tripulación en #282, `needs.o2Pct` (SIM). Ver `demo-run-sheet.md` |
| 1 m/s | `mobility.speed.flat`, SIM |
| 97 de cada 100 puntos | Acuerdo de clases de pendiente (0-15, 15-25, >25°) entre nuestra malla de 2 m y el DTM HiRISE de Mars Trek: 97.3 % de 564,001 nodos. RMS de altura 0.14 m. Prueba el procesamiento, no la exactitud del DTM. `docs/data/mars-trek-check/README.md` |
| Opacidad 2018 | tau 8.0, tormenta global medida por Curiosity en Gale (DATA); la subida en 30 s es SIM |
| Dosis de 2017 | RAD, Curiosity, cráter Gale, evento de septiembre de 2017 (`hazards.json` `sep_2017_profile`); la línea de tiempo comprimida es SIM |

## Conteo

`node tools/timing.mjs` revisa cada fila contra su tiempo a 140 palabras por minuto y escribe `council/timing.md`.
