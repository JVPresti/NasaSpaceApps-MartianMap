// The start screen's quiet way into the presentation (#291). A plain link, so the presentation starts from a fresh page.
import { getLanguage } from '../i18n/index.js';
import './entry.css';

export const presentHref = '?present=1';
export const presentLabel = () => (getLanguage() === 'es' ? 'Presentación' : 'Presentation');
export const isPresentUrl = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('present') === '1';
