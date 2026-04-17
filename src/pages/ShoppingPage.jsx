import { useState, useEffect, useRef } from 'react'
import { shopAPI } from '@/api/api'

const CATEGORIES = [
  { key: 'all',     label: 'All Products' },
  { key: 'rubbers', label: 'Rubbers'       },
  { key: 'blades',  label: 'Blades'        },
  { key: 'care',    label: 'Care'          },
  { key: 'shoes',   label: 'Shoes'         },
  { key: 'balls',   label: 'Balls'         },
  { key: 'rackets', label: 'Complete Rackets' },
]

// Simple category icons (SVG)
function CategoryIcon({ cat }) {
  const cls = 'w-10 h-10 mx-auto'
  if (cat === 'rubbers') return (
    <svg className={cls} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth={1.2}>
      <rect x="4" y="10" width="32" height="20" rx="2" />
      <line x1="12" y1="10" x2="12" y2="30" />
    </svg>
  )
  if (cat === 'blades') return (
    <svg className={cls} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth={1.2}>
      <ellipse cx="20" cy="16" rx="12" ry="10" />
      <rect x="18" y="26" width="4" height="10" rx="1" />
    </svg>
  )
  if (cat === 'care') return (
    <svg className={cls} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth={1.2}>
      <path d="M14 8h12l2 20H12L14 8z" />
      <path d="M16 8V6a4 4 0 0 1 8 0v2" />
      <line x1="20" y1="14" x2="20" y2="22" />
      <line x1="16" y1="18" x2="24" y2="18" />
    </svg>
  )
  if (cat === 'shoes') return (
    <svg className={cls} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth={1.2}>
      <path d="M4 28 C8 28 10 20 16 20 C22 20 28 24 36 24 L36 28 C28 30 8 32 4 28 Z" />
      <path d="M16 20 L18 12 L22 12 L20 20" />
    </svg>
  )
  if (cat === 'balls') return (
    <svg className={cls} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth={1.2}>
      <circle cx="20" cy="20" r="13" />
      <path d="M7 20 Q20 14 33 20" />
      <path d="M7 20 Q20 26 33 20" />
    </svg>
  )
  if (cat === 'rackets') return (
    <svg className={cls} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth={1.2}>
      <ellipse cx="20" cy="15" rx="11" ry="9" />
      <rect x="18" y="24" width="4" height="12" rx="1.5" />
      <line x1="9" y1="15" x2="31" y2="15" strokeWidth={0.8} />
      <line x1="20" y1="6" x2="20" y2="24" strokeWidth={0.8} />
    </svg>
  )
  return <div className={`${cls} rounded-full border border-gray-300`} />
}

function ProductCard({ product }) {
  const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace('/api', '')
  const firstImage = product.images?.[0]?.url ?? product.image_url ?? null
  const imgSrc = firstImage ? `${BASE}${firstImage}` : null

  return (
    <div className="group cursor-pointer">
      {/* Image */}
      <div className="relative aspect-square bg-gray-100 overflow-hidden mb-3">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <CategoryIcon cat={product.category} />
          </div>
        )}
        {/* Wishlist */}
        <button className="absolute top-3 right-3 text-gray-400 hover:text-black transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
        </button>
      </div>
      {/* Info */}
      <p className="text-sm text-gray-900 leading-snug">{product.name}</p>
      {product.price != null && (
        <p className="text-sm text-gray-500 mt-0.5">
          AUD {Number(product.price).toLocaleString('en-AU', { minimumFractionDigits: 0 })}
        </p>
      )}
    </div>
  )
}

export default function ShoppingPage() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef(null)

  useEffect(() => {
    setLoading(true)
    shopAPI.getProducts(activeCategory === 'all' ? null : activeCategory)
      .then(({ data }) => setProducts(data.products ?? []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false))
  }, [activeCategory])

  const activeCatLabel = CATEGORIES.find(c => c.key === activeCategory)?.label ?? 'All Products'

  return (
    <div className="min-h-screen bg-white pt-[84px]">

      {/* Category label + filter row */}
      <div className="px-6 lg:px-10 py-4 flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-1.5 text-sm text-gray-800">
          <span>{activeCatLabel}</span>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
        <button className="flex items-center gap-1.5 text-sm text-gray-800 border border-gray-300 rounded-full px-4 py-1.5 hover:border-black transition-colors">
          Filters
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* Category icons row */}
      <div className="relative border-b border-gray-100">
        {/* Scroll left */}
        <button
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-full flex items-center justify-center bg-gradient-to-r from-white to-transparent"
          onClick={() => scrollRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>

        <div
          ref={scrollRef}
          className="flex gap-0 overflow-x-auto scrollbar-hide px-10"
          style={{ scrollbarWidth: 'none' }}
        >
          {CATEGORIES.filter(c => c.key !== 'all').map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(activeCategory === cat.key ? 'all' : cat.key)}
              className={`flex-shrink-0 flex flex-col items-center gap-2 px-8 py-5 transition-colors border-b-2 ${
                activeCategory === cat.key
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-black'
              }`}
            >
              <CategoryIcon cat={cat.key} />
              <span className="text-xs text-center whitespace-nowrap">{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Scroll right */}
        <button
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-full flex items-center justify-center bg-gradient-to-l from-white to-transparent"
          onClick={() => scrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Product grid */}
      <div className="px-6 lg:px-10 py-8">
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square bg-gray-100 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-gray-400 text-sm">No products yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>

    </div>
  )
}
