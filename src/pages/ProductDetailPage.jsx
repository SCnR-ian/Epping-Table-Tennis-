import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { shopAPI } from '@/api/api'

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace('/api', '')
function imgSrc(url) { return `${BASE_URL}${url}` }

const CAT_LABELS = {
  rubbers: 'Rubbers', blades: 'Blades', care: 'Care',
  shoes: 'Shoes', balls: 'Balls', rackets: 'Complete Rackets',
}

// Collapsible spec accordion row
function Accordion({ title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-gray-100">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-4 text-sm font-medium text-gray-900 hover:text-gray-600 transition-colors"
      >
        {title}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && <div className="pb-5">{children}</div>}
    </div>
  )
}

export default function ProductDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeImg, setActiveImg] = useState(0)
  const [descExpanded, setDescExpanded] = useState(false)

  useEffect(() => {
    setLoading(true)
    shopAPI.getProduct(id)
      .then(({ data }) => { setProduct(data.product); setActiveImg(0) })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-white pt-[84px] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin" />
    </div>
  )

  if (!product) return (
    <div className="min-h-screen bg-white pt-[84px] flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-500 mb-4">Product not found.</p>
        <button onClick={() => navigate('/shopping')} className="text-sm underline underline-offset-4">
          Back to shop
        </button>
      </div>
    </div>
  )

  const images = product.images ?? []
  const hasSpecs = product.structure || product.thickness || product.head_size ||
                   product.reaction_property || product.vibration_property || product.product_type

  return (
    <div className="min-h-screen bg-white pt-[84px]">

      {/* Mobile sticky header */}
      <div className="lg:hidden sticky top-[84px] z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900 leading-tight">{product.name}</p>
          {product.price != null && (
            <p className="text-sm text-gray-500 mt-0.5">
              AUD {Number(product.price).toLocaleString('en-AU', { minimumFractionDigits: 0 })}
            </p>
          )}
        </div>
        <button
          onClick={() => navigate('/shopping')}
          className="text-gray-400 hover:text-gray-700 p-1 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="lg:flex lg:min-h-[calc(100vh-84px)]">

        {/* ── Left: images ─────────────────────────────────────────────────── */}
        <div className="lg:w-[60%] lg:sticky-none">

          {images.length === 0 ? (
            <div className="aspect-square bg-gray-50 flex items-center justify-center lg:aspect-[4/5]">
              <svg className="w-16 h-16 text-gray-200" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5M7.5 3.75H12m0 0h4.5M12 3.75V12" />
              </svg>
            </div>
          ) : (
            <>
              {/* Mobile: single image with prev/next */}
              <div className="lg:hidden relative">
                <div className="aspect-square overflow-hidden bg-gray-50">
                  <img
                    src={imgSrc(images[activeImg].url)}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => setActiveImg(i => (i - 1 + images.length) % images.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center shadow"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setActiveImg(i => (i + 1) % images.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center shadow"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                    {/* Dots */}
                    <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
                      {images.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setActiveImg(i)}
                          className={`w-1.5 h-1.5 rounded-full transition-colors ${i === activeImg ? 'bg-black' : 'bg-gray-300'}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Desktop: all images stacked vertically */}
              <div className="hidden lg:block space-y-1">
                {images.map((img, i) => (
                  <div key={img.id} className="w-full overflow-hidden bg-gray-50">
                    <img
                      src={imgSrc(img.url)}
                      alt={`${product.name} ${i + 1}`}
                      className="w-full object-cover"
                      style={{ aspectRatio: '4/5' }}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Right: product info (sticky on desktop) ───────────────────── */}
        <div className="lg:w-[40%] lg:sticky lg:top-[84px] lg:self-start px-6 py-8 lg:px-10 lg:py-12 lg:max-h-[calc(100vh-84px)] lg:overflow-y-auto">

          {/* Back link — desktop only */}
          <button
            onClick={() => navigate('/shopping')}
            className="hidden lg:flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mb-8"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back to Shop
          </button>

          {/* Category + code */}
          <p className="text-xs text-gray-400 tracking-wider mb-1">
            {CAT_LABELS[product.category] ?? product.category}
            {product.code && <span className="ml-2">{product.code}</span>}
          </p>

          {/* Name */}
          <h1 className="text-2xl font-light text-gray-900 leading-snug mb-2">{product.name}</h1>

          {/* Price */}
          {product.price != null && (
            <p className="text-base text-gray-700 mb-6">
              AUD {Number(product.price).toLocaleString('en-AU', { minimumFractionDigits: 0 })}
            </p>
          )}

          {/* Wishlist button */}
          <button className="w-full flex items-center justify-center gap-2 border border-gray-200 rounded py-3 text-sm text-gray-700 hover:border-black transition-colors mb-8">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
            Add to Wishlist
          </button>

          {/* Description */}
          {product.description && (
            <div className="mb-6 border-t border-gray-100 pt-5">
              <p className={`text-sm text-gray-600 leading-relaxed ${!descExpanded ? 'line-clamp-4' : ''}`}>
                {product.description}
              </p>
              {product.description.length > 200 && (
                <button
                  onClick={() => setDescExpanded(d => !d)}
                  className="text-xs font-medium mt-2 underline underline-offset-4 text-gray-700 hover:text-black transition-colors"
                >
                  {descExpanded ? 'Show less' : 'Read More'}
                </button>
              )}
            </div>
          )}

          {/* Specs accordion */}
          {hasSpecs && (
            <Accordion title="Specifications">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {product.product_type && (
                    <tr><td className="py-2 pr-4 text-gray-400 w-1/2">Type</td><td className="py-2 text-gray-700">{product.product_type}</td></tr>
                  )}
                  {product.structure && (
                    <tr><td className="py-2 pr-4 text-gray-400">Structure</td><td className="py-2 text-gray-700">{product.structure}</td></tr>
                  )}
                  {product.thickness && (
                    <tr><td className="py-2 pr-4 text-gray-400">Thickness</td><td className="py-2 text-gray-700">{product.thickness}</td></tr>
                  )}
                  {product.head_size && (
                    <tr><td className="py-2 pr-4 text-gray-400">Head Size</td><td className="py-2 text-gray-700">{product.head_size}</td></tr>
                  )}
                  {product.reaction_property && (
                    <tr><td className="py-2 pr-4 text-gray-400">Reaction</td><td className="py-2 text-gray-700">{product.reaction_property}</td></tr>
                  )}
                  {product.vibration_property && (
                    <tr><td className="py-2 pr-4 text-gray-400">Vibration</td><td className="py-2 text-gray-700">{product.vibration_property}</td></tr>
                  )}
                </tbody>
              </table>
            </Accordion>
          )}

          {/* Thumbnail strip — desktop, when 2+ images */}
          {images.length > 1 && (
            <div className="hidden lg:flex gap-2 mt-6 flex-wrap">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => {
                    setActiveImg(i)
                    // scroll to image on desktop
                    const el = document.querySelectorAll('.lg\\:block img')[i]
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className={`w-14 h-14 rounded overflow-hidden border-2 transition-colors ${i === activeImg ? 'border-black' : 'border-transparent'}`}
                >
                  <img src={imgSrc(img.url)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
