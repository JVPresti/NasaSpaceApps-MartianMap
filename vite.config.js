import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Files in public/ that the app never loads. They stay in public/ because the Blender export
// and check scripts read and write them there (blender/export/README.md), but they do not ship (#205).
const NOT_DEPLOYED = [
  'marswalk/assets/terrain_tiles.glb',
  'marswalk/assets/terrain_tiles.json',
]

function excludeFromDist(files) {
  let outDir = 'dist'
  return {
    name: 'exclude-from-dist',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      await Promise.all(files.map((file) => rm(resolve(outDir, file), { force: true })))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), excludeFromDist(NOT_DEPLOYED)],
  server: {
    // Online rooms (#52): `npm run dev:room` runs the Worker on 8787. The proxy forwards the browser's
    // Origin (http://localhost:5173) unchanged, which the Worker accepts as a localhost origin.
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } },
  },
  build: {
    // three.js alone is larger than Vite's default 500 kB warning threshold
    chunkSizeWarningLimit: 1500,
  },
  test: {
    // The planner tests assert real wall-clock budgets (re-plan under 100 ms).
    // Running files one at a time keeps CPU contention from turning those
    // assertions into flaky failures; the whole suite still runs in ~8 s.
    fileParallelism: false,
    // worker/ imports the Workers runtime module; tests get a small stand-in (worker/test/cloudflare-workers.js)
    alias: { 'cloudflare:workers': fileURLToPath(new URL('./worker/test/cloudflare-workers.js', import.meta.url)) },
  },
})
