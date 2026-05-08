import { createContext, useContext, useEffect, useState } from 'react'
import { clubAPI } from '@/api/api'

const ClubContext = createContext(null)

export function ClubProvider({ children }) {
  const [club, setClub]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    clubAPI.getCurrent()
      .then(r => {
        const c = r.data
        setClub(c)
        applyTheme(c.settings?.theme)
        if (c.name) document.title = c.name
        const logoUrl = c.settings?.theme?.logoUrl
        if (logoUrl) {
          const apiBase = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:8000'
          const fullUrl = logoUrl.startsWith('http') ? logoUrl : `${apiBase}${logoUrl}`
          const link = document.querySelector("link[rel='icon']")
          if (link) link.href = fullUrl
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <ClubContext.Provider value={{ club, loading, setClub }}>
      {children}
    </ClubContext.Provider>
  )
}

export function useClub() {
  return useContext(ClubContext)
}

// Inject CSS variables from the club theme into <html>
function applyTheme(theme) {
  if (!theme) return
  const root = document.documentElement
  if (theme.primaryColor) root.style.setProperty('--color-primary',      theme.primaryColor)
  if (theme.primaryDark)  root.style.setProperty('--color-primary-dark', theme.primaryDark)
}
