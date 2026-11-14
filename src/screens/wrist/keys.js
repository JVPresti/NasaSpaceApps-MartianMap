// Event.code keeps the bindings independent of the keyboard layout.
export function wristKey(event, open) {
  const el = event.target;
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey
    || event.isComposing || el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName)) return null;
  if (event.code === 'KeyR') return 'toggle';
  if (!open) return null;
  return { BracketLeft: 'previous-page', BracketRight: 'next-page', KeyJ: 'next-row', KeyK: 'previous-row', Enter: 'confirm' }[event.code] ?? null;
}
