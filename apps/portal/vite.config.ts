import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Esqueleto do Portal de Parceiros. A configuração definitiva (alias @,
// code-splitting, etc.) será montada na Fase 8.3.
export default defineConfig({
  plugins: [react()],
})
