/**
 * Save My Brain AI — i18n Hook
 *
 * Usage: const { t, lang } = useTranslation()
 * t('nav.home')                        → "Home"
 * t('settings.trial_days_left', {days: 3}) → "3 days left in trial"
 *
 * Language is stored in localStorage under 'smb_lang'.
 * Falls back to English if a key is missing in the selected language.
 */

import en from './en.json';
import zhTw from './zh-tw.json';
import ja from './ja.json';

const translations = { en, 'zh-tw': zhTw, ja };

export function useTranslation() {
  const lang = localStorage.getItem('smb_lang') || 'en';
  const dict = translations[lang] || translations.en;

  function t(key, replacements = {}) {
    const keys = key.split('.');
    let value = dict;
    for (const k of keys) {
      value = value?.[k];
    }
    if (value === undefined) {
      // Fallback to English
      let fallback = en;
      for (const k of keys) fallback = fallback?.[k];
      value = fallback ?? key;
    }
    // Return arrays/objects as-is (for features lists, steps, etc.)
    if (typeof value !== 'string') return value;
    // Handle replacements: t('greeting', {name: 'Eiko'}) → "Hello, Eiko"
    return value.replace(/\{(\w+)\}/g, (_, k) => replacements[k] ?? `{${k}}`);
  }

  return { t, lang };
}
