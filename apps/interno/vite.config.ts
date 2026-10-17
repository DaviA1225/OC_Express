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
  // Tela Conversas: em produção o vercel.json reescreve /api/agente para o
  // servidor do agente. No dev, o mesmo caminho vai ao `vercel dev` local dele.
  server: {
    proxy: {
      '/api/agente': {
        target: process.env.AGENTE_DEV_URL ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: () => '/api/painel',
      },
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
            // PRIMEIRO grupo de propósito. São micro-utilitários (poucos kB no
            // total) usados por VÁRIOS dos grupos abaixo. Sem um grupo próprio,
            // cada um caía dentro do primeiro chunk pesado que o referenciasse —
            // e aí todo mundo passava a importar daquele chunk.
            //
            // Era exatamente o que acontecia: o `clsx` foi parar dentro de
            // `charts`, então `ui` (radix/lucide, no caminho crítico) importava
            // UM símbolo de lá e arrastava os ~373 kB do recharts para o
            // modulepreload do index.html — baixado até na tela de login. O
            // `charts` puxava o `pdf` (1,4 MB) pelo mesmo mecanismo.
            //
            // Ao mexer nos grupos abaixo, confira o `index.html` gerado: chunk
            // pesado não pode aparecer como modulepreload.
            {
              name: 'vendor-shared',
              test: /node_modules\/(clsx|tailwind-merge|class-variance-authority|tslib|object-assign|react-is|use-sync-external-store|@swc\/helpers)\//,
            },
            { name: 'react', test: /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\// },
            { name: 'pdf', test: /node_modules\/(@react-pdf|pdfkit|fontkit|restructure|brotli|tiny-inflate)\// },
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
