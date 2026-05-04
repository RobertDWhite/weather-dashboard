/** Tiny i18n. Browser language preference is honored automatically; users
 * can override via the global selector. Translations are intentionally
 * sparse — covering only the highest-impact strings (alert severity, the
 * push-notification labels, and the most prominent banners). The vast
 * majority of weather data is technical jargon that's already universal. */
const STORAGE_KEY = 'wx-locale'

type Locale = 'en' | 'es'

export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'es') return saved
  } catch { /* */ }
  if (typeof navigator !== 'undefined') {
    const lang = (navigator.language || '').toLowerCase()
    if (lang.startsWith('es')) return 'es'
  }
  return 'en'
}

export function setLocale(locale: Locale) {
  try { localStorage.setItem(STORAGE_KEY, locale) } catch { /* */ }
  // Reload so all components pick up the change cleanly without hooking
  // every component into a context. This is a pragmatic trade-off: cleaner
  // than deep context propagation; only happens on user-initiated change.
  window.location.reload()
}

const STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    'alarm.on': 'Alarm ON',
    'alarm.off': 'Alarm OFF',
    'alarm.active': 'ALERT ACTIVE',
    'alarm.silence': 'Silence 30m',
    'alarm.test': 'Test',
    'tv.on': 'EXIT TV',
    'tv.off': 'TV',
    'push.on': 'PUSH ON',
    'push.off': 'PUSH',
    'push.unavailable': 'push n/a',
    'severity.Extreme': 'Extreme',
    'severity.Severe': 'Severe',
    'severity.Moderate': 'Moderate',
    'severity.Minor': 'Minor',
    'severity.Unknown': 'Unknown',
    'banner.emergency': 'LIFE-THREATENING EMERGENCY',
    'banner.action': 'TAKE ACTION NOW',
    'live': 'LIVE',
    'expires_in': 'expires in',
    'no_alerts': 'No active alerts in your area.',
  },
  es: {
    'alarm.on': 'Alarma activada',
    'alarm.off': 'Alarma desactivada',
    'alarm.active': 'ALERTA ACTIVA',
    'alarm.silence': 'Silenciar 30m',
    'alarm.test': 'Probar',
    'tv.on': 'SALIR TV',
    'tv.off': 'TV',
    'push.on': 'NOTIF. ACTIVAS',
    'push.off': 'NOTIF.',
    'push.unavailable': 'no disponible',
    'severity.Extreme': 'Extremo',
    'severity.Severe': 'Severo',
    'severity.Moderate': 'Moderado',
    'severity.Minor': 'Menor',
    'severity.Unknown': 'Desconocido',
    'banner.emergency': 'EMERGENCIA POTENCIALMENTE MORTAL',
    'banner.action': 'TOME ACCIÓN AHORA',
    'live': 'EN VIVO',
    'expires_in': 'expira en',
    'no_alerts': 'No hay alertas activas en su área.',
  },
}

let _locale: Locale = detectLocale()

export function t(key: string): string {
  return STRINGS[_locale]?.[key] ?? STRINGS.en[key] ?? key
}

export function currentLocale(): Locale { return _locale }
