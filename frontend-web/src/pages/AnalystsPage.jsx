import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, BriefcaseBusiness, RefreshCw, Search, ShieldPlus, UserCheck, UserPlus, Users } from 'lucide-react'

import AnalystRoster from '../components/analysts/AnalystRoster'
import {
  AnalystDetailDialog,
  AssignmentDialog,
  ExpertiseDialog,
  ProvisionAnalystDialog,
} from '../components/analysts/AnalystDialogs'
import Button from '../components/common/Button'
import ConfirmDialog from '../components/common/ConfirmDialog'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import { useToast } from '../context/ToastContext'
import { api } from '../services/api'

const TERMINAL_STATUSES = new Set(['Resolved', 'Closed'])

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
  const labels = {
    403: 'Permission denied',
    404: 'Record unavailable',
    409: 'Conflict',
    422: 'Validation failed',
  }
  const prefix = labels[error?.status] || 'Request failed'
  return `${action}: ${prefix}. ${error?.message || 'The request could not be completed.'}`
}

export default function AnalystsPage() {
  const { notify } = useToast()
  const [resources, setResources] = useState({ analysts: [], assignments: [], incidents: [], users: [] })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedAnalystId, setSelectedAnalystId] = useState(null)
  const [expertiseAnalystId, setExpertiseAnalystId] = useState(null)
  const [assignmentDialog, setAssignmentDialog] = useState({ open: false, analystId: null })
  const [provisionDialog, setProvisionDialog] = useState({ open: false, resume: null })
  const [partialProfile, setPartialProfile] = useState(null)
  const [removeAnalystId, setRemoveAnalystId] = useState(null)
  const [removing, setRemoving] = useState(false)

  const loadResources = useCallback(async (showInitialLoader = false) => {
    if (showInitialLoader) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const [analysts, assignments, incidents, users] = await Promise.all([
        api.analysts.list(),
        api.assignments.list(),
        loadAllIncidents(),
        api.users.list(),
      ])
      setResources({ analysts, assignments, incidents, users })
      return { analysts, assignments, incidents, users }
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

  const enrichedAnalysts = useMemo(() => {
    const incidentsById = new Map(resources.incidents.map((incident) => [incident.incident_id, incident]))
    const usersById = new Map(resources.users.map((user) => [user.user_id, user]))
    return resources.analysts.map((analyst) => {
      const assignmentRecords = resources.assignments
        .filter((assignment) => assignment.analyst_id === analyst.user_id)
        .map((assignment) => ({ assignment, incident: incidentsById.get(assignment.incident_id) || null }))
        .sort((left, right) => new Date(right.assignment.assigned_date) - new Date(left.assignment.assigned_date))
      const activeAssignments = assignmentRecords.filter(({ incident }) => incident && !TERMINAL_STATUSES.has(incident.status))
      return {
        ...analyst,
        department: usersById.get(analyst.user_id)?.department || null,
        assignmentRecords,
        activeAssignments,
      }
    })
  }, [resources])

  const analystsById = useMemo(() => new Map(enrichedAnalysts.map((analyst) => [analyst.user_id, analyst])), [enrichedAnalysts])
  const selectedAnalyst = analystsById.get(selectedAnalystId) || null
  const expertiseAnalyst = analystsById.get(expertiseAnalystId) || null
  const removeAnalyst = analystsById.get(removeAnalystId) || null

  const eligibleUsers = useMemo(() => {
    const profileIds = new Set(resources.analysts.map((analyst) => analyst.user_id))
    return resources.users.filter((user) => user.role === 'ANALYST' && !profileIds.has(user.user_id))
  }, [resources.analysts, resources.users])

  const filteredAnalysts = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return enrichedAnalysts
    return enrichedAnalysts.filter((analyst) => [
      analyst.user.name,
      analyst.user.email,
      analyst.department,
      analyst.expertise,
    ].some((value) => String(value || '').toLowerCase().includes(query)))
  }, [enrichedAnalysts, search])

  const activeAssignmentCount = enrichedAnalysts.reduce((total, analyst) => total + analyst.activeAssignments.length, 0)
  const workloadTotal = enrichedAnalysts.reduce((total, analyst) => total + analyst.workload, 0)

  const handleRefresh = async () => {
    try {
      await loadResources(false)
      notify('Analyst roster refreshed from current assignments and incidents.', 'success')
    } catch (requestError) {
      notify(describeError('Refresh failed', requestError), 'error')
    }
  }

  const handleExpertiseSave = async (analyst, expertise) => {
    try {
      await api.analysts.update(analyst.user_id, { expertise })
    } catch (requestError) {
      notify(describeError('Expertise update failed', requestError), 'error')
      throw requestError
    }
    try {
      await loadResources(false)
      notify(`Expertise updated for ${analyst.user.name}.`, 'success')
    } catch (refreshError) {
      notify(describeError('Expertise was updated, but roster refresh failed', refreshError), 'info')
    }
  }

  const handleAssignment = async (payload) => {
    try {
      await api.assignments.create(payload)
    } catch (requestError) {
      notify(describeError('Assignment failed', requestError), 'error')
      throw requestError
    }
    try {
      await loadResources(false)
      notify('Incident assignment created and workload refreshed.', 'success')
    } catch (refreshError) {
      notify(describeError('Assignment was created, but roster refresh failed', refreshError), 'info')
    }
  }

  const handleProvision = async ({ expertise, ...account }) => {
    let user
    try {
      user = await api.users.create({ ...account, role: 'ANALYST' })
    } catch (requestError) {
      notify(describeError('Analyst account creation failed', requestError), 'error')
      throw requestError
    }

    try {
      await api.analysts.create({ user_id: user.user_id, expertise })
    } catch (requestError) {
      const partial = { user, expertise, error: requestError }
      let refreshed = null
      try {
        refreshed = await loadResources(false)
      } catch {
        // The created account is still retained in the explicit partial state.
      }
      if (refreshed?.analysts.some((analyst) => analyst.user_id === user.user_id)) {
        setPartialProfile(null)
        notify(`Analyst profile for ${user.name} was confirmed after an ambiguous API response.`, 'success')
        return { partial: false, user }
      }
      setPartialProfile(partial)
      notify(`Account ${user.email} was created, but its analyst profile failed: ${requestError.message}`, 'error', 9000)
      return { partial: true, ...partial }
    }

    setPartialProfile(null)
    try {
      await loadResources(false)
      notify(`Analyst account and profile created for ${user.name}.`, 'success')
    } catch (refreshError) {
      notify(describeError('Account and profile were created, but roster refresh failed', refreshError), 'info')
    }
    return { partial: false, user }
  }

  const handleAttach = async (payload) => {
    const attachedUser = resources.users.find((user) => user.user_id === payload.user_id)
    try {
      await api.analysts.create(payload)
    } catch (requestError) {
      if (requestError.status === 409) {
        try {
          const refreshed = await loadResources(false)
          if (refreshed.analysts.some((analyst) => analyst.user_id === payload.user_id)) {
            setPartialProfile((current) => current?.user.user_id === payload.user_id ? null : current)
            notify(`Existing analyst profile${attachedUser ? ` for ${attachedUser.name}` : ''} was confirmed.`, 'success')
            return
          }
        } catch {
          // Keep the original profile conflict as the actionable form error.
        }
      }
      notify(describeError('Profile attachment failed', requestError), 'error')
      throw requestError
    }
    setPartialProfile((current) => current?.user.user_id === payload.user_id ? null : current)
    try {
      await loadResources(false)
      notify(`Analyst profile attached${attachedUser ? ` to ${attachedUser.name}` : ''}.`, 'success')
    } catch (refreshError) {
      notify(describeError('Profile was attached, but roster refresh failed', refreshError), 'info')
    }
  }

  const handleRemove = async () => {
    if (!removeAnalyst) return
    setRemoving(true)
    try {
      await api.analysts.remove(removeAnalyst.user_id)
    } catch (requestError) {
      notify(describeError('Profile removal failed', requestError), 'error')
      setRemoving(false)
      return
    }
    setRemoveAnalystId(null)
    if (selectedAnalystId === removeAnalyst.user_id) setSelectedAnalystId(null)
    try {
      await loadResources(false)
      notify(`${removeAnalyst.user.name}'s analyst profile was removed; the account is now REPORTER.`, 'success')
    } catch (refreshError) {
      notify(describeError('Profile was removed, but roster refresh failed', refreshError), 'info')
    } finally {
      setRemoving(false)
    }
  }

  const openAssignment = (analyst = null) => {
    setSelectedAnalystId(null)
    setAssignmentDialog({ open: true, analystId: analyst?.user_id || null })
  }

  if (loading) return <LoadingState label="Building analyst roster from live assignments..." />

  return (
    <div>
      <PageHeader
        eyebrow="Administration / Workforce"
        title="Analyst Roster"
        description="Provision response staff, maintain expertise, and allocate active incidents using authoritative user, profile, assignment, and incident records."
        actions={(
          <>
            <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={handleRefresh}>Refresh</Button>
            <Button variant="secondary" icon={ShieldPlus} onClick={() => openAssignment()}>Assign incident</Button>
            <Button icon={UserPlus} onClick={() => setProvisionDialog({ open: true, resume: null })}>Provision analyst</Button>
          </>
        )}
      />

      {error && <div className="mb-5"><ErrorState error={error} onRetry={() => loadResources(true).catch(() => {})} title="Unable to load the analyst roster" /></div>}

      {partialProfile && (
        <div className="mb-5 flex flex-col gap-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-100">Incomplete analyst provisioning</p>
            <p className="mt-1 text-sm leading-6 text-amber-100/70">
              User #{partialProfile.user.user_id} ({partialProfile.user.email}) exists with the ANALYST role, but no analyst profile was created. Resume the second API step before assigning incidents.
            </p>
          </div>
          <Button variant="secondary" icon={UserCheck} onClick={() => setProvisionDialog({ open: true, resume: partialProfile })}>Resume profile</Button>
        </div>
      )}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Roster profiles" value={enrichedAnalysts.length} icon={Users} detail="Attached analyst profiles" />
        <StatCard label="Profile workload" value={workloadTotal} icon={BriefcaseBusiness} tone="blue" detail="Current backend counters" />
        <StatCard label="Active assignments" value={activeAssignmentCount} icon={Activity} tone="green" detail="Derived from incident status" />
        <StatCard label="Awaiting profile" value={eligibleUsers.length} icon={UserCheck} tone={eligibleUsers.length ? 'yellow' : 'cyan'} detail="ANALYST users without profiles" />
      </section>

      <section className="panel mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <input className="field-input pl-9" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, department, expertise..." aria-label="Search analyst roster" />
          </div>
          <p className="text-xs text-slate-500"><span className="font-mono text-cyan-300">{filteredAnalysts.length}</span> of {enrichedAnalysts.length} profiles</p>
        </div>
      </section>

      {!error && !enrichedAnalysts.length ? (
        <div className="panel"><EmptyState title="No analyst profiles" message="Create an analyst account and profile, or attach a profile to an existing ANALYST user." action={<Button icon={UserPlus} onClick={() => setProvisionDialog({ open: true, resume: null })}>Provision first analyst</Button>} /></div>
      ) : !error && !filteredAnalysts.length ? (
        <div className="panel"><EmptyState title="No matching analysts" message="Adjust the roster search to see other profiles." /></div>
      ) : !error ? (
        <AnalystRoster
          analysts={filteredAnalysts}
          onView={(analyst) => setSelectedAnalystId(analyst.user_id)}
          onEdit={(analyst) => setExpertiseAnalystId(analyst.user_id)}
          onAssign={openAssignment}
          onRemove={(analyst) => setRemoveAnalystId(analyst.user_id)}
        />
      ) : null}

      <AnalystDetailDialog analyst={selectedAnalyst} onClose={() => setSelectedAnalystId(null)} onAssign={openAssignment} />
      <ExpertiseDialog analyst={expertiseAnalyst} onClose={() => setExpertiseAnalystId(null)} onSave={handleExpertiseSave} />
      <AssignmentDialog
        open={assignmentDialog.open}
        analysts={enrichedAnalysts}
        incidents={resources.incidents}
        assignments={resources.assignments}
        initialAnalyst={analystsById.get(assignmentDialog.analystId) || null}
        onClose={() => setAssignmentDialog({ open: false, analystId: null })}
        onAssign={handleAssignment}
      />
      <ProvisionAnalystDialog
        open={provisionDialog.open}
        eligibleUsers={eligibleUsers}
        resumeAccount={provisionDialog.resume}
        onClose={() => setProvisionDialog({ open: false, resume: null })}
        onProvision={handleProvision}
        onAttach={handleAttach}
      />
      <ConfirmDialog
        open={Boolean(removeAnalyst)}
        onClose={() => !removing && setRemoveAnalystId(null)}
        onConfirm={handleRemove}
        loading={removing}
        title="Remove analyst profile?"
        confirmLabel="Remove profile"
        message={removeAnalyst ? `Remove ${removeAnalyst.user.name}'s analyst profile? The account will be retained and demoted to REPORTER. Profiles with assignment history cannot be removed.` : ''}
      />
    </div>
  )
}
