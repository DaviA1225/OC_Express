import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // @sislog/shared é um pacote-fonte do workspace (.ts sem build). Excluir do
  // pre-bundle faz o Vite transpilar na hora e enxergar edições direto.
  optimizeDeps: {
    exclude: ['@sislog/shared'],
  },
})
