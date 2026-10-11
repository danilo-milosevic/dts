/** UI/appearance settings, persisted to localStorage and applied as CSS variables. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyTokens, type AccentName, type Density, type FontScale, type MotionLevel, type RadiusScale, type ThemeName, type TokenSettings } from '@/theme/tokens';

interface SettingsState extends TokenSettings {
  sidePanel: 'list' | 'settings';
  sidePanelCollapsed: boolean;
  inspectorOpen: boolean;
  /** User-resized panel widths in px (null = token default). */
  sidePanelW: number | null;
  inspectorW: number | null;
  outputDevice: string;
  bufferSize: number;
  previewAfterEncode: boolean;
  set: (patch: Partial<SettingsState>) => void;
  setTheme: (theme: ThemeName, origin?: { x: number; y: number }) => void;
  setAccent: (a: AccentName) => void;
  setFontScale: (f: FontScale) => void;
  setDensity: (d: Density) => void;
  setRadius: (r: RadiusScale) => void;
  setMotion: (m: MotionLevel) => void;
  resetAppearance: () => void;
}

const appearanceDefaults: TokenSettings = { theme: 'dark', accent: 'orange', fontScale: 'mid', density: 'default', radius: 'default', motion: 'normal' };

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...appearanceDefaults,
      sidePanel: 'list',
      sidePanelCollapsed: false,
      inspectorOpen: true,
      sidePanelW: null,
      inspectorW: null,
      outputDevice: 'default',
      bufferSize: 512,
      previewAfterEncode: true,
      set: patch => set(patch),
      setTheme: (theme, origin) => {
        if (theme === get().theme) return;
        const apply = () => set({ theme });
        const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
        if (get().motion !== 'off' && doc.startViewTransition) {
          const x = origin?.x ?? innerWidth / 2, y = origin?.y ?? innerHeight / 2;
          const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
          const root = document.documentElement.style;
          root.setProperty('--reveal-x', `${x}px`); root.setProperty('--reveal-y', `${y}px`); root.setProperty('--reveal-r', `${r}px`);
          doc.startViewTransition(apply);
        } else {
          document.documentElement.classList.add('theme-animating'); apply();
          setTimeout(() => document.documentElement.classList.remove('theme-animating'), 600);
        }
      },
      setAccent: accent => set({ accent }),
      setFontScale: fontScale => set({ fontScale }),
      setDensity: density => set({ density }),
      setRadius: radius => set({ radius }),
      setMotion: motion => set({ motion }),
      resetAppearance: () => set({ ...appearanceDefaults }),
    }),
    { name: 'dts-encoder-settings', partialize: s => Object.fromEntries(Object.entries(s).filter(([k, v]) => typeof v !== 'function' && !['sidePanel', 'sidePanelCollapsed'].includes(k))) as Partial<SettingsState> },
  ),
);

const tokenKeys = (s: SettingsState): TokenSettings => ({ theme: s.theme, accent: s.accent, fontScale: s.fontScale, density: s.density, radius: s.radius, motion: s.motion });

/** Apply now and whenever an appearance setting changes (runs synchronously inside view transitions). */
export function bindTokens() {
  applyTokens(tokenKeys(useSettings.getState()));
  let prev = JSON.stringify(tokenKeys(useSettings.getState()));
  useSettings.subscribe(s => { const k = tokenKeys(s); const j = JSON.stringify(k); if (j !== prev) { prev = j; applyTokens(k); } });
}
