import { Outlet, useLocation, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Navbar from './Navbar'
import Footer from './Footer'
import { useAuth } from '@/context/AuthContext'
import { messagesAPI } from '@/api/api'

function MessagesFAB() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) return
    const fetch = () => messagesAPI.getUnreadCount().then(({ data }) => setUnread(data.count)).catch(() => {})
    fetch()
    const id = setInterval(fetch, 10000)
    return () => clearInterval(id)
  }, [user])

  if (!user || pathname === '/messages') return null

  return (
    <Link
      to="/messages"
      className="fixed bottom-6 right-4 z-[9998] w-14 h-14 bg-white rounded-full shadow-lg border border-gray-200 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
    >
      <svg className="w-6 h-6 text-gray-800" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
      </svg>
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-[#07c160] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}

export default function RootLayout() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 pt-[84px]">
        <Outlet />
      </main>
      <Footer />
      <MessagesFAB />
    </div>
  )
}
