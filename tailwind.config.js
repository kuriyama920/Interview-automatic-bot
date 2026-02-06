/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Linear Design + Apple Vibrancy ハイブリッドカラーパレット
        // ベースカラー（白基調）
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#f9fafb',
          tertiary: '#f3f4f6',
          hover: '#f0f1f3',
        },
        // 透過対応カラー
        translucent: {
          white: 'rgba(255, 255, 255, 0.85)',
          light: 'rgba(249, 250, 251, 0.8)',
          overlay: 'rgba(255, 255, 255, 0.6)',
        },
        // ボーダー
        border: {
          DEFAULT: '#e5e7eb',
          subtle: 'rgba(0, 0, 0, 0.06)',
          focus: '#3b82f6',
        },
        // テキスト
        content: {
          DEFAULT: '#111827',
          secondary: '#6b7280',
          tertiary: '#9ca3af',
          inverted: '#ffffff',
        },
        // アクセント（Linear風ブルー）
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
          subtle: '#eff6ff',
          muted: '#dbeafe',
        },
        // セマンティックカラー
        success: {
          DEFAULT: '#10b981',
          subtle: '#d1fae5',
          text: '#065f46',
        },
        warning: {
          DEFAULT: '#f59e0b',
          subtle: '#fef3c7',
          text: '#92400e',
        },
        error: {
          DEFAULT: '#ef4444',
          subtle: '#fee2e2',
          text: '#991b1b',
        },
        info: {
          DEFAULT: '#3b82f6',
          subtle: '#dbeafe',
          text: '#1e40af',
        },
      },
      // グラスモーフィズム用のブラー
      backdropBlur: {
        xs: '2px',
        glass: '20px',
      },
      // シャドウ（Linear風の控えめなシャドウ）
      boxShadow: {
        'soft': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
        'elevated': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        'modal': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.08)',
      },
      // アニメーション
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-subtle': 'pulseSubtle 2s infinite',
        'wave': 'wave 1s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(0.5)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      // フォント
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Hiragino Sans"',
          '"Hiragino Kaku Gothic ProN"',
          '"Noto Sans JP"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        // カスタムライトテーマ（Linear Design + Apple Vibrancy）
        'interview-light': {
          'primary': '#3b82f6',
          'primary-content': '#ffffff',
          'secondary': '#6b7280',
          'secondary-content': '#ffffff',
          'accent': '#10b981',
          'accent-content': '#ffffff',
          'neutral': '#111827',
          'neutral-content': '#f9fafb',
          'base-100': '#ffffff',
          'base-200': '#f9fafb',
          'base-300': '#f3f4f6',
          'base-content': '#111827',
          'info': '#3b82f6',
          'info-content': '#ffffff',
          'success': '#10b981',
          'success-content': '#ffffff',
          'warning': '#f59e0b',
          'warning-content': '#ffffff',
          'error': '#ef4444',
          'error-content': '#ffffff',
          // カスタムCSS変数
          '--rounded-box': '0.75rem',
          '--rounded-btn': '0.5rem',
          '--rounded-badge': '0.375rem',
          '--animation-btn': '0.2s',
          '--animation-input': '0.2s',
          '--btn-focus-scale': '0.98',
          '--border-btn': '1px',
          '--tab-border': '1px',
          '--tab-radius': '0.5rem',
        },
      },
      'dark', // フォールバック用
    ],
    defaultTheme: 'interview-light',
  },
}
