import { useEffect } from 'react'

export interface ShortcutMap {
  [key: string]: () => void
}

/** Global keyboard shortcuts. Pass a map of `key` -> callback. Skips when
 * the user is focused in an input/textarea/contenteditable so typing isn't
 * intercepted. */
export function useKeyboardShortcuts(map: ShortcutMap) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null
      if (tgt) {
        const tag = tgt.tagName?.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || tgt.isContentEditable) return
      }
      // Skip when modifiers are present (so OS shortcuts pass through)
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const fn = map[e.key.toLowerCase()] ?? map[e.key]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [map])
}
