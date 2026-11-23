import { BriefcaseBusiness, Eye, Pencil, ShieldPlus, Trash2 } from 'lucide-react'

function Initials({ name }) {
  const initials = String(name || 'A')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-500/20 bg-cyan-400/10 text-xs font-bold text-cyan-200">
      {initials || 'A'}
    </span>
  )
}

function Workload({ analyst }) {
  const derived = analyst.activeAssignments.length
  const inSync = derived === analyst.workload

  return (
    <div>
      <div className="flex items-center gap-2">
        <BriefcaseBusiness className="h-4 w-4 text-cyan-400" />
        <span className="font-mono text-base font-semibold text-white">{derived}</span>
      </div>
      <p className={`mt-1 text-xs ${inSync ? 'text-slate-500' : 'text-amber-300'}`}>
        Profile counter: {analyst.workload}{inSync ? '' : ' | differs'}
      </p>
    </div>
  )
}

function RowActions({ analyst, onView, onEdit, onAssign, onRemove }) {
  const actions = [
    { label: 'View assigned incidents', icon: Eye, onClick: () => onView(analyst) },
    { label: 'Edit expertise', icon: Pencil, onClick: () => onEdit(analyst) },
    { label: 'Assign incident', icon: ShieldPlus, onClick: () => onAssign(analyst) },
    { label: 'Remove analyst profile', icon: Trash2, onClick: () => onRemove(analyst), danger: true },
  ]

  return (
    <div className="flex items-center justify-end gap-1">
      {actions.map(({ label, icon: Icon, onClick, danger }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          className={`rounded-lg p-2 transition ${danger ? 'text-slate-500 hover:bg-red-500/10 hover:text-red-300' : 'text-slate-500 hover:bg-cyan-400/10 hover:text-cyan-200'}`}
          title={label}
          aria-label={`${label} for ${analyst.user.name}`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  )
}

export default function AnalystRoster({ analysts, onView, onEdit, onAssign, onRemove }) {
  return (
    <>
      <div className="table-shell hidden overflow-x-auto md:block">
        <table className="data-table min-w-[900px]">
          <thead>
            <tr>
              <th>Analyst</th>
              <th>Department</th>
              <th>Expertise</th>
              <th>Workload</th>
              <th>Incident history</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {analysts.map((analyst) => (
              <tr key={analyst.user_id}>
                <td>
                  <div className="flex items-center gap-3">
                    <Initials name={analyst.user.name} />
                    <div className="min-w-0">
                      <button type="button" onClick={() => onView(analyst)} className="block max-w-[220px] truncate text-left font-semibold text-slate-100 hover:text-cyan-300">
                        {analyst.user.name}
                      </button>
                      <p className="mt-0.5 max-w-[220px] truncate text-xs text-slate-500">{analyst.user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="text-slate-400">{analyst.department || 'Not set'}</td>
                <td><p className="max-w-xs text-sm leading-5 text-slate-300">{analyst.expertise}</p></td>
                <td><Workload analyst={analyst} /></td>
                <td>
                  <button type="button" onClick={() => onView(analyst)} className="font-mono text-sm text-cyan-300 hover:text-cyan-200">
                    {analyst.assignmentRecords.length} assigned
                  </button>
                </td>
                <td><RowActions analyst={analyst} onView={onView} onEdit={onEdit} onAssign={onAssign} onRemove={onRemove} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {analysts.map((analyst) => (
          <article key={analyst.user_id} className="panel p-4">
            <div className="flex items-start gap-3">
              <Initials name={analyst.user.name} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-white">{analyst.user.name}</h3>
                <p className="truncate text-xs text-slate-500">{analyst.user.email}</p>
              </div>
              <span className="rounded-full border border-cyan-500/20 bg-cyan-400/10 px-2.5 py-1 font-mono text-xs text-cyan-200">
                {analyst.activeAssignments.length} active
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-600">Department</dt>
                <dd className="mt-1 text-slate-300">{analyst.department || 'Not set'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-600">History</dt>
                <dd className="mt-1 text-slate-300">{analyst.assignmentRecords.length} incidents</dd>
              </div>
            </dl>
            <div className="mt-3 rounded-lg border border-slate-700/70 bg-navy-900/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Expertise</p>
              <p className="mt-1 text-sm leading-5 text-slate-300">{analyst.expertise}</p>
            </div>
            <div className="mt-3 border-t border-slate-700/60 pt-2">
              <RowActions analyst={analyst} onView={onView} onEdit={onEdit} onAssign={onAssign} onRemove={onRemove} />
            </div>
          </article>
        ))}
      </div>
    </>
  )
}
