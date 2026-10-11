import { useEffect, useState } from 'react';

export function useMediaQuery(q: string) {
  const [match, setMatch] = useState(() => matchMedia(q).matches);
  useEffect(() => { const m = matchMedia(q); const on = () => setMatch(m.matches); m.addEventListener('change', on); on(); return () => m.removeEventListener('change', on); }, [q]);
  return match;
}
