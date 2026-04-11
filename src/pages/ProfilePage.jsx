import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { profileAPI } from '@/api/api'
import FormInput from '@/components/common/FormInput'

export default function ProfilePage() {
  const { user, updateUser } = useAuth()
  const [form, setForm] = useState({
    name:  user?.name  ?? '',
    phone: user?.phone ?? '',
  })
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')
  const [confirm, setConfirm] = useState(false) // waiting for name-change confirmation

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const nameChanging = form.name.trim() !== (user?.name ?? '')
  const nameLocked = user?.name_changed_at
    ? (Date.now() - new Date(user.name_changed_at)) / (1000 * 60 * 60 * 24) < 7
    : false
  const nextAllowedDate = user?.name_changed_at
    ? new Date(new Date(user.name_changed_at).getTime() + 7 * 24 * 60 * 60 * 1000)
        .toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    : null

  const handleProfileSave = async (e) => {
    e.preventDefault()
    // If name is changing, require confirmation first
    if (nameChanging && !confirm) {
      setConfirm(true)
      return
    }
    setConfirm(false)
    setSaving(true)
    setError('')
    try {
      const { data } = await profileAPI.update({ name: form.name.trim(), phone: form.phone })
      updateUser({ name: data.user?.name ?? form.name, phone: data.user?.phone ?? form.phone, name_changed_at: data.user?.name_changed_at ?? null })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save. Please try again.')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white min-h-screen pt-24 pb-16 px-4 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-5 mb-10 pb-8 border-b border-gray-300">
        <div className="w-16 h-16 rounded-full bg-black flex items-center justify-center text-2xl font-display text-white">
          {user?.name?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <div>
          <h1 className="font-display text-2xl font-normal text-black">{user?.name ?? 'Player'}</h1>
          <p className="text-gray-700 text-sm mt-0.5">{user?.email}</p>
          <span className="inline-block text-[10px] tracking-widest uppercase border border-gray-300 text-gray-700 px-2 py-0.5 mt-2 capitalize">
            {user?.role ?? 'Member'}
          </span>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleProfileSave} className="space-y-5">
        <div>
          <FormInput id="name" name="name" label="Full Name" value={form.name} onChange={handleChange} disabled={nameLocked} />
          {nameLocked && <p className="text-xs text-gray-400 mt-1">Name can be changed again on {nextAllowedDate}.</p>}
        </div>
        <FormInput id="phone" name="phone" label="Phone"     type="tel" value={form.phone} onChange={handleChange} />

        {/* Name-change confirmation banner */}
        {confirm && (
          <div className="border border-gray-300 rounded-xl p-4 space-y-3">
            <p className="text-sm text-gray-800">
              Change your name from <span className="font-medium">{user?.name}</span> to <span className="font-medium">{form.name.trim()}</span>?
            </p>
            <p className="text-xs text-gray-500">You can only change your name once per week. The club admin will be notified.</p>
            <div className="flex gap-3">
              <button type="submit" className="flex-1 py-2 bg-black text-white text-sm rounded-xl hover:bg-gray-800">
                Confirm
              </button>
              <button type="button" onClick={() => { setConfirm(false); setForm(f => ({ ...f, name: user?.name ?? '' })) }} className="flex-1 py-2 border border-gray-300 text-sm rounded-xl hover:border-black">
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        {!confirm && (
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
          </button>
        )}
      </form>

    </div>
  )
}
