import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import App from './App.tsx'
import { MaintenanceGate } from './components/MaintenanceGate'
import { ThemeProvider } from './hooks/useTheme'
import { DensityProvider } from './hooks/useDensity'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
      staleTime: 60_000,
      gcTime: 5 * 60_000,
    },
    mutations: {
      retry: 0,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <DensityProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <MaintenanceGate>
              <App />
            </MaintenanceGate>
            <Toaster position="bottom-right" richColors closeButton />
          </BrowserRouter>
        </QueryClientProvider>
      </DensityProvider>
    </ThemeProvider>
  </StrictMode>,
)
