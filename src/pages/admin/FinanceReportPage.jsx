import { useState, useEffect, useCallback, useRef } from 'react'
import { financeAPI, adminAPI, coachingAPI } from '@/api/api'

// ── Settings sub-panel ────────────────────────────────────────────────────────
function FinanceSettings({ onClose }) {
  const [recurring,     setRecurring]     = useState([])
  const [coachRates,    setCoachRates]    = useState([])
  const [editingR,      setEditingR]      = useState(null)  // recurring row being edited
  const [editingC,      setEditingC]      = useState(null)  // coach id being edited
  const [newR, setNewR] = useState({ description: '', amount: '', category: 'rent' })
  const [addingR, setAddingR] = useState(false)

  const load = async () => {
    const [r, c] = await Promise.all([
      financeAPI.getRecurring().catch(() => ({ data: { recurring: [] } })),
      financeAPI.getCoachRates().catch(() => ({ data: { coaches: [] } })),
    ])
    setRecurring(r.data.recurring ?? [])
    setCoachRates(c.data.coaches ?? [])
  }
  useEffect(() => { load() }, [])

  const saveRecurring = async (id, data) => {
    await financeAPI.updateRecurring(id, data)
    setEditingR(null); load()
  }
  const deleteRecurring = async (id) => {
    if (!window.confirm('Delete this recurring expense?')) return
    await financeAPI.deleteRecurring(id); load()
  }
  const addRecurring = async () => {
    if (!newR.description.trim() || !newR.amount) return
    await financeAPI.addRecurring(newR)
    setNewR({ description: '', amount: '', category: 'rent' }); setAddingR(false); load()
  }
  const saveCoachRate = async (id, rate) => {
    await financeAPI.updateCoachRate(id, rate === '' ? null : Number(rate))
    setEditingC(null); load()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-full sm:max-w-lg rounded-2xl p-6 max-h-[85vh] overflow-y-auto space-y-6">
        <div className="flex justify-between items-center">
          <p className="font-medium text-gray-900">Expense Settings</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        {/* Recurring expenses */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium uppercase tracking-widest text-gray-500">Recurring Expenses</p>
            <button onClick={() => setAddingR(true)} className="text-xs text-black border border-gray-300 px-3 py-1 rounded-full hover:bg-gray-50">+ Add</button>
          </div>
          <p className="text-xs text-gray-400 mb-3">Fixed costs (rent, supplies) — auto-included in every report. Coach salaries are set in the section below.</p>

          {addingR && (
            <div className="border border-gray-200 rounded-xl p-3 mb-3 space-y-2">
              <select value={newR.category} onChange={e => setNewR(r => ({...r, category: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
                {EXPENSE_CATEGORIES.filter(c => c.value !== 'other' && c.value !== 'salary').map(c =>
                  <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <input placeholder="Description" value={newR.description}
                onChange={e => setNewR(r => ({...r, description: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
              <div className="flex gap-2">
                <input type="number" placeholder="Amount (AUD)" value={newR.amount}
                  onChange={e => setNewR(r => ({...r, amount: e.target.value}))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                <button onClick={addRecurring} className="bg-black text-white text-xs px-3 py-1.5 rounded-lg">Save</button>
                <button onClick={() => setAddingR(false)} className="text-xs text-gray-500 px-2">Cancel</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {recurring.map(r => editingR === r.id ? (
              <RecurringEditRow key={r.id} row={r} onSave={data => saveRecurring(r.id, data)} onCancel={() => setEditingR(null)} />
            ) : (
              <div key={r.id} className={`flex items-center gap-3 text-sm border border-gray-100 rounded-xl px-3 py-2 ${!r.is_active ? 'opacity-50' : ''}`}>
                <span className="text-xs text-gray-400 w-16">{CAT_LABEL[r.category] ?? r.category}</span>
                <span className="flex-1 text-gray-700">{r.description}</span>
                <span className="font-medium text-gray-900">{fmt(r.amount)}</span>
                <button onClick={() => setEditingR(r.id)} className="text-xs text-gray-400 hover:text-black">Edit</button>
                <button onClick={() => saveRecurring(r.id, { is_active: !r.is_active })}
                  className={`text-xs ${r.is_active ? 'text-gray-400 hover:text-orange-500' : 'text-gray-400 hover:text-green-600'}`}>
                  {r.is_active ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => deleteRecurring(r.id)} className="text-xs text-gray-300 hover:text-red-500">✕</button>
              </div>
            ))}
            {recurring.length === 0 && !addingR && <p className="text-xs text-gray-400">No recurring expenses set.</p>}
          </div>
        </div>

        {/* Coach pay rates */}
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-3">Coach Pay Rates</p>
          <p className="text-xs text-gray-400 mb-3">Salary = sessions completed in period × rate. Leave blank to exclude a coach.</p>
          <div className="space-y-2">
            {coachRates.map(c => editingC === c.id ? (
              <CoachRateEditRow key={c.id} coach={c} onSave={rate => saveCoachRate(c.id, rate)} onCancel={() => setEditingC(null)} />
            ) : (
              <div key={c.id} className="flex items-center gap-3 text-sm border border-gray-100 rounded-xl px-3 py-2">
                <span className="flex-1 text-gray-700">{c.name}</span>
                <span className={`font-medium ${c.pay_rate_per_session ? 'text-gray-900' : 'text-gray-300'}`}>
                  {c.pay_rate_per_session ? `$${c.pay_rate_per_session}/session` : 'Not set'}
                </span>
                <button onClick={() => setEditingC(c.id)} className="text-xs text-gray-400 hover:text-black">Edit</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function RecurringEditRow({ row, onSave, onCancel }) {
  const [desc, setDesc]   = useState(row.description)
  const [amt,  setAmt]    = useState(row.amount)
  const [cat,  setCat]    = useState(row.category)
  return (
    <div className="border border-black/10 rounded-xl p-3 space-y-2">
      <select value={cat} onChange={e => setCat(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
        {EXPENSE_CATEGORIES.filter(c => c.value !== 'other' && c.value !== 'salary').map(c =>
          <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <input value={desc} onChange={e => setDesc(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
      <div className="flex gap-2">
        <input type="number" value={amt} onChange={e => setAmt(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
        <button onClick={() => onSave({ description: desc, amount: Number(amt), category: cat })}
          className="bg-black text-white text-xs px-3 py-1.5 rounded-lg">Save</button>
        <button onClick={onCancel} className="text-xs text-gray-500 px-2">Cancel</button>
      </div>
    </div>
  )
}

function CoachRateEditRow({ coach, onSave, onCancel }) {
  const [rate, setRate] = useState(coach.pay_rate_per_session ?? '')
  return (
    <div className="flex items-center gap-2 border border-black/10 rounded-xl px-3 py-2">
      <span className="flex-1 text-sm text-gray-700">{coach.name}</span>
      <input type="number" value={rate} onChange={e => setRate(e.target.value)}
        placeholder="Rate per session"
        className="w-36 border border-gray-200 rounded-lg px-3 py-1 text-sm focus:outline-none" />
      <button onClick={() => onSave(rate)} className="bg-black text-white text-xs px-3 py-1.5 rounded-lg">Save</button>
      <button onClick={onCancel} className="text-xs text-gray-500 px-2">Cancel</button>
    </div>
  )
}

const INCOME_CATEGORIES = [
  { value: 'booking',  label: 'Table Booking' },
  { value: 'social',   label: 'Social Play' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'shop',     label: 'Shop' },
  { value: 'other',    label: 'Other' },
]

const EXPENSE_CATEGORIES = [
  { value: 'salary',   label: 'Coach Salary' },
  { value: 'rent',     label: 'Venue Rental' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'other',    label: 'Other' },
]

const CAT_LABEL = Object.fromEntries(
  [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].map(c => [c.value, c.label])
)

function today() { return new Date().toISOString().slice(0, 10) }
function monthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function fmt(amount) {
  return Number(amount).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })
}

export default function FinanceReportPage() {
  const [topTab, setTopTab] = useState('report')  // 'report' | 'wallets'

  // ── Report state ──────────────────────────────────────────────────────────
  const [from, setFrom]         = useState(monthStart())
  const [to,   setTo]           = useState(today())
  const [report, setReport]     = useState(null)
  const [loading, setLoading]   = useState(false)

  // Cash entry form
  const [cashOpen,         setCashOpen]         = useState(false)
  const [cashTxType,       setCashTxType]        = useState('income')  // income | expense
  const [cashAmount,       setCashAmount]        = useState('')
  const [cashCat,          setCashCat]           = useState('other')
  const [cashDesc,         setCashDesc]          = useState('')
  const [cashMember,       setCashMember]        = useState('')
  const [cashMemberQuery,  setCashMemberQuery]   = useState('')
  const [memberDropOpen,   setMemberDropOpen]    = useState(false)
  const [members,          setMembers]           = useState([])
  const [savingCash,       setSavingCash]        = useState(false)
  const [cashError,        setCashError]         = useState(null)

  // Filters
  const [filterType,    setFilterType]    = useState('all')  // all | online | cash | auto
  const [filterCat,     setFilterCat]     = useState('all')
  const [filterTxType,  setFilterTxType]  = useState('all')  // all | income | expense

  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [visibleCount,  setVisibleCount]  = useState(10)
  const sentinelRef = useRef(null)

  // ── Wallets state ─────────────────────────────────────────────────────────
  const [walletSearch,      setWalletSearch]      = useState('')
  const [walletDropOpen,    setWalletDropOpen]    = useState(false)
  const [walletTarget,      setWalletTarget]      = useState(null)  // { userId, name, balance, ledger, soloPrice, groupPrice }
  const [walletLoading,     setWalletLoading]     = useState(false)
  const [walletForm,        setWalletForm]        = useState({ delta: '', note: '' })
  const [walletSaving,      setWalletSaving]      = useState(false)
  const [walletError,       setWalletError]       = useState(null)
  const [pricingForm,       setPricingForm]       = useState({ solo: '', group: '', saving: false })

  const loadWallet = async (userId, name) => {
    setWalletLoading(true); setWalletError(null)
    try {
      const [{ data: wd }, { data: pd }] = await Promise.all([
        financeAPI.getWallet(userId),
        coachingAPI.getStudentPrices(userId),
      ])
      setWalletTarget({ userId, name, balance: wd.balance, ledger: wd.ledger })
      setWalletForm({ delta: '', note: '' })
      setPricingForm({ solo: String(pd.solo_price ?? ''), group: String(pd.group_price ?? ''), saving: false })
    } catch { setWalletError('Failed to load wallet.') }
    finally { setWalletLoading(false) }
  }

  const handleTopUp = async () => {
    const d = parseFloat(walletForm.delta)
    if (!walletForm.delta || isNaN(d) || d === 0) { setWalletError('Enter a non-zero amount.'); return }
    setWalletSaving(true); setWalletError(null)
    try {
      const { data } = await financeAPI.topUpWallet(walletTarget.userId, { delta: d, note: walletForm.note || null })
      const { data: wd } = await financeAPI.getWallet(walletTarget.userId)
      setWalletTarget(t => ({ ...t, balance: data.balance, ledger: wd.ledger }))
      setWalletForm({ delta: '', note: '' })
    } catch (err) { setWalletError(err.response?.data?.message ?? 'Failed.') }
    finally { setWalletSaving(false) }
  }

  const handleSavePricing = async () => {
    const solo  = parseFloat(pricingForm.solo)
    const group = parseFloat(pricingForm.group)
    if (isNaN(solo) || isNaN(group)) return
    setPricingForm(f => ({ ...f, saving: true }))
    try {
      await coachingAPI.updateStudentPrices(walletTarget.userId, { solo_price: solo, group_price: group })
      setPricingForm(f => ({ ...f, saving: false }))
    } catch { setPricingForm(f => ({ ...f, saving: false })) }
  }

  const fetchReport = useCallback(() => {
    setLoading(true)
    setVisibleCount(10)
    financeAPI.getReport(from, to)
      .then(r => setReport(r.data))
      .catch(() => setReport(null))
      .finally(() => setLoading(false))
  }, [from, to])

  useEffect(() => { fetchReport() }, [fetchReport])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setVisibleCount(v => v + 10)
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  // re-attach whenever the list changes so sentinel position is re-evaluated
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, filterType, filterCat, filterTxType, visibleCount])

  useEffect(() => {
    adminAPI.getAllMembers().then(r => setMembers(r.data.members ?? [])).catch(() => {})
  }, [])

  async function handleAddCash(e) {
    e.preventDefault()
    if (!cashAmount || isNaN(cashAmount) || Number(cashAmount) <= 0) {
      setCashError('Enter a valid amount.'); return
    }
    setSavingCash(true); setCashError(null)
    try {
      await financeAPI.addCash({
        amount:      Number(cashAmount),
        category:    cashCat,
        type:        cashTxType,
        description: cashDesc.trim() || undefined,
        member_id:   cashMember || undefined,
      })
      setCashAmount(''); setCashDesc(''); setCashMember(''); setCashMemberQuery('')
      setCashCat('other'); setCashTxType('income')
      setCashOpen(false)
      fetchReport()
    } catch (err) {
      setCashError(err.response?.data?.message ?? 'Failed to save.')
    } finally { setSavingCash(false) }
  }

  async function handleDeleteCash(id) {
    if (!window.confirm('Delete this cash entry?')) return
    try {
      await financeAPI.deleteCash(id)
      fetchReport()
    } catch {}
  }

  function exportCSV() {
    if (!report) return
    const rows = filteredRows()
    const header = 'Date,Category,Payment Type,Type,Amount,Member,Reference'
    const lines = rows.map(r =>
      [r.date, CAT_LABEL[r.category] ?? r.category, r.payment_type, r.type ?? 'income',
       r.amount, `"${r.member_name}"`, `"${r.reference}"`].join(',')
    )
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `finance_${from}_${to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  function filteredRows() {
    if (!report) return []
    return report.rows.filter(r => {
      if (filterType   !== 'all' && r.payment_type    !== filterType)   return false
      if (filterCat    !== 'all' && r.category         !== filterCat)    return false
      if (filterTxType !== 'all' && (r.type ?? 'income') !== filterTxType) return false
      return true
    })
  }

  const allRows = filteredRows()
  const rows = allRows.slice(0, visibleCount)

  return (
    <div className="min-h-screen bg-white pt-6 pb-16 px-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-medium text-gray-900">Finance</h1>
        {topTab === 'report' && (
          <div className="flex gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-xs border border-gray-300 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors"
            >
              ⚙ Settings
            </button>
            <button
              onClick={() => setCashOpen(o => !o)}
              className="flex items-center gap-2 bg-black text-white text-xs px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
            >
              + Record Cash
            </button>
          </div>
        )}
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {[['report', 'Report'], ['wallets', 'Member Wallets']].map(([key, label]) => (
          <button key={key} onClick={() => setTopTab(key)}
            className={`px-5 py-1.5 rounded-lg text-sm transition-all ${topTab === key ? 'bg-white text-black shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {settingsOpen && <FinanceSettings onClose={() => { setSettingsOpen(false); fetchReport() }} />}

      {/* Cash entry modal */}
      {cashOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setCashOpen(false) }}>
          <div className="bg-white w-full sm:max-w-sm rounded-2xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <p className="font-medium text-gray-900">Record Cash</p>
              <button onClick={() => setCashOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAddCash} className="space-y-3">
              {/* Income / Expense toggle */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                {['income', 'expense'].map(t => (
                  <button
                    key={t} type="button"
                    onClick={() => { setCashTxType(t); setCashCat('other') }}
                    className={`flex-1 py-2 transition-colors ${cashTxType === t
                      ? t === 'expense' ? 'bg-red-500 text-white' : 'bg-black text-white'
                      : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    {t === 'income' ? 'Income' : 'Expense'}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Amount (AUD)</label>
                <input
                  type="number" step="0.01" min="0.01"
                  value={cashAmount} onChange={e => setCashAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Category</label>
                <select
                  value={cashCat} onChange={e => setCashCat(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
                >
                  {(cashTxType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES)
                    .map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="relative">
                <label className="text-xs text-gray-500 mb-1 block">Member (optional)</label>
                <input
                  type="text"
                  value={cashMemberQuery}
                  onChange={e => {
                    setCashMemberQuery(e.target.value)
                    setCashMember('')
                    setMemberDropOpen(true)
                  }}
                  onFocus={() => setMemberDropOpen(true)}
                  onBlur={() => setTimeout(() => setMemberDropOpen(false), 150)}
                  placeholder="Search by name or email…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
                />
                {cashMember && (
                  <button
                    type="button"
                    onClick={() => { setCashMember(''); setCashMemberQuery('') }}
                    className="absolute right-2 top-7 text-gray-400 hover:text-gray-700 text-sm"
                  >×</button>
                )}
                {memberDropOpen && cashMemberQuery.length > 0 && (
                  <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg mt-1 max-h-44 overflow-y-auto shadow-md text-sm">
                    {members
                      .filter(m => {
                        const q = cashMemberQuery.toLowerCase()
                        return (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)
                      })
                      .slice(0, 20)
                      .map(m => (
                        <li
                          key={m.id}
                          onMouseDown={() => {
                            setCashMember(m.id)
                            setCashMemberQuery(m.name || m.email)
                            setMemberDropOpen(false)
                          }}
                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                        >
                          <span className="font-medium">{m.name || '—'}</span>
                          <span className="text-gray-400 ml-2 text-xs">{m.email}</span>
                        </li>
                      ))
                    }
                    {members.filter(m => {
                      const q = cashMemberQuery.toLowerCase()
                      return (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)
                    }).length === 0 && (
                      <li className="px-3 py-2 text-gray-400">No members found.</li>
                    )}
                  </ul>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Description (optional)</label>
                <input
                  type="text"
                  value={cashDesc} onChange={e => setCashDesc(e.target.value)}
                  placeholder={cashTxType === 'expense' ? 'e.g. Court rental, electricity bill' : 'e.g. Walk-in booking, court 2'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
                />
              </div>
              {cashError && <p className="text-xs text-red-500">{cashError}</p>}
              <button
                type="submit" disabled={savingCash}
                className={`w-full text-white text-sm py-2.5 rounded-xl disabled:opacity-50 transition-colors ${cashTxType === 'expense' ? 'bg-red-500 hover:bg-red-600' : 'bg-black hover:bg-gray-800'}`}
              >
                {savingCash ? 'Saving…' : 'Save'}
              </button>
            </form>
          </div>
        </div>
      )}

      {topTab === 'report' && <>
      {/* Date range */}
      <div className="flex gap-3 flex-wrap mb-6">
        <div>
          <label className="text-[10px] tracking-widest uppercase text-gray-400 block mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500" />
        </div>
        <div>
          <label className="text-[10px] tracking-widest uppercase text-gray-400 block mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500" />
        </div>
        <div className="flex items-end">
          <button onClick={fetchReport} className="border border-gray-300 text-sm px-4 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
            Apply
          </button>
        </div>
        <div className="flex items-end ml-auto">
          <button onClick={exportCSV} className="text-xs text-gray-500 hover:text-black border border-gray-200 px-3 py-1.5 rounded-lg transition-colors">
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {report && (
        <>
          {/* Top row: Income / Expenses / Net */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-[10px] tracking-widest uppercase text-gray-400 mb-1">Income</p>
              <p className="text-xl font-normal text-gray-800">{fmt(report.summary.income ?? 0)}</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-[10px] tracking-widest uppercase text-gray-400 mb-1">Expenses</p>
              <p className="text-xl font-normal text-red-500">{fmt(report.summary.expense ?? 0)}</p>
            </div>
            <div className="border border-black rounded-xl p-4">
              <p className="text-[10px] tracking-widest uppercase text-gray-400 mb-1">Net Income</p>
              <p className={`text-xl font-normal ${(report.summary.net ?? 0) >= 0 ? 'text-black' : 'text-red-500'}`}>
                {fmt(report.summary.net ?? 0)}
              </p>
            </div>
          </div>

          {/* Bottom row: income breakdown / expense breakdown */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-[10px] tracking-widest uppercase text-gray-400 mb-2">Income Breakdown</p>
              {INCOME_CATEGORIES.filter(c => {
                const key = c.value === 'other' ? 'other_income' : c.value
                return (report.summary[key] || 0) > 0
              }).map(c => {
                const key = c.value === 'other' ? 'other_income' : c.value
                return (
                  <div key={c.value} className="flex justify-between text-xs text-gray-600 mb-0.5">
                    <span>{c.label}</span><span>{fmt(report.summary[key])}</span>
                  </div>
                )
              })}
              <div className="flex justify-between text-xs text-gray-400 mt-1 pt-1 border-t border-gray-100">
                <span>Online</span><span>{fmt(report.summary.online ?? 0)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                <span>Cash</span><span>{fmt(report.summary.cash ?? 0)}</span>
              </div>
            </div>
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-[10px] tracking-widest uppercase text-gray-400 mb-2">Expense Breakdown</p>
              {EXPENSE_CATEGORIES.filter(c => {
                const key = c.value === 'other' ? 'other_expense' : c.value
                return (report.summary[key] || 0) > 0
              }).map(c => {
                const key = c.value === 'other' ? 'other_expense' : c.value
                return (
                  <div key={c.value} className="flex justify-between text-xs text-gray-600 mb-0.5">
                    <span>{c.label}</span><span className="text-red-500">{fmt(report.summary[key])}</span>
                  </div>
                )
              })}
              {EXPENSE_CATEGORIES.every(c => {
                const key = c.value === 'other' ? 'other_expense' : c.value
                return !(report.summary[key] || 0)
              }) && <p className="text-xs text-gray-400">No expenses recorded.</p>}
            </div>
          </div>
        </>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-4">
        {[
          { value: 'all', label: 'All' },
          { value: 'income', label: 'Income' },
          { value: 'expense', label: 'Expenses' },
        ].map(t => (
          <button key={t.value} onClick={() => { setFilterTxType(t.value); setVisibleCount(10) }}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterTxType === t.value ? 'bg-black text-white border-black' : 'border-gray-300 text-gray-600 hover:border-black'}`}>
            {t.label}
          </button>
        ))}
        <span className="text-gray-200">|</span>
        {[
          { value: 'all',    label: 'All Types' },
          { value: 'online', label: 'Online' },
          { value: 'cash',   label: 'Cash' },
          { value: 'auto',   label: 'Auto' },
        ].map(t => (
          <button key={t.value} onClick={() => { setFilterType(t.value); setVisibleCount(10) }}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterType === t.value ? 'bg-black text-white border-black' : 'border-gray-300 text-gray-600 hover:border-black'}`}>
            {t.label}
          </button>
        ))}
        <span className="text-gray-200">|</span>
        {['all', ...INCOME_CATEGORIES.map(c => c.value)].map(c => (
          <button key={c} onClick={() => { setFilterCat(c); setVisibleCount(10) }}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterCat === c ? 'bg-black text-white border-black' : 'border-gray-300 text-gray-600 hover:border-black'}`}>
            {c === 'all' ? 'All Categories' : CAT_LABEL[c]}
          </button>
        ))}
      </div>

      {/* Transactions table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-[10px] tracking-widest uppercase text-gray-400">Details</span>
          <span className="text-[10px] tracking-widest uppercase text-gray-400">Type</span>
          <span className="text-[10px] tracking-widest uppercase text-gray-400 text-right">Amount</span>
          <span />
        </div>

        {loading && (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        )}

        {!loading && rows.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">No transactions found.</div>
        )}

        {!loading && rows.map((r, i) => {
          const isExpense = r.type === 'expense'
          return (
            <div key={i} className={`grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 ${isExpense ? 'bg-red-50/40' : ''}`}>
              <div className="min-w-0">
                <p className="text-sm text-gray-900 truncate">
                  {isExpense
                    ? <span className="text-red-600">{CAT_LABEL[r.category] ?? r.category}</span>
                    : (CAT_LABEL[r.category] ?? r.category)}
                  {r.member_name && r.member_name !== 'N/A' && (
                    <span className="text-gray-400"> · {r.member_name}</span>
                  )}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {new Date(r.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {r.reference && ` · ${r.reference}`}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                r.payment_type === 'cash'   ? 'bg-amber-100 text-amber-700' :
                r.payment_type === 'auto'   ? 'bg-purple-100 text-purple-700' :
                'bg-sky-100 text-sky-700'}`}>
                {r.payment_type === 'cash' ? 'Cash' : r.payment_type === 'auto' ? 'Auto' : 'Online'}
              </span>
              <span className={`text-sm font-medium text-right ${isExpense ? 'text-red-500' : 'text-gray-900'}`}>
                {isExpense ? '−' : ''}{fmt(r.amount)}
              </span>
              {r.payment_type === 'cash' && r.id ? (
                <button onClick={() => handleDeleteCash(r.id)} className="text-gray-300 hover:text-red-500 transition-colors text-xs pl-1">✕</button>
              ) : <span />}
            </div>
          )
        })}
      </div>

      {!loading && allRows.length > 0 && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {rows.length} of {allRows.length} transaction{allRows.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
      {!loading && visibleCount < allRows.length && (
        <div ref={sentinelRef} className="h-8" />
      )}
      </>}

      {/* ── Wallets tab ─────────────────────────────────────────────────── */}
      {topTab === 'wallets' && (
        <div className="space-y-6">
          {/* Member search */}
          <div className="border border-gray-200 rounded-2xl p-5 space-y-4">
            <p className="text-sm font-medium text-gray-900">Look Up Member Wallet</p>
            <div className="relative">
              <input
                type="text"
                value={walletSearch}
                onChange={e => { setWalletSearch(e.target.value); setWalletDropOpen(true) }}
                onFocus={() => setWalletDropOpen(true)}
                onBlur={() => setTimeout(() => setWalletDropOpen(false), 150)}
                placeholder="Search by name or email…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
              />
              {walletSearch && walletDropOpen && (
                <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg mt-1 max-h-44 overflow-y-auto shadow-md text-sm">
                  {members
                    .filter(m => {
                      const q = walletSearch.toLowerCase()
                      return (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)
                    })
                    .slice(0, 20)
                    .map(m => (
                      <li
                        key={m.id}
                        onMouseDown={() => {
                          setWalletSearch(m.name || m.email)
                          setWalletDropOpen(false)
                          loadWallet(m.id, m.name || m.email)
                        }}
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                      >
                        <span className="font-medium">{m.name || '—'}</span>
                        <span className="text-gray-400 ml-2 text-xs">{m.email}</span>
                      </li>
                    ))
                  }
                  {members.filter(m => {
                    const q = walletSearch.toLowerCase()
                    return (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)
                  }).length === 0 && (
                    <li className="px-3 py-2 text-gray-400">No members found.</li>
                  )}
                </ul>
              )}
            </div>
            {walletLoading && <p className="text-xs text-gray-400">Loading…</p>}
          </div>

          {/* Member wallet details */}
          {walletTarget && !walletLoading && (
            <div className="border border-gray-200 rounded-2xl p-5 space-y-5">
              <p className="text-sm font-medium text-gray-900">{walletTarget.name}</p>

              {/* Balance */}
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Balance</p>
                <p className={`text-3xl font-light ${(walletTarget.balance ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {fmt(walletTarget.balance ?? 0)}
                </p>
              </div>

              {/* Session pricing */}
              <div className="border-t border-gray-100 pt-4 space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-widest">Session Pricing</p>
                <div className="flex gap-3 items-center">
                  <div className="flex items-center gap-1.5 flex-1">
                    <span className="text-xs text-gray-500 whitespace-nowrap">1-on-1 $</span>
                    <input
                      type="number" min="0" step="0.01" placeholder="e.g. 70"
                      value={pricingForm.solo}
                      onChange={e => setPricingForm(f => ({ ...f, solo: e.target.value }))}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-1">
                    <span className="text-xs text-gray-500 whitespace-nowrap">Group $</span>
                    <input
                      type="number" min="0" step="0.01" placeholder="e.g. 50"
                      value={pricingForm.group}
                      onChange={e => setPricingForm(f => ({ ...f, group: e.target.value }))}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500"
                    />
                  </div>
                  <button
                    onClick={handleSavePricing}
                    disabled={pricingForm.saving || !pricingForm.solo || !pricingForm.group}
                    className="bg-black text-white text-xs px-4 py-1.5 rounded-lg disabled:opacity-40 whitespace-nowrap"
                  >
                    {pricingForm.saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Manual top-up / adjustment */}
              <div className="border-t border-gray-100 pt-4 space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-widest">Manual Adjustment</p>
                <p className="text-xs text-gray-400">Positive = credit (top-up). Negative = deduction.</p>
                <div className="flex gap-2">
                  <input
                    type="number" step="0.01" placeholder="e.g. 200 or -50"
                    value={walletForm.delta}
                    onChange={e => setWalletForm(f => ({ ...f, delta: e.target.value }))}
                    className="w-36 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
                  />
                  <input
                    type="text" placeholder="Note (optional)"
                    value={walletForm.note}
                    onChange={e => setWalletForm(f => ({ ...f, note: e.target.value }))}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
                  />
                  <button
                    onClick={handleTopUp}
                    disabled={walletSaving || !walletForm.delta || walletForm.delta === '0'}
                    className="bg-black text-white text-xs px-4 py-2 rounded-lg disabled:opacity-40"
                  >
                    {walletSaving ? 'Saving…' : 'Apply'}
                  </button>
                </div>
                {walletError && <p className="text-xs text-red-500">{walletError}</p>}
              </div>

              {/* Ledger */}
              {walletTarget.ledger?.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-3">Recent Transactions</p>
                  <div className="space-y-0 divide-y divide-gray-100">
                    {walletTarget.ledger.map(entry => (
                      <div key={entry.id} className="flex items-center gap-3 py-2.5 text-sm">
                        <span className="text-xs text-gray-400 w-20 shrink-0">
                          {new Date(entry.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                          entry.session_type === 'group'  ? 'bg-teal-100 text-teal-700' :
                          entry.session_type === 'credit' ? 'bg-blue-100 text-blue-700' :
                          'bg-emerald-100 text-emerald-700'}`}>
                          {entry.session_type === 'group' ? 'Group' : entry.session_type === 'credit' ? 'Credit' : '1-on-1'}
                        </span>
                        <span className={`font-medium tabular-nums ${parseFloat(entry.delta) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {parseFloat(entry.delta) >= 0 ? '+' : ''}{fmt(Math.abs(parseFloat(entry.delta)))}
                        </span>
                        <span className="text-gray-400 text-xs truncate">{entry.note || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {walletTarget.ledger?.length === 0 && (
                <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">No transactions yet.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
