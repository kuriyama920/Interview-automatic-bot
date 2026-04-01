/**
 * 共通UIコンポーネント
 * Linear Design + Apple Vibrancy ハイブリッドスタイル
 */

import { ReactNode, ButtonHTMLAttributes, forwardRef } from 'react'
import { formatErrorMessage } from '../../utils/errorMessages'

// ============================================================
// Card コンポーネント
// ============================================================

interface CardProps {
  children: ReactNode
  className?: string
  variant?: 'default' | 'glass' | 'elevated'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Card({
  children,
  className = '',
  variant = 'default',
  padding = 'md',
}: CardProps) {
  const baseStyles = 'rounded-xl border transition-all duration-200'

  const variantStyles = {
    default: 'bg-surface border-border shadow-card',
    glass:
      'bg-translucent-white backdrop-blur-glass border-border-subtle shadow-glass',
    elevated: 'bg-surface border-border shadow-elevated hover:shadow-modal',
  }

  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  }

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${paddingStyles[padding]} ${className}`}
    >
      {children}
    </div>
  )
}

// ============================================================
// CardHeader コンポーネント
// ============================================================

interface CardHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}

export function CardHeader({ title, subtitle, action, className = '' }: CardHeaderProps) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      <div>
        <h3 className="text-base font-semibold text-content">{title}</h3>
        {subtitle && <p className="text-sm text-content-secondary mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ============================================================
// Button コンポーネント
// ============================================================

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'

    const variantStyles = {
      primary:
        'bg-accent text-content-inverted hover:bg-accent-hover focus:ring-accent shadow-soft hover:shadow-card',
      secondary:
        'bg-surface-secondary text-content border border-border hover:bg-surface-hover focus:ring-accent',
      ghost: 'text-content-secondary hover:text-content hover:bg-surface-hover focus:ring-accent',
      danger:
        'bg-error text-content-inverted hover:bg-error/90 focus:ring-error shadow-soft hover:shadow-card',
    }

    const sizeStyles = {
      sm: 'text-sm px-3 py-1.5 gap-1.5',
      md: 'text-sm px-4 py-2 gap-2',
      lg: 'text-base px-5 py-2.5 gap-2',
    }

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Spinner size={size === 'lg' ? 'md' : 'sm'} />
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'

// ============================================================
// Badge コンポーネント
// ============================================================

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  size?: 'sm' | 'md'
  className?: string
}

export function Badge({ children, variant = 'default', size = 'sm', className = '' }: BadgeProps) {
  const baseStyles = 'inline-flex items-center font-medium rounded-full'

  const variantStyles = {
    default: 'bg-surface-tertiary text-content-secondary',
    success: 'bg-success-subtle text-success-text',
    warning: 'bg-warning-subtle text-warning-text',
    error: 'bg-error-subtle text-error-text',
    info: 'bg-info-subtle text-info-text',
  }

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  }

  return (
    <span className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}>
      {children}
    </span>
  )
}

// ============================================================
// Spinner コンポーネント
// ============================================================

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeStyles = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  return (
    <svg
      className={`animate-spin ${sizeStyles[size]} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

// ============================================================
// Alert コンポーネント
// ============================================================

interface AlertProps {
  children: ReactNode
  variant?: 'info' | 'success' | 'warning' | 'error'
  onClose?: () => void
  className?: string
}

export function Alert({ children, variant = 'info', onClose, className = '' }: AlertProps) {
  const baseStyles = 'flex items-start gap-3 p-4 rounded-lg border'

  const variantStyles = {
    info: 'bg-info-subtle border-info/20 text-info-text',
    success: 'bg-success-subtle border-success/20 text-success-text',
    warning: 'bg-warning-subtle border-warning/20 text-warning-text',
    error: 'bg-error-subtle border-error/20 text-error-text',
  }

  const icons = {
    info: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    success: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  }

  return (
    <div className={`${baseStyles} ${variantStyles[variant]} ${className}`}>
      {icons[variant]}
      <div className="flex-1 text-sm">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 -m-1 rounded hover:bg-black/5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ============================================================
// WaveformVisualizer コンポーネント（音声波形）
// ============================================================

interface WaveformVisualizerProps {
  isActive: boolean
  barCount?: number
  className?: string
}

export function WaveformVisualizer({
  isActive,
  barCount = 12,
  className = '',
}: WaveformVisualizerProps) {
  return (
    <div className={`flex items-center justify-center gap-0.5 h-8 ${className}`}>
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-full transition-all duration-150 ${
            isActive ? 'bg-accent animate-wave' : 'bg-content-tertiary h-1'
          }`}
          style={{
            height: isActive ? `${Math.random() * 60 + 40}%` : '4px',
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </div>
  )
}

// ============================================================
// Avatar コンポーネント
// ============================================================

interface AvatarProps {
  src?: string | null
  name?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  const sizeStyles = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  }

  const initial = name?.[0]?.toUpperCase() || '?'

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        className={`rounded-full object-cover ${sizeStyles[size]} ${className}`}
      />
    )
  }

  return (
    <div
      className={`rounded-full bg-accent text-content-inverted flex items-center justify-center font-medium ${sizeStyles[size]} ${className}`}
    >
      {initial}
    </div>
  )
}

// ============================================================
// Input コンポーネント
// ============================================================

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-content">{label}</label>
        )}
        <input
          ref={ref}
          className={`w-full px-3 py-2 text-sm bg-surface border rounded-lg transition-colors
            ${error ? 'border-error focus:ring-error' : 'border-border focus:border-accent focus:ring-accent'}
            focus:outline-none focus:ring-2 focus:ring-offset-0
            placeholder:text-content-tertiary
            disabled:bg-surface-secondary disabled:cursor-not-allowed
            ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-error">{error}</p>}
        {hint && !error && <p className="text-xs text-content-tertiary">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'

// ============================================================
// ErrorAlert コンポーネント（日本語エラー表示）
// ============================================================

interface ErrorAlertProps {
  error: string
  onClose?: () => void
  className?: string
}

export function ErrorAlert({ error, onClose, className = '' }: ErrorAlertProps) {
  const { message, hint } = formatErrorMessage(error)

  return (
    <div className={`rounded-lg border border-warning/30 bg-warning-subtle p-3 ${className}`}>
      <div className="flex items-start gap-2">
        <svg className="w-4 h-4 shrink-0 text-warning-text mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-warning-text">{message}</p>
          {hint && (
            <p className="text-[11px] text-content-secondary mt-0.5">{hint}</p>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="shrink-0 p-0.5 rounded hover:bg-black/5 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-warning-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
