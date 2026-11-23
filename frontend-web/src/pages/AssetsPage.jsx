import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, Building2, CircleDot, Clock3, Link2, Plus, RefreshCw, Search } from 'lucide-react'

import {
  AssetDetailDialog,
  AssetFormDialog,
  AssetLinkDialog,
} from '../components/assets/AssetDialogs'
import AssetInventory from '../components/assets/AssetInventory'
import Button from '../components/common/Button'
import ConfirmDialog from '../components/common/ConfirmDialog'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../services/api'

async function loadAllIncidents() {
  const incidents = []
  const limit = 200
  for (let offset = 0; ; offset += limit) {
    const page = await api.incidents.list({ offset, limit })
    incidents.push(...page)
    if (page.length < limit) break
  }
  return incidents
}

function describeError(action, error) {
  const labels = { 403: 'Permission denied', 404: 'Record unavailable', 409: 'Conflict', 422: 'Validation failed' }
  return `${action}: ${labels[error?.status] || 'Request failed'}. ${error?.message || 'The request could not be completed.'}`
}

function readPendingAssets(storageKey) {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) || '[]')
    return Array.isArray(value) ? value.filter((asset) => Number.isInteger(asset?.asset_id)) : []
  } catch {
    return []
  }
}

export default function AssetsPage() {
  const { user } = useAuth()
  const { notify } = useToast()
  const isAdmin = user.role === 'ADMIN'
  const pendingStorageKey = `cims_pending_assets_${user.user_id}`
  const [assets, setAssets] = useState([])
  const [incidents, setIncidents] = useState([])
  const [associationCache, setAssociationCache] = useState({})
  const [pendingAssets, setPendingAssets] = useState(() => isAdmin ? [] : readPendingAssets(pendingStorageKey))
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [formDialog, setFormDialog] = useState({ open: false, asset: null })
  const [selectedAssetId, setSelectedAssetId] = useState(null)
  const [linkTarget, setLinkTarget] = useState(null)
  const [deleteAssetId, setDeleteAssetId] = useState(null)
  const [unlinkTarget, setUnlinkTarget] = useState(null)
  const [confirming, setConfirming] = useState(false)

  const loadResources = useCallback(async (showInitialLoader = false) => {
    if (showInitialLoader) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const [nextAssets, nextIncidents] = await Promise.all([api.assets.list(), loadAllIncidents()])
      setAssets(nextAssets)
      setIncidents(nextIncidents)
      const visibleIds = new Set(nextAssets.map((asset) => asset.asset_id))
      setPendingAssets((current) => current.filter((asset) => !visibleIds.has(asset.asset_id)))
      return { assets: nextAssets, incidents: nextIncidents }
    } catch (requestError) {
      setError(requestError)
      throw requestError
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadResources(true).catch(() => {})
  }, [loadResources])

  useEffect(() => {
    if (isAdmin) return
    try {
      sessionStorage.setItem(pendingStorageKey, JSON.stringify(pendingAssets))
    } catch {
      // The in-memory pending workflow remains available if browser storage is blocked.
    }
  }, [isAdmin, pendingAssets, pendingStorageKey])

  const loadAssociations = useCallback(async (assetId) => {
    setAssociationCache((current) => ({ ...current, [assetId]: { ...current[assetId], loading: true, error: null } }))
    try {
      const items = await api.assets.incidents(assetId)
      setAssociationCache((current) => ({ ...current, [assetId]: { loading: false, error: null, items } }))
      return items
    } catch (requestError) {
      setAssociationCache((current) => ({ ...current, [assetId]: { loading: false, error: requestError, items: current[assetId]?.items || [] } }))
      throw requestError
    }
  }, [])

  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.asset_id, asset])), [assets])
  const selectedAsset = assetsById.get(selectedAssetId) || null
  const deleteAsset = assetsById.get(deleteAssetId) || null
  const activeIncidents = incidents.filter((incident) => !['Resolved', 'Closed'].includes(incident.status))

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return assets
    return assets.filter((asset) => [asset.name, asset.type, asset.ip_address, asset.department, asset.asset_id]
      .some((value) => String(value || '').toLowerCase().includes(query)))
  }, [assets, search])

  const openDetails = async (asset) => {
    setSelectedAssetId(asset.asset_id)
    if (!associationCache[asset.asset_id]?.loading) {
      try {
        await loadAssociations(asset.asset_id)
      } catch (requestError) {
        notify(describeError('Asset incident lookup failed', requestError), 'error')
      }
    }
  }

  const openLink = async (asset, pending = false) => {
    setLinkTarget({ asset, pending })
    if (pending) {
      setAssociationCache((current) => ({ ...current, [asset.asset_id]: { loading: false, error: null, items: [] } }))
      return
    }
    if (!associationCache[asset.asset_id]?.loading) {
      try {
        await loadAssociations(asset.asset_id)
      } catch (requestError) {
        notify(describeError('Existing association check failed', requestError), 'error')
      }
    }
  }

  const handleSaveAsset = async (payload) => {
    if (formDialog.asset) {
      try {
        const updated = await api.assets.update(formDialog.asset.asset_id, payload)
        setError(null)
        setAssets((current) => current.map((asset) => asset.asset_id === updated.asset_id ? updated : asset))
        notify(`${updated.name} was updated.`, 'success')
        return updated
      } catch (requestError) {
        notify(describeError('Asset update failed', requestError), 'error')
        throw requestError
      }
    }

    try {
      const created = await api.assets.create(payload)
      setError(null)
      notify(`${created.name} was registered.`, 'success')
      if (isAdmin) {
        setAssets((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)))
      } else {
        setPendingAssets((current) => current.some((asset) => asset.asset_id === created.asset_id) ? current : [...current, created])
        window.setTimeout(() => openLink(created, true), 0)
      }
      return created
    } catch (requestError) {
      notify(describeError('Asset creation failed', requestError), 'error')
      throw requestError
    }
  }

  const handleLink = async (target, incidentId, impactType) => {
    try {
      await api.assets.link(target.asset.asset_id, incidentId, impactType)
    } catch (requestError) {
      if (target.pending && requestError.status === 404 && /asset not found/i.test(requestError.message || '')) {
        setPendingAssets((current) => current.filter((asset) => asset.asset_id !== target.asset.asset_id))
      }
      if (requestError.status === 409) {
        try {
          await loadResources(false)
        } catch {
          // Preserve the original operation error for the form and toast.
        }
      }
      notify(describeError('Asset association failed', requestError), 'error')
      throw requestError
    }
    setPendingAssets((current) => current.filter((asset) => asset.asset_id !== target.asset.asset_id))
    try {
      await loadResources(false)
      try {
        await loadAssociations(target.asset.asset_id)
      } catch {
        // The association succeeded; a follow-up scoped read may still race with visibility.
      }
      notify(`${target.asset.name} was associated with incident #${incidentId}.`, 'success')
    } catch (refreshError) {
      notify(describeError('Association succeeded, but inventory refresh failed', refreshError), 'info')
    }
  }

  const handleDelete = async () => {
    if (!deleteAsset) return
    setConfirming(true)
    try {
      await api.assets.remove(deleteAsset.asset_id)
      setError(null)
      setDeleteAssetId(null)
      if (selectedAssetId === deleteAsset.asset_id) setSelectedAssetId(null)
      setAssets((current) => current.filter((asset) => asset.asset_id !== deleteAsset.asset_id))
      setAssociationCache((current) => {
        const next = { ...current }
        delete next[deleteAsset.asset_id]
        return next
      })
      notify(`${deleteAsset.name} was deleted.`, 'success')
    } catch (requestError) {
      notify(describeError('Asset deletion failed', requestError), 'error')
    } finally {
      setConfirming(false)
    }
  }

  const handleUnlink = async () => {
    if (!unlinkTarget) return
    setConfirming(true)
    const { asset, incident } = unlinkTarget
    try {
      await api.assets.unlink(asset.asset_id, incident.incident_id)
    } catch (requestError) {
      notify(describeError('Association removal failed', requestError), 'error')
      setConfirming(false)
      return
    }
    setUnlinkTarget(null)
    setAssociationCache((current) => ({
      ...current,
      [asset.asset_id]: {
        ...current[asset.asset_id],
        items: (current[asset.asset_id]?.items || []).filter((item) => item.incident_id !== incident.incident_id),
      },
    }))
    try {
      const refreshed = await loadResources(false)
      if (refreshed.assets.some((item) => item.asset_id === asset.asset_id)) {
        try {
          await loadAssociations(asset.asset_id)
        } catch {
          // Keep the successful unlink result even if the follow-up lookup fails.
        }
      } else {
        setSelectedAssetId(null)
      }
      notify(`${asset.name} was unlinked from incident #${incident.incident_id}.`, 'success')
    } catch (refreshError) {
      notify(describeError('Association was removed, but inventory refresh failed', refreshError), 'info')
    } finally {
      setConfirming(false)
    }
  }

  const handleRefresh = async () => {
    try {
      await loadResources(false)
      notify('Scoped asset inventory refreshed.', 'success')
    } catch (requestError) {
      notify(describeError('Refresh failed', requestError), 'error')
    }
  }

  if (loading) return <LoadingState label="Loading scoped asset inventory..." />

  return (
    <div>
      <PageHeader
        eyebrow="Operations / Infrastructure"
        title="Asset Inventory"
        description={isAdmin ? 'Global infrastructure inventory with incident impact associations.' : 'Assets associated with incidents assigned to you. Newly created assets enter this scope after their first association.'}
        actions={<><Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={handleRefresh}>Refresh</Button><Button icon={Plus} onClick={() => setFormDialog({ open: true, asset: null })}>Register asset</Button></>}
      />

      {error && <div className="mb-5"><ErrorState error={error} onRetry={() => loadResources(true).catch(() => {})} title="Unable to load asset inventory" /></div>}

      {!isAdmin && pendingAssets.length > 0 && (
        <section className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-amber-100">Pending first association</h2>
              <p className="mt-1 text-sm leading-6 text-amber-100/70">These assets were created successfully but are not returned by your scoped inventory until linked to an active assigned incident. They remain available here for this signed-in browser session.</p>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {pendingAssets.map((asset) => (
                  <div key={asset.asset_id} className="flex flex-col gap-3 rounded-lg border border-amber-500/20 bg-navy-900/50 p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-200">{asset.name}</p><p className="mt-0.5 font-mono text-xs text-slate-500">ASSET #{asset.asset_id} | {asset.ip_address || 'no address'}</p></div>
                    <Button variant="secondary" icon={Link2} onClick={() => openLink(asset, true)} disabled={!activeIncidents.length}>Associate now</Button>
                  </div>
                ))}
              </div>
              {!activeIncidents.length && <p className="mt-3 text-xs text-amber-200/70">No active assigned incident is available. An administrator can still locate and associate these globally visible assets.</p>}
            </div>
          </div>
        </section>
      )}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={isAdmin ? 'Global inventory' : 'Scoped inventory'} value={assets.length} icon={Boxes} detail={isAdmin ? 'All registered assets' : 'Linked to assigned incidents'} />
        <StatCard label="Departments" value={new Set(assets.map((asset) => asset.department)).size} icon={Building2} tone="blue" detail="Represented in current scope" />
        <StatCard label="Active incidents" value={activeIncidents.length} icon={CircleDot} tone="green" detail="Accessible association targets" />
        <StatCard label="Pending assets" value={pendingAssets.length} icon={Clock3} tone={pendingAssets.length ? 'yellow' : 'cyan'} detail="Created, awaiting first link" />
      </section>

      <section className="panel mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <input className="field-input pl-9" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, type, address, department..." aria-label="Search assets" />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 rounded-full bg-cyan-400" /><span>{isAdmin ? 'Administrator: global scope' : 'Analyst: assignment scope'}</span></div>
        </div>
      </section>

      {!error && !assets.length ? (
        <div className="panel"><EmptyState title={isAdmin ? 'No assets registered' : 'No assets in your incident scope'} message={isAdmin ? 'Register the first infrastructure resource to begin the inventory.' : 'Register an asset and associate it with an active assigned incident, or wait for an administrator to link an existing resource.'} action={<Button icon={Plus} onClick={() => setFormDialog({ open: true, asset: null })}>Register asset</Button>} /></div>
      ) : !error && !filteredAssets.length ? (
        <div className="panel"><EmptyState title="No matching assets" message="Adjust the search to see other assets in your current scope." /></div>
      ) : !error ? (
        <AssetInventory assets={filteredAssets} associationCache={associationCache} isAdmin={isAdmin} onView={openDetails} onEdit={(asset) => setFormDialog({ open: true, asset })} onLink={(asset) => openLink(asset, false)} onDelete={(asset) => setDeleteAssetId(asset.asset_id)} />
      ) : null}

      <AssetFormDialog
        open={formDialog.open}
        asset={formDialog.asset}
        analystMode={!isAdmin}
        activeIncidentCount={activeIncidents.length}
        onClose={() => setFormDialog({ open: false, asset: null })}
        onSave={handleSaveAsset}
      />
      <AssetDetailDialog asset={selectedAsset} association={selectedAsset ? associationCache[selectedAsset.asset_id] : null} onClose={() => setSelectedAssetId(null)} onAssociate={(asset) => openLink(asset, false)} onRequestUnlink={(asset, incident) => setUnlinkTarget({ asset, incident })} />
      <AssetLinkDialog target={linkTarget} incidents={incidents} association={linkTarget ? associationCache[linkTarget.asset.asset_id] : null} onClose={() => setLinkTarget(null)} onLink={handleLink} />
      <ConfirmDialog open={Boolean(deleteAsset)} onClose={() => !confirming && setDeleteAssetId(null)} onConfirm={handleDelete} loading={confirming} title="Delete asset?" confirmLabel="Delete asset" message={deleteAsset ? `Permanently delete ${deleteAsset.name}? The backend will reject deletion if any incident history references this asset.` : ''} />
      <ConfirmDialog open={Boolean(unlinkTarget)} onClose={() => !confirming && setUnlinkTarget(null)} onConfirm={handleUnlink} loading={confirming} title="Remove asset association?" confirmLabel="Unlink asset" message={unlinkTarget ? `Remove ${unlinkTarget.asset.name} from incident #${unlinkTarget.incident.incident_id}? Historical or terminal incidents cannot be modified.` : ''} />
    </div>
  )
}
