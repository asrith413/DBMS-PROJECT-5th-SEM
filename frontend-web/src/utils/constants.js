export const INCIDENT_STATUSES = [
  'Open',
  'Assigned',
  'Under Investigation',
  'In Progress',
  'Resolved',
  'Closed',
]

export const NEXT_STATUS = {
  Assigned: 'Under Investigation',
  'Under Investigation': 'In Progress',
  'In Progress': 'Resolved',
  Resolved: 'Closed',
}

export const TERMINAL_STATUSES = new Set(['Resolved', 'Closed'])
export const SECURITY_SEVERITIES = ['Low', 'Medium', 'High', 'Critical']

export const roleHome = {
  ADMIN: '/dashboard',
  ANALYST: '/dashboard',
  REPORTER: '/dashboard',
}
