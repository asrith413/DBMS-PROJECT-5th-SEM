import { AlertTriangle, CheckCircle2, Fingerprint, ShieldCheck } from 'lucide-react'

import Button from '../common/Button'

export default function AuditVerificationPanel({ result, loading, onVerify }) {
  return (
    <section className="panel mb-5 overflow-hidden">
      <div className="grid md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex gap-4 p-5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Audit chain integrity</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              Hash chaining is tamper-evident, not immutable. Verification recalculates the ordered records and detects changed hashed content or broken links that remain in the chain. It does not prevent privileged database writes, guarantee append-only storage, or independently prove that the chain was not truncated at its tail.
            </p>
          </div>
        </div>
        <div className="flex items-center border-t border-slate-700/60 bg-navy-900/50 p-5 md:border-l md:border-t-0">
          <Button icon={ShieldCheck} loading={loading} onClick={onVerify} className="w-full md:w-auto">Verify chain</Button>
        </div>
      </div>

      {result && (
        <div className={`flex items-start gap-3 border-t px-5 py-4 ${result.integrity_valid ? 'border-emerald-500/20 bg-emerald-500/[0.06]' : 'border-red-500/25 bg-red-500/[0.07]'}`} role="status">
          {result.integrity_valid
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />}
          <div>
            <p className={`font-semibold ${result.integrity_valid ? 'text-emerald-200' : 'text-red-200'}`}>
              {result.integrity_valid ? 'Hash chain is internally consistent' : 'Hash chain integrity failure detected'}
            </p>
            <p className={`mt-1 text-sm ${result.integrity_valid ? 'text-emerald-300/70' : 'text-red-300/80'}`}>
              {result.integrity_valid
                ? `${result.records_checked} ordered record${result.records_checked === 1 ? '' : 's'} recalculated successfully.`
                : `${result.records_checked} record position${result.records_checked === 1 ? '' : 's'} checked; first invalid log ID: ${result.first_invalid_log_id ?? 'not returned'}.`}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
