# Guion del pitch local, 4 minutos (español)

> **Formato.** Fernando fijó el límite el 15 de noviembre. La charla dura como máximo 4 minutos, con el video incluido, y la meta es 3:40. La página de los organizadores citada en `docs/SUBMISSION.md` (PR #316) dice "tiempo máximo de 3 minutos". El equipo toma 4 y lo confirma con ellos.

Esta es la charla en español. `script-4min-en.md` es la misma charla en inglés, con los mismos beats, tiempos y números. Digan la charla en el idioma que confirmen los organizadores. Corre en el modo de presentación en `main` (https://martian-map.fernando-haro-c.workers.dev/?present=1), siete beats, una flecha **Derecha** por beat, como dice `demo-run-sheet.md`. El beat `demo` reproduce una grabación de 73.8 s de la app real en lugar de una demo en vivo. Si WebGL falla, la presentación solo muestra textos, así que cambien a `out/deck-global.pdf`.

**Beats.** Las filas siguen los siete beats de #356 en `src/present/beats.js` en `main`, con sus duraciones de autoplay: `open` 20 s, `plan` 24 s, `zone` 24 s, `radiation` 16 s, `demo` 73.8 s, `sources` 18 s y `credits` 22 s. La charla termina en 3:18, 22 s antes de la meta de 3:40.

**No hablen sobre la apertura.** El beat `open` escribe "En Marte, nadie puede ir por ti." y, a los 8 s, "Marswalk muestra desde dónde aún vuelves a casa." Dejen que la sala lea las dos. Hablen solo cuando la segunda lleve unos 4 s en pantalla.

**Tesis.** En Marte, la pregunta no es a dónde puedes ir. Es a dónde puedes ir y todavía volver. Se dice en el beat `zone`, donde la muestran los textos, y otra vez al cerrar.

**El momento para recordar** es la zona cerrándose sobre la astronauta en el beat `radiation`. Digan "Una alerta de radiación. Miren la zona." y guarden silencio mientras se cierra y se queda en 0.5 ha durante 2.5 s.

**Solo tres números en voz alta.** Son la pendiente de 20°, la salida de treinta minutos y la revisión del terreno de 0.14 m. Ninguna cifra de margen ni de dosis.

**Ritmo.** Cada fila cabe a 130 palabras por minuto y ninguna pasa de 140.

| Tiempo | Beat | Quién | Texto |
|---|---|---|---|
| 0:00 | open | P1 | (Silencio mientras aparecen las dos líneas. Hacia 0:12:) Este es el cráter Jezero. Su meta es Cheyava Falls, donde Perseverance encontró una posible biofirma, sin confirmar. |
| 0:20 | plan | P1 | Camina hasta ahí desde el hábitat, y si algo sale mal, el único rescate es su propia caminata a casa. Marswalk planea esa caminata sobre el terreno HiRISE de la NASA. Más de veinte grados no se pasa, y cada metro cuesta tiempo y oxígeno, según pruebas de la NASA con traje. |
| 0:44 | zone | P1 | En Marte, la pregunta no es a dónde puedes ir. Es a dónde puedes ir y todavía volver. En una salida de treinta minutos, lo naranja es todo lo que alcanza y todavía regresa a tiempo. Cada minuto afuera lo encoge. |
| 1:08 | radiation | P1 | Una alerta de radiación. Miren la zona. (Silencio mientras se cierra y se queda, unos 4 s.) Solo queda el camino a casa. Ella regresa ya. Ahora la app real, grabada. |
| 1:24 | demo | P2 | (Corre la grabación con sus propios textos. Digan cada frase cuando empiece su escena y dejen hablar a la app. En 0:00:) La misma zona naranja, en la app. (0:12:) Las necesidades del equipo arman la ruta. (0:24:) Sale por la esclusa, con su compañero, EV2. (0:30:) Una tormenta de polvo, y EV2 avisa del frente. (0:38:) La alerta de radiación. EV2 vuelve a casa antes que ella. (0:58:) De vuelta por la esclusa. (1:04:) La revisión compara su caminata con el plan. |
| 2:38 | sources | P3 | Cada número en pantalla dice si es medido, derivado o simulado. Las lecturas de radiación y tormenta son reales, de Gale, no de Jezero, y sus tiempos son nuestros. El terreno coincide con el de la NASA a catorce centímetros. |
| 2:56 | credits | P3 | El reto pidió una guía de supervivencia para Marte. La nuestra empieza con una pregunta. En Marte, no es a dónde puedes ir. Es desde dónde todavía vuelves a casa. Somos Los Frijolitos Espaciales Refritos Nueva Generación. Gracias. (No presionen Derecha otra vez: el siguiente beat abre la app.) |
| 3:18 | | | (Fin. 22 s antes de la meta de 3:40, 42 s antes del tope.) |

La tabla al final de `script-4min-en.md` da la fuente de cada número.
