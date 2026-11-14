import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogs, formatNumber, formatUnit, getLanguage, LANGUAGE_KEY, setLanguage, subscribeLanguage, t, translateText } from './index.js';

afterEach(() => { setLanguage('en'); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('interface languages', () => {
  it('has complete English and Spanish catalogs with matching interpolation arguments', () => {
    expect(Object.keys(catalogs.es).sort()).toEqual(Object.keys(catalogs.en).sort());
    for (const [key, text] of Object.entries(catalogs.en)) {
      expect(catalogs.es[key].trim(), key).not.toBe('');
      const placeholders = (value) => (value.match(/\{\w+\}/g) ?? []).sort();
      expect(placeholders(catalogs.es[key]), key).toEqual(placeholders(text));
    }
  });

  it('notifies mounted consumers immediately, saves the preference and rejects unsupported languages', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    const listener = vi.fn();
    const unsubscribe = subscribeLanguage(listener);
    setLanguage('es');
    expect(getLanguage()).toBe('es');
    expect(t('language')).toBe('Idioma');
    expect(setItem).toHaveBeenCalledWith(LANGUAGE_KEY, 'es');
    expect(listener).toHaveBeenCalledTimes(1);
    setLanguage('fr');
    expect(getLanguage()).toBe('es');
    unsubscribe();
    setLanguage('en');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('restores a saved language on a fresh session and falls back for invalid preferences', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'es' });
    vi.resetModules();
    expect((await import('./index.js')).getLanguage()).toBe('es');
    vi.stubGlobal('localStorage', { getItem: () => 'unknown' });
    vi.resetModules();
    expect((await import('./index.js')).getLanguage()).toBe('en');
  });

  it('still switches when browser storage is disabled', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('disabled'); } });
    expect(() => setLanguage('es')).not.toThrow();
    expect(t('pause')).toBe('Pausa');
  });

  it('shows the missing key itself and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(t('missing.example')).toBe('missing.example');
    expect(t('missing.example')).toBe('missing.example');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('missing.example');
  });

  it('formats interpolated UI messages, numbers and SI units without changing existing rounding', () => {
    expect(formatNumber(0.955, 2)).toBe('0.95');
    expect(formatNumber(null)).toBe('–');
    expect(formatUnit(1.25, 'm', 1)).toBe('1.3 m');
    setLanguage('es');
    expect(formatNumber(0.955, 2)).toBe('0,95');
    expect(formatUnit(21.5, '°', 1)).toBe('21,5°');
    expect(t('files', { loaded: 2, total: 10 })).toBe('2 / 10 archivos');
    expect(translateText('Dust storm: opacity rising. Return to the habitat.')).toContain('Vuelve al hábitat');
    expect(translateText('Cheyava Falls')).toBe('Cheyava Falls');
    expect(translateText('Scientific content from a data file.')).toBe('Scientific content from a data file.');
  });
});
