export default function FormField({ label, error, hint, required, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}{required && <span className="ml-1 text-cyan-400" aria-hidden="true">*</span>}</span>
      {children}
      {error ? <span className="mt-1.5 block text-xs text-red-400">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  )
}
