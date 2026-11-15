# Guion del pitch local, 5 minutos (gemelo en español)

> **Formato.** El equipo planea una charla de 5 minutos con la demo en vivo adentro, y luego preguntas. La página de los organizadores citada en `docs/SUBMISSION.md` (PR #316) todavía dice "prepárate para exponer en idioma inglés durante un tiempo máximo de 3 minutos". **Confirmar con los organizadores** antes de las 2:00 pm. Si mantienen los 3 minutos, usar el punto de corte marcado abajo, que pasa a `script-3min-es.md`.

El guion principal es `script-5min-en.md`, en inglés. Este es su gemelo en español, para ensayar y para contestar preguntas en español: mismos beats (`beats.md`, tabla de 5 minutos), misma demo (`demo-run-sheet.md`, corte A), mismos números. Presentan tres personas: **P1** (apertura), **P2** (demo, en la laptop), **P3** (datos y cierre). Los nombres los decide el equipo.

**Tesis:** en Marte, la pregunta no es a dónde puedes ir. Es a dónde puedes ir y todavía volver. Se dice una vez, al principio. Todo lo demás la demuestra.

Ritmo: escrito para 125 palabras por minuto, y ninguna fila pasa de 140 (`node tools/timing.mjs`). La charla termina en 4:45, con la demo incluida.

| Tiempo | Beat | Quién | Texto |
|---|---|---|---|
| 0:00 | 1 · Jezero | P1 | Cráter Jezero, Marte. Una astronauta está en Cheyava Falls, donde Perseverance encontró una posible señal de vida, a 913 metros del hábitat por la ruta planeada. Es el final de su caminata afuera, su EVA. Le quedan 160 gramos de oxígeno. Volver cuesta 53. Su reserva, treinta minutos de aire, son otros 72. Y llega una alerta de radiación. |
| 0:28 | 1 · Tesis | P1 | En Marte, la pregunta no es a dónde puedes ir. Es a dónde puedes ir y todavía volver. Somos Los Frijolitos Espaciales Refritos Nueva Generación, de Ensenada. Marswalk cuenta esos minutos sobre terreno real de la NASA. |
| 0:46 | 2 · Los límites | P1 | (**Punto de corte a 3 minutos.** Si los organizadores mantienen los 3 minutos, P1 salta esta fila y dice el beat 3 de `script-3min-es.md`, también en 0:46, y P2 corre el corte B. Los beats 1a y 1b de arriba son idénticos a los del guion de 3 minutos.) Tres límites de los trajes lunares de la NASA: ocho horas afuera, media hora de reserva, nada de más de veinte grados. Sin GPS, el camino se lee en el terreno. |
| 1:01 | 3 · La zona de regreso | P1 | Lo azul es todo lo que alcanza y todavía regresa con su reserva, dibujado con el planificador de la app. Cada subida lo encoge. La alerta lo cierra al camino de vuelta. En la app es un número en el visor, el margen. |
| 1:23 | 4 · Demo | P2 | (Demo, corte A, 2:14. Líneas abajo.) |
| 3:37 | 5 · La respuesta y los datos | P3 | De vuelta en Cheyava Falls. La alerta le deja catorce minutos de margen, así que Marswalk la manda a casa ya. La pendiente sale del modelo HiRISE y la roca de las fotos de Perseverance. La tormenta llega a la opacidad que midió Curiosity en 2018, y la alerta repite sus dosis de 2017. |
| 4:03 | 6 · Medido o simulado | P3 | Cada lectura dice si es medida, calculada o supuesta. Caminar a un metro por segundo es supuesto. El pico de la tormenta y la radiación son de Curiosity, en Gale, no en Jezero. El clima es de MEDA, de Perseverance. |
| 4:23 | 7 · Quién y un dato | P3 | Podría servir a quien planea una caminata, para comparar tres rutas antes de aprobar una, y a una clase en Ensenada, en el navegador. Un último dato: procesamos el mismo modelo HiRISE que sirve NASA Mars Trek, y la diferencia típica es de catorce centímetros. |
| 4:45 | | | (Fin. 15 segundos de margen.) |

## Líneas de la demo (P2, corte A)

Los tiempos corren desde la entrega en 1:23. Teclas, clics y el respaldo de cada beat están en `demo-run-sheet.md`, corte A.

| Beat | Tiempo de la demo | Texto |
|---|---|---|
| D1 | 0:00 | La mesa de misión, sobre el terreno HiRISE de Jezero. |
| D2 | 0:05 | Capa Terreno, la pendiente. La ruta rodea lo amarillo, y el planificador bloquea lo rojo, más de veinte grados. |
| D3 | 0:25 | Si la tripulación pide Cheyava Falls, la ruta crece y el plan recalcula tiempo y oxígeno. En vivo caminamos la primera parada, 55 metros. |
| D4 | 0:45 | Simulo el final de una EVA y salgo con 20 % de oxígeno. El plan dice que sí. |
| D5 | 0:55 | A la izquierda está el margen, los minutos que me quedan después de volver caminando y guardar la reserva. Se calcula a mi paso. Abajo está la posición. Sin GPS, el error crece al caminar y se corrige al detenerme con horizonte despejado. Ese modelo es nuestro, y dice SIM. |
| D6 | 1:48 | Llegamos. Foto, muestra, guardar. |
| D7 | 2:03 | Tormenta de polvo. Te quita el horizonte, y sin horizonte no hay posición. La ruta se recalcula al hábitat. |
| | 2:14 | (Vuelta al modo de presentación. La alerta de radiación llega en la app unos 15 s después de la tormenta; P3 la cuenta en el beat 5.) |

## Apertura opcional, 20 segundos

Solo si el equipo la elige en el ensayo. Va antes del beat 1 y necesita 20 segundos que la charla no tiene: terminaría en 5:05. Usarla solo si los organizadores confirman más de 5 minutos.

| Tiempo | Quién | Texto |
|---|---|---|
| 0:00 | P1 | El año pasado, cinco de nosotros ganamos Ensenada con NASA Explorer, primer lugar de diecisiete, y nominados globales. Este año se sumó Andrea. Refritos, nueva generación. |
| 0:12 | P1 | (Pausa. Cambia a Jezero.) |
| 0:20 | | |

## De dónde sale cada número

| Número | Fuente |
|---|---|
| 913 m por la ruta de ida; volver: 824 m, 53 g de O2, 18 min | Ida: ruta del planificador de la app (`planRoute`, esclusa del hábitat, WP1, WP2, WP3, Cheyava Falls). Vuelta: la ruta que replanea la alerta, de Cheyava Falls directo al hábitat, con el modelo del traje (`walkCost`, con el 20 % extra de Apolo 15). `data/walkback-zone.json`, campo `coldOpen`: 53.4 g, 18.4 min, margen 14.1 min. La línea recta es 785 m (pestaña Sitio) |
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

`node tools/timing.mjs` revisa cada fila contra su tiempo a 140 palabras por minuto y escribe `council/timing.md`. `node tools/timing.mjs --wpm 125 --out council/timing-5min-125.md script-5min-en.md script-5min-es.md` revisa el guion de 5 minutos al ritmo para el que se escribió.
