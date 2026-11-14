import SharedSourceTag from '../components/SourceTag.jsx';

// The shared provenance tag (#62, src/components/SourceTag.jsx) in the Plan mode chip style (.src-tag in index.css).
// Plan panels take the pointer, so the tag is interactive by default: details on hover and keyboard focus.

const chip = (tag) => 'src-tag src-tag-' + tag;

/**
 * DATA, DERIVED or SIM tag for a store path (plan section 4.1).
 * @param {{ path: string, interactive?: boolean, requireSource?: boolean }} props
 *   requireSource: render nothing until the store has sources[path] (default), so a placeholder shows no tag.
 */
export default function SourceTag({ path, interactive = true, requireSource = true }) {
  return <SharedSourceTag path={path} variant="tag" interactive={interactive} requireSource={requireSource} className={chip} />;
}
