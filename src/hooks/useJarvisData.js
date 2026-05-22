import { useCallback, useEffect, useState } from 'react';
import { getJarvis, JARVIS_DEFAULT_DATA } from '@/jarvis-bridge.js';

export function useJarvisData() {
  const [data, setData] = useState(null);

  const refresh = useCallback(async () => {
    const next = await getJarvis().readData();
    setData(next);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const off = getJarvis().onDataChanged(() => {
      refresh();
    });
    return off;
  }, [refresh]);

  /** @param {(d: typeof JARVIS_DEFAULT_DATA) => typeof JARVIS_DEFAULT_DATA} mutator */
  const persist = useCallback(async (mutator) => {
    const current = await getJarvis().readData();
    const next = mutator(structuredClone(current));
    await getJarvis().writeData(next);
    setData(next);
  }, []);

  return { data: data ?? JARVIS_DEFAULT_DATA, refresh, persist };
}
