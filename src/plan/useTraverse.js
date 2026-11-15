import { useEffect, useState } from 'react';
import { loadTraverse } from '../data/traverse.js';

/** traverse.json, parsed once per page. Null until it loads, and null if it cannot be loaded. */
export function useTraverse() {
  const [traverse, setTraverse] = useState(null);
  useEffect(() => {
    let alive = true;
    loadTraverse().then((value) => alive && setTraverse(value), () => {});
    return () => { alive = false; };
  }, []);
  return traverse;
}
