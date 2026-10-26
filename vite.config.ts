import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Electron loads the production bundle from file://, which needs relative asset URLs.
  // Cloudflare Pages serves these relative URLs normally as well.
  base: './',
  plugins: [react()],
  server: {
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: 'web-dist',
    sourcemap: true,
  },
})
