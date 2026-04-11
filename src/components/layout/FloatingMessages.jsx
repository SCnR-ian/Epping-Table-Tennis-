import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { messagesAPI, adminAPI } from '@/api/api'
import { useLocation } from 'react-router-dom'

const PRESET_EMOJIS = ['👍', '❤️', '😂', '😮', '😢']

function fmtTime(ts) {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function Avatar({ name, size = 'md', green = false }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  return (
    <div className={`${sz} ${green ? 'bg-[#07c160]' : 'bg-gray-300'} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}>
      {name?.[0]?.toUpperCase()}
    </div>
  )
}

export default function FloatingMessages() {
  const { user, isAdmin } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('inbox')
  const [inbox, setInbox] = useState({ announcements: [], threads: [] })
  const [thread, setThread] = useState([])
  const [threadUser, setThreadUser] = useState(null)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [members, setMembers] = useState([])
  const [admins, setAdmins] = useState([])
  const [memberSearch, setMemberSearch] = useState('')
  const [composeRecipient, setComposeRecipient] = useState(null)
  const [unread, setUnread] = useState(0)
  const [minimized, setMinimized] = useState(false)
  // new state
  const [activeMsg, setActiveMsg]     = useState(null)   // msg id with popup open
  const [activeMsgAnchor, setActiveMsgAnchor] = useState(null) // { top, left, right, isMe }
  const [editingMsg, setEditingMsg]   = useState(null)   // msg id being edited
  const [editBody, setEditBody]       = useState('')
  const [attachPreview, setAttachPreview] = useState(null) // { data, type, name }

  const msgContainerRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    const el = msgContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const loadInbox = useCallback(async () => {
    try {
      const { data } = await messagesAPI.getInbox()
      setInbox(data)
      const { data: uc } = await messagesAPI.getUnreadCount()
      setUnread(uc.count)
    } catch {}
  }, [])

  const loadThread = useCallback(async (uid, scroll = false) => {
    try {
      const { data } = await messagesAPI.getThread(uid)
      setThread(data.messages)
      if (scroll) setTimeout(scrollToBottom, 50)
    } catch {}
  }, [scrollToBottom])

  useEffect(() => {
    if (!user) return
    loadInbox()
    if (isAdmin) {
      adminAPI.getAllMembers().then(({ data }) => setMembers(data.members ?? [])).catch(() => {})
    } else {
      adminAPI.getAllMembers().then(({ data }) => setAdmins((data.members ?? []).filter(m => m.role === 'admin'))).catch(() => {})
    }
  }, [user, isAdmin, loadInbox])

  useEffect(() => {
    if (!user) return
    const id = setInterval(() => {
      loadInbox()
      if (view === 'thread' && threadUser) loadThread(threadUser.id, false)
    }, 10000)
    return () => clearInterval(id)
  }, [user, view, threadUser, loadInbox, loadThread])

  const openThread = async (otherUser) => {
    setThreadUser(otherUser)
    setView('thread')
    setActiveMsg(null)
    setActiveMsgAnchor(null)
    setEditingMsg(null)
    await loadThread(otherUser.id, true)
    setTimeout(() => inputRef.current?.focus(), 150)
  }

  // Handle file selection for attachment
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setAttachPreview({ data: ev.target.result, type: file.type, name: file.name })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSend = async () => {
    if (!body.trim() && !attachPreview || sending) return
    setSending(true)
    try {
      await messagesAPI.send({
        recipient_id: view === 'compose' ? (composeRecipient?.id ?? null) : threadUser?.id,
        body: body.trim() || null,
        attachment_data: attachPreview?.data ?? null,
        attachment_type: attachPreview?.type ?? null,
        attachment_name: attachPreview?.name ?? null,
      })
      setBody('')
      setAttachPreview(null)
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

  const handleEdit = async (msg) => {
    if (!editBody.trim()) return
    try {
      await messagesAPI.editMessage(msg.id, editBody.trim())
      setThread(prev => prev.map(m => m.id === msg.id ? { ...m, body: editBody.trim(), edited_at: new Date().toISOString() } : m))
    } catch {}
    setEditingMsg(null)
    setActiveMsg(null)
    setActiveMsgAnchor(null)
  }

  const handleDelete = async (msgId) => {
    try {
      await messagesAPI.deleteMessage(msgId)
      setThread(prev => prev.map(m => m.id === msgId ? { ...m, deleted: true, body: null } : m))
    } catch {}
    setActiveMsg(null)
    setActiveMsgAnchor(null)
  }

  const handleReact = async (msgId, emoji) => {
    try {
      const { data } = await messagesAPI.reactMessage(msgId, emoji)
      setThread(prev => prev.map(m => m.id === msgId ? { ...m, reactions: data.reactions } : m))
    } catch {}
    setActiveMsg(null)
    setActiveMsgAnchor(null)
  }

  // Find the last message sent by me that the recipient has read
  const lastReadIdx = thread.reduce((acc, m, i) => m.sender_id === user?.id && m.read_by_recipient ? i : acc, -1)

  const filteredMembers = memberSearch
    ? members.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()) && m.id !== user?.id)
    : members.filter(m => m.id !== user?.id)

  if (!user || pathname === '/messages') return null

  return (
    <>
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

      {/* FAB */}
      <button
        onClick={() => { if (open) { setOpen(false); setMinimized(false) } else { setOpen(true); setView('inbox'); loadInbox() } }}
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
      </button>

      {/* Panel */}
      {open && (
        <>
          <div className="fixed inset-0 z-[9998] bg-black/20 sm:hidden" onClick={() => setOpen(false)} />

          <div
            className={`fixed z-[9999] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden inset-x-0 bottom-0 rounded-b-none sm:inset-x-auto sm:bottom-24 sm:right-4 sm:w-[360px] sm:rounded-2xl transition-all duration-200 ${minimized ? 'h-auto sm:h-auto' : 'h-[82vh] sm:h-[520px]'}`}
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
            onClick={() => { if (activeMsg) { setActiveMsg(null); setActiveMsgAnchor(null) } }}
          >

            {/* ── Inbox ── */}
            {view === 'inbox' && (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
                  <h2 className="font-semibold text-gray-900 text-sm">Messages</h2>
                  <div className="flex items-center gap-2">
                    {!minimized && (
                      <button onClick={() => { setView('compose'); setComposeRecipient(null); setBody(''); setMemberSearch('') }}
                        className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-black">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                      </button>
                    )}
                    <button onClick={() => setMinimized(m => !m)} className="w-7 h-7 hidden sm:flex items-center justify-center text-gray-400 hover:text-black">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        {minimized
                          ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                          : <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        }
                      </svg>
                    </button>
                    <button onClick={() => setOpen(false)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-black">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {!minimized && <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                  {inbox.announcements.map(msg => (
                    <div key={msg.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between">
                          <p className="text-xs font-semibold text-gray-900">Announcement</p>
                          <p className="text-[10px] text-gray-400">{fmtTime(msg.created_at)}</p>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{msg.body}</p>
                      </div>
                    </div>
                  ))}
                  {inbox.threads.map(t => {
                    const unreadMsg = !t.is_read && t.sender_id !== user?.id
                    return (
                      <button key={t.other_user} onClick={() => openThread({ id: t.other_user, name: t.other_name })}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors">
                        <Avatar name={t.other_name} green={unreadMsg} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center">
                            <p className={`text-sm ${unreadMsg ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{t.other_name}</p>
                            <p className="text-[10px] text-gray-400 shrink-0 ml-1">{fmtTime(t.created_at)}</p>
                          </div>
                          <p className={`text-xs truncate ${unreadMsg ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                            {t.sender_id === user?.id ? 'You: ' : ''}{t.deleted ? 'Message deleted' : t.body}
                          </p>
                        </div>
                        {unreadMsg && <span className="w-2 h-2 rounded-full bg-[#07c160] shrink-0" />}
                      </button>
                    )
                  })}
                  {inbox.threads.length === 0 && inbox.announcements.length === 0 && (
                    <p className="text-center text-gray-400 text-xs py-10">No messages yet.</p>
                  )}
                </div>}
              </>
            )}

            {/* ── Thread ── */}
            {view === 'thread' && (
              <>
                <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-100 shrink-0">
                  <button onClick={() => { setView('inbox'); setThread([]); setActiveMsg(null); setActiveMsgAnchor(null); setEditingMsg(null) }} className="p-1 text-gray-500 hover:text-black">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  <Avatar name={threadUser?.name} size="sm" />
                  <p className="flex-1 text-sm font-semibold text-gray-900">{threadUser?.name}</p>
                  <button onClick={() => setMinimized(m => !m)} className="p-1 hidden sm:flex text-gray-400 hover:text-black">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      {minimized
                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                        : <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      }
                    </svg>
                  </button>
                  <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-black">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {!minimized && <div ref={msgContainerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1 bg-[#f5f5f5]">
                  {thread.length === 0 && <p className="text-center text-gray-400 text-xs py-6">No messages yet.</p>}
                  {thread.map((msg, i) => {
                    const isMe = msg.sender_id === user?.id
                    const showTime = i === 0 || (new Date(msg.created_at) - new Date(thread[i-1].created_at)) > 5 * 60 * 1000
                    const isActive = activeMsg === msg.id
                    const isEditing = editingMsg === msg.id
                    const showRead = isMe && i === lastReadIdx
                    return (
                      <div key={msg.id}>
                        {showTime && <p className="text-center text-[10px] text-gray-400 py-1">{fmtTime(msg.created_at)}</p>}
                        <div className={`flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                          {!isMe && <Avatar name={msg.sender_name} size="sm" />}
                          <div className="relative max-w-[72%]">
                            {/* Bubble */}
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                <input
                                  autoFocus
                                  value={editBody}
                                  onChange={e => setEditBody(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleEdit(msg); if (e.key === 'Escape') { setEditingMsg(null); setActiveMsg(null); setActiveMsgAnchor(null) } }}
                                  className="flex-1 bg-white border border-gray-300 rounded-full px-3 py-1.5 text-sm focus:outline-none"
                                />
                                <button onClick={() => handleEdit(msg)} className="text-[#07c160] text-xs font-medium">✓</button>
                                <button onClick={() => { setEditingMsg(null); setActiveMsg(null); setActiveMsgAnchor(null) }} className="text-gray-400 text-xs">✕</button>
                              </div>
                            ) : (
                              <div
                                onClick={e => {
                                  e.stopPropagation()
                                  if (!msg.deleted) {
                                    if (isActive) {
                                      setActiveMsg(null); setActiveMsgAnchor(null)
                                    } else {
                                      const r = e.currentTarget.getBoundingClientRect()
                                      setActiveMsgAnchor({ top: r.top, left: r.left, right: r.right, isMe })
                                      setActiveMsg(msg.id)
                                    }
                                  }
                                }}
                                className={`px-3 py-2 rounded-2xl text-sm leading-relaxed cursor-pointer select-none ${
                                  msg.deleted
                                    ? 'bg-gray-100 text-gray-400 italic rounded-bl-sm'
                                    : isMe
                                      ? 'bg-[#07c160] text-white rounded-br-sm'
                                      : 'bg-white text-gray-900 rounded-bl-sm shadow-sm'
                                }`}
                              >
                                {msg.deleted ? 'This message was deleted' : (
                                  <>
                                    {msg.attachment_data && (
                                      <img src={msg.attachment_data} alt="attachment" className="max-w-full rounded-xl mb-1" />
                                    )}
                                    {msg.body && <span>{msg.body}</span>}
                                    {msg.edited_at && !msg.deleted && (
                                      <span className={`text-[10px] ml-1 ${isMe ? 'text-white/60' : 'text-gray-400'}`}>edited</span>
                                    )}
                                  </>
                                )}
                              </div>
                            )}

                            {/* Reactions */}
                            {msg.reactions?.length > 0 && (
                              <div className={`flex flex-wrap gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                {msg.reactions.map(r => (
                                  <button key={r.emoji} onClick={() => handleReact(msg.id, r.emoji)}
                                    className={`text-xs px-1.5 py-0.5 rounded-full border transition-colors ${r.reacted_by_me ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                                    {r.emoji} {r.count > 1 && r.count}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Read receipt */}
                        {showRead && (
                          <p className="text-right text-[10px] text-gray-400 pr-1 mt-0.5">Read</p>
                        )}
                      </div>
                    )
                  })}
                </div>}

                {/* Fixed action popup — outside scroll container so it's never clipped */}
                {activeMsg && activeMsgAnchor && !editingMsg && (() => {
                  const activeMsgData = thread.find(m => m.id === activeMsg)
                  if (!activeMsgData) return null
                  const popupIsMe = activeMsgData.sender_id === user?.id
                  const spaceAbove = activeMsgAnchor.top
                  const showBelow = spaceAbove < 120
                  return (
                    <div
                      onClick={e => e.stopPropagation()}
                      className="fixed z-[99999] bg-white rounded-2xl shadow-xl border border-gray-100 p-2 flex flex-col gap-1 min-w-[160px]"
                      style={showBelow
                        ? { top: activeMsgAnchor.top + 40, ...(popupIsMe ? { right: window.innerWidth - activeMsgAnchor.right } : { left: activeMsgAnchor.left }) }
                        : { bottom: window.innerHeight - activeMsgAnchor.top + 6, ...(popupIsMe ? { right: window.innerWidth - activeMsgAnchor.right } : { left: activeMsgAnchor.left }) }
                      }
                    >
                      <div className="flex gap-1 px-1 pb-1 border-b border-gray-100">
                        {PRESET_EMOJIS.map(emoji => {
                          const reacted = activeMsgData.reactions?.some(r => r.emoji === emoji && r.reacted_by_me)
                          return (
                            <button key={emoji} onClick={() => handleReact(activeMsg, emoji)}
                              className={`text-lg p-0.5 rounded-full transition-colors ${reacted ? 'bg-green-100' : 'hover:bg-gray-100'}`}>
                              {emoji}
                            </button>
                          )
                        })}
                      </div>
                      {popupIsMe && !activeMsgData.deleted && (
                        <>
                          <button onClick={() => { setEditBody(activeMsgData.body); setEditingMsg(activeMsg); setActiveMsg(null); setActiveMsgAnchor(null) }}
                            className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-xl">
                            ✎ Edit
                          </button>
                          <button onClick={() => handleDelete(activeMsg)}
                            className="flex items-center gap-2 px-2 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-xl">
                            🗑 Delete
                          </button>
                        </>
                      )}
                    </div>
                  )
                })()}

                {/* Attachment preview */}
                {!minimized && attachPreview && (
                  <div className="px-3 pt-2 shrink-0 relative w-fit">
                    <img src={attachPreview.data} alt="preview" className="h-16 rounded-xl object-cover" />
                    <button onClick={() => setAttachPreview(null)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-gray-700 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                  </div>
                )}

                {/* Input bar */}
                {!minimized && <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 bg-white shrink-0">
                  <button onClick={() => fileInputRef.current?.click()} className="text-gray-400 hover:text-gray-700 shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                  </button>
                  <input ref={inputRef} type="text" value={body}
                    onChange={e => setBody(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Message…"
                    className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm text-black placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-200 transition-all"
                  />
                  <button onClick={handleSend} disabled={!body.trim() && !attachPreview || sending}
                    className="w-8 h-8 rounded-full bg-[#07c160] disabled:bg-gray-200 flex items-center justify-center shrink-0 transition-colors">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                  </button>
                </div>}
              </>
            )}

            {/* ── Compose ── */}
            {view === 'compose' && (
              <>
                <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-100 shrink-0">
                  <button onClick={() => setView('inbox')} className="p-1 text-gray-500 hover:text-black">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  <p className="flex-1 text-sm font-semibold text-gray-900">New Message</p>
                  <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-black">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                  {isAdmin ? (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-400 uppercase tracking-wider">To</p>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => setComposeRecipient(null)}
                          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${!composeRecipient ? 'bg-[#07c160] text-white border-[#07c160]' : 'border-gray-300 text-gray-600'}`}>
                          📢 Everyone
                        </button>
                        <button onClick={() => setComposeRecipient('pick')}
                          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${composeRecipient && composeRecipient !== 'pick' ? 'bg-[#07c160] text-white border-[#07c160]' : 'border-gray-300 text-gray-600'}`}>
                          👤 Specific member
                        </button>
                      </div>
                      {(composeRecipient === 'pick' || (composeRecipient && typeof composeRecipient === 'object')) && (
                        composeRecipient && typeof composeRecipient === 'object' ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={composeRecipient.name} size="sm" />
                            <span className="text-sm text-gray-800">{composeRecipient.name}</span>
                            <button onClick={() => { setComposeRecipient('pick'); setMemberSearch('') }} className="text-xs text-gray-400 ml-auto">Change</button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <input type="text" placeholder="Search…" value={memberSearch}
                              onChange={e => setMemberSearch(e.target.value)}
                              className="w-full bg-gray-100 rounded-full px-3 py-1.5 text-sm focus:outline-none" autoFocus />
                            <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-100">
                              {filteredMembers.slice(0, 8).map(m => (
                                <button key={m.id} onClick={() => { setComposeRecipient({ id: m.id, name: m.name }); setMemberSearch('') }}
                                  className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 flex items-center gap-2">
                                  <Avatar name={m.name} size="sm" />
                                  <span>{m.name} <span className="text-xs text-gray-400">{m.role}</span></span>
                                </button>
                              ))}
                              {filteredMembers.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No members found.</p>}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400 uppercase tracking-wider">To</p>
                      {admins.map(a => (
                        <button key={a.id} onClick={() => setComposeRecipient({ id: a.id, name: a.name })}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${composeRecipient?.id === a.id ? 'border-[#07c160] bg-green-50' : 'border-gray-100 hover:border-gray-300'}`}>
                          <Avatar name={a.name} size="sm" />
                          <span>{a.name}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Message</p>
                    <textarea value={body} onChange={e => setBody(e.target.value)}
                      placeholder="Type your message…" rows={4}
                      className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-black placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-200 transition-all resize-none"
                    />
                  </div>

                  <button onClick={handleSend}
                    disabled={!body.trim() || sending || (isAdmin && composeRecipient === 'pick') || (!isAdmin && !composeRecipient)}
                    className="w-full bg-[#07c160] disabled:bg-gray-200 text-white rounded-full py-3 text-sm font-medium transition-colors">
                    {sending ? 'Sending…' : composeRecipient === null && isAdmin ? '📢 Send Announcement' : 'Send Message'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
