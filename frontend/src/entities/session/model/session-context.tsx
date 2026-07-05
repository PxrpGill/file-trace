import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getToken } from '@/shared/api'
import type { User } from '@/entities/user'
import { fetchCurrentUser } from '../api/session-api'

interface SessionState {
  user: User | null
  loading: boolean
  setUser: (user: User | null) => void
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    if (!getToken()) {
      setUser(null)
      return
    }
    setUser(await fetchCurrentUser())
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  return (
    <SessionContext.Provider value={{ user, loading, setUser, refresh }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession outside SessionProvider')
  return ctx
}
