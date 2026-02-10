/**
 * 共通UIコンポーネント
 * Linear Design + Apple Vibrancy ハイブリッドスタイル
 */

import { ReactNode, ButtonHTMLAttributes, forwardRef } from 'react'

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
// IconButton コンポーネント
// ============================================================

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  variant?: 'ghost' | 'secondary'
  size?: 'sm' | 'md'
  label: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, variant = 'ghost', size = 'md', label, className = '', ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed'

    const variantStyles = {
      ghost: 'text-content-secondary hover:text-content hover:bg-surface-hover',
      secondary: 'text-content-secondary hover:text-content bg-surface-secondary hover:bg-surface-hover border border-border',
    }

    const sizeStyles = {
      sm: 'p-1.5',
      md: 'p-2',
    }

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        aria-label={label}
        title={label}
        {...props}
      >
        {icon}
      </button>
    )
  }
)

IconButton.displayName = 'IconButton'

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
// Select コンポーネント
// ============================================================

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-content">{label}</label>
        )}
        <select
          ref={ref}
          className={`w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg transition-colors
            focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent focus:ring-offset-0
            disabled:bg-surface-secondary disabled:cursor-not-allowed
            ${className}`}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    )
  }
)

Select.displayName = 'Select'

// ============================================================
// Toggle コンポーネント
// ============================================================

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <label className={`inline-flex items-center gap-3 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2
          ${checked ? 'bg-accent' : 'bg-surface-tertiary'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-soft transition-transform
            ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
      {label && <span className="text-sm text-content">{label}</span>}
    </label>
  )
}

// ============================================================
// Slider コンポーネント
// ============================================================

interface SliderProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  label?: string
  valueLabel?: string
  disabled?: boolean
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  valueLabel,
  disabled = false,
}: SliderProps) {
  return (
    <div className="space-y-2">
      {(label || valueLabel) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-sm font-medium text-content">{label}</span>}
          {valueLabel && <span className="text-sm text-content-secondary">{valueLabel}</span>}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-surface-tertiary rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-accent
          [&::-webkit-slider-thumb]:shadow-card
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110
          disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  )
}
