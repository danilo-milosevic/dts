import type { CSSProperties, ReactNode } from 'react';
import { toneVar, type Tone } from './tone';
import s from './Stat.module.css';

export function Stat({ label, value, tone, align }: { label: string; value: ReactNode; tone?: Tone; align?: 'right' }) {
  return (
    <div className={[s.stat, align === 'right' && s.right].filter(Boolean).join(' ')} style={tone ? ({ '--tone': toneVar[tone] } as CSSProperties) : undefined}>
      <span className={s.label}>{label}</span>
      <span className={s.value}>{value}</span>
    </div>
  );
}
