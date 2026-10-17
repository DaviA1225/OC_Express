/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Classes .status-* e .card-status-* são aplicadas dinamicamente (`status-${s}`,
  // `card-status-${row.status}`) no filtro e nos cards de solicitações, então o scanner
  // do Tailwind não as enxerga e purgaria as variantes do modo claro (as do dark
  // sobrevivem por causa da classe `dark`). Safelist garante que todas as cores de
  // status estejam sempre no bundle, em claro e escuro.
  safelist: [
    'status-recebida',
    'status-em_cadastro',
    'status-instrucao_emitida',
    'status-oc_gerada',
    'status-oc_enviada',
    'status-finalizada',
    'status-cancelada',
    'card-status-recebida',
    'card-status-em_cadastro',
    'card-status-instrucao_emitida',
    'card-status-oc_gerada',
    'card-status-oc_enviada',
    'card-status-finalizada',
    'card-status-cancelada',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      fontFamily: {
        // Manual LHG §5.1: Wanted Sans (primária) para corpo, Kanit (secundária) para títulos.
        sans: ['"Wanted Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Kanit', '"Wanted Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        // Contorno de controle (input/checkbox/switch/outline) = --border-strong,
        // ≥3:1 nos dois temas. Classe: `border-input`.
        input: 'hsl(var(--input))',
        // Camadas: canvas (atrás) → card/background (seção) → popover (elevado).
        canvas: 'hsl(var(--canvas))',
        'row-hover': 'hsl(var(--row-hover))',
        // Texto 3: meta, ícone em repouso, rótulo desabilitado.
        tertiary: 'hsl(var(--tertiary))',
        header: {
          DEFAULT: 'hsl(var(--header))',
          foreground: 'hsl(var(--header-foreground))',
        },
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
          // Laranja mais escuro para o acento COMO TEXTO (text-primary-strong).
          // O #FF5100 (--primary) é vibrante demais como texto em fundo claro
          // (3.1:1); este passa WCAG AA (4.6-4.9:1). O fill segue #FF5100.
          strong: 'hsl(var(--primary-strong))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Semânticos: DEFAULT = tom de texto/ícone (passa AA sobre surface e
        // sobre o próprio subtle); subtle = fundo de faixa/badge; border = contorno.
        // Uso: `bg-warning-subtle text-warning border-warning-border`.
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          subtle: 'hsl(var(--success-subtle))',
          border: 'hsl(var(--success-border))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          subtle: 'hsl(var(--warning-subtle))',
          border: 'hsl(var(--warning-border))',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          subtle: 'hsl(var(--danger-subtle))',
          border: 'hsl(var(--danger-border))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          subtle: 'hsl(var(--info-subtle))',
          border: 'hsl(var(--info-border))',
        },
        // Séries de gráfico (hex em var; sem modificador de opacidade).
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
          6: 'var(--chart-6)',
          7: 'var(--chart-7)',
          8: 'var(--chart-8)',
          ref: 'var(--chart-ref)',
          ok: 'var(--chart-ok)',
          bad: 'var(--chart-bad)',
          grid: 'var(--chart-grid)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        control: '2px',
        surface: '4px',
      },
      // Escala tipográfica FECHADA (DESIGN.md §3). Use estes 8 tokens em vez de
      // text-[Npx]. `page` e `kpi` pedem font-display (Kanit) 500.
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        meta: ['11px', { lineHeight: '16px' }],
        'body-sm': ['12px', { lineHeight: '18px' }],
        body: ['13px', { lineHeight: '20px' }],
        'body-lg': ['14px', { lineHeight: '20px' }],
        'title-sm': ['15px', { lineHeight: '20px' }],
        title: ['18px', { lineHeight: '24px' }],
        page: ['22px', { lineHeight: '28px', letterSpacing: '-0.01em' }],
        kpi: ['28px', { lineHeight: '32px', letterSpacing: '-0.01em' }],
      },
      // Elevação: 0 = plano (padrão), 1 = borda + fundo raised (popover),
      // 2 = overlay (diálogo/popover/menu). Sem glow, sem blur.
      boxShadow: {
        overlay: '0 4px 12px rgba(0,0,0,0.08)',
      },
      transitionDuration: {
        fast: '120ms',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        progress: {
          '0%': { transform: 'translateX(-100%) scaleX(0.6)' },
          '50%': { transform: 'translateX(50%) scaleX(1.4)' },
          '100%': { transform: 'translateX(300%) scaleX(0.6)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        progress: 'progress 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
