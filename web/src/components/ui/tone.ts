export type Tone = 'accent' | 'dts' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';
/** Tone → CSS color variable. */
export const toneVar: Record<Tone, string> = {
  accent: 'var(--accent-primary)', dts: 'var(--accent-dts)', info: 'var(--accent-info)', success: 'var(--accent-success)',
  warning: 'var(--accent-warning)', danger: 'var(--accent-danger)', neutral: 'var(--text-muted)',
};
