import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const styles = {
  success: { icon: CheckCircle2, border: 'border-emerald-500/40', iconColor: 'text-emerald-400' },
  error: { icon: AlertCircle, border: 'border-red-500/50', iconColor: 'text-red-400' },
  info: { icon: Info, border: 'border-cyan-500/40', iconColor: 'text-cyan-400' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback((message, type = 'info', duration = 4500) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((current) => [...current, { id, message, type }])
    window.setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => {
          const style = styles[toast.type] || styles.info
          const Icon = style.icon
          return (
            <div key={toast.id} className={`flex items-start gap-3 rounded-lg border ${style.border} bg-navy-800 p-4 shadow-panel`}>
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconColor}`} />
              <p className="flex-1 text-sm leading-5 text-slate-200">{toast.message}</p>
              <button type="button" onClick={() => dismiss(toast.id)} className="text-slate-500 hover:text-slate-200" aria-label="Dismiss notification">
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
