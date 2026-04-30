import { useState, useEffect, useRef } from 'react'
import { shopAPI } from '@/api/api'

const CATEGORIES = ['rubbers', 'blades', 'care', 'shoes', 'balls', 'rackets']
const CAT_LABELS  = { rubbers: 'Rubbers', blades: 'Blades', care: 'Care', shoes: 'Shoes', balls: 'Balls', rackets: 'Complete Rackets' }
const BASE_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:8000'

const EMPTY_FORM = {
  name: '', category: 'rubbers', price: '', sort_order: '0', description: '',
  stock: '',
  code: '', product_type: '', reaction_property: '', vibration_property: '',
  structure: '', thickness: '', head_size: '', is_active: true,
}

function imgSrc(url) { return `${BASE_URL}${url}` }

// ── Product Form Modal ────────────────────────────────────────────────────────
function ProductModal({ product, onClose, onSaved }) {
  const [form, setForm]           = useState(product
    ? { ...EMPTY_FORM, ...product,
        price: product.price ?? '',
        sort_order: product.sort_order ?? '0',
        stock: product.stock ?? '',
        reaction_property: product.reaction_property ?? '',
        vibration_property: product.vibration_property ?? '',
      }
    : EMPTY_FORM
  )
  const [images, setImages]       = useState(product?.images ?? [])
  const [saving, setSaving]       = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState(null)
  const fileRef                   = useRef()

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        name:               form.name.trim(),
        category:           form.category,
        price:              form.price !== '' ? Number(form.price) : null,
        sort_order:         Number(form.sort_order) || 0,
        stock:              form.stock !== '' ? Number(form.stock) : null,
        description:        form.description || null,
        is_active:          form.is_active,
        code:               form.code || null,
        product_type:       form.product_type || null,
        reaction_property:  form.reaction_property || null,
        vibration_property: form.vibration_property || null,
        structure:          form.structure || null,
        thickness:          form.thickness || null,
        head_size:          form.head_size || null,
      }
      const { data } = product
        ? await shopAPI.updateProduct(product.id, payload)
        : await shopAPI.createProduct(payload)
      onSaved(data.product, !!product)
    } catch { setError('Save failed. Please try again.') }
    finally { setSaving(false) }
  }

  async function handleUploadImage(e) {
    const file = e.target.files?.[0]
    if (!file || !product) return
    const fd = new FormData(); fd.append('image', file)
    setUploading(true)
    try {
      const { data } = await shopAPI.uploadImage(product.id, fd)
      setImages(imgs => [...imgs, data.image])
    } catch (err) {
      alert(err.response?.data?.message ?? 'Upload failed.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDeleteImage(img) {
    if (!product) return
    if (!window.confirm('Delete this image?')) return
    try {
      await shopAPI.deleteImage(product.id, img.id)
      setImages(imgs => imgs.filter(i => i.id !== img.id))
    } catch { alert('Delete failed.') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[88px] bg-black/40 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl mb-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {product ? 'Edit Product' : 'New Product'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                value={form.name} onChange={e => set('name', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                placeholder="e.g. Innerforce Layer ALC"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category *</label>
              <select
                value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Price (AUD)</label>
              <input
                type="number" min="0" step="0.01"
                value={form.price} onChange={e => set('price', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                placeholder="e.g. 189.00"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stock (leave blank = unlimited)</label>
              <input
                type="number" min="0" step="1"
                value={form.stock} onChange={e => set('stock', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                placeholder="e.g. 10"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Product Code</label>
              <input
                value={form.code} onChange={e => set('code', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                placeholder="e.g. 23680"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <input
                value={form.product_type} onChange={e => set('product_type', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                placeholder="e.g. Chinese penhold"
              />
            </div>
          </div>

          {/* Specs row */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Specifications</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reaction Property</label>
                <input
                  value={form.reaction_property} onChange={e => set('reaction_property', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="e.g. 10.7"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vibration Property</label>
                <input
                  value={form.vibration_property} onChange={e => set('vibration_property', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="e.g. 9.4"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Structure</label>
                <input
                  value={form.structure} onChange={e => set('structure', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="e.g. 5-ply wood + 2 Arylate-Carbon [Innerfiber]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Thickness</label>
                <input
                  value={form.thickness} onChange={e => set('thickness', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="e.g. 6.0 mm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Head Size</label>
                <input
                  value={form.head_size} onChange={e => set('head_size', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="e.g. 161×150 mm"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              value={form.description} onChange={e => set('description', e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 resize-none"
              placeholder="Optional product description..."
            />
          </div>

          {/* Sort order + Active */}
          <div className="flex items-center gap-6">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
              <input
                type="number" min="0"
                value={form.sort_order} onChange={e => set('sort_order', e.target.value)}
                className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                type="button"
                onClick={() => set('is_active', !form.is_active)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  form.is_active ? 'bg-black' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  form.is_active ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
              <span className="text-sm text-gray-700">{form.is_active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>

          {/* Images — only shown for existing products */}
          {product && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Photos ({images.length}/6)
                </p>
                {images.length < 6 && (
                  <label className={`flex items-center gap-1.5 text-xs font-medium cursor-pointer px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-400 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    {uploading ? 'Uploading…' : 'Upload photo'}
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUploadImage} />
                  </label>
                )}
              </div>

              {images.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No photos yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((img, idx) => (
                    <div key={img.id} className="relative group aspect-square bg-gray-50 rounded-lg overflow-hidden">
                      <img src={imgSrc(img.url)} alt="" className="w-full h-full object-cover" />
                      {idx === 0 && (
                        <span className="absolute top-1 left-1 text-[9px] bg-black text-white px-1.5 py-0.5 rounded">Cover</span>
                      )}
                      <button
                        onClick={() => handleDeleteImage(img)}
                        className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {images.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">Save the product first, then upload photos.</p>
              )}
            </div>
          )}

          {!product && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
              Save this product first — you can upload photos on the next screen.
            </p>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-black text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : (product ? 'Save Changes' : 'Create Product')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Orders Panel ─────────────────────────────────────────────────────────────
const ORDER_STATUSES = ['pending','paid','processing','shipped','completed','cancelled']
const STATUS_STYLE = {
  pending:    'bg-yellow-50 text-yellow-700',
  paid:       'bg-blue-50 text-blue-700',
  processing: 'bg-purple-50 text-purple-700',
  shipped:    'bg-indigo-50 text-indigo-700',
  completed:  'bg-emerald-50 text-emerald-700',
  cancelled:  'bg-red-50 text-red-500',
}

function OrdersPanel() {
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  const load = () => {
    setLoading(true)
    shopAPI.getOrders().then(r => setOrders(r.data.orders ?? [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const updateStatus = async (id, status) => {
    try { await shopAPI.updateOrderStatus(id, status); load() }
    catch { alert('Failed to update status.') }
  }

  const fmtDate = (d) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const fmtAmt  = (cents) => `$${(cents / 100).toFixed(2)}`

  return (
    <div className="space-y-4">
      {loading ? <p className="text-sm text-gray-400">Loading…</p> : orders.length === 0 ? (
        <p className="text-sm text-gray-400">No orders yet.</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivery</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map(o => (
                <>
                  <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">#{o.id}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{o.user_name}</p>
                      <p className="text-xs text-gray-400">{o.user_email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(o.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{fmtAmt(o.total_cents)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 capitalize">{o.delivery_type}</td>
                    <td className="px-4 py-3">
                      <select
                        value={o.status}
                        onChange={e => updateStatus(o.id, e.target.value)}
                        className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ${STATUS_STYLE[o.status] ?? 'bg-gray-100 text-gray-500'}`}
                      >
                        {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} className="text-xs text-gray-500 hover:text-black transition-colors">
                        {expanded === o.id ? 'Hide' : 'Items'}
                      </button>
                    </td>
                  </tr>
                  {expanded === o.id && (
                    <tr key={`${o.id}-detail`}>
                      <td colSpan={7} className="px-4 pb-4 bg-gray-50/50">
                        <div className="space-y-1 pt-2">
                          {(o.items ?? []).map((item, i) => (
                            <div key={i} className="flex justify-between text-xs text-gray-600">
                              <span>{item.name} ×{item.qty}</span>
                              <span>${(item.price_cents / 100).toFixed(2)}</span>
                            </div>
                          ))}
                          {o.delivery_type === 'home' && o.address && (
                            <p className="text-xs text-gray-400 pt-2 border-t border-gray-100 mt-2">
                              Ship to: {o.address.firstName} {o.address.lastName}, {o.address.address1}, {o.address.city} {o.address.postcode} {o.address.state}
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main ShopManager ──────────────────────────────────────────────────────────
export default function ShopManager() {
  const [sub,      setSub]       = useState('products') // 'products' | 'orders'
  const [products, setProducts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(null) // null | 'new' | product object
  const [deleteConfirm, setDeleteConfirm] = useState(null) // product id
  const [deleting, setDeleting]   = useState(false)
  const [filterCat, setFilterCat] = useState('all')

  useEffect(() => {
    loadProducts()
  }, [])

  async function loadProducts() {
    setLoading(true)
    try {
      const { data } = await shopAPI.getAdminProducts()
      setProducts(data.products ?? [])
    } catch { setProducts([]) }
    finally { setLoading(false) }
  }

  function handleSaved(product, isEdit) {
    if (isEdit) {
      setProducts(ps => ps.map(p => p.id === product.id ? product : p))
      setModal(null) // close after saving edits
    } else {
      setProducts(ps => [...ps, product])
      // Re-open in edit mode so admin can upload photos immediately
      setModal(product)
    }
  }

  async function handleDelete(id) {
    setDeleting(true)
    try {
      await shopAPI.deleteProduct(id)
      setProducts(ps => ps.filter(p => p.id !== id))
      setDeleteConfirm(null)
    } catch { alert('Delete failed.') }
    finally { setDeleting(false) }
  }

  const visible = filterCat === 'all' ? products : products.filter(p => p.category === filterCat)

  return (
    <div className="animate-fade-in space-y-6">

      {/* Sub-tabs */}
      <div className="flex border-b border-gray-100 gap-1">
        {['products','orders'].map(t => (
          <button key={t} onClick={() => setSub(t)}
            className={`px-5 py-2 text-sm font-medium rounded-t-lg transition-colors capitalize ${sub === t ? 'bg-white text-black border border-b-white border-gray-100 -mb-px' : 'text-gray-500 hover:text-gray-800'}`}>
            {t}
          </button>
        ))}
      </div>

      {sub === 'orders' && <OrdersPanel />}

      {sub === 'products' && <>
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterCat('all')}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${filterCat === 'all' ? 'bg-black text-white border-black' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
          >
            All
          </button>
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setFilterCat(c)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${filterCat === c ? 'bg-black text-white border-black' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
            >
              {CAT_LABELS[c]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-1.5 px-4 py-2 bg-black text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Product
        </button>
      </div>

      {/* Product table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">No products yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Photo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      {p.images?.[0] ? (
                        <img
                          src={imgSrc(p.images[0].url)}
                          alt=""
                          className="w-12 h-12 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M13.5 12h.008v.008H13.5V12zm0 0H13.5M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                          </svg>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.name}</p>
                      {p.images?.length > 1 && (
                        <p className="text-xs text-gray-400 mt-0.5">{p.images.length} photos</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{CAT_LABELS[p.category] ?? p.category}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.code ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {p.price != null ? `$${Number(p.price).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {p.stock == null ? (
                        <span className="text-xs text-gray-400">∞</span>
                      ) : (
                        <span className={`text-xs font-medium ${p.stock === 0 ? 'text-red-500' : p.stock <= 5 ? 'text-yellow-600' : 'text-gray-700'}`}>
                          {p.stock}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setModal(p)}
                          className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded border border-transparent hover:border-gray-200 transition-colors"
                        >
                          Edit
                        </button>
                        {deleteConfirm === p.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(p.id)}
                              disabled={deleting}
                              className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded transition-colors"
                            >
                              {deleting ? '…' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(p.id)}
                            className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded border border-transparent hover:border-red-100 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <ProductModal
          product={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
      </>}
    </div>
  )
}
