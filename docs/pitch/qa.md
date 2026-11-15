# Q&A prep: the 14 hardest questions, plus three quick ones

Short, honest answers. Say the number, name the source, stop. If you don't know, say so and say where it would come from. Spanish first for the local judges, English under it for the global round. Sources are in `public/data/hazards.json`, `docs/credits.md` and `docs/data/`.

## 1. What is measured and what is simulated?

**ES.** El terreno es medido: el modelo HiRISE de 1 m, remuestreado a 2 m, y su imagen de 25 cm, mostrada a 0.5 m. Las tasas de dosis de radiación son medidas por RAD en Curiosity, en Gale, no en Jezero. El clima es MEDA: temperatura y presión del sol 1187, viento del sol 312. Las reglas del traje (8 h, 30 min de reserva, 20°) son documentos de la NASA. Simulado: la velocidad al caminar (1 m/s), cuándo llegan los eventos, las rocas individuales (un modelo estadístico) y el compañero EV2. En `hazards.json` hay 75 valores: 57 DATA, 7 DERIVED y 11 SIM, y la pantalla muestra la etiqueta junto a cada número.

**EN.** Measured: the terrain (HiRISE 1 m DTM resampled to a 2 m grid, and its 25 cm image shown at 0.5 m), the radiation dose rates (RAD on Curiosity, in Gale crater, not Jezero), MEDA temperature and pressure from sol 1187 and wind from sol 312, and the suit rules (8 h, 30 min reserve, 20°) from NASA documents. Simulated: walking speed (1 m/s), when the events arrive, individual rock positions (a statistical model) and the partner EV2. `hazards.json` has 75 values: 57 DATA, 7 DERIVED, 11 SIM, and the tag shows next to each number on screen.

## 2. Why walkback? Why not just show the oxygen left?

**ES.** Porque el oxígeno que te queda no dice si alcanzas a volver. Apolo ya planeaba así: el memo de restricciones de Apolo 15 sumaba un 20 % al gasto de la caminata de regreso, y la NASA probó en 2009 una caminata de regreso de 10 km con traje. El margen es el oxígeno que sobra después de volver caminando por la ruta, con ese 20 %, y guardando los 30 minutos de reserva de Apolo 17. Lo recalculamos cada metro.

**EN.** Oxygen left doesn't tell you whether you can get home. Apollo planned this way: the Apollo 15 constraints memo added 20 % to the metabolic rate for the walkback estimate, and NASA tested a suited 10 km walkback in 2009 (NASA/TP-2009-214796). Our margin is the oxygen left after walking back along the route with that 20 % pad and keeping the Apollo 17 30-minute reserve. It updates every metre.

## 3. How does the terrain model become a route and a cost?

**ES.** Del DTM de HiRISE (1 m) sacamos una malla de unos 2 m (751 × 751). Cada celda tiene pendiente, y más de 20° está prohibido. El planificador es A*: el costo por celda es la distancia por 1 + (pendiente/9)² + 0.6 × rocas. El oxígeno de cada tramo sale de un modelo metabólico publicado: la curva de Minetti (2002) para caminar en pendiente, que escalamos a la gravedad de Marte y a la masa con traje de las pruebas de la NASA (202 kg). El costo en plano y el aumento por pendiente están calibrados con las pruebas de la NASA con traje a gravedad reducida (Norcross 2008 y 2010, de 0.12 a 3/8 g). El modelo es DERIVED: no modela la rigidez propia de un traje para Marte, y el xEMU es un traje lunar. El ritmo es de esfuerzo constante: en subida caminas más lento.

**EN.** We resample the HiRISE DTM to a 751 × 751 grid, about 2 m. Each cell has a slope; over 20° is no-go. The planner is A*, with a cell cost of distance × (1 + (slope/9)² + 0.6 × rock). Each leg's oxygen comes from a published metabolic model: Minetti's (2002) cost of walking on a gradient, which we scale to Mars gravity and to the suited mass from NASA's tests (202 kg). The level cost and the grade rise are calibrated to NASA's suited tests at reduced gravity (Norcross et al. 2008 and 2010, 0.12 to 3/8 g). The model is DERIVED: it does not model a Mars suit's own stiffness, and the xEMU is a lunar suit. The pace is constant effort, so you slow down uphill.

## 4. How do you know the terrain is right?

**ES.** Lo comparamos con NASA Mars Trek, que sirve el mismo DTM: 0.14 m RMS en los 564,001 nodos, 97.3 % de acuerdo en las clases de pendiente. Eso prueba que lo procesamos bien, no que el DTM sea perfecto: su precisión es la de HiRISE.

**EN.** We checked it against NASA Mars Trek, which serves the same DTM: 0.14 m RMS over 564,001 nodes, 97.3 % agreement on slope classes. That proves our processing, not the DTM itself; its accuracy is HiRISE's.

## 5. Your radiation is from Gale crater. Isn't that wrong for Jezero?

**ES.** Es una medición real en la superficie de Marte: RAD, en Curiosity, midió este evento solar desde el suelo. Perseverance no lleva dosímetro. Usamos las tasas de dosis del evento de septiembre de 2017, con la fecha del registro DONKI de la NASA. La pantalla dice "cráter Gale, no Jezero". Lo que comprimimos es el tiempo: 12 minutos del evento en la EVA completa, uno en la primera salida, y eso está marcado SIM.

**EN.** It is a real measurement on the surface of Mars: RAD, on Curiosity, measured this solar event from the ground. Perseverance carries no dosimeter. We use the September 2017 event dose rates, dated by NASA's DONKI record. The screen says "Gale crater, not Jezero". What we compress is time: the event runs 12 minutes in the full EVA and 1 minute in the first sortie, tagged SIM.

## 5b. That dose is small. Why does the alert send her home?

**ES.** Porque es un aviso temprano. Cuando se ve la llamarada nadie sabe qué tan grande será el evento, así que la regla es refugiarse temprano (ALARA, tan bajo como sea razonable). El evento de septiembre de 2017 fue moderado: sumó 544 µGy en total, unas dos sols y media de dosis normal. Nosotros comprimimos sus 57 horas en 12 minutos y mantenemos las tasas medidas, así que la dosis del visor no es la del evento real (#295).

**EN.** Because it is an early warning. When the flare is seen nobody knows how large the event will be, so the rule is shelter early (ALARA). The September 2017 event was moderate: it added 544 µGy in total, about two and a half sols of normal dose. We squeeze its 57 hours into 12 minutes and keep the measured rates, so the visor's dose is not what the real event delivered (#295).

## 5c. Your margin reads +480 or +399 with a full tank. Does resting inflate it?

**ES.** Sí. El margen divide el oxígeno por el ritmo actual, suavizado en 30 segundos, así que sube cuando ella se detiene. Lo reportamos como problema (#312) y el arreglo es usar un ritmo de planeación fijo. El 14 de la astronauta de Cheyava Falls usa el ritmo de caminar en plano, 2.4 g/min. Y con el tanque lleno cerca de casa manda el reloj de 8 horas, por eso se ve +480.

**EN.** Yes. The margin divides O2 by the current rate, smoothed over 30 s, so it rises when she stops. We filed it (#312); the fix is a fixed planning rate. The 14 minutes for the astronaut at Cheyava Falls use the flat walking rate, 2.4 g/min. With a full tank near home the 8 h clock is the limit, which is why it reads +480.

## 6. Is the dust storm real?

**ES.** La opacidad, sí: de 0.45 en cielo claro (Mastcam-Z, Jezero) hasta 8.0, el pico de la tormenta global de 2018 que midió Curiosity en Gale. Lo que suponemos es qué tan rápido sube: 30 segundos en la primera salida. En la tormenta no se puede fijar la posición con el terreno (necesita opacidad de 1 o menos), así que el círculo de error crece.

**EN.** The opacity is: from 0.45 clear sky (Mastcam-Z, Jezero) up to 8.0, the peak of the 2018 global storm Curiosity measured in Gale. How fast it rises is our assumption, 30 s in the first sortie. During the storm the suit can't take a terrain fix (it needs opacity 1 or less), so the position error ring grows.

## 7. How do you navigate without GPS?

**ES.** La app separa la posición real de la estimada. Al caminar, el error crece 2 % de la distancia. Si te detienes 5 segundos con horizonte despejado, el modelo supone que el traje ubicó su posición comparando el terreno, y el error baja a 0.4 m. No calculamos la comparación de imágenes; modelamos su resultado, la idea de cómo Perseverance se ubica sobre el mapa orbital. El 2 % y los 0.4 m son valores nuestros, sin fuente todavía. Con línea de vista a la antena del hábitat, el radio limita el error a 2 m. Todo esto está marcado SIM: es nuestro modelo, no una medición.

**EN.** The app keeps the true position apart from the estimate. Walking adds 2 % of the distance as error. Stand still 5 s with a clear horizon and the model assumes a terrain fix, cutting the error to 0.4 m. We don't compute the image matching; we model its result, after the way Perseverance localizes on orbital maps. The 2 % and 0.4 m are our values, not yet sourced. In line of sight of the habitat mast, radio ranging caps the error at 2 m. All tagged SIM: our model, not a measurement.

## 8. Why a game? The challenge asks for a map.

**ES.** El mismo mapa de HiRISE corre en tres lugares: la mesa de misión, el minimapa del visor y la pantalla de la muñeca. Caminarlo con oxígeno limitado es como probamos que se lee de un vistazo: el reto pide un mapa que ayude a planear y a ejecutar una caminata, y la segunda parte solo se prueba caminando.

**EN.** The same HiRISE map runs in three places: the mission table, the visor minimap and the wrist screen. Walking it with limited oxygen is how we test that it reads in a glance: the challenge asks for a map that helps plan and carry out a walk, and the second half can only be tested by walking.

## 9. The blue walkback zone in the presentation. Is that in the app?

(Raised by an AI reviewer playing a NASA judge in our council, `council/`, not by a person. Answer it before a real judge asks. The zone carries a caption on screen.)

**ES.** En la app, el mismo cálculo es un número: el margen en el visor y en la mesa. La zona azul del modo de presentación la dibujamos con el mismo código de la app (planificador, malla de costos y modelo del traje) y dos pasadas de Dijkstra; el escenario de 205 g de oxígeno es nuestro y está marcado SIM. Mostrarla en la mesa de misión es el siguiente paso.

**EN.** In the app, the same calculation is one number, the margin on the visor and at the table. The presentation's zone is drawn with the app's own code (planner, cost grid and suit model) and two Dijkstra passes; the 205 g scenario is ours and tagged SIM. Showing it at the mission table is the next step.

## 10. How did you use AI?

**ES.** (Confirmar con el equipo antes de decirlo, y nombrar la herramienta.) Usamos asistentes de programación con IA (SI, en el término de 2026) para escribir y revisar código y documentos. Los cambios entraron a main por pull request: 143 fusionados a main (153 si se cuentan los que fueron a otras ramas), y 53 de los 143 tuvieron la revisión de un integrante distinto al autor. Las imágenes generadas por IA son solo el video de inicio y las ilustraciones de peligros, y dicen que son IA. Ningún número de la app sale de una IA: cada uno cita su fuente.

**EN.** (Team to confirm before saying it, and name the tool.) We used AI (SI, the 2026 term) coding assistants to write and review code and documents. Changes reached main through pull requests: 143 merged into main (153 counting PRs into other branches), and 53 of the 143 got a review from a teammate other than the author. The only AI-generated images are the start screen video and the hazard illustrations, and they are labelled as AI. No number in the app comes from an AI; each one cites its source.

## 11. What did you build during the hackathon, and what existed before?

**ES.** (Confirmar con el equipo; ver `docs/RULES.md`, PR #315.) El repositorio se creó el 14 de noviembre a las 8:47 am, 13 minutos antes del inicio, vacío. Los recursos del banco de pruebas anterior (terreno, traje, hábitat) tienen fecha del 12 y 13 de noviembre, y lo declaramos a los organizadores. Durante el evento hicimos la app: la mesa de misión, el planificador sobre el terreno real, el modelo del traje y el margen, los eventos con datos de la NASA, la navegación sin GPS, las fuentes, el resumen y la primera misión. El historial está en GitHub, en los 143 pull requests fusionados a main (153 con otras ramas), contados con gh el 15 de noviembre a las 9:00 am.

**EN.** (Team to confirm; see `docs/RULES.md`, PR #315.) The repo was created on 14 November at 8:47 am, 13 minutes before the start, empty. Assets from the earlier test bench (terrain tile, suit rig, habitat) are dated 12 and 13 November, and we disclose that to the organisers. During the event we built the app: the mission table, the planner on real terrain, the suit model and the margin, the NASA-data events, navigation without GPS, the sources screen, the debrief and the first mission. The history is on GitHub, in the 143 pull requests merged into main (153 counting other branches), counted with gh on 15 November at 9:00 am.

## 12. What's next, and who would use it?

**ES.** Un sensor de ritmo cardiaco real que mueva el consumo de oxígeno, con el modelo de la NASA que estima el gasto metabólico desde el pulso (Hoffmann 2021). Tripulaciones en línea, de dos a seis personas. Y cualquier sitio con modelo HiRISE, porque ningún paso del proceso depende de Jezero. Nadie fuera del equipo lo ha usado todavía. Los primeros usuarios que buscamos: quien planea una EVA, para comparar las tres rutas en el modelo HiRISE antes de aprobar una, y una clase en Ensenada que planee la caminata a Cheyava Falls (por confirmar con el equipo).

**EN.** A real heart rate sensor driving oxygen use, through NASA's model of metabolic rate from heart rate (Hoffmann 2021). Crews online, two to six people. Any site with a HiRISE terrain model, since nothing in the pipeline depends on Jezero. Nobody outside the team has used it yet. The first users we want: an EVA planner comparing the three routes on the HiRISE model before approving one, and a class in Ensenada planning the walk to Cheyava Falls (team to confirm).

## Extra: three questions a judge may slip in

- **Have you checked your numbers?** "109 numbers checked against their sources, 16 problems listed, each with an issue" (`docs/VALIDITY.md`, PR #314). Never say every number is verified correct.
- **Communication delay with Earth?** The app does not model it. If asked: 4 to 24 minutes one way, which is why the margin has to live on the visor and not in mission control.
- **Is the habitat full protection?** No. Say "the best shelter on the tile". The natural shelters cut less than we first assumed (#296).

## Local context, if asked "why Ensenada?"

Use only what is verified. The UNAM National Astronomical Observatory at Sierra San Pedro Mártir (OAN-SPM), with its 2.1 m telescope inaugurated in 1979, is in Baja California, and UNAM's Instituto de Astronomía runs it from Ensenada ([astrossp.unam.mx](https://www.astrossp.unam.mx/en/users/telescopes/2-1m-telescope)). We did not find a primary source for Baja desert Mars-analog field work, so we don't claim it.
