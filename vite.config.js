import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // three.js alone is larger than Vite's default 500 kB warning threshold
    chunkSizeWarningLimit: 1500,
  },
  test: {
    // The planner tests assert real wall-clock budgets (re-plan under 100 ms).
    // Running files one at a time keeps CPU contention from turning those
    // assertions into flaky failures; the whole suite still runs in ~8 s.
    fileParallelism: false,
  },
})

