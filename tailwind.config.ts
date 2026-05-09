import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surface
        surface: '#f6fbf2',
        'surface-dim': '#d7dbd3',
        'surface-bright': '#f6fbf2',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f0f5ed',
        'surface-container': '#ebefe7',
        'surface-container-high': '#e5eae1',
        'surface-container-highest': '#dfe4dc',
        'on-surface': '#181d18',
        'on-surface-variant': '#3f4940',
        'inverse-surface': '#2d322c',
        'inverse-on-surface': '#edf2ea',
        outline: '#6f7a6f',
        'outline-variant': '#becabd',
        'surface-tint': '#006d36',
        // Primary
        primary: '#006a34',
        'on-primary': '#ffffff',
        'primary-container': '#268549',
        'on-primary-container': '#f6fff3',
        'inverse-primary': '#7eda95',
        // Secondary
        secondary: '#57605d',
        'on-secondary': '#ffffff',
        'secondary-container': '#d9e2dd',
        'on-secondary-container': '#5c6561',
        // Tertiary
        tertiary: '#9a3c4e',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#b95466',
        'on-tertiary-container': '#fffbff',
        // Error
        error: '#ba1a1a',
        'on-error': '#ffffff',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a',
        // Fixed
        'primary-fixed': '#9af7af',
        'primary-fixed-dim': '#7eda95',
        'on-primary-fixed': '#00210c',
        'on-primary-fixed-variant': '#005227',
        'secondary-fixed': '#dce5e0',
        'secondary-fixed-dim': '#bfc9c4',
        'on-secondary-fixed': '#151d1b',
        'on-secondary-fixed-variant': '#404945',
        'tertiary-fixed': '#ffd9dd',
        'tertiary-fixed-dim': '#ffb2bc',
        'on-tertiary-fixed': '#400012',
        'on-tertiary-fixed-variant': '#7e283a',
        // Background
        background: '#f6fbf2',
        'on-background': '#181d18',
        'surface-variant': '#dfe4dc',
        // Warning
        'warning-container': '#fff3cd',
        'on-warning-container': '#664d03',
        // Price status accents
        'price-cheapest': '#00C853',
        'price-warning': '#D32F2F',
      },
      fontFamily: {
        jakarta: ['"Plus Jakarta Sans"', 'sans-serif'],
        worksans: ['"Work Sans"', 'sans-serif'],
      },
      fontSize: {
        'headline-lg': ['28px', { lineHeight: '36px', fontWeight: '700' }],
        'headline-md': ['22px', { lineHeight: '28px', fontWeight: '600' }],
        'headline-sm': ['18px', { lineHeight: '24px', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '26px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-sm': ['13px', { lineHeight: '16px', fontWeight: '500', letterSpacing: '0.02em' }],
        'price-display': ['20px', { lineHeight: '24px', fontWeight: '700' }],
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        gutter: '12px',
      },
      boxShadow: {
        card: '0px 4px 12px rgba(0,0,0,0.05)',
        floating: '0px 8px 24px rgba(0,0,0,0.1)',
      },
    },
  },
  plugins: [],
}

export default config
