# Marswalk: assets gráficos (Andrea y Tessa)

Qué hay en el repo:

- `public/marswalk/` — modelos, texturas y datos listos para usar. Vite los sirve tal cual:
  `fetch('/marswalk/assets/terrain.json')`, `loader.load('/marswalk/assets_habitat/habitat.glb')`.
  - `assets/` terreno real de Jezero, rocas, ruta de relleno (`route.json`), cielos (`atmosphere_presets.json`)
  - `assets_astronaut/` astronauta Z-2 con animaciones, brazos y piernas en primera persona
  - `assets_props/` pala de muestras y maletín
  - `assets_habitat/` hábitat (exterior, interior, luces horneadas) y `furniture/` (muebles + `layout.json`)
- `docs/marswalk-assets/README.md` — explica cada archivo, cómo se usa y los créditos (en inglés). Leer primero.
- `docs/marswalk-assets/testbench-reference/` — `main.js` y `shaders.js` del banco de pruebas en three.js.
  Son de **referencia**: copien lo que les sirva a `src/`. No son la app.

Reglas para no pisarnos:

1. La app se escribe en `src/`. Los gráficos solo tocan `public/marswalk/` y `docs/marswalk-assets/`.
2. Los nombres de archivos, de animaciones y los campos de los `.json` no cambian sin avisar.
3. Donde el README o el banco de pruebas digan `.glb.json`, aquí es el `.glb` normal
   (el `.glb.json` solo existía porque la página de pruebas no aceptaba `.glb`).
4. Los archivos fuente de Blender (`.blend`, 280 MB) no están en este repo; los tienen Andrea y Tessa.
