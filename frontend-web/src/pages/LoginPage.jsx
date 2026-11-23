import { useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Fingerprint,
  LockKeyhole,
  Mail,
  Shield,
  ShieldCheck,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import Button from '../components/common/Button'
import ThemeToggle from '../components/common/ThemeToggle'
import { useAuth } from '../context/AuthContext'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function destinationFrom(location) {
  const from = location.state?.from
  if (
    typeof from?.pathname === 'string'
    && from.pathname.startsWith('/')
    && !from.pathname.startsWith('//')
  ) {
    return `${from.pathname}${from.search || ''}${from.hash || ''}`
  }
  return '/dashboard'
}

export default function LoginPage() {
  const { login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const passwordInput = useRef(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [requestError, setRequestError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const updateField = (field, value) => {
    if (field === 'email') setEmail(value)
    if (field === 'password') setPassword(value)
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: '' }))
    }
    if (requestError) setRequestError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const normalizedEmail = email.trim()
    const errors = {}

    if (!normalizedEmail) {
      errors.email = 'Enter your email address.'
    } else if (!EMAIL_PATTERN.test(normalizedEmail)) {
      errors.email = 'Enter a valid email address.'
    }
    if (!password) errors.password = 'Enter your password.'

    setFieldErrors(errors)
    setRequestError('')
    if (Object.keys(errors).length) return

    setSubmitting(true)
    try {
      await login(normalizedEmail, password)
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setRequestError(error?.message || 'CIMS could not sign you in. Please try again.')
      if (error?.status === 401) {
        setPassword('')
        requestAnimationFrame(() => passwordInput.current?.focus())
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-navy-950 text-slate-100">
      <div className="absolute right-4 top-4 z-30">
        <ThemeToggle showLabel />
      </div>
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-44 top-[-14rem] h-[34rem] w-[34rem] rounded-full bg-cyan-500/[0.08] blur-3xl" />
        <div className="absolute -bottom-56 right-[-8rem] h-[38rem] w-[38rem] rounded-full bg-blue-600/[0.08] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.025)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>

      <main className="relative mx-auto grid min-h-screen w-full max-w-[1440px] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="hidden flex-col justify-between border-r border-slate-700/50 px-12 py-10 lg:flex xl:px-20 xl:py-14" aria-label="CIMS platform overview">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.08)]">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <p className="font-bold tracking-[0.18em] text-white">CIMS</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Security operations console</p>
            </div>
          </div>

          <div className="max-w-2xl py-16">
            <p className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-cyan-400">
              <span className="h-px w-8 bg-cyan-400/70" />
              Incident command workspace
            </p>
            <h1 className="max-w-xl text-4xl font-bold leading-[1.1] tracking-[-0.035em] text-white xl:text-6xl">
              Coordinate response. Preserve every decision.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-400 xl:text-lg xl:leading-8">
              A role-aware workspace for incident triage, SLA oversight, investigation activity, and audit continuity.
            </p>

            <div className="mt-10 max-w-xl overflow-hidden rounded-2xl border border-slate-700/60 bg-navy-900/65 shadow-2xl shadow-black/20 backdrop-blur">
              <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  <Fingerprint className="h-4 w-4 text-cyan-400" />
                  Controlled access
                </div>
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-slate-700/50 px-2 py-5">
                <div className="px-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Access</p>
                  <p className="mt-2 text-sm font-semibold text-slate-200">Role scoped</p>
                </div>
                <div className="px-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Session</p>
                  <p className="mt-2 text-sm font-semibold text-slate-200">Tab scoped</p>
                </div>
                <div className="px-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Records</p>
                  <p className="mt-2 text-sm font-semibold text-slate-200">Audit linked</p>
                </div>
              </div>
            </div>
          </div>

          <p className="flex items-center gap-2 text-xs text-slate-600">
            <ShieldCheck className="h-4 w-4 text-cyan-500/70" />
            Cybersecurity Incident Management System
          </p>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12 xl:px-20">
          <div className="w-full max-w-md">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold tracking-[0.16em] text-white">CIMS</p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">SOC console</p>
              </div>
            </div>

            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-400">Secure sign in</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Access the console</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Authenticate with your authorized CIMS account to continue.
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-slate-700/70 bg-navy-850/90 p-5 shadow-2xl shadow-black/25 backdrop-blur sm:p-7">
              {requestError && (
                <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/[0.08] p-3.5 text-sm text-red-200" role="alert" aria-live="polite">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <p>{requestError}</p>
                </div>
              )}

              <div>
                <label htmlFor="email" className="field-label">Email address</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(event) => updateField('email', event.target.value)}
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    autoFocus
                    disabled={submitting}
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                    className={`field-input pl-10 ${fieldErrors.email ? 'border-red-500/70 focus:border-red-400 focus:ring-red-400/10' : ''}`}
                    placeholder="you@organization.com"
                  />
                </div>
                {fieldErrors.email && <p id="email-error" className="mt-1.5 text-xs text-red-400">{fieldErrors.email}</p>}
              </div>

              <div className="mt-5">
                <label htmlFor="password" className="field-label">Password</label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                  <input
                    ref={passwordInput}
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => updateField('password', event.target.value)}
                    autoComplete="current-password"
                    disabled={submitting}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                    className={`field-input px-10 ${fieldErrors.password ? 'border-red-500/70 focus:border-red-400 focus:ring-red-400/10' : ''}`}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    disabled={submitting}
                    className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-500 transition hover:bg-white/5 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldErrors.password && <p id="password-error" className="mt-1.5 text-xs text-red-400">{fieldErrors.password}</p>}
              </div>

              <Button type="submit" loading={submitting} icon={ArrowRight} className="mt-7 min-h-12 w-full">
                {submitting ? 'Authenticating' : 'Sign in securely'}
              </Button>

              <div className="mt-5 flex items-start gap-2 border-t border-slate-700/60 pt-5 text-xs leading-5 text-slate-500">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500/70" />
                Access is governed by CIMS role policies. Incident operations may be recorded in the audit trail.
              </div>
            </form>

            <p className="mt-6 text-center text-[11px] uppercase tracking-[0.16em] text-slate-700">
              Authorized personnel only
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
