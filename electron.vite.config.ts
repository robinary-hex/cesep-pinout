import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

// Trois cibles : le processus principal et le preload (Node, dans electron/),
// le rendu Vue (navigateur, dans src/). Voir ARCHITECTURE.md.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { lib: { entry: resolve('electron/main.ts') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { lib: { entry: resolve('electron/preload.ts') } }
  },
  renderer: {
    root: resolve('src'),
    build: { rollupOptions: { input: resolve('src/index.html') } },
    resolve: { alias: { '@': resolve('src') } },
    plugins: [vue()]
  }
})
