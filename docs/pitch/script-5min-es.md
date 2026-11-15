# Guion del pitch local, 5 minutos

> **Confirmar con los organizadores de Ensenada:** duración del pitch (suponemos 5 minutos más preguntas), si las preguntas van aparte, y si podemos conectar nuestra laptop. Si el formato es de 8 minutos, usar `script-8min-es.md`. Si es de 3, usar `script-3min-es.md`.

Diapositivas: `deck-local.html` (en inglés, regla global). La demo en vivo sigue `demo-run-sheet.md`, corte A. Presentan tres personas: **P1** (historia), **P2** (demo, en la laptop), **P3** (datos y cierre). Los nombres los decide el equipo.

Ritmo: 140 palabras por minuto. Las líneas de la demo se dicen mientras P2 maneja; los tiempos de espera de la demo ya están contados.

| Tiempo | Diapositiva | Quién | Texto |
|---|---|---|---|
| 0:00 | 1 · Marswalk | P1 | Somos Los Frijolitos Espaciales Refritos Nueva Generación, de Ensenada. Esto es Marswalk. |
| 0:06 | 2 · El problema | P1 | En la Luna, si algo salía mal, el astronauta volvía caminando al módulo. En Marte será igual, pero más lejos y sin nadie que vaya por ti. El traje aguanta ocho horas, la NASA guarda treinta minutos de oxígeno de reserva, y no hay GPS. Los mapas de Marte que existen están hechos para ver regiones desde órbita. Ninguno responde la pregunta del astronauta: ¿todavía puedo volver a casa? |
| 0:36 | 3 · La idea | P1 | Marswalk responde eso todo el tiempo. Lo llamamos margen de regreso: el oxígeno que te sobra después de volver caminando al hábitat y guardar la reserva. Lo calculamos sobre el terreno real, paso a paso. Subir lo reduce, las rocas lo reducen, una tormenta lo reduce. Les enseñamos. |
| 1:00 | 4 · Demo | P2 | (Demo, corte A, 2:25. Líneas abajo.) |
| 3:25 | 5 · Datos de la NASA | P3 | Nada de esto es inventado. El terreno es el modelo de HiRISE, de Mars Reconnaissance Orbiter, a un metro por píxel. De ahí salen la pendiente, la ruta, la sombra de radio y la posición. Las paradas y las fotos son de Perseverance. El clima es un día real medido por MEDA en Jezero. La radiación son dosis que midió Curiosity en septiembre de 2017. El oxígeno sale de pruebas de trajes de la NASA. |
| 3:58 | 6 · Medido o simulado | P3 | Cada número en pantalla dice de dónde viene. DATA es medido, DERIVED lo calculamos nosotros, SIM es una suposición nuestra. Comparamos nuestro terreno con el de NASA Mars Trek: catorce centímetros de diferencia en todo el mapa. Y cuando un dato no es de Jezero, como la radiación de Gale, la pantalla lo dice. |
| 4:22 | 7 · Lo que sigue | P3 | Lo siguiente: un sensor de ritmo cardiaco real que mueva el consumo de oxígeno, tripulaciones en línea, y cualquier sitio de Marte con modelo de HiRISE. El año pasado ganamos Ensenada con NASA Explorer. Este año queremos que la primera caminata en Marte se planee con un mapa así. Pruébenlo con el código QR. Gracias. |
| 5:00 | | | (Fin.) |

## Líneas de la demo (P2, corte A)

| Beat | Tiempo de la demo | Texto |
|---|---|---|
| D1 | 0:00 | Esta es la mesa de misión. Todo es Jezero, con datos de la NASA. |
| D2 | 0:06 | Cada capa dice qué decide. Terreno: la pendiente del modelo de HiRISE. La ruta rodea la zona amarilla y nunca cruza la roja. |
| D3 | 0:25 | Si la tripulación pide ir a la roca donde Perseverance encontró una posible biofirma, la ruta crece a 930 metros y el plan recalcula tiempo y oxígeno. Hoy hacemos la primera salida: 55 metros. |
| D4 | 0:45 | El plan dice que sí podemos salir. Empezamos. |
| D5 | 0:55 | A la izquierda, el número que importa: el margen de regreso. Es el oxígeno que me sobra después de volver caminando al hábitat y guardar la reserva de 30 minutos. Cada subida lo reduce. Abajo, la navegación: Marte no tiene GPS, así que la posición se fija comparando el terreno con el mapa de HiRISE. (Silencio, caminar.) |
| D6 | 1:48 | Llegamos. Foto, muestra, guardar. |
| D7 | 2:03 | Tormenta de polvo. La opacidad viene de la tormenta de 2018 que midió Curiosity. La ruta se recalcula al hábitat y el margen se ajusta. |
| fin | 2:14 | Quince segundos después llega la alerta de radiación, con dosis reales de Curiosity. Al volver, el resumen compara la ruta caminada con la aprobada. |
| | 2:25 | (Vuelta a las diapositivas.) |

## Conteo

Palabras habladas: ver `council/timing.md`, que se recalcula con `node tools/timing.mjs`. Límite: 5:00 a 140 palabras por minuto, contando el tiempo de caminar en la demo.
