import type { CSSProperties } from 'react';
import { toneVar, type Tone } from './tone';
import s from './Legend.module.css';

export interface LegendItem { key: string; label: string; tone: Tone; }

/** Clickable legend that toggles series visibility. */
export function Legend({ items, hidden, onToggle }: { items: LegendItem[]; hidden: string[]; onToggle: (key: string) => void }) {
  return (
    <div className={s.legend}>
      {items.map(i => (
        <button key={i.key} type="button" aria-pressed={!hidden.includes(i.key)} className={[s.item, hidden.includes(i.key) && s.off].filter(Boolean).join(' ')} style={{ '--tone': toneVar[i.tone] } as CSSProperties} onClick={() => onToggle(i.key)}>
          <span className={s.sw} />{i.label}
        </button>
      ))}
    </div>
  );
}
