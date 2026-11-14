import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // three.js alone is larger than Vite's default 500 kB warning threshold
    chunkSizeWarningLimit: 1500,
  },
})
