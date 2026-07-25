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
        input: 'hsl(var(--input))',
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
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      boxShadow: {
        overlay: '0 4px 12px rgba(0,0,0,0.08)',
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
