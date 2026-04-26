import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { articlesAPI } from '@/api/api'

const TYPE_LABEL = {
  competition: 'Competition',
  news:        'News',
  achievement: 'Achievement',
}

export default function NewsDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    articlesAPI.getById(id)
      .then(r => setArticle(r.data.article))
      .catch(() => navigate('/news'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="flex justify-center py-32">
      <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin" />
    </div>
  )

  if (!article) return null

  return (
    <div className="min-h-screen bg-white">
      {/* Back nav */}
      <div className="">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <button
            onClick={() => navigate(`/news?type=${article.type}`)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-black transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            {TYPE_LABEL[article.type]}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Category + date */}
        <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-widest text-gray-400 mb-4">
          <span>{TYPE_LABEL[article.type]}</span>
          <span>·</span>
          <span>
            {new Date(article.published_at).toLocaleDateString('en-AU', {
              day: 'numeric', month: 'long', year: 'numeric'
            })}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 leading-tight mb-3">
          {article.title}
        </h1>
        {article.subtitle && (
          <p className="text-lg text-gray-500 mb-8">{article.subtitle}</p>
        )}

        {/* Hero image */}
        {article.image_data && (
          <div className="aspect-[16/9] overflow-hidden rounded-sm bg-gray-100 mb-8">
            <img
              src={article.image_data}
              alt={article.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Body */}
        {article.body && (
          <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed whitespace-pre-line">
            {article.body}
          </div>
        )}

        {article.author_name && (
          <p className="mt-10 pt-6 border-t border-gray-100 text-sm text-gray-400">
            Posted by {article.author_name}
          </p>
        )}
      </div>
    </div>
  )
}
