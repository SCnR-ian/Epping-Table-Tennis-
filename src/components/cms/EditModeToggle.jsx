import { Edit2, X, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useEditMode } from '@/context/EditModeContext'

/**
 * Floating toggle button — only visible to admins.
 * Sits at bottom-right corner of every page.
 */
export default function EditModeToggle() {
  const { isAuthenticated, user } = useAuth()
  const { isEditing, setIsEditing } = useEditMode()

  if (!isAuthenticated || user?.role !== 'admin') return null

  return (
    <div className="fixed bottom-6 left-6 z-[200] select-none">
      {isEditing ? (
        <div className="flex items-center gap-2.5 bg-blue-600 text-white pl-4 pr-3 py-2.5 rounded-full shadow-2xl">
          <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse flex-shrink-0" />
          <span className="text-sm font-medium tracking-wide">Editing</span>
          <span className="text-white/40 text-xs ml-1">·</span>
          <span className="text-white/60 text-xs">Auto-saves on blur</span>
          <button
            onClick={() => setIsEditing(false)}
            className="ml-1 p-0.5 text-white/60 hover:text-white transition-colors rounded-full hover:bg-white/10"
            title="Exit edit mode"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-2 bg-white border border-gray-200 shadow-xl px-4 py-2.5 rounded-full text-sm font-medium text-gray-700 hover:bg-gray-50 hover:shadow-2xl transition-all duration-200"
        >
          <Edit2 size={14} className="text-gray-500" />
          Edit Page
        </button>
      )}
    </div>
  )
}
