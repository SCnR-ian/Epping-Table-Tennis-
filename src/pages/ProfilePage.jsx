import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import FormInput from '@/components/common/FormInput'

export default function ProfilePage() {
  const { user } = useAuth()
  const [form, setForm] = useState({
    name:  user?.name  ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    bio:   user?.bio   ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await new Promise(r => setTimeout(r, 600))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  return (
    <div className="page-wrapper py-10 px-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-5 mb-10">
        <div className="w-20 h-20 rounded-full bg-brand-500/20 flex items-center justify-center text-3xl font-display text-brand-400">
          {user?.name?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <div>
          <h1 className="font-display text-4xl text-white tracking-wider">{user?.name ?? 'Player'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{user?.email}</p>
          <span className="badge bg-brand-500/10 text-brand-400 border border-brand-500/30 mt-2 capitalize">
            {user?.role ?? 'Member'}
          </span>
        </div>
      </div>

      <form onSubmit={handleProfileSave} className="card max-w-lg space-y-5 animate-fade-in">
        <FormInput id="name"  name="name"  label="Full Name"     value={form.name}  onChange={handleChange} />
        <FormInput id="email" name="email" label="Email Address" type="email" value={form.email} onChange={handleChange} />
        <FormInput id="phone" name="phone" label="Phone"         type="tel"  value={form.phone} onChange={handleChange} />
        <div>
          <label className="text-sm font-medium text-slate-300 block mb-1.5">Bio</label>
          <textarea
            name="bio" rows={3} value={form.bio} onChange={handleChange}
            placeholder="Tell us about your playing style…"
            className="input-field resize-none"
          />
        </div>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
