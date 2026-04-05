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

export default function MessagesPage() {
  const { user, isAdmin } = useAuth()
  const [view, setView] = useState('inbox') // 'inbox' | 'thread' | 'compose'
  const [inbox, setInbox] = useState({ announcements: [], threads: [] })
  const [thread, setThread] = useState([])
  const [threadUser, setThreadUser] = useState(null) // { id, name }
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState([]) // for admin compose picker
  const [composeRecipient, setComposeRecipient] = useState(null) // null=broadcast, or { id, name }
  const [memberSearch, setMemberSearch] = useState('')
  const [admins, setAdmins] = useState([]) // for members to pick admin
  const bottomRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const initialScrollDone = useRef(false)

  const loadInbox = useCallback(async () => {
    try {
      const { data } = await messagesAPI.getInbox()
      setInbox(data)
    } catch {}
  }, [])

  const loadThread = useCallback(async (uid) => {
    try {
      const { data } = await messagesAPI.getThread(uid)
      setThread(data.messages)
    } catch {}
  }, [])

  useEffect(() => {
    loadInbox().then(() => setLoading(false))
    // Load members for admin compose
    if (isAdmin) {
      adminAPI.getAllMembers().then(({ data }) => setMembers(data.members ?? [])).catch(() => {})
    } else {
      // Load admins for member to message
      adminAPI.getAllMembers().then(({ data }) => {
        setAdmins((data.members ?? []).filter(m => m.role === 'admin'))
      }).catch(() => {})
    }
  }, [isAdmin, loadInbox])

  // Poll for new messages every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      loadInbox()
      if (view === 'thread' && threadUser) loadThread(threadUser.id)
    }, 10000)
    return () => clearInterval(interval)
  }, [view, threadUser, loadInbox, loadThread])

  // Scroll messages container to bottom on initial thread open and after sending
  useEffect(() => {
    if (thread.length > 0 && !initialScrollDone.current) {
      const el = messagesContainerRef.current
      if (el) el.scrollTop = el.scrollHeight
      initialScrollDone.current = true
    }
  }, [thread])

  const openThread = async (otherUser) => {
    initialScrollDone.current = false
    setThreadUser(otherUser)
    setView('thread')
    await loadThread(otherUser.id)
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
      initialScrollDone.current = false
      if (view === 'compose') {
        if (composeRecipient) {
          setThreadUser(composeRecipient)
          setView('thread')
          await loadThread(composeRecipient.id)
        } else {
          setView('inbox')
        }
      } else {
        await loadThread(threadUser.id)
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

  if (loading) return (
    <div className="page-wrapper py-8 px-4 pb-28">
      <p className="text-gray-500 text-sm">Loading…</p>
    </div>
  )

  return (
    <div className={view === 'thread' ? 'fixed inset-0 top-[84px] bottom-0 flex flex-col bg-white px-4 max-w-2xl mx-auto w-full' : 'page-wrapper py-8 px-4 pb-28 max-w-2xl mx-auto'}>

      {/* Header */}
      <div className={`flex items-center justify-between ${view === 'thread' ? 'py-4' : 'mb-6'}`}>
        {view !== 'inbox' ? (
          <button onClick={() => { setView('inbox'); setThread([]); setThreadUser(null); setBody('') }}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-black transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back
          </button>
        ) : (
          <h1 className="text-lg font-medium text-gray-900">Messages</h1>
        )}
        {view === 'inbox' && (
          <button onClick={() => { setView('compose'); setBody(''); setComposeRecipient(null); setMemberSearch('') }}
            className="btn-primary text-sm px-4 py-2">
            + New
          </button>
        )}
        {view === 'thread' && threadUser && (
          <h2 className="text-base font-medium text-gray-900">{threadUser.name}</h2>
        )}
        {view === 'compose' && (
          <h2 className="text-base font-medium text-gray-900">New Message</h2>
        )}
      </div>

      {/* ── Inbox ── */}
      {view === 'inbox' && (
        <div className="space-y-2">
          {/* Announcements */}
          {inbox.announcements.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                <p className="text-xs font-medium text-amber-700 uppercase tracking-wider">Announcements</p>
              </div>
              <div className="divide-y divide-gray-100">
                {inbox.announcements.map(msg => (
                  <div key={msg.id} className={`px-4 py-3 ${!msg.is_read ? 'bg-blue-50/40' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        {!msg.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                        <div>
                          <p className="text-sm text-gray-800">{msg.body}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{msg.sender_name} · {fmtTime(msg.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Direct message threads */}
          {inbox.threads.length === 0 && inbox.announcements.length === 0 && (
            <div className="text-center py-16 text-gray-400 text-sm">No messages yet.</div>
          )}
          {inbox.threads.map(t => (
            <button key={t.other_user} onClick={() => openThread({ id: t.other_user, name: t.other_name })}
              className={`w-full card p-4 text-left flex items-start gap-3 hover:bg-gray-50 transition-colors ${!t.is_read && t.sender_id !== user?.id ? 'border-blue-200' : ''}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${!t.is_read && t.sender_id !== user?.id ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {t.other_name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm ${!t.is_read && t.sender_id !== user?.id ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>{t.other_name}</p>
                  <p className="text-xs text-gray-400 shrink-0">{fmtTime(t.created_at)}</p>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {t.sender_id === user?.id ? 'You: ' : ''}{t.body}
                </p>
              </div>
              {!t.is_read && t.sender_id !== user?.id && (
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Thread view ── */}
      {view === 'thread' && (
        <div className="flex flex-col flex-1 overflow-hidden pb-4">
          {/* Scrollable messages area */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto space-y-2 pr-1">
            {thread.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">No messages yet. Say hello!</p>
            )}
            {thread.map(msg => {
              const isMe = msg.sender_id === user?.id
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm ${
                    isMe ? 'bg-black text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                  }`}>
                    <p>{msg.body}</p>
                    <p className={`text-[10px] mt-1 ${isMe ? 'text-gray-400' : 'text-gray-400'}`}>{fmtTime(msg.created_at)}</p>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 pt-3 border-t border-gray-100 mt-2">
            <input
              type="text" value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Type a message…"
              className="input flex-1 text-sm"
            />
            <button onClick={handleSend} disabled={!body.trim() || sending}
              className="btn-primary px-4 disabled:opacity-40">
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {/* ── Compose ── */}
      {view === 'compose' && (
        <div className="space-y-4">
          {isAdmin ? (
            <>
              {/* Broadcast toggle */}
              <div className="card p-4 space-y-3">
                <p className="text-xs text-gray-500 uppercase tracking-wider">To</p>
                <div className="flex gap-2">
                  <button onClick={() => setComposeRecipient(null)}
                    className={`px-4 py-2 rounded-full text-sm border transition-colors ${!composeRecipient ? 'bg-black text-white border-black' : 'border-gray-300 text-gray-600 hover:border-black'}`}>
                    📢 Everyone
                  </button>
                  <button onClick={() => setComposeRecipient('pick')}
                    className={`px-4 py-2 rounded-full text-sm border transition-colors ${composeRecipient && composeRecipient !== 'pick' ? 'bg-black text-white border-black' : 'border-gray-300 text-gray-600 hover:border-black'}`}>
                    👤 Specific member
                  </button>
                </div>
                {(composeRecipient === 'pick' || (composeRecipient && composeRecipient !== null && typeof composeRecipient === 'object')) && (
                  <div>
                    {composeRecipient && typeof composeRecipient === 'object' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{composeRecipient.name}</span>
                        <button onClick={() => { setComposeRecipient('pick'); setMemberSearch('') }} className="text-xs text-gray-400 hover:text-gray-600">Change</button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input type="text" placeholder="Search member…" value={memberSearch}
                          onChange={e => setMemberSearch(e.target.value)}
                          className="input w-full text-sm" autoFocus />
                        <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
                          {filteredMembers.slice(0, 10).map(m => (
                            <button key={m.id} onClick={() => { setComposeRecipient({ id: m.id, name: m.name }); setMemberSearch('') }}
                              className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 transition-colors">
                              {m.name} <span className="text-xs text-gray-400">{m.role}</span>
                            </button>
                          ))}
                          {filteredMembers.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No members found.</p>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Member: pick an admin */
            <div className="card p-4 space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider">To</p>
              {admins.map(a => (
                <button key={a.id} onClick={() => setComposeRecipient({ id: a.id, name: a.name })}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${composeRecipient?.id === a.id ? 'border-black bg-gray-50 font-medium' : 'border-gray-200 text-gray-700 hover:border-gray-400'}`}>
                  {a.name} <span className="text-xs text-gray-400">Admin</span>
                </button>
              ))}
            </div>
          )}

          {/* Message body */}
          <div className="card p-4 space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Message</p>
            <textarea value={body} onChange={e => setBody(e.target.value)}
              placeholder="Type your message…"
              rows={5}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black transition-colors resize-none"
            />
          </div>

          <button onClick={handleSend}
            disabled={!body.trim() || sending || (isAdmin && composeRecipient === 'pick') || (!isAdmin && !composeRecipient)}
            className="btn-primary w-full disabled:opacity-40 py-3">
            {sending ? 'Sending…' : composeRecipient === null && isAdmin ? '📢 Send Announcement' : 'Send Message'}
          </button>
        </div>
      )}
    </div>
  )
}
