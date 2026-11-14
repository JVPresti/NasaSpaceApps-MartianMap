import { t } from '../i18n/index.js';
import { openSources } from './sourcesStore.js';

/** The single Plan mode entry point to the sources screen. */
export default function SourcesButton() {
  return (
    <button type="button" className="sources-open" onClick={openSources} title={t('ui.every.dataset.and.asset.with.its.credit.c')}>{t('ui.sources')}<kbd>{t('keys.sources')}</kbd>
    </button>
  );
}
