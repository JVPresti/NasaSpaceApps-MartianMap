// Mounts the presentation (#291) only for ?present=1. The presentation itself is a separate chunk, loaded on demand,
// so the normal app downloads and runs nothing of it.
import { lazy, Suspense, useState } from 'react';
import { isPresentUrl } from './entry.js';

const Present = lazy(() => import('./Present.jsx'));

/** @param {{ engine: object | null }} props the engine, once App has it (null while the scene loads) */
export default function PresentGate({ engine }) {
  const [on, setOn] = useState(isPresentUrl);
  if (!on) return null;
  return (
    <Suspense fallback={null}>
      <Present engine={engine} onExit={() => setOn(false)} />
    </Suspense>
  );
}
