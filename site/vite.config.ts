import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the site from /Medea/
export default defineConfig({
  base: process.env.MEDEA_BASE ?? '/Medea/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 900 },
})
