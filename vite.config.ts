import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `vite build --mode single` собирает всё в один index.html — для быстрой выкладки прототипа.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
  // `npm run dev` + `npm run dev:api`: интерфейс ходит в локальный воркер.
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
}))
