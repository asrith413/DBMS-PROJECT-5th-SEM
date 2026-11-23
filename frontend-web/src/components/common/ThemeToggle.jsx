import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'

export default function ThemeToggle({ className = '', showLabel = false }) {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
        isDark
          ? 'border-slate-700 bg-navy-850/90 text-slate-300 hover:border-cyan-400/50 hover:bg-navy-800 hover:text-cyan-300'
          : 'border-slate-300 bg-white text-slate-700 shadow-sm hover:border-amber-400/60 hover:bg-slate-50 hover:text-amber-600'
      } ${className}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-cyan-400 transition-transform duration-200 hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 text-amber-500 transition-transform duration-200 hover:-rotate-12" />
      )}
      {showLabel && (
        <span className="hidden sm:inline">
          {isDark ? 'Light mode' : 'Dark mode'}
        </span>
      )}
    </button>
  )
}
