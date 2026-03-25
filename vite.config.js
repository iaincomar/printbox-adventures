import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/', 
  root: 'src', // Le decimos que el proyecto "empieza" en src
  build: {
    outDir: '../dist', // Como el root es src, el dist debe salir una carpeta hacia atrás
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/index.html'), // Ruta absoluta al index
    },
  },
})