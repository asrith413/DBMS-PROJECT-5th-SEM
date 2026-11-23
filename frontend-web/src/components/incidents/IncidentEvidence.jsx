import { useEffect, useState } from 'react'
import {
  Boxes,
  Crosshair,
  Link2,
  LockKeyhole,
  Network,
  Plus,
  Unlink,
} from 'lucide-react'

import Badge from '../common/Badge'
import Button from '../common/Button'
import ConfirmDialog from '../common/ConfirmDialog'
import FormField from '../common/FormField'
import { ErrorState, LoadingState } from '../common/States'
import { TERMINAL_STATUSES } from '../../utils/constants'

function SectionHeading({ icon: Icon, title, description, detail }) {
  return (
    <div className="panel-header">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg border border-cyan-500/20 bg-cyan-400/[0.06] p-2 text-cyan-300">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
        </div>
      </div>
      {detail && <span className="rounded-full border border-slate-700 bg-navy-900 px-2.5 py-1 text-xs font-semibold text-slate-400">{detail}</span>}
    </div>
  )
}

function RestrictedEvidence() {
  return (
    <div className="panel flex min-h-72 items-center justify-center p-8 text-center">
      <div className="max-w-lg">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-blue-500/25 bg-blue-500/[0.06] text-blue-300">
          <LockKeyhole className="h-6 w-6" />
        </span>
        <h2 className="mt-4 font-semibold text-slate-100">Operational evidence is redacted</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Affected asset details and linked threat actors are available only to authorized SOC personnel.
        </p>
      </div>
    </div>
  )
}

function Assets({
  incident,
  inventory,
  inventoryLoading,
  inventoryError,
  busyKey,
  onLink,
  onUnlink,
  onRetryResources,
}) {
  const links = incident.assets || []
  const active = !TERMINAL_STATUSES.has(incident.status)
  const linkedIds = new Set(links.map((link) => link.asset_id))
  const available = inventory.filter((asset) => !linkedIds.has(asset.asset_id))
  const [assetId, setAssetId] = useState('')
  const [impactType, setImpactType] = useState('')
  const [errors, setErrors] = useState({})
  const [unlinkTarget, setUnlinkTarget] = useState(null)

  useEffect(() => {
    if (assetId && !available.some((asset) => String(asset.asset_id) === String(assetId))) setAssetId('')
  }, [assetId, available])

  const submit = async (event) => {
    event.preventDefault()
    const nextErrors = {}
    if (!assetId) nextErrors.assetId = 'Select an asset.'
    if (impactType.trim().length < 2) nextErrors.impactType = 'Enter at least 2 characters.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    const succeeded = await onLink(Number(assetId), impactType.trim())
    if (succeeded) {
      setAssetId('')
      setImpactType('')
    }
  }

  const confirmUnlink = async () => {
    const succeeded = await onUnlink(unlinkTarget.asset_id)
    if (succeeded) setUnlinkTarget(null)
  }
  const unlinking = busyKey === `asset-unlink:${unlinkTarget?.asset_id}`

  return (
    <section className="panel">
      <SectionHeading
        icon={Boxes}
        title="Affected assets"
        description="Inventory records linked through the incident-asset relationship."
        detail={`${links.length} linked`}
      />

      {links.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <Boxes className="mx-auto h-6 w-6 text-slate-700" />
          <p className="mt-3 text-sm font-semibold text-slate-300">No assets linked</p>
          <p className="mt-1 text-xs text-slate-600">Associate an inventory asset while the incident is active.</p>
        </div>
      ) : (
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {links.map((link) => {
            const asset = link.asset || {}
            return (
              <article key={link.asset_id} className="rounded-lg border border-slate-700/70 bg-navy-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{asset.name || `Asset #${link.asset_id}`}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge value={asset.type} />
                      <Badge value={asset.department} />
                    </div>
                  </div>
                  {active && (
                    <Button
                      variant="ghost"
                      icon={Unlink}
                      onClick={() => setUnlinkTarget(link)}
                      disabled={Boolean(busyKey)}
                      className="min-h-9 px-2.5 py-1.5 text-red-300"
                      aria-label={`Unlink ${asset.name || `asset ${link.asset_id}`}`}
                    >
                      <span className="hidden sm:inline">Unlink</span>
                    </Button>
                  )}
                </div>
                <div className="mt-4 space-y-2 border-t border-slate-700/60 pt-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-400"><Network className="h-4 w-4 text-slate-600" /><span className="font-mono">{asset.ip_address || 'No IP address'}</span></div>
                  <div className="flex items-start gap-2 text-slate-400"><Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" /><span>{link.impact_type}</span></div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {active ? (
        <div className="border-t border-slate-700/60 bg-navy-900/35 p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Associate asset</h3>
          {inventoryLoading && inventory.length === 0 ? (
            <LoadingState label="Loading accessible assets..." compact />
          ) : inventoryError ? (
            <ErrorState error={inventoryError} onRetry={onRetryResources} title="Unable to load asset inventory" />
          ) : available.length === 0 ? (
            <p className="text-xs leading-5 text-slate-500">No additional assets are available in your authorized inventory scope.</p>
          ) : (
            <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end" noValidate>
              <FormField label="Asset" required error={errors.assetId}>
                <select
                  className="field-input"
                  value={assetId}
                  onChange={(event) => { setAssetId(event.target.value); setErrors((current) => ({ ...current, assetId: undefined })) }}
                >
                  <option value="">Select accessible asset</option>
                  {available.map((asset) => (
                    <option key={asset.asset_id} value={asset.asset_id}>
                      {asset.name} | {asset.type} | {asset.ip_address || 'no IP'}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Impact type" required error={errors.impactType}>
                <input
                  className="field-input"
                  value={impactType}
                  onChange={(event) => { setImpactType(event.target.value); setErrors((current) => ({ ...current, impactType: undefined })) }}
                  maxLength={120}
                  placeholder="Credentials targeted"
                />
              </FormField>
              <Button
                type="submit"
                icon={Link2}
                loading={busyKey === 'asset-link'}
                disabled={Boolean(busyKey) && busyKey !== 'asset-link'}
                className="w-full lg:w-auto"
              >
                Link asset
              </Button>
            </form>
          )}
        </div>
      ) : (
        <div className="border-t border-slate-700/60 px-5 py-3 text-xs text-slate-500">Asset relationships are read-only after resolution.</div>
      )}

      <ConfirmDialog
        open={Boolean(unlinkTarget)}
        onClose={() => { if (!unlinking) setUnlinkTarget(null) }}
        onConfirm={confirmUnlink}
        title="Unlink affected asset?"
        message={`Remove ${unlinkTarget?.asset?.name || 'this asset'} from incident #${incident.incident_id}? This removes the relationship and writes an audit event; it does not delete the inventory asset.`}
        confirmLabel="Unlink asset"
        loading={unlinking}
      />
    </section>
  )
}

function ThreatActors({
  incident,
  inventory,
  inventoryLoading,
  inventoryError,
  busyKey,
  onLink,
  onUnlink,
  onRetryResources,
}) {
  const links = incident.threat_actors || []
  const active = !TERMINAL_STATUSES.has(incident.status)
  const linkedIds = new Set(links.map((link) => link.actor_id))
  const available = inventory.filter((actor) => !linkedIds.has(actor.actor_id))
  const [actorId, setActorId] = useState('')
  const [unlinkTarget, setUnlinkTarget] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (actorId && !available.some((actor) => String(actor.actor_id) === String(actorId))) setActorId('')
  }, [actorId, available])

  const submit = async (event) => {
    event.preventDefault()
    if (!actorId) {
      setError('Select a threat actor.')
      return
    }
    const succeeded = await onLink(Number(actorId))
    if (succeeded) {
      setActorId('')
      setError('')
    }
  }

  const confirmUnlink = async () => {
    const succeeded = await onUnlink(unlinkTarget.actor_id)
    if (succeeded) setUnlinkTarget(null)
  }
  const unlinking = busyKey === `actor-unlink:${unlinkTarget?.actor_id}`

  return (
    <section className="panel">
      <SectionHeading
        icon={Crosshair}
        title="Threat actors"
        description="Maintained intelligence entities associated with this incident."
        detail={`${links.length} linked`}
      />

      {links.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <Crosshair className="mx-auto h-6 w-6 text-slate-700" />
          <p className="mt-3 text-sm font-semibold text-slate-300">No threat actors linked</p>
          <p className="mt-1 text-xs text-slate-600">No maintained actor has been attributed to this case.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {links.map((link) => {
            const actor = link.threat_actor || {}
            return (
              <article key={link.actor_id} className="flex items-start gap-4 px-5 py-4">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-orange-500/25 bg-orange-500/[0.06] text-orange-300">
                  <Crosshair className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100">{actor.alias || `Actor #${link.actor_id}`}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{actor.description}</p>
                </div>
                {active && (
                  <Button
                    variant="ghost"
                    icon={Unlink}
                    onClick={() => setUnlinkTarget(link)}
                    disabled={Boolean(busyKey)}
                    className="min-h-9 shrink-0 px-2.5 py-1.5 text-red-300"
                    aria-label={`Unlink ${actor.alias || `threat actor ${link.actor_id}`}`}
                  >
                    <span className="hidden sm:inline">Unlink</span>
                  </Button>
                )}
              </article>
            )
          })}
        </div>
      )}

      {active ? (
        <div className="border-t border-slate-700/60 bg-navy-900/35 p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Link threat actor</h3>
          {inventoryLoading && inventory.length === 0 ? (
            <LoadingState label="Loading threat actor inventory..." compact />
          ) : inventoryError ? (
            <ErrorState error={inventoryError} onRetry={onRetryResources} title="Unable to load threat actors" />
          ) : available.length === 0 ? (
            <p className="text-xs leading-5 text-slate-500">No additional maintained threat actors are available to link.</p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4 sm:flex-row sm:items-end" noValidate>
              <FormField label="Threat actor" required error={error} className="flex-1">
                <select className="field-input" value={actorId} onChange={(event) => { setActorId(event.target.value); setError('') }}>
                  <option value="">Select maintained actor</option>
                  {available.map((actor) => <option key={actor.actor_id} value={actor.actor_id}>{actor.alias}</option>)}
                </select>
              </FormField>
              <Button
                type="submit"
                icon={Plus}
                loading={busyKey === 'actor-link'}
                disabled={Boolean(busyKey) && busyKey !== 'actor-link'}
                className="w-full sm:w-auto"
              >
                Link actor
              </Button>
            </form>
          )}
        </div>
      ) : (
        <div className="border-t border-slate-700/60 px-5 py-3 text-xs text-slate-500">Threat actor relationships are read-only after resolution.</div>
      )}

      <ConfirmDialog
        open={Boolean(unlinkTarget)}
        onClose={() => { if (!unlinking) setUnlinkTarget(null) }}
        onConfirm={confirmUnlink}
        title="Unlink threat actor?"
        message={`Remove ${unlinkTarget?.threat_actor?.alias || 'this threat actor'} from incident #${incident.incident_id}? This removes only the relationship and appends an audit event.`}
        confirmLabel="Unlink actor"
        loading={unlinking}
      />
    </section>
  )
}

export default function IncidentEvidence({
  incident,
  role,
  assets,
  threatActors,
  resourcesLoading,
  resourceErrors,
  busyKey,
  onLinkAsset,
  onUnlinkAsset,
  onLinkActor,
  onUnlinkActor,
  onRetryResources,
}) {
  if (role === 'REPORTER') return <RestrictedEvidence />

  return (
    <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
      <Assets
        incident={incident}
        inventory={assets}
        inventoryLoading={resourcesLoading}
        inventoryError={resourceErrors.assets}
        busyKey={busyKey}
        onLink={onLinkAsset}
        onUnlink={onUnlinkAsset}
        onRetryResources={onRetryResources}
      />
      <ThreatActors
        incident={incident}
        inventory={threatActors}
        inventoryLoading={resourcesLoading}
        inventoryError={resourceErrors.threatActors}
        busyKey={busyKey}
        onLink={onLinkActor}
        onUnlink={onUnlinkActor}
        onRetryResources={onRetryResources}
      />
    </div>
  )
}
