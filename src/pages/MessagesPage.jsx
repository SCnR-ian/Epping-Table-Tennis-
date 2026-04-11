import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { messagesAPI, adminAPI } from '@/api/api'

const PRESET_EMOJIS = ['👍', '❤️', '😂', '😮', '😢']

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
  const [deletingThread, setDeletingThread] = useState(null)
  const [inboxSearch, setInboxSearch] = useState('')
  const [editingAnnouncement, setEditingAnnouncement] = useState(null)
  const [deletingAnnouncement, setDeletingAnnouncement] = useState(null)
  // new state
  const [activeMsg, setActiveMsg] = useState(null)
  const [activeMsgAnchor, setActiveMsgAnchor] = useState(null)
  const [editingMsg, setEditingMsg] = useState(null)
  const [editBody, setEditBody] = useState('')
  const [attachPreview, setAttachPreview] = useState(null)

  const messagesContainerRef = useRef(null)
  const threadContainerRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
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
    setActiveMsg(null)
    setActiveMsgAnchor(null)
    setEditingMsg(null)
    await loadThread(otherUser.id, true)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

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

  // ── Thread view (full-screen fixed layout like WeChat) ──────────────────────
  if (view === 'thread') {
    return (
      <div
        ref={threadContainerRef}
        className="fixed inset-x-0 top-[84px] flex flex-col bg-[#f5f5f5]"
        style={{ height: threadHeight ? threadHeight - 84 : 'calc(100dvh - 84px)' }}
        onClick={() => { if (activeMsg) { setActiveMsg(null); setActiveMsgAnchor(null) } }}
      >
        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => { setView('inbox'); setThread([]); setThreadUser(null); setBody(''); setActiveMsg(null); setActiveMsgAnchor(null); setEditingMsg(null) }}
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
            const isActive = activeMsg === msg.id
            const isEditing = editingMsg === msg.id
            const showRead = isMe && i === lastReadIdx
            return (
              <div key={msg.id}>
                {showTime && (
                  <p className="text-center text-[10px] text-gray-400 py-2">{fmtTime(msg.created_at)}</p>
                )}
                <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  {!isMe && <Avatar name={msg.sender_name} size="sm" />}
                  <div className="relative max-w-[70%]">
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
                              setActiveMsgAnchor({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, isMe })
                              setActiveMsg(msg.id)
                            }
                          }
                        }}
                        className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed cursor-pointer select-none ${
                          msg.deleted
                            ? 'bg-gray-100 text-gray-400 italic'
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
                  {isMe && <div className="w-8 shrink-0" />}
                </div>
                {/* Read receipt */}
                {showRead && (
                  <p className="text-right text-[10px] text-gray-400 pr-1 mt-0.5">Read</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Fixed action popup — outside scroll container so it's never clipped */}
        {activeMsg && activeMsgAnchor && !editingMsg && (() => {
          const activeMsgData = thread.find(m => m.id === activeMsg)
          if (!activeMsgData) return null
          const popupIsMe = activeMsgData.sender_id === user?.id
          const showBelow = activeMsgAnchor.top < 160
          return (
            <div
              onClick={e => e.stopPropagation()}
              className="fixed z-[99999] bg-white rounded-2xl shadow-xl border border-gray-100 p-2 flex flex-col gap-1 min-w-[160px]"
              style={showBelow
                ? { top: activeMsgAnchor.bottom + 6, ...(popupIsMe ? { right: window.innerWidth - activeMsgAnchor.right } : { left: activeMsgAnchor.left }) }
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
        {attachPreview && (
          <div className="px-4 pt-2 shrink-0 relative w-fit">
            <img src={attachPreview.data} alt="preview" className="h-16 rounded-xl object-cover" />
            <button onClick={() => setAttachPreview(null)}
              className="absolute -top-1 -right-1 w-5 h-5 bg-gray-700 text-white rounded-full text-xs flex items-center justify-center">✕</button>
          </div>
        )}

        {/* Input bar */}
        <div className="shrink-0 bg-white border-t border-gray-200 px-3 py-2 flex items-center gap-2 pb-[max(env(safe-area-inset-bottom),8px)]">
          <button onClick={() => fileInputRef.current?.click()} className="text-gray-400 hover:text-gray-700 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
            </svg>
          </button>
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
            disabled={!body.trim() && !attachPreview || sending}
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

          {/* Search */}
          <div className="px-4 py-2 bg-white border-b border-gray-100">
            <input
              type="text" value={inboxSearch} onChange={e => setInboxSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full bg-gray-100 rounded-full px-4 py-2 text-sm focus:outline-none"
            />
          </div>

          <div className="bg-white divide-y divide-gray-100">
            {/* Announcements */}
            {inbox.announcements
              .filter(msg => !inboxSearch || msg.body?.toLowerCase().includes(inboxSearch.toLowerCase()))
              .map(msg => (
              <div key={msg.id} className="relative group">
                {deletingAnnouncement === msg.id ? (
                  <div className="flex items-center justify-between px-4 py-3 bg-red-50">
                    <p className="text-sm text-gray-700">Delete this announcement?</p>
                    <div className="flex gap-3 shrink-0 ml-3">
                      <button onClick={() => setDeletingAnnouncement(null)} className="text-sm text-gray-500">Cancel</button>
                      <button onClick={async () => {
                        await messagesAPI.deleteMessage(msg.id)
                        setDeletingAnnouncement(null)
                        loadInbox()
                      }} className="text-sm text-red-600 font-medium">Delete</button>
                    </div>
                  </div>
                ) : editingAnnouncement?.id === msg.id ? (
                  <div className="px-4 py-3 space-y-2">
                    <textarea
                      autoFocus value={editingAnnouncement.body}
                      onChange={e => setEditingAnnouncement(a => ({ ...a, body: e.target.value }))}
                      rows={4}
                      className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none"
                    />
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => setEditingAnnouncement(null)} className="text-sm text-gray-500">Cancel</button>
                      <button onClick={async () => {
                        if (!editingAnnouncement.body.trim()) return
                        await messagesAPI.editMessage(msg.id, editingAnnouncement.body.trim())
                        setEditingAnnouncement(null)
                        loadInbox()
                      }} className="text-sm text-[#07c160] font-medium">Save</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={`flex items-start gap-3 px-4 py-3 pr-20 ${!msg.is_read ? 'bg-green-50/40' : ''}`}>
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
                        <p className="text-sm text-gray-500 mt-0.5 whitespace-pre-wrap">{msg.body}</p>
                      </div>
                      {!msg.is_read && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 mt-1.5" />}
                    </div>
                    {isAdmin && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button onClick={() => setEditingAnnouncement({ id: msg.id, body: msg.body })}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-500 text-sm">✎</button>
                        <button onClick={() => setDeletingAnnouncement(msg.id)}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {/* DM threads */}
            {inbox.threads
              .filter(t => !inboxSearch || t.other_name?.toLowerCase().includes(inboxSearch.toLowerCase()) || t.body?.toLowerCase().includes(inboxSearch.toLowerCase()))
              .map(t => {
              const unread = !t.is_read && t.sender_id !== user?.id
              const isDeleting = deletingThread === t.other_user
              return (
                <div key={t.other_user} className="relative group">
                  {isDeleting ? (
                    <div className="flex items-center justify-between px-4 py-3 bg-red-50">
                      <p className="text-sm text-gray-700">Hide chat with <b>{t.other_name}</b>?</p>
                      <div className="flex gap-3 shrink-0 ml-3">
                        <button onClick={() => setDeletingThread(null)} className="text-sm text-gray-500 hover:text-gray-800">Cancel</button>
                        <button onClick={async () => {
                          await messagesAPI.deleteThread(t.other_user)
                          setDeletingThread(null)
                          loadInbox()
                        }} className="text-sm text-red-600 font-medium hover:text-red-800">Hide</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => openThread({ id: t.other_user, name: t.other_name })}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors pr-12"
                      >
                        <Avatar name={t.other_name} unread={unread} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className={`text-sm ${unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>{t.other_name}</p>
                            <p className="text-xs text-gray-400 shrink-0 ml-2">{fmtTime(t.created_at)}</p>
                          </div>
                          <p className={`text-xs truncate mt-0.5 ${unread ? 'text-gray-700' : 'text-gray-400'}`}>
                            {t.sender_id === user?.id ? 'You: ' : ''}{t.deleted ? 'Message deleted' : t.body}
                          </p>
                        </div>
                        {unread && <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] text-white font-bold shrink-0">1</span>}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeletingThread(t.other_user) }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
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
