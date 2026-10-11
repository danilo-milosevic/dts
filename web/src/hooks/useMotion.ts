import { useSettings } from '@/store/settings';
import { durations, motionFactor } from '@/theme/tokens';

/** Durations in seconds for framer-motion, scaled by the Motion setting (0 when off). */
export function useMotion() {
  const f = motionFactor(useSettings(s => s.motion));
  return { factor: f, fast: (durations.fast / 1000) * f, base: (durations.base / 1000) * f, slow: (durations.slow / 1000) * f, chart: (durations.chart / 1000) * f, spring: f ? { type: 'spring' as const, stiffness: 500, damping: 38 } : { duration: 0 } };
}
