import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { messagesAPI, adminAPI, coachingAPI, aiAPI } from '@/api/api'

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
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null)
  const [editingAnnouncement, setEditingAnnouncement] = useState(null)
  const [deletingAnnouncement, setDeletingAnnouncement] = useState(null)
  // new state
  const [activeMsg, setActiveMsg] = useState(null)
  const [activeMsgAnchor, setActiveMsgAnchor] = useState(null)
  const [editingMsg, setEditingMsg] = useState(null)
  const [editBody, setEditBody] = useState('')
  const [attachPreview, setAttachPreview] = useState(null)
  // Student leave request
  const [leaveModal, setLeaveModal] = useState(false)
  const [leaveSessions, setLeaveSessions] = useState([])
  const [leaveSessionId, setLeaveSessionId] = useState('')
  const [leaveReason, setLeaveReason] = useState('')
  const [leaveSubmitting, setLeaveSubmitting] = useState(false)
  const [leaveActioning, setLeaveActioning] = useState(null) // request_id being actioned
  // Coach leave request
  const [coachLeaveModal, setCoachLeaveModal] = useState(false)
  const [coachLeaveFrom, setCoachLeaveFrom] = useState('')
  const [coachLeaveTo, setCoachLeaveTo] = useState('')
  const [coachLeaveReason, setCoachLeaveReason] = useState('')
  const [coachLeaveSubmitting, setCoachLeaveSubmitting] = useState(false)
  // AI thread
  const [aiMessages, setAiMessages] = useState([]) // { role: 'user'|'assistant', content: string, ts: Date }
  const [aiLoading, setAiLoading]   = useState(false)

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
      messagesAPI.getAdmins().then(({ data }) => setAdmins(data.admins ?? [])).catch(() => {})
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

  // Leave request helpers
  const openLeaveModal = async () => {
    try {
      const { data } = await coachingAPI.getMySessions()
      const upcoming = (data.sessions ?? []).filter(s => s.status === 'confirmed')
      setLeaveSessions(upcoming)
      setLeaveSessionId(upcoming[0]?.id ? String(upcoming[0].id) : '')
      setLeaveReason('')
      setLeaveModal(true)
    } catch { alert('Could not load sessions.') }
  }

  const submitLeaveRequest = async () => {
    if (!leaveSessionId) return
    setLeaveSubmitting(true)
    try {
      await coachingAPI.createLeaveRequest({ session_id: parseInt(leaveSessionId, 10), reason: leaveReason || undefined })
      setLeaveModal(false)
      await loadThread(threadUser.id, true)
      await loadInbox()
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not submit leave request.')
    } finally { setLeaveSubmitting(false) }
  }

  const isCoach = user?.role === 'coach'
  const partnerIsAdmin = threadUser && inbox.threads.find(t => t.other_user === threadUser.id)?.other_role === 'admin'

  const openCoachLeaveModal = () => {
    const today = new Date().toLocaleDateString('en-CA')
    setCoachLeaveFrom(today)
    setCoachLeaveTo(today)
    setCoachLeaveReason('')
    setCoachLeaveModal(true)
  }

  const submitCoachLeaveRequest = async () => {
    if (!coachLeaveFrom) return
    setCoachLeaveSubmitting(true)
    try {
      await coachingAPI.createCoachLeaveRequest({
        date_from: coachLeaveFrom,
        date_to: coachLeaveTo || coachLeaveFrom,
        reason: coachLeaveReason || undefined,
      })
      setCoachLeaveModal(false)
      await loadThread(threadUser.id, true)
      await loadInbox()
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not submit leave request.')
    } finally { setCoachLeaveSubmitting(false) }
  }
  const isAIThread = threadUser?.id === 'ai'

  const openAIThread = () => {
    setThreadUser({ id: 'ai', name: 'AI Assistant' })
    setView('thread')
    setActiveMsg(null); setActiveMsgAnchor(null); setEditingMsg(null)
    setTimeout(() => { scrollToBottom(); inputRef.current?.focus() }, 100)
  }

  // Auto-scroll to bottom when AI messages change
  useEffect(() => {
    if (isAIThread) setTimeout(() => scrollToBottom(), 50)
  }, [aiMessages, aiLoading, isAIThread, scrollToBottom])

  const handleAISend = async () => {
    if (!body.trim() || aiLoading) return
    const userMsg = body.trim()
    setBody('')
    const history = aiMessages.map(m => ({ role: m.role, content: m.content }))
    setAiMessages(prev => [...prev, { role: 'user', content: userMsg, ts: new Date() }])
    setAiLoading(true)
    setTimeout(() => scrollToBottom(), 50)
    try {
      const { data } = await aiAPI.chat(userMsg, history)
      setAiMessages(prev => [...prev, { role: 'assistant', content: data.reply, ts: new Date() }])
    } catch (err) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: '❌ ' + (err.response?.data?.message ?? 'Something went wrong.'), ts: new Date() }])
    } finally {
      setAiLoading(false)
      setTimeout(() => scrollToBottom(), 50)
    }
  }

  // Find the last message sent by me that the recipient has read
  const lastReadIdx = thread.reduce((acc, m, i) => m.sender_id === user?.id && m.read_by_recipient ? i : acc, -1)

  const filteredMembers = memberSearch
    ? members.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()) && m.id !== user?.id)
    : members.filter(m => m.id !== user?.id)

  // ── Announcement detail view ─────────────────────────────────────────────────
  if (selectedAnnouncement) {
    return (
      <div className="fixed inset-x-0 top-[84px] flex flex-col bg-white" style={{ height: 'calc(100dvh - 84px)' }}>
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button onClick={() => setSelectedAnnouncement(null)} className="p-1 -ml-1 text-gray-600 hover:text-black">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="flex-1 text-center">
            <p className="text-sm font-semibold text-gray-900">Announcement</p>
          </div>
          {isAdmin ? (
            <div className="flex gap-1">
              <button onClick={() => { setEditingAnnouncement({ id: selectedAnnouncement.id, body: selectedAnnouncement.body }); setSelectedAnnouncement(null) }}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-500 text-base">✎</button>
              <button onClick={() => { setDeletingAnnouncement(selectedAnnouncement.id); setSelectedAnnouncement(null) }}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ) : <div className="w-7" />}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <p className="text-xs text-gray-400 mb-3">
            {new Date(selectedAnnouncement.created_at).toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' })} · {selectedAnnouncement.sender_name}
          </p>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{selectedAnnouncement.body}</p>
        </div>
      </div>
    )
  }

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
            {isAIThread
              ? <p className="text-sm font-semibold text-gray-900">✦ AI Assistant</p>
              : <p className="text-sm font-semibold text-gray-900">{threadUser?.name}</p>
            }
          </div>
          <div className="w-7" />
        </div>

        {/* AI Thread messages */}
        {isAIThread && (
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
            {aiMessages.length === 0 && (
              <div className="py-10 text-center space-y-2">
                <div className="text-4xl">✦</div>
                <p className="text-sm font-medium text-gray-700">Hi! I'm your club AI assistant.</p>
                <p className="text-xs text-gray-400">You can ask me to manage sessions, check balances, send announcements, and more.</p>
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  {['List all coaches', '今天誰簽到了？', 'Show upcoming sessions for this week'].map(s => (
                    <button key={s} onClick={() => { setBody(s); inputRef.current?.focus() }}
                      className="text-xs bg-purple-50 text-purple-600 border border-purple-200 rounded-full px-3 py-1.5 hover:bg-purple-100 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {aiMessages.map((m, i) => (
              <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 text-white text-sm">✦</div>
                )}
                <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-[#07c160] text-white rounded-br-sm'
                    : 'bg-white text-gray-900 rounded-bl-sm shadow-sm'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex items-end gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 text-white text-sm">✦</div>
                <div className="bg-white rounded-2xl rounded-bl-sm shadow-sm px-4 py-3">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => <div key={i} className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Regular thread messages */}
        {!isAIThread && (
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
                            {msg.body && <span className="whitespace-pre-line">{msg.body}</span>}
                            {msg.edited_at && !msg.deleted && (
                              <span className={`text-[10px] ml-1 ${isMe ? 'text-white/60' : 'text-gray-400'}`}>edited</span>
                            )}
                            {/* Coach leave request — admin sees Approve/Reject */}
                            {msg.metadata?.type === 'coach_leave_request' && isAdmin && (() => {
                              const rid = msg.metadata.request_id
                              const status = msg.coach_leave_request_status
                              if (status === 'pending') return (
                                <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                                  <button
                                    disabled={leaveActioning === rid}
                                    className="text-xs bg-white text-emerald-600 border border-emerald-300 rounded-full px-3 py-1 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                                    onClick={async () => {
                                      setLeaveActioning(rid)
                                      try { await coachingAPI.approveCoachLeaveRequest(rid); await loadThread(threadUser.id, false) }
                                      catch (err) { alert(err.response?.data?.message ?? 'Could not approve.') }
                                      finally { setLeaveActioning(null) }
                                    }}>✓ Approve</button>
                                  <button
                                    disabled={leaveActioning === rid}
                                    className="text-xs bg-white text-red-500 border border-red-300 rounded-full px-3 py-1 hover:bg-red-50 disabled:opacity-50 transition-colors"
                                    onClick={async () => {
                                      setLeaveActioning(rid)
                                      try { await coachingAPI.rejectCoachLeaveRequest(rid); await loadThread(threadUser.id, false) }
                                      catch (err) { alert(err.response?.data?.message ?? 'Could not reject.') }
                                      finally { setLeaveActioning(null) }
                                    }}>✗ Reject</button>
                                </div>
                              )
                              if (status === 'approved') return <p className="text-xs mt-1 text-emerald-300">✅ Approved</p>
                              if (status === 'rejected') return <p className="text-xs mt-1 text-red-300">❌ Rejected</p>
                              return null
                            })()}
                            {/* Coach leave request — coach sees status pill */}
                            {msg.metadata?.type === 'coach_leave_request' && !isAdmin && (() => {
                              const status = msg.coach_leave_request_status
                              if (status === 'pending')   return <p className="text-xs mt-1 text-white/70">🕐 Pending review</p>
                              if (status === 'approved')  return <p className="text-xs mt-1 text-white/90">✅ Approved</p>
                              if (status === 'rejected')  return <p className="text-xs mt-1 text-white/70">❌ Rejected</p>
                              return null
                            })()}
                            {/* Student leave request interactive elements */}
                            {msg.metadata?.type === 'leave_request' && isAdmin && (() => {
                              const rid = msg.metadata.request_id
                              const status = msg.leave_request_status
                              if (status === 'pending') return (
                                <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                                  <button
                                    disabled={leaveActioning === rid}
                                    className="text-xs bg-white text-emerald-600 border border-emerald-300 rounded-full px-3 py-1 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                                    onClick={async () => {
                                      setLeaveActioning(rid)
                                      try { await coachingAPI.approveLeaveRequest(rid); await loadThread(threadUser.id, false) }
                                      catch (err) { alert(err.response?.data?.message ?? 'Could not approve.') }
                                      finally { setLeaveActioning(null) }
                                    }}>✓ Approve</button>
                                  <button
                                    disabled={leaveActioning === rid}
                                    className="text-xs bg-white text-red-500 border border-red-300 rounded-full px-3 py-1 hover:bg-red-50 disabled:opacity-50 transition-colors"
                                    onClick={async () => {
                                      setLeaveActioning(rid)
                                      try { await coachingAPI.rejectLeaveRequest(rid); await loadThread(threadUser.id, false) }
                                      catch (err) { alert(err.response?.data?.message ?? 'Could not reject.') }
                                      finally { setLeaveActioning(null) }
                                    }}>✗ Reject</button>
                                </div>
                              )
                              if (status === 'approved') return <p className="text-xs mt-1 text-emerald-300">✅ Approved</p>
                              if (status === 'rejected') return <p className="text-xs mt-1 text-red-300">❌ Rejected</p>
                              if (status === 'rescheduled') return <p className="text-xs mt-1 text-white/70">🔄 Rescheduled</p>
                              return null
                            })()}
                            {msg.metadata?.type === 'slot_options' && !isAdmin && (() => {
                              const rid = msg.metadata.request_id
                              const slots = msg.metadata.slots ?? []
                              const status = msg.leave_request_status
                              const expired = msg.leave_request_expires_at && new Date(msg.leave_request_expires_at) < new Date()
                              if (status === 'rescheduled') return <p className="text-xs mt-2 text-emerald-300">✅ Rescheduled</p>
                              if (expired || status === 'cancelled') return <p className="text-xs mt-2 text-gray-400">⏰ Selection window expired — standard cancellation policy applies.</p>
                              if (status === 'approved' && slots.length > 0) return (
                                <div className="mt-2 space-y-1.5" onClick={e => e.stopPropagation()}>
                                  {slots.map((s, i) => {
                                    const [sh, sm] = s.start_time.slice(0, 5).split(':').map(Number)
                                    const [eh, em] = s.end_time.slice(0, 5).split(':').map(Number)
                                    const period = h => h >= 12 ? 'PM' : 'AM'
                                    const fmt = (h, m) => `${h % 12 || 12}:${String(m).padStart(2,'0')} ${period(h)}`
                                    const dateLabel = new Date(s.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
                                    return (
                                      <button key={i}
                                        disabled={leaveActioning === rid}
                                        className="block w-full text-left text-xs bg-white/20 hover:bg-white/30 border border-white/40 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
                                        onClick={async () => {
                                          setLeaveActioning(rid)
                                          try {
                                            await coachingAPI.selectLeaveSlot(rid, { date: s.date, start_time: s.start_time, end_time: s.end_time })
                                            await loadThread(threadUser.id, true)
                                          } catch (err) { alert(err.response?.data?.message ?? 'Could not reschedule.') }
                                          finally { setLeaveActioning(null) }
                                        }}>
                                        {dateLabel} · {fmt(sh, sm)} – {fmt(eh, em)}
                                      </button>
                                    )
                                  })}
                                </div>
                              )
                              return null
                            })()}
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

        )} {/* end !isAIThread regular thread */}

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
          {!isAIThread && !isAdmin && partnerIsAdmin && (
            <button
              onClick={isCoach ? openCoachLeaveModal : openLeaveModal}
              className="text-gray-400 hover:text-amber-500 shrink-0 transition-colors"
              title="Request Leave"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5M12 15h.008v.008H12V15zm0-2.25h.008v.008H12v-.008zm0 4.5h.008v.008H12v-.008zm-2.625-4.5h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm5.25-4.5h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18z" />
              </svg>
            </button>
          )}
          {!isAIThread && <button onClick={() => fileInputRef.current?.click()} className="text-gray-400 hover:text-gray-700 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
            </svg>
          </button>}
          <input
            ref={inputRef}
            type="text"
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (isAIThread ? handleAISend() : handleSend())}
            placeholder={isAIThread ? 'Ask AI Assistant…' : 'Type a message…'}
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm text-black placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-300 transition-all"
          />
          <button
            onClick={isAIThread ? handleAISend : handleSend}
            disabled={isAIThread ? (!body.trim() || aiLoading) : (!body.trim() && !attachPreview || sending)}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors disabled:bg-gray-200 ${isAIThread ? 'bg-gradient-to-br from-violet-500 to-purple-600' : 'bg-[#07c160]'}`}
          >
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>

        {/* Coach Leave Request Modal */}
        {coachLeaveModal && (
          <div className="fixed inset-0 z-[20000] flex items-end sm:items-center justify-center bg-black/50 p-4"
               onClick={e => { if (e.target === e.currentTarget) setCoachLeaveModal(false) }}>
            <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
              <h3 className="text-base font-semibold text-gray-900">Request Leave</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">From</label>
                  <input
                    type="date"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    value={coachLeaveFrom}
                    onChange={e => { setCoachLeaveFrom(e.target.value); if (!coachLeaveTo || coachLeaveTo < e.target.value) setCoachLeaveTo(e.target.value) }}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">To</label>
                  <input
                    type="date"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    value={coachLeaveTo}
                    min={coachLeaveFrom}
                    onChange={e => setCoachLeaveTo(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Reason</label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  placeholder="e.g. Sick leave, personal appointment"
                  value={coachLeaveReason}
                  onChange={e => setCoachLeaveReason(e.target.value)}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button className="flex-1 py-2 rounded-full border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                  onClick={() => setCoachLeaveModal(false)}>Cancel</button>
                <button
                  className="flex-1 py-2 rounded-full bg-[#07c160] text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50"
                  disabled={coachLeaveSubmitting || !coachLeaveFrom}
                  onClick={submitCoachLeaveRequest}>
                  {coachLeaveSubmitting ? 'Sending…' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Student Leave Request Modal */}
        {leaveModal && (
          <div className="fixed inset-0 z-[20000] flex items-end sm:items-center justify-center bg-black/50 p-4"
               onClick={e => { if (e.target === e.currentTarget) setLeaveModal(false) }}>
            <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
              <h3 className="text-base font-semibold text-gray-900">Request Leave</h3>
              {leaveSessions.length === 0 ? (
                <p className="text-sm text-gray-500">You have no upcoming coaching sessions.</p>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Select session</label>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      value={leaveSessionId}
                      onChange={e => setLeaveSessionId(e.target.value)}
                    >
                      {leaveSessions.map(s => {
                        const [sh, sm] = s.start_time.slice(0,5).split(':').map(Number)
                        const [eh, em] = s.end_time.slice(0,5).split(':').map(Number)
                        const p = h => h >= 12 ? 'PM' : 'AM'
                        const f = (h,m) => `${h%12||12}:${String(m).padStart(2,'0')} ${p(h)}`
                        const d = new Date(String(s.date).slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})
                        return <option key={s.id} value={s.id}>{d} · {f(sh,sm)}–{f(eh,em)} ({s.coach_name})</option>
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Reason (optional)</label>
                    <input
                      type="text"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      placeholder="e.g. Business trip"
                      value={leaveReason}
                      onChange={e => setLeaveReason(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button className="flex-1 py-2 rounded-full border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                      onClick={() => setLeaveModal(false)}>Cancel</button>
                    <button
                      className="flex-1 py-2 rounded-full bg-[#07c160] text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50"
                      disabled={leaveSubmitting || !leaveSessionId}
                      onClick={submitLeaveRequest}>
                      {leaveSubmitting ? 'Sending…' : 'Send Request'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
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
                    <button onClick={() => setSelectedAnnouncement(msg)}
                      className={`w-full flex items-start gap-3 px-4 py-3 pr-20 text-left hover:bg-amber-50/50 transition-colors ${!msg.is_read ? 'bg-green-50/40' : ''}`}>
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
                        <p className="text-sm text-gray-500 mt-0.5 truncate">{msg.body}</p>
                      </div>
                      {!msg.is_read && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 mt-1.5" />}
                    </button>
                    {isAdmin && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button onClick={e => { e.stopPropagation(); setEditingAnnouncement({ id: msg.id, body: msg.body }) }}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-500 text-sm">✎</button>
                        <button onClick={e => { e.stopPropagation(); setDeletingAnnouncement(msg.id) }}
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

            {/* AI Assistant — admin only */}
            {isAdmin && (!inboxSearch || 'ai assistant'.includes(inboxSearch.toLowerCase())) && (
              <button
                onClick={openAIThread}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-purple-50/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 text-white text-lg">✦</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">AI Assistant</p>
                    <p className="text-xs text-purple-400">Admin only</p>
                  </div>
                  <p className="text-sm text-gray-400 mt-0.5 truncate">Ask me to manage sessions, members, and more…</p>
                </div>
              </button>
            )}

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
