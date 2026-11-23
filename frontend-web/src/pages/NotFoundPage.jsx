import { ArrowLeft, ShieldQuestion } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-navy-950 p-6 text-center">
      <div>
        <ShieldQuestion className="mx-auto h-12 w-12 text-cyan-400" />
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">Error 404</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Route not found</h1>
        <p className="mt-3 text-slate-400">This console route does not exist or is no longer available.</p>
        <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/20"><ArrowLeft className="h-4 w-4" />Return to dashboard</Link>
      </div>
    </div>
  )
}
