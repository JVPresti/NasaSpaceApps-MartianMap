# Guion del pitch local, 5 minutos

> **Confirmar con los organizadores de Ensenada:** duración del pitch (suponemos 5 minutos más preguntas), si las preguntas van aparte, y si podemos conectar nuestra laptop. Si el formato es de 8 minutos, usar `script-8min-es.md`. Si es de 3, `script-3min-es.md`.

**Tesis:** en Marte, la pregunta no es a dónde puedes ir. Es a dónde puedes ir y todavía volver. Se dice una vez, al principio. Todo lo demás la demuestra.

El pitch corre dentro del sitio, en el modo de presentación (`?present=1`), y pasa a la demo en vivo en el beat 4. Los beats están en `beats.md`. La demo sigue `demo-run-sheet.md`, corte A. Presentan tres personas: **P1** (apertura), **P2** (demo, en la laptop), **P3** (datos y cierre). Los nombres los decide el equipo. Versión en inglés: `script-5min-en.md`.

Ritmo: 140 palabras por minuto. Los números salen de la app y de sus fuentes (ver "De dónde sale cada número" abajo).

| Tiempo | Beat | Quién | Texto |
|---|---|---|---|
| 0:00 | 1 · Jezero | P1 | Cráter Jezero, Marte. Una astronauta está en Cheyava Falls, la roca donde Perseverance encontró una posible biofirma. El hábitat está a 913 metros. Volver le cuesta 18 minutos y 54 gramos de oxígeno. Y viene una tormenta de polvo. |
| 0:20 | 1 · Tesis | P1 | En Marte, la pregunta no es a dónde puedes ir. Es a dónde puedes ir y todavía volver. Somos Los Frijolitos Espaciales Refritos Nueva Generación, de Ensenada. Esto es Marswalk. |
| 0:35 | 2 · Las reglas | P1 | Las reglas son de la NASA. Ocho horas máximo de caminata con traje. Treinta minutos de oxígeno que no se tocan, como en Apolo. Ninguna pendiente de más de veinte grados. Y en Marte no hay GPS. |
| 0:52 | 3 · La zona de regreso | P1 | Lo azul es todo lo que alcanza y todavía regresa con su reserva. Sale del terreno de HiRISE y de pruebas de trajes de la NASA. Cada subida lo encoge. Con la alerta de radiación se cierra al camino de vuelta. En la app, eso es un número en el visor: el margen. |
| 1:16 | 4 · Demo | P2 | (Demo, corte A, 2:25. Líneas abajo.) |
| 3:41 | 5 · Datos de la NASA | P3 | Cada capa sale de una misión. El terreno es el modelo HiRISE de Mars Reconnaissance Orbiter, a un metro por píxel: pendiente, ruta, sombra de radio y posición. Las paradas y las fotos son de Mastcam-Z, en Perseverance. El clima es el sol 1187 de MEDA. La radiación son las dosis de RAD en septiembre de 2017, con la fecha del registro DONKI. |
| 4:11 | 6 · Medido o simulado | P3 | Cada número dice de dónde viene. DATA es medido. DERIVED lo calculamos nosotros. SIM es una suposición nuestra, como caminar a un metro por segundo. La radiación se midió en Gale, no en Jezero, y la pantalla lo dice. |
| 4:30 | 7 · Cierre | P3 | Siguiente: el ritmo cardiaco real de quien camina, con el modelo de la NASA, y cualquier sitio con modelo HiRISE. Un último dato: comparamos nuestro terreno con el de NASA Mars Trek en 564 mil puntos. La diferencia típica es de catorce centímetros. El código QR abre la demo. |
| 5:00 | | | (Fin.) |

## Líneas de la demo (P2, corte A)

| Beat | Tiempo de la demo | Texto |
|---|---|---|
| D1 | 0:00 | La mesa de misión. Todo es Jezero, con datos de la NASA. |
| D2 | 0:06 | Cada capa dice qué decide. Terreno: la pendiente de HiRISE. La ruta rodea lo amarillo y nunca cruza lo rojo. |
| D3 | 0:25 | Si la tripulación pide ir a Cheyava Falls, la ruta crece a 930 metros y el plan recalcula tiempo y oxígeno. Hoy hacemos la primera salida: 55 metros. |
| D4 | 0:45 | El plan dice que sí podemos salir. Empezamos. |
| D5 | 0:55 | A la izquierda, el margen: el oxígeno que me sobra después de volver caminando y guardar la reserva de 30 minutos. Cada subida lo baja. Abajo, la posición: sin GPS, se fija comparando el terreno con el mapa de HiRISE. (Silencio, caminar.) |
| D6 | 1:48 | Llegamos. Foto, muestra, guardar. |
| D7 | 2:03 | Tormenta de polvo, con la opacidad que midió Curiosity en 2018. La ruta se recalcula al hábitat y el margen se ajusta. |
| fin | 2:14 | Quince segundos después llega la alerta de radiación. Al volver, el resumen compara la ruta caminada con la aprobada. |
| | 2:25 | (Vuelta al modo de presentación.) |

## Apertura opcional, 20 segundos

Solo si el equipo la elige en el ensayo. Va antes del beat 1 y le quita 20 segundos al beat 7 (se corta "Siguiente: ...").

| Tiempo | Quién | Texto |
|---|---|---|
| 0:00 | P1 | El año pasado, Los Frijolitos Espaciales ganamos Ensenada, primer lugar de diecisiete, con NASA Explorer, y fuimos nominados globales. Volvimos. Refritos, nueva generación. |
| 0:12 | P1 | (Pausa. Cambia a Jezero.) |
| 0:20 | | |

## De dónde sale cada número

| Número | Fuente |
|---|---|
| 913 m, 18 min, 54 g de O2 para volver desde Cheyava Falls | Ruta del planeador de la app (`planRoute`) y modelo del traje (`walkCost`, con el 20 % extra de Apolo 15 para el regreso). `tools/walkback-zone.mjs` |
| 8 h | `suit.eva_duration_max`, NASA EVA-EXP-0042 Rev B (xEVA Concept of Operations) |
| 30 min de reserva | `suit.reserve.time`, Apollo 17 Final Lunar Surface Procedures |
| 20° | `slope.no_go`, NASA EVA-EXP-0042 Rev B |
| 930 m a Cheyava Falls, 55 m la primera salida | Mesa de misión en #282 |
| 1 m/s | `mobility.speed.flat`, SIM |
| 14 cm | RMS de nuestra malla contra el DTM HiRISE de Mars Trek, 564,001 nodos, `docs/data/mars-trek-check/README.md`. El recorte de 1500 × 1500 px (2.25 millones de píxeles) es idéntico al de Trek |
| Sol 1187 | `public/data/meda_sol.json` |
| Septiembre de 2017 | RAD, Curiosity, cráter Gale; destello 2017-09-10 en DONKI (`hazards.json`) |

## Conteo

`node tools/timing.mjs` revisa cada fila contra su tiempo a 140 palabras por minuto y escribe `council/timing.md`.
