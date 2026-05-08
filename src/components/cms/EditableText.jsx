import { useState, useRef, useEffect } from 'react'
import { useEditMode } from '@/context/EditModeContext'
import { useAuth } from '@/context/AuthContext'

/**
 * EditableText — drop-in replacement for h1/h2/p/span
 *
 * Props:
 *   as         — HTML tag to render ('h1', 'h2', 'p', 'span', …)
 *   value      — current text value (controlled)
 *   onChange   — called on every keystroke (updates parent state immediately)
 *   onSave     — called on blur (persist to API)
 *   multiline  — force textarea even for non-p tags
 *   className  — forwarded to both the display tag and the input
 */
export default function EditableText({
  as: Tag = 'p',
  value,
  onChange,
  onSave,
  className = '',
  multiline = false,
  placeholder = '',
  children,
  ...props
}) {
  const { isEditing } = useEditMode()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [active, setActive] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const savedValue = useRef(value ?? '') // value at the moment editing started
  const ref = useRef()

  // Keep draft in sync when parent value changes externally,
  // but don't reset while the user is actively typing
  useEffect(() => { if (!active) setDraft(value ?? '') }, [value, active])

  // Auto-focus + auto-resize when entering active state
  useEffect(() => {
    if (!active || !ref.current) return
    ref.current.focus()
    if (ref.current.tagName === 'TEXTAREA') {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [active])

  // Not in edit mode — render normally, but show placeholder hint to admins when empty
  if (!isEditing) {
    const isEmpty = !value && !children
    if (isEmpty && placeholder && isAdmin) {
      return (
        <Tag className={`${className} opacity-40`} {...props}>
          <span className="italic">{placeholder}</span>
        </Tag>
      )
    }
    return <Tag className={className} {...props}>{children ?? value}</Tag>
  }

  const useTextarea = multiline || Tag === 'p' || Tag === 'span'

  // Active (typing) state
  if (active) {
    const sharedProps = {
      ref,
      value: draft,
      className: `${className} bg-blue-50/60 border border-blue-400 rounded-sm px-1 outline-none ring-2 ring-blue-200/70 w-full`,
      onChange: e => {
        const v = e.target.value
        setDraft(v)
        onChange?.(v)
        if (e.target.tagName === 'TEXTAREA') {
          e.target.style.height = 'auto'
          e.target.style.height = e.target.scrollHeight + 'px'
        }
      },
      onBlur: () => {
        setActive(false)
        if (draft !== savedValue.current) onSave?.(draft)
      },
      onKeyDown: e => {
        if (!useTextarea && e.key === 'Enter') { e.preventDefault(); ref.current?.blur() }
        if (e.key === 'Escape') { setDraft(value ?? ''); setActive(false) }
      },
    }
    return useTextarea
      ? <textarea {...sharedProps} rows={2} style={{ resize: 'none', display: 'block' }} />
      : <input {...sharedProps} type="text" />
  }

  // Edit mode, not active — show with hover hint
  const isEmpty = !value && !children
  return (
    <Tag
      className={`${className} cursor-text border-b-2 border-dashed border-blue-300/50 hover:border-blue-400 hover:bg-blue-50/20 transition-colors${isEmpty ? ' min-h-[1em]' : ''}`}
      onClick={() => { savedValue.current = value ?? ''; setActive(true) }}
      title="Click to edit"
      {...props}
    >
      {isEmpty && placeholder
        ? <span className="text-gray-300 italic text-sm">{placeholder}</span>
        : (children ?? value)
      }
    </Tag>
  )
}
