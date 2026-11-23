import { LoaderCircle } from 'lucide-react'

const variants = {
  primary: 'border-cyan-400/50 bg-cyan-500 text-navy-950 hover:bg-cyan-300',
  secondary: 'border-slate-600 bg-navy-750 text-slate-200 hover:border-slate-500 hover:bg-navy-700',
  ghost: 'border-transparent bg-transparent text-slate-300 hover:bg-white/5 hover:text-white',
  danger: 'border-red-500/50 bg-red-500/10 text-red-300 hover:bg-red-500/20',
}

export default function Button({
  children,
  variant = 'primary',
  loading = false,
  icon: Icon,
  className = '',
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  )
}
