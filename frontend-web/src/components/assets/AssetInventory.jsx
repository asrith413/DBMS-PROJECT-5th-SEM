import { Eye, Link2, Network, Pencil, Trash2 } from 'lucide-react'

function AssetIcon({ type }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-300">
      <Network className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{type}</span>
    </span>
  )
}

function Actions({ asset, isAdmin, onView, onEdit, onLink, onDelete }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={() => onView(asset)} className="rounded-lg p-2 text-slate-500 transition hover:bg-cyan-400/10 hover:text-cyan-200" title="View associated incidents" aria-label={`View incidents for ${asset.name}`}>
        <Eye className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onLink(asset)} className="rounded-lg p-2 text-slate-500 transition hover:bg-cyan-400/10 hover:text-cyan-200" title="Associate incident" aria-label={`Associate ${asset.name} with an incident`}>
        <Link2 className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onEdit(asset)} className="rounded-lg p-2 text-slate-500 transition hover:bg-cyan-400/10 hover:text-cyan-200" title="Edit asset" aria-label={`Edit ${asset.name}`}>
        <Pencil className="h-4 w-4" />
      </button>
      {isAdmin && (
        <button type="button" onClick={() => onDelete(asset)} className="rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-300" title="Delete asset" aria-label={`Delete ${asset.name}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export default function AssetInventory({ assets, associationCache, isAdmin, onView, onEdit, onLink, onDelete }) {
  return (
    <>
      <div className="table-shell hidden overflow-x-auto md:block">
        <table className="data-table min-w-[820px]">
          <thead>
            <tr><th>Asset</th><th>Type</th><th>Network address</th><th>Department</th><th>Known links</th><th><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const association = associationCache[asset.asset_id]
              return (
                <tr key={asset.asset_id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <AssetIcon type={asset.type} />
                      <div className="min-w-0">
                        <button type="button" onClick={() => onView(asset)} className="max-w-[240px] truncate text-left font-semibold text-slate-100 hover:text-cyan-300">{asset.name}</button>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-600">ASSET-{String(asset.asset_id).padStart(4, '0')}</p>
                      </div>
                    </div>
                  </td>
                  <td><span className="rounded-full border border-slate-600 bg-slate-700/20 px-2.5 py-1 text-xs text-slate-300">{asset.type}</span></td>
                  <td className="font-mono text-xs text-cyan-200">{asset.ip_address || 'Not assigned'}</td>
                  <td className="text-slate-400">{asset.department}</td>
                  <td>
                    {association?.loading ? <span className="text-xs text-slate-500">Loading...</span> : association?.items ? (
                      <button type="button" onClick={() => onView(asset)} className="font-mono text-sm text-cyan-300 hover:text-cyan-200">{association.items.length} incidents</button>
                    ) : <button type="button" onClick={() => onView(asset)} className="text-xs text-slate-500 hover:text-cyan-300">Load links</button>}
                  </td>
                  <td><Actions asset={asset} isAdmin={isAdmin} onView={onView} onEdit={onEdit} onLink={onLink} onDelete={onDelete} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {assets.map((asset) => {
          const association = associationCache[asset.asset_id]
          return (
            <article key={asset.asset_id} className="panel p-4">
              <div className="flex items-start gap-3">
                <AssetIcon type={asset.type} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-white">{asset.name}</h3>
                  <p className="mt-0.5 font-mono text-xs text-cyan-300">{asset.ip_address || 'No network address'}</p>
                </div>
                <span className="rounded-full border border-slate-600 bg-slate-700/20 px-2 py-1 text-[11px] text-slate-300">{asset.type}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-[10px] uppercase tracking-wider text-slate-600">Department</dt><dd className="mt-1 text-slate-300">{asset.department}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-wider text-slate-600">Known links</dt><dd className="mt-1 text-slate-300">{association?.items ? association.items.length : 'Not loaded'}</dd></div>
              </dl>
              <div className="mt-3 border-t border-slate-700/60 pt-2">
                <Actions asset={asset} isAdmin={isAdmin} onView={onView} onEdit={onEdit} onLink={onLink} onDelete={onDelete} />
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}
