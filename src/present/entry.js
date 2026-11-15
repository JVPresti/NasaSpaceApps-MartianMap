// The start screen's quiet way into the presentation (#291). A plain link, so the presentation starts from a fresh page.
import { getLanguage } from '../i18n/index.js';
import { presentHrefFor } from './control.js';
import './entry.css';

/** The link, keeping the page's ?tier and ?lang so the presentation runs on the tier and language the presenter chose. */
export const presentHref = () => presentHrefFor(typeof window === 'undefined' ? '' : window.location.search);
export const presentLabel = () => (getLanguage() === 'es' ? 'Presentación' : 'Presentation');
export const isPresentUrl = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('present') === '1';
