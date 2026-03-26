import it from '../i18n/it.json';
import en from '../i18n/en.json';

type Translations = typeof it;
type TranslationKey = string; // Simplified for deep access

const translations: Record<string, any> = { it, en };
const DEFAULT_LANG = 'it';

let currentLang = DEFAULT_LANG;

export function setLanguage(lang: string) {
  if (translations[lang]) {
    currentLang = lang;
  }
}

export function t(keyPath: string): string {
  const keys = keyPath.split('.');
  let result: any = translations[currentLang];

  for (const key of keys) {
    if (result && result[key]) {
      result = result[key];
    } else {
      return keyPath; // Fallback to key path if not found
    }
  }

  return typeof result === 'string' ? result : keyPath;
}

export function useI18n() {
  return { t, setLanguage, currentLang };
}
