import SharedSourceTag from '../components/SourceTag.jsx';

// The shared provenance tag (#62, src/components/SourceTag.jsx) in the Plan mode chip style (.src-tag in index.css).
// Plan panels take the pointer, so the tag is interactive by default: details on hover and keyboard focus.

const chip = (tag) => 'src-tag src-tag-' + tag;

/**
 * DATA, DERIVED or SIM tag for a store path (plan section 4.1).
 * @param {{ path: string, interactive?: boolean, requireSource?: boolean, source?: object | null }} props
 *   requireSource: render nothing until the store has sources[path] (default), so a placeholder shows no tag.
 *   source: a live entry to use instead of the store's sources[path]; null shows the registry entry alone.
 */
export default function SourceTag({ path, interactive = true, requireSource = true, source }) {
  return <SharedSourceTag path={path} variant="tag" interactive={interactive} requireSource={requireSource} source={source} className={chip} />;
}
