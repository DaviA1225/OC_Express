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
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\// },
            { name: 'pdf', test: /node_modules\/(@react-pdf|pdfkit|fontkit|restructure|brotli|tiny-inflate|@swc\/helpers)\// },
            { name: 'charts', test: /node_modules\/(recharts|d3-.*|victory-vendor)\// },
            { name: 'supabase', test: /node_modules\/(@supabase|isows|websocket)\// },
            { name: 'ui', test: /node_modules\/(@radix-ui|cmdk|sonner|lucide-react)\// },
            { name: 'forms', test: /node_modules\/(react-hook-form|@hookform|zod)\// },
            { name: 'query', test: /node_modules\/(@tanstack)\// },
            { name: 'date', test: /node_modules\/(date-fns)\// },
          ],
        },
      },
    },
  },
})
