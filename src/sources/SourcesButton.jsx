import { openSources } from './sourcesStore.js';

/** The single Plan mode entry point to the sources screen. */
export default function SourcesButton() {
  return (
    <button type="button" className="sources-open" onClick={openSources} title="Every dataset and asset, with its credit (C)">
      Sources <kbd>C</kbd>
    </button>
  );
}
