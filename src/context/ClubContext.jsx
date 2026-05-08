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
        applyManifest(c)
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

// Dynamically update the PWA manifest with club name, color, and logo
function applyManifest(club) {
  const apiBase = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:8000'
  const logoUrl = club.settings?.theme?.logoUrl
  const iconUrl = logoUrl
    ? (logoUrl.startsWith('http') ? logoUrl : `${apiBase}${logoUrl}`)
    : null

  const manifest = {
    name: club.name,
    short_name: club.name,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: club.settings?.theme?.primaryColor || '#111111',
    icons: iconUrl
      ? [
          { src: iconUrl, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: iconUrl, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ]
      : [],
  }

  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.querySelector('link[rel="manifest"]')
  if (link) link.href = url
}
