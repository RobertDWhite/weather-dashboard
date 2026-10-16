import { useEffect, useRef } from 'react'

export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current
    if (!dialog) return
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ),
      ).filter((e) => e.getAttribute('aria-hidden') !== 'true')
    ;(focusable()[0] ?? dialog).focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        close.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusable()
      const first = items[0] ?? dialog
      const last = items[items.length - 1] ?? dialog
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault()
        last.focus()
      } else if (
        !e.shiftKey &&
        (document.activeElement === last || !dialog.contains(document.activeElement))
      ) {
        e.preventDefault()
        first.focus()
      }
    }
    const keepFocus = (e: FocusEvent) => {
      if (!dialog.contains(e.target as Node)) (focusable()[0] ?? dialog).focus()
    }
    document.addEventListener('keydown', handle, true)
    document.addEventListener('focusin', keepFocus)
    return () => {
      document.removeEventListener('keydown', handle, true)
      document.removeEventListener('focusin', keepFocus)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])
  return ref
}
