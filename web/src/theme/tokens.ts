/**
 * Design tokens — the single source of truth for every visual value in the app.
 * They are written to CSS custom properties on <html> by `applyTokens()`, and every
 * stylesheet reads them with var(--…). Settings change them at runtime.
 *
 * Values mirror the Figma "Foundations" section (Theme / Dark, Theme / Light,
 * Spacing & Radius, Barlow Condensed type styles).
 */

export type ThemeName = 'dark' | 'light';
export type AccentName = 'orange' | 'green' | 'blue' | 'purple' | 'yellow';
export type FontScale = 'small' | 'mid' | 'big';
export type Density = 'compact' | 'default' | 'comfortable';
export type RadiusScale = 'sharp' | 'default' | 'round';
export type MotionLevel = 'off' | 'reduced' | 'normal' | 'slow';

/** Theme colors (Figma: Theme / Dark and Theme / Light collections). */
export const colors: Record<ThemeName, Record<string, string>> = {
  dark: {
    'bg-app': '#212121',
    'bg-panel': '#2f2f2f',
    'bg-inset': '#2b2b2b',
    'bg-card': '#212121',
    'bg-hover': 'rgba(255,255,255,0.05)',
    'bg-overlay': 'rgba(0,0,0,0.5)',
    'text-primary': '#e0e0e0',
    'text-secondary': '#cfcfcf',
    'text-muted': '#afafaf',
    'text-on-accent': '#212121',
    'text-on-strong': '#ffffff',
    'border-default': '#565656',
    'border-subtle': '#363636',
    'accent-danger': '#e83a51',
    'accent-dts': '#743ae8',
    'accent-info': '#3aaee8',
    'accent-success': '#3ae888',
    'accent-warning': '#e8d33a',
    'shadow-color': 'rgba(0,0,0,0.35)',
    'shadow-color-strong': 'rgba(0,0,0,0.5)',
    // spectrogram color maps (low → high energy)
    'spec-src-0': '#212121', 'spec-src-1': '#2c1d28', 'spec-src-2': '#6b2140', 'spec-src-3': '#e83a51', 'spec-src-4': '#e8973a', 'spec-src-5': '#f6d27c', 'spec-src-6': '#fff7e6',
    'spec-dts-0': '#212121', 'spec-dts-1': '#221c33', 'spec-dts-2': '#3d2577', 'spec-dts-3': '#743ae8', 'spec-dts-4': '#9562f0', 'spec-dts-5': '#b28cff', 'spec-dts-6': '#f2ebff',
  },
  light: {
    'bg-app': '#eeeeee',
    'bg-panel': '#d7d7d7',
    'bg-inset': '#e4e4e4',
    'bg-card': '#f6f6f6',
    'bg-hover': 'rgba(0,0,0,0.05)',
    'bg-overlay': 'rgba(0,0,0,0.25)',
    'text-primary': '#2b2b2b',
    'text-secondary': '#565656',
    'text-muted': '#6e6e6e',
    'text-on-accent': '#2b2b2b',
    'text-on-strong': '#ffffff',
    'border-default': '#afafaf',
    'border-subtle': '#cfcfcf',
    'accent-danger': '#df001e',
    'accent-dts': '#743ae8',
    'accent-info': '#1c8cc4',
    'accent-success': '#14a85c',
    'accent-warning': '#b89a00',
    'shadow-color': 'rgba(0,0,0,0.12)',
    'shadow-color-strong': 'rgba(0,0,0,0.2)',
    'spec-src-0': '#f6f6f6', 'spec-src-1': '#f4e6d6', 'spec-src-2': '#f2c27a', 'spec-src-3': '#efa52f', 'spec-src-4': '#df001e', 'spec-src-5': '#7a1035', 'spec-src-6': '#2b2b2b',
    'spec-dts-0': '#f6f6f6', 'spec-dts-1': '#ebe3fb', 'spec-dts-2': '#c2a8f6', 'spec-dts-3': '#743ae8', 'spec-dts-4': '#5a2bc0', 'spec-dts-5': '#3d1f8f', 'spec-dts-6': '#1b1033',
  },
};

/** Accent swatches offered in Settings → Display. */
export const accents: Record<AccentName, Record<ThemeName, string>> = {
  orange: { dark: '#e8973a', light: '#efa52f' },
  green: { dark: '#3ae888', light: '#14a85c' },
  blue: { dark: '#3aaee8', light: '#1c8cc4' },
  purple: { dark: '#9562f0', light: '#743ae8' },
  yellow: { dark: '#e8d33a', light: '#b89a00' },
};

/** Spacing scale (Figma: space/2 … space/48). Multiplied by the density factor. */
export const space = { 2: 2, 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 48: 48 } as const;
/** Corner radii (Figma: radius/xs … radius/xl). Multiplied by the radius factor. */
export const radius = { xs: 2, sm: 5, md: 10, lg: 20, xl: 30 } as const;

/**
 * Type scale (Figma text styles, Barlow Condensed).
 * display = Big/Title, title = Mid/Title, heading = Mid/Subtitle, subheading = Small/Subtitle,
 * body = Mid/Body, small = Small/Body, label = UI/Label, caption = UI/Caption, numeric = UI/Numeric.
 */
export const fontSizes = { display: 36, title: 32, heading: 24, subheading: 20, body: 16, small: 12, label: 16, button: 16, caption: 12, numeric: 20 } as const;
export const fontWeights = { regular: 400, medium: 500, semibold: 600 } as const;

/** Fixed component dimensions. */
export const sizes = {
  'control-h': 36, 'control-h-sm': 28, 'icon-btn-sm': 32, 'icon-btn-md': 40, 'icon': 20,
  'sidepanel-w': 480, 'rail-w': 72, 'inspector-w': 400, 'topbar-h': 56,
  'track-row-h': 52, 'queue-row-h': 60, 'lane-h': 112, 'lane-head-w': 200, 'spec-h': 150,
  'meter-w': 8, 'toggle-w': 36, 'toggle-h': 20,
} as const;

/** Motion (durations in ms). Multiplied by the motion factor (0 = off). */
export const durations = { fast: 120, base: 200, slow: 350, theme: 500, chart: 600 } as const;
export const easings = {
  out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
};

export const factors = {
  fontScale: { small: 0.875, mid: 1, big: 1.125 } as Record<FontScale, number>,
  density: { compact: 0.8, default: 1, comfortable: 1.2 } as Record<Density, number>,
  radius: { sharp: 0.4, default: 1, round: 1.5 } as Record<RadiusScale, number>,
  motion: { off: 0, reduced: 0.5, normal: 1, slow: 1.8 } as Record<MotionLevel, number>,
};

export interface TokenSettings {
  theme: ThemeName;
  accent: AccentName;
  fontScale: FontScale;
  density: Density;
  radius: RadiusScale;
  motion: MotionLevel;
}

const hexToRgb = (hex: string) => {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const rgba = (hex: string, a: number) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

/** Compute the full CSS-variable map for a set of settings. */
export function computeTokens(s: TokenSettings): Record<string, string> {
  const out: Record<string, string> = {};
  const c = colors[s.theme];
  for (const [k, v] of Object.entries(c)) out[k] = v;
  const accent = accents[s.accent][s.theme];
  out['accent-primary'] = accent;
  out['bg-accent-soft'] = rgba(accent, s.theme === 'dark' ? 0.14 : 0.22);
  out['bg-dts-soft'] = rgba(c['accent-dts'], s.theme === 'dark' ? 0.18 : 0.14);
  out['bg-danger-soft'] = rgba(c['accent-danger'], 0.12);
  out['focus-ring'] = rgba(accent, 0.45);

  const d = factors.density[s.density];
  for (const [k, v] of Object.entries(space)) out[`space-${k}`] = `${Math.round(v * d)}px`;
  const r = factors.radius[s.radius];
  for (const [k, v] of Object.entries(radius)) out[`radius-${k}`] = `${Math.round(v * r * 10) / 10}px`;
  const f = factors.fontScale[s.fontScale];
  for (const [k, v] of Object.entries(fontSizes)) out[`fs-${k}`] = `${Math.round(v * f)}px`;
  for (const [k, v] of Object.entries(fontWeights)) out[`fw-${k}`] = `${v}`;
  out['font-family'] = "'Barlow Condensed', 'Arial Narrow', sans-serif";
  out['line-height'] = '1.2';
  out['letter-spacing-button'] = '0.02em';
  out['letter-spacing-caption'] = '0.04em';
  for (const [k, v] of Object.entries(sizes)) {
    const scaled = ['control-h', 'control-h-sm', 'track-row-h', 'queue-row-h', 'topbar-h'].includes(k) ? Math.round(v * (0.5 + d / 2)) : v;
    out[`size-${k}`] = `${scaled}px`;
  }
  const m = factors.motion[s.motion];
  for (const [k, v] of Object.entries(durations)) out[`dur-${k}`] = `${Math.round(v * m)}ms`;
  out['ease-out'] = easings.out; out['ease-in-out'] = easings.inOut; out['ease-spring'] = easings.spring;

  out['shadow-sm'] = `0 1px 2px var(--shadow-color)`;
  out['shadow-md'] = `0 8px 24px var(--shadow-color)`;
  out['shadow-tooltip'] = `0 4px 12px var(--shadow-color-strong)`;
  out['shadow-focus'] = `0 0 0 3px var(--focus-ring)`;

  return out;
}

/** Write tokens to <html> as CSS custom properties. */
export function applyTokens(s: TokenSettings, root: HTMLElement = document.documentElement) {
  const t = computeTokens(s);
  for (const [k, v] of Object.entries(t)) root.style.setProperty(`--${k}`, v);
  root.dataset.theme = s.theme;
  root.dataset.motion = s.motion;
}

/** Motion factor as a number, for JS-driven animations (framer-motion, D3). */
export const motionFactor = (m: MotionLevel) => factors.motion[m];

