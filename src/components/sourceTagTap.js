// A source tag's details on a touch screen (#365). A mouse opens them on hover; a finger has no hover, so a tap on the
// tag opens them and a second tap closes them. A pen or a mouse keeps the hover behaviour, so this answers only for
// touch. Plain JavaScript, tested without a browser.

/**
 * What a pointer release on the tag does to its details.
 * @param {boolean} open the details are showing
 * @param {string} pointerType PointerEvent.pointerType
 * @returns {'open' | 'close' | null} null: leave them to hover and focus
 */
export function tipAfterTap(open, pointerType) {
  if (pointerType !== 'touch') return null;
  return open ? 'close' : 'open';
}
