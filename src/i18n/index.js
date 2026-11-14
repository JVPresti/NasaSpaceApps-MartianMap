import en from './en.json';
import es from './es.json';

export const LANGUAGE_KEY = 'marswalk.language';
export const LANGUAGES = ['en', 'es'];
export const catalogs = { en, es };
const listeners = new Set();
const warned = new Set();
const englishKeys = new Map(Object.entries(en).map(([key, text]) => [text, key]));

function savedLanguage() {
  try {
    const saved = globalThis.localStorage?.getItem(LANGUAGE_KEY);
    if (LANGUAGES.includes(saved)) return saved;
  } catch { /* Storage may be disabled; switching still works for this session. */ }
  return 'en';
}

let language = savedLanguage();
export const getLanguage = () => language;
export const subscribeLanguage = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

export function setLanguage(next) {
  if (!LANGUAGES.includes(next)) return;
  try { globalThis.localStorage?.setItem(LANGUAGE_KEY, next); } catch { /* Session-only preference. */ }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  if (next === language) return;
  language = next;
  for (const listener of listeners) listener();
}

if (typeof document !== 'undefined') document.documentElement.lang = language;

/** Named strings and plain-text interpolation; React handles escaping at the rendering boundary. */
export function t(key, values = {}) {
  const text = Object.hasOwn(catalogs[language], key) ? catalogs[language][key] : undefined;
  if (typeof text !== 'string') {
    if (!warned.has(key)) { console.warn('[i18n] Missing translation: ' + key); warned.add(key); }
    return key;
  }
  return text.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
}

/** Boundary for existing engine/event data. Scientific content and proper names pass through unchanged. */
export function translateText(text) {
  if (Object.hasOwn(catalogs[language], text)) return t(text);
  const key = englishKeys.get(text);
  return key ? t(key) : text;
}

const numberFormats = new Map();
export function formatNumber(value, digits = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  const key = language + ':' + digits;
  if (!numberFormats.has(key)) numberFormats.set(key, new Intl.NumberFormat(language === 'es' ? 'es-ES' : 'en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false,
  }));
  // Keep the simulation UI's existing toFixed rounding at binary halfway values.
  return numberFormats.get(key).format(Number(value.toFixed(digits)));
}

/** SI symbols stay invariant; all UI number/unit combinations share this formatter. */
export function formatUnit(value, unit, digits = 0) {
  return formatNumber(value, digits) + (unit === '°' ? '' : ' ') + unit;
}
