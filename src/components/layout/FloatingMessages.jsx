import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { messagesAPI, adminAPI, coachingAPI, aiAPI } from '@/api/api'
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
  const [deletingThread, setDeletingThread] = useState(null)
  const [inboxSearch, setInboxSearch] = useState('')
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null) // full announcement object
  const [editingAnnouncement, setEditingAnnouncement] = useState(null) // { id, body }
  const [deletingAnnouncement, setDeletingAnnouncement] = useState(null)
  // new state
  const [activeMsg, setActiveMsg]     = useState(null)   // msg id with popup open
  const [activeMsgAnchor, setActiveMsgAnchor] = useState(null) // { top, left, right, isMe }
  const [editingMsg, setEditingMsg]   = useState(null)   // msg id being edited
  const [editBody, setEditBody]       = useState('')
  const [attachPreview, setAttachPreview] = useState(null) // { data, type, name }
  // Student leave request
  const [leaveModal, setLeaveModal] = useState(false)
  const [leaveSessions, setLeaveSessions] = useState([])
  const [leaveSessionId, setLeaveSessionId] = useState('')
  const [leaveReason, setLeaveReason] = useState('')
  const [leaveSubmitting, setLeaveSubmitting] = useState(false)
  const [leaveActioning, setLeaveActioning] = useState(null)
  // Coach leave request
  const [coachLeaveModal, setCoachLeaveModal] = useState(false)
  const [coachLeaveDate, setCoachLeaveDate] = useState('')
  const [coachLeaveReason, setCoachLeaveReason] = useState('')
  const [coachLeaveSubmitting, setCoachLeaveSubmitting] = useState(false)
  const [coachLeaveDateSessions, setCoachLeaveDateSessions] = useState([])
  const [coachLeaveDateLoading, setCoachLeaveDateLoading] = useState(false)
  const [coachLeaveSelectedIds, setCoachLeaveSelectedIds] = useState([])
  // Assign cover modal (admin)
  const [assignCoverModal, setAssignCoverModal] = useState(null)
  const [coverageAssignments, setCoverageAssignments] = useState({})
  const [assignCoverCoaches, setAssignCoverCoaches] = useState([])
  const [assignCoverSubmitting, setAssignCoverSubmitting] = useState(false)
  const [coverageActioning, setCoverageActioning] = useState(null)
  const [declinedSlots, setDeclinedSlots] = useState(new Set()) // request_ids where student chose "none"
  // AI thread — persisted to localStorage
  const [aiMessages, setAiMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ai_chat_history') ?? '[]') } catch { return [] }
  })
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    localStorage.setItem('ai_chat_history', JSON.stringify(aiMessages))
  }, [aiMessages])

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
    if (uid === 'ai') return   // AI thread is local-only, no server fetch
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
      messagesAPI.getAdmins().then(({ data }) => setAdmins(data.admins ?? [])).catch(() => {})
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

  const partnerIsAdmin = threadUser && inbox.threads.find(t => t.other_user === threadUser.id)?.other_role === 'admin'
  const isAIThread = threadUser?.id === 'ai'

  // Auto-scroll to bottom when AI thread is open and messages change
  useEffect(() => {
    if (isAIThread) setTimeout(scrollToBottom, 50)
  }, [aiMessages, aiLoading, isAIThread, scrollToBottom])

  const openAIThread = () => {
    setThreadUser({ id: 'ai', name: 'AI Assistant' })
    setView('thread')
    setActiveMsg(null); setActiveMsgAnchor(null); setEditingMsg(null)
    setTimeout(() => { scrollToBottom(); inputRef.current?.focus() }, 150)
  }

  const handleAISend = async () => {
    if (!body.trim() || aiLoading) return
    const userMsg = body.trim()
    setBody('')
    const history = aiMessages.map(m => ({ role: m.role, content: m.content }))
    setAiMessages(prev => [...prev, { role: 'user', content: userMsg, ts: new Date() }])
    setAiLoading(true)
    setTimeout(scrollToBottom, 50)
    try {
      const { data } = await aiAPI.chat(userMsg, history)
      setAiMessages(prev => [...prev, { role: 'assistant', content: data.reply, ts: new Date() }])
    } catch (err) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: '❌ ' + (err.response?.data?.message ?? 'Something went wrong.'), ts: new Date() }])
    } finally {
      setAiLoading(false)
      setTimeout(scrollToBottom, 50)
    }
  }

  const isCoach = user?.role === 'coach'

  const openLeaveModal = async () => {
    try {
      const { data } = await coachingAPI.getMySessions()
      const upcoming = (data.sessions ?? []).filter(s => s.status === 'confirmed' && !s.has_pending_leave)
      setLeaveSessions(upcoming)
      setLeaveSessionId(upcoming[0]?.id ? String(upcoming[0].id) : '')
      setLeaveReason('')
      setLeaveModal(true)
    } catch { alert('Could not load sessions.') }
  }

  const openCoachLeaveModal = () => {
    const today = new Date().toLocaleDateString('en-CA')
    setCoachLeaveDate(today)
    setCoachLeaveReason('')
    setCoachLeaveDateSessions([])
    setCoachLeaveSelectedIds([])
    setCoachLeaveModal(true)
    loadCoachLeaveSessions(today)
  }

  const loadCoachLeaveSessions = async (date) => {
    if (!date) return
    setCoachLeaveDateLoading(true)
    try {
      const { data } = await coachingAPI.getCoachSessions(date)
      setCoachLeaveDateSessions(data.sessions || [])
      setCoachLeaveSelectedIds((data.sessions || []).map(s => s.id))
    } catch { setCoachLeaveDateSessions([]) }
    finally { setCoachLeaveDateLoading(false) }
  }

  const submitCoachLeaveRequest = async () => {
    if (!coachLeaveDate) return
    setCoachLeaveSubmitting(true)
    try {
      await coachingAPI.createCoachLeaveRequest({
        date_from: coachLeaveDate,
        reason: coachLeaveReason || undefined,
        session_ids: coachLeaveSelectedIds,
      })
      setCoachLeaveModal(false)
      await loadThread(threadUser.id, true)
      await loadInbox()
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not submit leave request.')
    } finally { setCoachLeaveSubmitting(false) }
  }

  const openAssignCoverModal = async (leaveReqId, sessions) => {
    setAssignCoverModal({ leaveReqId, sessions })
    setCoverageAssignments({})
    setAssignCoverSubmitting(false)
    if (!assignCoverCoaches.length) {
      try {
        const { data } = await coachingAPI.getCoaches()
        setAssignCoverCoaches(data.coaches || [])
      } catch { setAssignCoverCoaches([]) }
    }
  }

  const submitAssignCover = async () => {
    if (!assignCoverModal) return
    const coverages = Object.entries(coverageAssignments)
      .filter(([, coachId]) => coachId)
      .map(([sessionId, coachId]) => ({ session_id: parseInt(sessionId), sub_coach_id: parseInt(coachId) }))
    if (!coverages.length) return
    setAssignCoverSubmitting(true)
    try {
      await coachingAPI.assignCover(assignCoverModal.leaveReqId, { coverages })
      setAssignCoverModal(null)
      await loadThread(threadUser.id, false)
    } catch (err) {
      alert(err.response?.data?.message ?? 'Could not assign cover.')
    } finally { setAssignCoverSubmitting(false) }
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

  // Find the last message sent by me that the recipient has read
  const lastReadIdx = thread.reduce((acc, m, i) => m.sender_id === user?.id && m.read_by_recipient ? i : acc, -1)

  const filteredMembers = memberSearch
    ? members.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()) && m.id !== user?.id)
    : members.filter(m => m.id !== user?.id)

  if (!user) return null

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

                {!minimized && <>
                  {/* Search */}
                  <div className="px-3 py-2 border-b border-gray-100 shrink-0">
                    <input
                      type="text" value={inboxSearch} onChange={e => setInboxSearch(e.target.value)}
                      placeholder="Search…"
                      className="w-full bg-gray-100 rounded-full px-3 py-1.5 text-xs focus:outline-none"
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                  {inbox.announcements
                    .filter(msg => !inboxSearch || msg.body?.toLowerCase().includes(inboxSearch.toLowerCase()))
                    .map(msg => (
                    <div key={msg.id} className="relative group">
                      {deletingAnnouncement === msg.id ? (
                        <div className="flex items-center justify-between px-4 py-3 bg-red-50">
                          <p className="text-xs text-gray-700">Delete this announcement?</p>
                          <div className="flex gap-2 shrink-0 ml-2">
                            <button onClick={() => setDeletingAnnouncement(null)} className="text-xs text-gray-500">Cancel</button>
                            <button onClick={async () => {
                              await messagesAPI.deleteMessage(msg.id)
                              setDeletingAnnouncement(null)
                              loadInbox()
                            }} className="text-xs text-red-600 font-medium">Delete</button>
                          </div>
                        </div>
                      ) : editingAnnouncement?.id === msg.id ? (
                        <div className="px-4 py-3 space-y-2">
                          <textarea
                            autoFocus value={editingAnnouncement.body}
                            onChange={e => setEditingAnnouncement(a => ({ ...a, body: e.target.value }))}
                            rows={3}
                            className="w-full bg-gray-50 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none"
                          />
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingAnnouncement(null)} className="text-xs text-gray-500">Cancel</button>
                            <button onClick={async () => {
                              if (!editingAnnouncement.body.trim()) return
                              await messagesAPI.editMessage(msg.id, editingAnnouncement.body.trim())
                              setEditingAnnouncement(null)
                              loadInbox()
                            }} className="text-xs text-[#07c160] font-medium">Save</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => setSelectedAnnouncement(msg)}
                            className="w-full flex items-center gap-3 px-4 py-3 pr-16 hover:bg-amber-50/50 text-left transition-colors">
                            <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center shrink-0">
                              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
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
                          </button>
                          {isAdmin && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                              <button onClick={e => { e.stopPropagation(); setEditingAnnouncement({ id: msg.id, body: msg.body }) }}
                                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-blue-500 text-xs">✎</button>
                              <button onClick={e => { e.stopPropagation(); setDeletingAnnouncement(msg.id) }}
                                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  {/* AI Assistant entry — admin only */}
                  {isAdmin && (!inboxSearch || 'ai assistant'.includes(inboxSearch.toLowerCase())) && (
                    <button onClick={openAIThread}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-purple-50/50 text-left transition-colors">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 text-white text-base">✦</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <p className="text-sm font-semibold text-gray-900">AI Assistant</p>
                          <p className="text-[10px] text-purple-400">Admin</p>
                        </div>
                        <p className="text-xs text-gray-400 truncate">Manage sessions, members, and more…</p>
                      </div>
                    </button>
                  )}

                  {inbox.threads
                    .filter(t => !inboxSearch || t.other_name?.toLowerCase().includes(inboxSearch.toLowerCase()) || t.body?.toLowerCase().includes(inboxSearch.toLowerCase()))
                    .map(t => {
                    const unreadMsg = !t.is_read && t.sender_id !== user?.id
                    const isDeleting = deletingThread === t.other_user
                    return (
                      <div key={t.other_user} className="relative group">
                        {isDeleting ? (
                          <div className="flex items-center justify-between px-4 py-3 bg-red-50">
                            <p className="text-xs text-gray-700">Hide chat with <b>{t.other_name}</b>?</p>
                            <div className="flex gap-2 shrink-0 ml-2">
                              <button onClick={() => setDeletingThread(null)} className="text-xs text-gray-500 hover:text-gray-800">Cancel</button>
                              <button onClick={async () => {
                                await messagesAPI.deleteThread(t.other_user)
                                setDeletingThread(null)
                                loadInbox()
                              }} className="text-xs text-red-600 font-medium hover:text-red-800">Hide</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button onClick={() => openThread({ id: t.other_user, name: t.other_name })}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors pr-10">
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
                            <button
                              onClick={e => { e.stopPropagation(); setDeletingThread(t.other_user) }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500">
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
                    <p className="text-center text-gray-400 text-xs py-10">No messages yet.</p>
                  )}
                  </div>
                </>}
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
                  {isAIThread
                    ? <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 text-white text-sm">✦</div>
                    : <Avatar name={threadUser?.name} size="sm" />
                  }
                  <p className="flex-1 text-sm font-semibold text-gray-900">{isAIThread ? 'AI Assistant' : threadUser?.name}</p>
                  {isAIThread && aiMessages.length > 0 && (
                    <button onClick={() => setAiMessages([])} className="p-1 text-gray-300 hover:text-red-400 transition-colors" title="Clear history">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
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

                {/* AI messages */}
                {!minimized && isAIThread && (
                  <div ref={msgContainerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-[#f5f5f5]">
                    {aiMessages.length === 0 && (
                      <div className="py-6 text-center space-y-2">
                        <div className="text-3xl">✦</div>
                        <p className="text-xs font-medium text-gray-700">Hi! I'm your AI assistant.</p>
                        <p className="text-[10px] text-gray-400">Ask me to manage sessions, check balances, send announcements and more.</p>
                        <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                          {['List coaches', '今天誰簽到了？', 'This week sessions'].map(s => (
                            <button key={s} onClick={() => { setBody(s); inputRef.current?.focus() }}
                              className="text-[10px] bg-purple-50 text-purple-600 border border-purple-200 rounded-full px-2.5 py-1 hover:bg-purple-100 transition-colors">
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {aiMessages.map((m, i) => (
                      <div key={i} className={`flex items-end gap-1.5 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        {m.role === 'assistant' && (
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 text-white text-xs">✦</div>
                        )}
                        <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                          m.role === 'user' ? 'bg-[#07c160] text-white rounded-br-sm' : 'bg-white text-gray-900 rounded-bl-sm shadow-sm'
                        }`}>{m.content}</div>
                      </div>
                    ))}
                    {aiLoading && (
                      <div className="flex items-end gap-1.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 text-white text-xs">✦</div>
                        <div className="bg-white rounded-2xl rounded-bl-sm shadow-sm px-3 py-2.5">
                          <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay:`${i*0.15}s` }} />)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Regular messages */}
                {!minimized && !isAIThread && <div ref={msgContainerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1 bg-[#f5f5f5]">
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
                                      setActiveMsgAnchor({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, isMe })
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
                                    {msg.body && <span className="whitespace-pre-line">{msg.body}</span>}
                                    {msg.edited_at && !msg.deleted && (
                                      <span className={`text-[10px] ml-1 ${isMe ? 'text-white/60' : 'text-gray-400'}`}>edited</span>
                                    )}
                                    {/* Coach leave request — admin Approve/Reject/Assign Cover */}
                                    {msg.metadata?.type === 'coach_leave_request' && isAdmin && (() => {
                                      const rid = msg.metadata.request_id
                                      const status = msg.coach_leave_request_status
                                      const sessions = msg.metadata.sessions || []
                                      if (status === 'pending') return (
                                        <div className="flex gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                                          <button disabled={leaveActioning === rid}
                                            className="text-xs bg-white text-emerald-600 border border-emerald-300 rounded-full px-2.5 py-1 hover:bg-emerald-50 disabled:opacity-50"
                                            onClick={async () => {
                                              setLeaveActioning(rid)
                                              try { await coachingAPI.approveCoachLeaveRequest(rid); await loadThread(threadUser.id, false) }
                                              catch (err) { alert(err.response?.data?.message ?? 'Could not approve.') }
                                              finally { setLeaveActioning(null) }
                                            }}>✓ Approve</button>
                                          <button disabled={leaveActioning === rid}
                                            className="text-xs bg-white text-red-500 border border-red-300 rounded-full px-2.5 py-1 hover:bg-red-50 disabled:opacity-50"
                                            onClick={async () => {
                                              setLeaveActioning(rid)
                                              try { await coachingAPI.rejectCoachLeaveRequest(rid); await loadThread(threadUser.id, false) }
                                              catch (err) { alert(err.response?.data?.message ?? 'Could not reject.') }
                                              finally { setLeaveActioning(null) }
                                            }}>✗ Reject</button>
                                        </div>
                                      )
                                      if (status === 'approved') return (
                                        <div className="mt-2 space-y-1" onClick={e => e.stopPropagation()}>
                                          <p className="text-xs text-emerald-300">✅ Approved</p>
                                          {sessions.length > 0 && (
                                            <button className="text-xs bg-white/20 hover:bg-white/30 border border-white/40 rounded-full px-2.5 py-1 transition-colors"
                                              onClick={() => openAssignCoverModal(rid, sessions)}>
                                              👥 Assign Cover
                                            </button>
                                          )}
                                          <button disabled={leaveActioning === rid}
                                            className="text-xs bg-white/20 hover:bg-white/30 border border-white/40 rounded-full px-2.5 py-1 transition-colors disabled:opacity-50"
                                            onClick={async () => {
                                              setLeaveActioning(rid)
                                              try { await coachingAPI.offerStudentSlots(rid); await loadThread(threadUser.id, false) }
                                              catch (err) { alert(err.response?.data?.message ?? 'Error.') }
                                              finally { setLeaveActioning(null) }
                                            }}>📩 Offer Makeup Slots</button>
                                        </div>
                                      )
                                      if (status === 'rejected') return <p className="text-xs mt-1 text-red-300">❌ Rejected</p>
                                      return null
                                    })()}
                                    {/* Coach leave request — coach sees status pill */}
                                    {msg.metadata?.type === 'coach_leave_request' && !isAdmin && (() => {
                                      const status = msg.coach_leave_request_status
                                      if (status === 'pending')   return <p className="text-xs mt-1 text-white/70">🕐 Pending review</p>
                                      if (status === 'approved')  return <p className="text-xs mt-1 text-white/90">✅ Approved — arranging coverage</p>
                                      if (status === 'rejected')  return <p className="text-xs mt-1 text-white/70">❌ Rejected</p>
                                      return null
                                    })()}
                                    {/* Coverage request — substitute coach sees Accept/Decline */}
                                    {msg.metadata?.type === 'coverage_request' && !isAdmin && (() => {
                                      const coverages = msg.metadata.coverages || []
                                      const liveStatuses = msg.coverage_statuses || []
                                      const fmtD = d => new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})
                                      const fmtT = t => { const [h,m] = t.slice(0,5).split(':').map(Number); return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}` }
                                      return (
                                        <div className="mt-2 space-y-2" onClick={e => e.stopPropagation()}>
                                          {coverages.map(cv => {
                                            const live = liveStatuses.find(s => s.id === cv.id)
                                            const st = live?.status ?? 'pending'
                                            return (
                                              <div key={cv.id} className="bg-white/10 rounded-xl p-2 space-y-1">
                                                <p className="text-xs font-medium">{fmtD(cv.date)} · {fmtT(cv.start_time)}–{fmtT(cv.end_time)}</p>
                                                <p className="text-xs text-white/70">{cv.student_name}</p>
                                                {st === 'pending' ? (
                                                  <div className="flex gap-1.5">
                                                    <button disabled={coverageActioning === cv.id}
                                                      className="text-xs bg-emerald-500 text-white rounded-full px-2.5 py-1 hover:bg-emerald-600 disabled:opacity-50"
                                                      onClick={async () => {
                                                        setCoverageActioning(cv.id)
                                                        try {
                                                          await coachingAPI.respondCoverage(cv.id, { accept: true })
                                                          window.dispatchEvent(new CustomEvent('coaching-sessions-updated'))
                                                          await loadThread(threadUser.id, false)
                                                        }
                                                        catch (err) { alert(err.response?.data?.message ?? 'Error.') }
                                                        finally { setCoverageActioning(null) }
                                                      }}>✓ Accept</button>
                                                    <button disabled={coverageActioning === cv.id}
                                                      className="text-xs bg-white/20 border border-white/40 rounded-full px-2.5 py-1 hover:bg-white/30 disabled:opacity-50"
                                                      onClick={async () => {
                                                        setCoverageActioning(cv.id)
                                                        try { await coachingAPI.respondCoverage(cv.id, { accept: false }); await loadThread(threadUser.id, false) }
                                                        catch (err) { alert(err.response?.data?.message ?? 'Error.') }
                                                        finally { setCoverageActioning(null) }
                                                      }}>✗ Decline</button>
                                                  </div>
                                                ) : st === 'accepted' ? (
                                                  <p className="text-xs text-emerald-300">✅ Accepted</p>
                                                ) : (
                                                  <p className="text-xs text-white/50">❌ Declined</p>
                                                )}
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )
                                    })()}
                                    {/* Coverage declined — admin sees re-assign / offer student buttons */}
                                    {msg.metadata?.type === 'coverage_declined' && isAdmin && (() => {
                                      const { session_id, leave_req_id, session } = msg.metadata
                                      return (
                                        <div className="flex flex-wrap gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                                          {session && (
                                            <button className="text-xs bg-white text-gray-700 border border-gray-300 rounded-full px-2.5 py-1 hover:bg-gray-50"
                                              onClick={() => {
                                                coachingAPI.getCoaches().then(({ data }) => {
                                                  setAssignCoverCoaches(data.coaches || [])
                                                  setAssignCoverModal({ leaveReqId: leave_req_id, sessions: [session] })
                                                  setCoverageAssignments({})
                                                }).catch(() => {})
                                              }}>👥 Try Another Coach</button>
                                          )}
                                          <button disabled={leaveActioning === session_id}
                                            className="text-xs bg-white text-amber-600 border border-amber-300 rounded-full px-2.5 py-1 hover:bg-amber-50 disabled:opacity-50"
                                            onClick={async () => {
                                              setLeaveActioning(session_id)
                                              try { await coachingAPI.offerStudentSlot(session_id); await loadThread(threadUser.id, false) }
                                              catch (err) { alert(err.response?.data?.message ?? 'Error.') }
                                              finally { setLeaveActioning(null) }
                                            }}>📩 讓學生自選時間</button>
                                        </div>
                                      )
                                    })()}
                                    {/* Student leave request interactive */}
                                    {msg.metadata?.type === 'leave_request' && isAdmin && (() => {
                                      const rid = msg.metadata.request_id
                                      const status = msg.leave_request_status
                                      if (status === 'pending') return (
                                        <div className="flex gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                                          <button disabled={leaveActioning === rid}
                                            className="text-xs bg-white text-emerald-600 border border-emerald-300 rounded-full px-2.5 py-1 hover:bg-emerald-50 disabled:opacity-50"
                                            onClick={async () => {
                                              setLeaveActioning(rid)
                                              try { await coachingAPI.approveLeaveRequest(rid); await loadThread(threadUser.id, false) }
                                              catch (err) { alert(err.response?.data?.message ?? 'Could not approve.') }
                                              finally { setLeaveActioning(null) }
                                            }}>✓ Approve</button>
                                          <button disabled={leaveActioning === rid}
                                            className="text-xs bg-white text-red-500 border border-red-300 rounded-full px-2.5 py-1 hover:bg-red-50 disabled:opacity-50"
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
                                      if (status === 'rescheduled') return <p className="text-xs mt-1.5 text-emerald-300">✅ Rescheduled</p>
                                      if (expired || status === 'cancelled') return <p className="text-xs mt-1.5 text-gray-400">⏰ Window expired</p>
                                      if (declinedSlots.has(rid)) return <p className="text-xs mt-1.5 text-white/60">Please discuss with your admin to arrange a new time.</p>
                                      if (status === 'approved' && slots.length > 0) return (
                                        <div className="mt-2 space-y-1" onClick={e => e.stopPropagation()}>
                                          {slots.map((s, i) => {
                                            const [sh, sm] = s.start_time.slice(0,5).split(':').map(Number)
                                            const [eh, em] = s.end_time.slice(0,5).split(':').map(Number)
                                            const p = h => h >= 12 ? 'PM' : 'AM'
                                            const f = (h,m) => `${h%12||12}:${String(m).padStart(2,'0')} ${p(h)}`
                                            const dateLabel = new Date(s.date+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})
                                            return (
                                              <button key={i} disabled={leaveActioning === rid}
                                                className="block w-full text-left text-xs bg-white/20 hover:bg-white/30 border border-white/40 rounded-lg px-2.5 py-1 disabled:opacity-50"
                                                onClick={async () => {
                                                  setLeaveActioning(rid)
                                                  try {
                                                    await coachingAPI.selectLeaveSlot(rid, { date: s.date, start_time: s.start_time, end_time: s.end_time })
                                                    await loadThread(threadUser.id, true)
                                                  } catch (err) { alert(err.response?.data?.message ?? 'Could not reschedule.') }
                                                  finally { setLeaveActioning(null) }
                                                }}>
                                                {dateLabel} · {f(sh,sm)}–{f(eh,em)}
                                              </button>
                                            )
                                          })}
                                          <button
                                            className="block w-full text-left text-xs text-white/50 hover:text-white/80 px-1 py-1 transition-colors"
                                            onClick={e => { e.stopPropagation(); setDeclinedSlots(prev => new Set(prev).add(rid)); setTimeout(() => inputRef.current?.focus(), 50) }}>
                                            None of these — I'll discuss with admin
                                          </button>
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
                        </div>
                        {/* Read receipt */}
                        {showRead && (
                          <p className="text-right text-[10px] text-gray-400 pr-1 mt-0.5">Read</p>
                        )}
                      </div>
                    )
                  })}
                </div>} {/* end regular messages */}

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
                {!minimized && attachPreview && (
                  <div className="px-3 pt-2 shrink-0 relative w-fit">
                    <img src={attachPreview.data} alt="preview" className="h-16 rounded-xl object-cover" />
                    <button onClick={() => setAttachPreview(null)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-gray-700 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                  </div>
                )}

                {/* Input bar */}
                {!minimized && <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 bg-white shrink-0">
                  {!isAIThread && !isAdmin && partnerIsAdmin && (
                    <button onClick={isCoach ? openCoachLeaveModal : openLeaveModal} className="text-gray-400 hover:text-amber-500 shrink-0 transition-colors" title="Request Leave">
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
                  <input ref={inputRef} type="text" value={body}
                    onChange={e => setBody(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (isAIThread ? handleAISend() : handleSend())}
                    placeholder={isAIThread ? 'Ask AI…' : 'Message…'}
                    className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm text-black placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-200 transition-all"
                  />
                  <button
                    onClick={isAIThread ? handleAISend : handleSend}
                    disabled={isAIThread ? (!body.trim() || aiLoading) : (!body.trim() && !attachPreview || sending)}
                    className={`w-8 h-8 rounded-full disabled:bg-gray-200 flex items-center justify-center shrink-0 transition-colors ${isAIThread ? 'bg-gradient-to-br from-violet-500 to-purple-600' : 'bg-[#07c160]'}`}>
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                  </button>
                </div>}
              </>
            )}

            {/* ── Coach Leave Request Modal ── */}
            {coachLeaveModal && (
              <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/40 rounded-2xl p-3">
                <div className="bg-white rounded-2xl w-full p-4 space-y-3 max-h-[85%] overflow-y-auto">
                  <h3 className="text-sm font-semibold text-gray-900">Request Leave</h3>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Date</label>
                    <input type="date"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
                      value={coachLeaveDate}
                      onChange={e => { setCoachLeaveDate(e.target.value); loadCoachLeaveSessions(e.target.value) }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Sessions to request leave for</label>
                    {coachLeaveDateLoading ? (
                      <p className="text-xs text-gray-400">Loading…</p>
                    ) : coachLeaveDateSessions.length === 0 ? (
                      <p className="text-xs text-gray-400">No sessions on this date.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {coachLeaveDateSessions.map(s => {
                          const [sh, sm] = s.start_time.slice(0,5).split(':').map(Number)
                          const [eh, em] = s.end_time.slice(0,5).split(':').map(Number)
                          const p = h => h >= 12 ? 'PM' : 'AM'
                          const f = (h,m) => `${h%12||12}:${String(m).padStart(2,'0')} ${p(h)}`
                          const checked = coachLeaveSelectedIds.includes(s.id)
                          return (
                            <label key={s.id} className="flex items-start gap-2 cursor-pointer">
                              <input type="checkbox" checked={checked}
                                onChange={() => setCoachLeaveSelectedIds(prev => checked ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                                className="mt-0.5 accent-green-500" />
                              <span className="text-xs text-gray-800">{f(sh,sm)}–{f(eh,em)} <span className="text-gray-400">{s.student_name}</span></span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <input type="text"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
                    placeholder="Reason (e.g. Sick leave)"
                    value={coachLeaveReason} onChange={e => setCoachLeaveReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button className="flex-1 py-1.5 rounded-full border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                      onClick={() => setCoachLeaveModal(false)}>Cancel</button>
                    <button className="flex-1 py-1.5 rounded-full bg-[#07c160] text-white text-xs font-medium hover:bg-green-600 disabled:opacity-50"
                      disabled={coachLeaveSubmitting || !coachLeaveDate || coachLeaveSelectedIds.length === 0}
                      onClick={submitCoachLeaveRequest}>
                      {coachLeaveSubmitting ? 'Sending…' : `Request (${coachLeaveSelectedIds.length})`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Assign Cover Modal (admin) ── */}
            {assignCoverModal && (
              <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/40 rounded-2xl p-3">
                <div className="bg-white rounded-2xl w-full p-4 space-y-3 max-h-[85%] overflow-y-auto">
                  <h3 className="text-sm font-semibold text-gray-900">Assign Cover Coaches</h3>
                  {assignCoverModal.sessions.map(s => {
                    const [sh, sm] = s.start_time.slice(0,5).split(':').map(Number)
                    const [eh, em] = s.end_time.slice(0,5).split(':').map(Number)
                    const p = h => h >= 12 ? 'PM' : 'AM'
                    const f = (h,m) => `${h%12||12}:${String(m).padStart(2,'0')} ${p(h)}`
                    const d = new Date(String(s.date).slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})
                    return (
                      <div key={s.id} className="border border-gray-100 rounded-xl p-2.5 space-y-1.5">
                        <p className="text-xs font-medium text-gray-800">{d} · {f(sh,sm)}–{f(eh,em)}</p>
                        <p className="text-xs text-gray-400">{s.student_name}</p>
                        <select
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
                          value={coverageAssignments[s.id] || ''}
                          onChange={e => setCoverageAssignments(prev => ({ ...prev, [s.id]: e.target.value }))}>
                          <option value="">— No cover —</option>
                          {assignCoverCoaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    )
                  })}
                  <div className="flex gap-2">
                    <button className="flex-1 py-1.5 rounded-full border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                      onClick={() => setAssignCoverModal(null)}>Cancel</button>
                    <button className="flex-1 py-1.5 rounded-full bg-black text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                      disabled={assignCoverSubmitting || !Object.values(coverageAssignments).some(Boolean)}
                      onClick={submitAssignCover}>
                      {assignCoverSubmitting ? 'Sending…' : 'Send Requests'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Student Leave Request Modal ── */}
            {leaveModal && (
              <div className="absolute inset-0 z-20 flex items-end sm:items-center justify-center bg-black/40 rounded-2xl p-3">
                <div className="bg-white rounded-2xl w-full p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">Request Leave</h3>
                  {leaveSessions.length === 0 ? (
                    <>
                      <p className="text-xs text-gray-500">No upcoming coaching sessions.</p>
                      <button className="w-full py-1.5 rounded-full border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        onClick={() => setLeaveModal(false)}>Close</button>
                    </>
                  ) : (
                    <>
                      <select
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
                        value={leaveSessionId}
                        onChange={e => setLeaveSessionId(e.target.value)}
                      >
                        {leaveSessions.map(s => {
                          const [sh, sm] = s.start_time.slice(0,5).split(':').map(Number)
                          const [eh, em] = s.end_time.slice(0,5).split(':').map(Number)
                          const p = h => h >= 12 ? 'PM' : 'AM'
                          const f = (h,m) => `${h%12||12}:${String(m).padStart(2,'0')} ${p(h)}`
                          const d = new Date(String(s.date).slice(0,10)+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})
                          return <option key={s.id} value={s.id}>{d} {f(sh,sm)}–{f(eh,em)} ({s.coach_name})</option>
                        })}
                      </select>
                      <input type="text" className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
                        placeholder="Reason (optional)" value={leaveReason} onChange={e => setLeaveReason(e.target.value)} />
                      <div className="flex gap-2">
                        <button className="flex-1 py-1.5 rounded-full border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                          onClick={() => setLeaveModal(false)}>Cancel</button>
                        <button className="flex-1 py-1.5 rounded-full bg-[#07c160] text-white text-xs font-medium hover:bg-green-600 disabled:opacity-50"
                          disabled={leaveSubmitting || !leaveSessionId} onClick={submitLeaveRequest}>
                          {leaveSubmitting ? 'Sending…' : 'Send Request'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Announcement detail overlay ── */}
            {selectedAnnouncement && (
              <div className="absolute inset-0 z-10 bg-white flex flex-col rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-100 shrink-0">
                  <button onClick={() => setSelectedAnnouncement(null)} className="p-1 text-gray-500 hover:text-black">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  <p className="flex-1 text-sm font-semibold text-gray-900">Announcement</p>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingAnnouncement({ id: selectedAnnouncement.id, body: selectedAnnouncement.body }); setSelectedAnnouncement(null) }}
                        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-blue-500 text-sm">✎</button>
                      <button onClick={() => { setDeletingAnnouncement(selectedAnnouncement.id); setSelectedAnnouncement(null) }}
                        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                  <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-black">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                  <p className="text-[11px] text-gray-400">{new Date(selectedAnnouncement.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })} · {selectedAnnouncement.sender_name}</p>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{selectedAnnouncement.body}</p>
                </div>
              </div>
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
