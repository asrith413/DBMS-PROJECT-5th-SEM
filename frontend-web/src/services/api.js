import axios from 'axios'

export const TOKEN_KEY = 'cims_access_token'
export const USER_KEY = 'cims_current_user'

const baseURL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export const http = axios.create({
  baseURL,
  timeout: 30000,
  headers: { Accept: 'application/json' },
})

http.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY)
      sessionStorage.removeItem(USER_KEY)
      window.dispatchEvent(new CustomEvent('cims:unauthorized'))
    }
    return Promise.reject(normalizeApiError(error))
  },
)

export function normalizeApiError(error) {
  if (error?.isCimsApiError) return error
  const status = error.response?.status ?? null
  const body = error.response?.data
  let message = 'The request could not be completed.'
  let fields = []

  if (!error.response) {
    message = error.code === 'ECONNABORTED'
      ? 'The API request timed out.'
      : 'Cannot reach the CIMS API. Confirm that FastAPI is running.'
  } else if (Array.isArray(body?.detail)) {
    fields = body.detail.map((item) => ({
      field: (item.loc || []).filter((part) => part !== 'body').join('.'),
      message: item.msg || 'Invalid value',
    }))
    message = fields.map((item) => item.field ? `${item.field}: ${item.message}` : item.message).join('; ')
  } else if (typeof body?.detail === 'string') {
    message = body.detail
  } else if (typeof body === 'string' && body.trim()) {
    message = body.trim()
  } else if (status === 403) {
    message = 'Your role does not permit this operation.'
  } else if (status === 404) {
    message = 'The requested record was not found or is not accessible.'
  }

  return {
    name: 'CimsApiError',
    isCimsApiError: true,
    status,
    message,
    fields,
    original: error,
  }
}

const cleanParams = (params) => Object.fromEntries(
  Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
)

export const api = {
  baseURL,
  auth: {
    login: async (email, password) => {
      const form = new URLSearchParams({ username: email, password })
      return (await http.post('/auth/login', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })).data
    },
    me: async () => (await http.get('/auth/me')).data,
    register: async (payload) => (await http.post('/auth/register', payload)).data,
  },
  system: {
    dependencies: async () => (await http.get('/health/dependencies')).data,
  },
  incidents: {
    list: async (params = {}) => (await http.get('/incidents', { params: cleanParams(params) })).data,
    get: async (id) => (await http.get(`/incidents/${id}`)).data,
    create: async (payload) => (await http.post('/incidents', payload)).data,
    update: async (id, payload) => (await http.patch(`/incidents/${id}`, payload)).data,
    remove: async (id) => (await http.delete(`/incidents/${id}`)).data,
    suggestSeverity: async (payload) => (await http.post('/incidents/suggest-severity', payload)).data,
  },
  incidentTypes: {
    list: async () => (await http.get('/incident-types')).data,
    create: async (payload) => (await http.post('/incident-types', payload)).data,
    update: async (id, payload) => (await http.patch(`/incident-types/${id}`, payload)).data,
    remove: async (id) => (await http.delete(`/incident-types/${id}`)).data,
  },
  severities: {
    list: async () => (await http.get('/severity')).data,
    create: async (payload) => (await http.post('/severity', payload)).data,
    update: async (id, payload) => (await http.patch(`/severity/${id}`, payload)).data,
    remove: async (id) => (await http.delete(`/severity/${id}`)).data,
  },
  assignments: {
    list: async () => (await http.get('/assignments')).data,
    forIncident: async (incidentId) => (await http.get(`/assignments/incident/${incidentId}`)).data,
    create: async (payload) => (await http.post('/assignments', payload)).data,
  },
  actions: {
    forIncident: async (incidentId) => (await http.get(`/actions/incident/${incidentId}`)).data,
    create: async (incidentId, description) => (
      await http.post(`/actions/incident/${incidentId}`, { description })
    ).data,
  },
  users: {
    list: async () => (await http.get('/users')).data,
    create: async (payload) => (await http.post('/users', payload)).data,
    update: async (id, payload) => (await http.patch(`/users/${id}`, payload)).data,
    remove: async (id) => (await http.delete(`/users/${id}`)).data,
  },
  analysts: {
    list: async () => (await http.get('/analysts')).data,
    get: async (id) => (await http.get(`/analysts/${id}`)).data,
    create: async (payload) => (await http.post('/analysts', payload)).data,
    update: async (id, payload) => (await http.patch(`/analysts/${id}`, payload)).data,
    remove: async (id) => (await http.delete(`/analysts/${id}`)).data,
  },
  assets: {
    list: async () => (await http.get('/assets')).data,
    get: async (id) => (await http.get(`/assets/${id}`)).data,
    incidents: async (id) => (await http.get(`/assets/${id}/incidents`)).data,
    create: async (payload) => (await http.post('/assets', payload)).data,
    update: async (id, payload) => (await http.patch(`/assets/${id}`, payload)).data,
    remove: async (id) => (await http.delete(`/assets/${id}`)).data,
    link: async (assetId, incidentId, impactType) => (
      await http.post(`/assets/${assetId}/incidents/${incidentId}`, { impact_type: impactType })
    ).data,
    unlink: async (assetId, incidentId) => (
      await http.delete(`/assets/${assetId}/incidents/${incidentId}`)
    ).data,
  },
  threatActors: {
    list: async () => (await http.get('/threat-actors')).data,
    create: async (payload) => (await http.post('/threat-actors', payload)).data,
    update: async (id, payload) => (await http.patch(`/threat-actors/${id}`, payload)).data,
    remove: async (id) => (await http.delete(`/threat-actors/${id}`)).data,
    link: async (actorId, incidentId) => (
      await http.post(`/threat-actors/${actorId}/incidents/${incidentId}`)
    ).data,
    unlink: async (actorId, incidentId) => (
      await http.delete(`/threat-actors/${actorId}/incidents/${incidentId}`)
    ).data,
  },
  securityLogs: {
    list: async (params = {}) => (await http.get('/security-logs', { params: cleanParams(params) })).data,
    forIncident: async (incidentId) => (await http.get(`/security-logs/incident/${incidentId}`)).data,
    create: async (payload) => (await http.post('/security-logs', payload)).data,
  },
  audit: {
    list: async (params = {}) => (await http.get('/audit', { params: cleanParams(params) })).data,
    verify: async () => (await http.get('/audit/verify')).data,
  },
  reports: {
    dashboard: async () => (await http.get('/reports/dashboard')).data,
    csv: async () => (await http.get('/reports/incidents.csv', { responseType: 'blob' })),
  },
}
