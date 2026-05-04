/** Minimal locale switcher for the StatusFooter. EN/ES only for now. */
import { currentLocale, setLocale } from '../i18n'

export default function LocaleSelector() {
  const cur = currentLocale()
  const next = cur === 'en' ? 'es' : 'en'
  return (
    <button
      onClick={() => setLocale(next)}
      title={cur === 'en' ? 'Cambiar a Español' : 'Switch to English'}
      aria-label={cur === 'en' ? 'Switch to Spanish' : 'Switch to English'}
      style={{
        background: 'transparent',
        border: '1px solid var(--border)',
        color: 'var(--text-muted)',
        padding: '3px 6px',
        borderRadius: 3,
        cursor: 'pointer',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}
    >
      {cur === 'en' ? 'EN | ES' : 'ES | EN'}
    </button>
  )
}
