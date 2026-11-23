import { AlertTriangle } from 'lucide-react'

import Button from './Button'
import Modal from './Modal'

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', loading = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex gap-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-4">
        <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
        <p className="text-sm leading-6 text-slate-300">{message}</p>
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}
