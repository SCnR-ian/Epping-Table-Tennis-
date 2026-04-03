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
        <FormInput id="name"  name="name"  label="Full Name"     value={form.name}  onChange={handleChange} />
        <FormInput id="email" name="email" label="Email Address" type="email" value={form.email} onChange={handleChange} />
        <FormInput id="phone" name="phone" label="Phone"         type="tel"  value={form.phone} onChange={handleChange} />
        <div>
          <label className="text-sm font-normal text-gray-700 block mb-1.5">Bio</label>
          <textarea
            name="bio" rows={3} value={form.bio} onChange={handleChange}
            placeholder="Tell us about your playing style…"
            className="w-full bg-white border border-gray-300 px-4 py-2.5 text-black placeholder-gray-400 focus:outline-none focus:border-black transition-all duration-200 resize-none"
          />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </form>

    </div>
  )
}
