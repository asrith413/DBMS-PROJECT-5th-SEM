import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { api, TOKEN_KEY, USER_KEY } from '../services/api'

const AuthContext = createContext(null)

const readStoredUser = () => {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null')
  } catch {
    sessionStorage.removeItem(USER_KEY)
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser)
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY))
  const [loading, setLoading] = useState(Boolean(token))

  const clearSession = () => {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
    setLoading(false)
  }

  useEffect(() => {
    const onUnauthorized = () => clearSession()
    window.addEventListener('cims:unauthorized', onUnauthorized)
    return () => window.removeEventListener('cims:unauthorized', onUnauthorized)
  }, [])

  useEffect(() => {
    let active = true
    if (!token) {
      setLoading(false)
      return undefined
    }

    setLoading(true)
    api.auth.me()
      .then((currentUser) => {
        if (!active) return
        sessionStorage.setItem(USER_KEY, JSON.stringify(currentUser))
        setUser(currentUser)
      })
      .catch(() => {
        if (active) clearSession()
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [token])

  const login = async (email, password) => {
    const result = await api.auth.login(email, password)
    sessionStorage.setItem(TOKEN_KEY, result.access_token)
    sessionStorage.setItem(USER_KEY, JSON.stringify(result.user))
    setUser(result.user)
    setToken(result.access_token)
    setLoading(false)
    return result.user
  }

  const refreshUser = async () => {
    const currentUser = await api.auth.me()
    sessionStorage.setItem(USER_KEY, JSON.stringify(currentUser))
    setUser(currentUser)
    return currentUser
  }

  const value = useMemo(() => ({
    user,
    token,
    loading,
    isAuthenticated: Boolean(token && user),
    login,
    logout: clearSession,
    refreshUser,
  }), [user, token, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
