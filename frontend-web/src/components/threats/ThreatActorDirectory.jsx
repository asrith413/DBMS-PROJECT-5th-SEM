import { Eye, Link2, Pencil, Radar, Trash2 } from 'lucide-react'

function ActorMark({ alias }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-300">
      <Radar className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{alias}</span>
    </span>
  )
}

function Actions({ actor, isAdmin, onView, onEdit, onLink, onDelete }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={() => onView(actor)} className="rounded-lg p-2 text-slate-500 transition hover:bg-cyan-400/10 hover:text-cyan-200" title="View accessible incident links" aria-label={`View incidents linked to ${actor.alias}`}><Eye className="h-4 w-4" /></button>
      <button type="button" onClick={() => onLink(actor)} className="rounded-lg p-2 text-slate-500 transition hover:bg-cyan-400/10 hover:text-cyan-200" title="Link active incident" aria-label={`Link ${actor.alias} to an incident`}><Link2 className="h-4 w-4" /></button>
      {isAdmin && <button type="button" onClick={() => onEdit(actor)} className="rounded-lg p-2 text-slate-500 transition hover:bg-cyan-400/10 hover:text-cyan-200" title="Edit threat actor" aria-label={`Edit ${actor.alias}`}><Pencil className="h-4 w-4" /></button>}
      {isAdmin && <button type="button" onClick={() => onDelete(actor)} className="rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-300" title="Delete threat actor" aria-label={`Delete ${actor.alias}`}><Trash2 className="h-4 w-4" /></button>}
    </div>
  )
}

export default function ThreatActorDirectory({ actors, incidentLinks, mappingLoading, isAdmin, onView, onEdit, onLink, onDelete }) {
  return (
    <>
      <div className="table-shell hidden overflow-x-auto md:block">
        <table className="data-table min-w-[780px]">
          <thead><tr><th>Threat actor</th><th>Description</th><th>Accessible incident links</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {actors.map((actor) => (
              <tr key={actor.actor_id}>
                <td>
                  <div className="flex items-center gap-3">
                    <ActorMark alias={actor.alias} />
                    <div className="min-w-0"><button type="button" onClick={() => onView(actor)} className="max-w-[220px] truncate text-left font-semibold text-slate-100 hover:text-cyan-300">{actor.alias}</button><p className="mt-0.5 font-mono text-[11px] text-slate-600">ACTOR-{String(actor.actor_id).padStart(4, '0')}</p></div>
                  </div>
                </td>
                <td><p className="max-w-xl text-sm leading-5 text-slate-400">{actor.description}</p></td>
                <td>{mappingLoading ? <span className="text-xs text-slate-500">Deriving...</span> : <button type="button" onClick={() => onView(actor)} className="font-mono text-sm text-cyan-300 hover:text-cyan-200">{(incidentLinks[actor.actor_id] || []).length} incidents</button>}</td>
                <td><Actions actor={actor} isAdmin={isAdmin} onView={onView} onEdit={onEdit} onLink={onLink} onDelete={onDelete} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {actors.map((actor) => (
          <article key={actor.actor_id} className="panel p-4">
            <div className="flex items-start gap-3">
              <ActorMark alias={actor.alias} />
              <div className="min-w-0 flex-1"><h3 className="truncate font-semibold text-white">{actor.alias}</h3><p className="mt-0.5 font-mono text-[11px] text-slate-600">ACTOR-{String(actor.actor_id).padStart(4, '0')}</p></div>
              <span className="rounded-full border border-red-500/20 bg-red-500/[0.07] px-2.5 py-1 font-mono text-xs text-red-200">{mappingLoading ? '...' : (incidentLinks[actor.actor_id] || []).length} links</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">{actor.description}</p>
            <div className="mt-3 border-t border-slate-700/60 pt-2"><Actions actor={actor} isAdmin={isAdmin} onView={onView} onEdit={onEdit} onLink={onLink} onDelete={onDelete} /></div>
          </article>
        ))}
      </div>
    </>
  )
}
