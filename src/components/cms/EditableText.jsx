import { useState, useRef, useEffect } from 'react'
import { useEditMode } from '@/context/EditModeContext'

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
  children,
  ...props
}) {
  const { isEditing } = useEditMode()
  const [active, setActive] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const ref = useRef()

  // Keep draft in sync when parent value changes externally
  useEffect(() => { setDraft(value ?? '') }, [value])

  // Auto-focus + auto-resize when entering active state
  useEffect(() => {
    if (!active || !ref.current) return
    ref.current.focus()
    if (ref.current.tagName === 'TEXTAREA') {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [active])

  // Not in edit mode — render normally
  if (!isEditing) {
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
        if (draft !== value) onSave?.(draft)
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
  return (
    <Tag
      className={`${className} cursor-text border-b-2 border-dashed border-blue-300/50 hover:border-blue-400 hover:bg-blue-50/20 transition-colors`}
      onClick={() => setActive(true)}
      title="點擊編輯"
      {...props}
    >
      {children ?? value}
    </Tag>
  )
}
