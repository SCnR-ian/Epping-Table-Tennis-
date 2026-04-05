import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { messagesAPI, adminAPI } from '@/api/api'

function fmtTime(ts) {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function Avatar({ name, size = 'md', unread = false }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  const bg = unread ? 'bg-green-500' : 'bg-gray-300'
  return (
    <div className={`${sz} ${bg} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}>
      {name?.[0]?.toUpperCase()}
    </div>
  )
}

export default function MessagesPage() {
  const { user, isAdmin } = useAuth()
  const [view, setView] = useState('inbox')
  const [inbox, setInbox] = useState({ announcements: [], threads: [] })
  const [thread, setThread] = useState([])
  const [threadUser, setThreadUser] = useState(null)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState([])
  const [composeRecipient, setComposeRecipient] = useState(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [admins, setAdmins] = useState([])
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const threadContainerRef = useRef(null)
  const inputRef = useRef(null)
  const [threadHeight, setThreadHeight] = useState(null)

  // Resize thread container when iOS keyboard opens/closes
  useEffect(() => {
    if (view !== 'thread') return
    const updateHeight = () => {
      const vv = window.visualViewport
      if (vv) setThreadHeight(vv.height)
    }
    updateHeight()
    window.visualViewport?.addEventListener('resize', updateHeight)
    window.visualViewport?.addEventListener('scroll', updateHeight)
    return () => {
      window.visualViewport?.removeEventListener('resize', updateHeight)
      window.visualViewport?.removeEventListener('scroll', updateHeight)
    }
  }, [view])

  const scrollToBottom = useCallback(() => {
    const el = messagesContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const loadInbox = useCallback(async () => {
    try {
      const { data } = await messagesAPI.getInbox()
      setInbox(data)
    } catch {}
  }, [])

  const loadThread = useCallback(async (uid, scrollDown = false) => {
    try {
      const { data } = await messagesAPI.getThread(uid)
      setThread(data.messages)
      if (scrollDown) setTimeout(() => scrollToBottom(), 50)
    } catch {}
  }, [scrollToBottom])

  useEffect(() => {
    loadInbox().then(() => setLoading(false))
    if (isAdmin) {
      adminAPI.getAllMembers().then(({ data }) => setMembers(data.members ?? [])).catch(() => {})
    } else {
      adminAPI.getAllMembers().then(({ data }) => {
        setAdmins((data.members ?? []).filter(m => m.role === 'admin'))
      }).catch(() => {})
    }
  }, [isAdmin, loadInbox])

  // Poll every 10s — don't auto-scroll on poll updates
  useEffect(() => {
    const interval = setInterval(() => {
      loadInbox()
      if (view === 'thread' && threadUser) loadThread(threadUser.id, false)
    }, 10000)
    return () => clearInterval(interval)
  }, [view, threadUser, loadInbox, loadThread])

  const openThread = async (otherUser) => {
    setThreadUser(otherUser)
    setView('thread')
    await loadThread(otherUser.id, true)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleSend = async () => {
    if (!body.trim() || sending) return
    setSending(true)
    try {
      await messagesAPI.send({
        recipient_id: view === 'compose' ? (composeRecipient?.id ?? null) : threadUser?.id,
        body: body.trim(),
      })
      setBody('')
      if (view === 'compose') {
        if (composeRecipient) {
          setThreadUser(composeRecipient)
          setView('thread')
          await loadThread(composeRecipient.id, true)
        } else {
          setView('inbox')
        }
      } else {
        await loadThread(threadUser.id, true)
      }
      await loadInbox()
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not send message.')
    } finally {
      setSending(false)
    }
  }

  const filteredMembers = memberSearch
    ? members.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()) && m.id !== user?.id)
    : members.filter(m => m.id !== user?.id)

  // ── Thread view (full-screen fixed layout like WeChat) ──────────────────────
  if (view === 'thread') {
    return (
      <div
        ref={threadContainerRef}
        className="fixed inset-x-0 top-[84px] flex flex-col bg-[#f5f5f5]"
        style={{ height: threadHeight ? threadHeight - 84 : 'calc(100dvh - 84px)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => { setView('inbox'); setThread([]); setThreadUser(null); setBody('') }}
            className="p-1 -ml-1 text-gray-600 hover:text-black"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="flex-1 text-center">
            <p className="text-sm font-semibold text-gray-900">{threadUser?.name}</p>
          </div>
          <div className="w-7" />
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {thread.length === 0 && (
            <p className="text-center text-gray-400 text-xs py-8">No messages yet. Say hello!</p>
          )}
          {thread.map((msg, i) => {
            const isMe = msg.sender_id === user?.id
            const showTime = i === 0 || (new Date(msg.created_at) - new Date(thread[i - 1].created_at)) > 5 * 60 * 1000
            return (
              <div key={msg.id}>
                {showTime && (
                  <p className="text-center text-[10px] text-gray-400 py-2">{fmtTime(msg.created_at)}</p>
                )}
                <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  {!isMe && <Avatar name={msg.sender_name} size="sm" />}
                  <div className={`max-w-[70%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? 'bg-[#07c160] text-white rounded-br-sm'
                      : 'bg-white text-gray-900 rounded-bl-sm shadow-sm'
                  }`}>
                    {msg.body}
                  </div>
                  {isMe && <div className="w-8 shrink-0" />}
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="shrink-0 bg-white border-t border-gray-200 px-3 py-2 flex items-center gap-2 pb-[max(env(safe-area-inset-bottom),8px)]">
          <input
            ref={inputRef}
            type="text"
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message…"
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm text-black placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-300 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!body.trim() || sending}
            className="w-9 h-9 rounded-full bg-[#07c160] disabled:bg-gray-200 flex items-center justify-center shrink-0 transition-colors"
          >
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // ── Inbox & Compose ─────────────────────────────────────────────────────────
  if (loading) return (
    <div className="page-wrapper py-8 px-4">
      <p className="text-gray-400 text-sm">Loading…</p>
    </div>
  )

  return (
    <div className="page-wrapper pb-28 bg-[#f5f5f5] min-h-screen">

      {/* ── Inbox ── */}
      {view === 'inbox' && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-200">
            <h1 className="text-base font-semibold text-gray-900">Messages</h1>
            <button
              onClick={() => { setView('compose'); setBody(''); setComposeRecipient(null); setMemberSearch('') }}
              className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-black"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>

          <div className="bg-white divide-y divide-gray-100">
            {/* Announcements */}
            {inbox.announcements.map(msg => (
              <div key={msg.id} className={`flex items-start gap-3 px-4 py-3 ${!msg.is_read ? 'bg-green-50/40' : ''}`}>
                <div className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">Announcement</p>
                    <p className="text-xs text-gray-400">{fmtTime(msg.created_at)}</p>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{msg.body}</p>
                </div>
                {!msg.is_read && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 mt-1.5" />}
              </div>
            ))}

            {/* DM threads */}
            {inbox.threads.map(t => {
              const unread = !t.is_read && t.sender_id !== user?.id
              return (
                <button key={t.other_user}
                  onClick={() => openThread({ id: t.other_user, name: t.other_name })}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors"
                >
                  <Avatar name={t.other_name} unread={unread} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm ${unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>{t.other_name}</p>
                      <p className="text-xs text-gray-400 shrink-0 ml-2">{fmtTime(t.created_at)}</p>
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${unread ? 'text-gray-700' : 'text-gray-400'}`}>
                      {t.sender_id === user?.id ? 'You: ' : ''}{t.body}
                    </p>
                  </div>
                  {unread && <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] text-white font-bold shrink-0">1</span>}
                </button>
              )
            })}

            {inbox.threads.length === 0 && inbox.announcements.length === 0 && (
              <div className="text-center py-16 text-gray-400 text-sm">No messages yet.</div>
            )}
          </div>
        </>
      )}

      {/* ── Compose ── */}
      {view === 'compose' && (
        <>
          <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-200">
            <button onClick={() => { setView('inbox'); setBody(''); setComposeRecipient(null) }} className="text-gray-600 hover:text-black">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <h2 className="flex-1 text-center text-sm font-semibold text-gray-900">New Message</h2>
            <div className="w-5" />
          </div>

          <div className="px-4 py-4 space-y-4">
            {isAdmin ? (
              <div className="bg-white rounded-2xl p-4 space-y-3">
                <p className="text-xs text-gray-400 uppercase tracking-wider">To</p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setComposeRecipient(null)}
                    className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${!composeRecipient ? 'bg-[#07c160] text-white border-[#07c160]' : 'border-gray-300 text-gray-600'}`}>
                    📢 Everyone
                  </button>
                  <button onClick={() => setComposeRecipient('pick')}
                    className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${composeRecipient && composeRecipient !== 'pick' ? 'bg-[#07c160] text-white border-[#07c160]' : 'border-gray-300 text-gray-600'}`}>
                    👤 Specific member
                  </button>
                </div>
                {(composeRecipient === 'pick' || (composeRecipient && typeof composeRecipient === 'object')) && (
                  composeRecipient && typeof composeRecipient === 'object' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{composeRecipient.name}</span>
                      <button onClick={() => { setComposeRecipient('pick'); setMemberSearch('') }} className="text-xs text-gray-400">Change</button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input type="text" placeholder="Search member…" value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        className="w-full bg-gray-100 rounded-full px-4 py-2 text-sm focus:outline-none" autoFocus />
                      <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100 bg-white divide-y divide-gray-100">
                        {filteredMembers.slice(0, 10).map(m => (
                          <button key={m.id} onClick={() => { setComposeRecipient({ id: m.id, name: m.name }); setMemberSearch('') }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 flex items-center gap-3">
                            <Avatar name={m.name} size="sm" />
                            <span>{m.name} <span className="text-xs text-gray-400">{m.role}</span></span>
                          </button>
                        ))}
                        {filteredMembers.length === 0 && <p className="px-4 py-3 text-xs text-gray-400">No members found.</p>}
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-4 space-y-2">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">To</p>
                {admins.map(a => (
                  <button key={a.id} onClick={() => setComposeRecipient({ id: a.id, name: a.name })}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${composeRecipient?.id === a.id ? 'border-[#07c160] bg-green-50' : 'border-gray-100 hover:border-gray-300'}`}>
                    <Avatar name={a.name} size="sm" />
                    <span className="text-sm text-gray-800">{a.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="bg-white rounded-2xl p-4 space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Message</p>
              <textarea value={body} onChange={e => setBody(e.target.value)}
                placeholder="Type your message…" rows={5}
                className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm text-black placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-200 transition-all resize-none"
              />
            </div>

            <button onClick={handleSend}
              disabled={!body.trim() || sending || (isAdmin && composeRecipient === 'pick') || (!isAdmin && !composeRecipient)}
              className="w-full bg-[#07c160] disabled:bg-gray-200 text-white rounded-full py-3.5 text-sm font-medium tracking-wide transition-colors">
              {sending ? 'Sending…' : composeRecipient === null && isAdmin ? '📢 Send Announcement' : 'Send Message'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
