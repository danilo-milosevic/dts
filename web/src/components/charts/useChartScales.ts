export const MARGIN = { l: 52, r: 16, t: 12, b: 28 };
export const LAYOUT_GROUPS = ['mono', 'stereo', 'surround'] as const;
export const layoutToneVar = { mono: 'var(--accent-info)', stereo: 'var(--accent-primary)', surround: 'var(--accent-dts)' } as const;
export const layoutLegend = [{ key: 'mono', label: 'Mono', tone: 'info' as const }, { key: 'stereo', label: 'Stereo', tone: 'accent' as const }, { key: 'surround', label: 'Surround', tone: 'dts' as const }];
/** Least-squares line through points. */
export function linearFit(pts: [number, number][]) {
  const n = pts.length; if (n < 2) return null;
  const sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0), sxx = pts.reduce((a, p) => a + p[0] * p[0], 0), sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx); const a = (sy - b * sx) / n; return { a, b };
}
