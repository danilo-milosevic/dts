import type { CSSProperties } from 'react';
import { toneVar, type Tone } from './tone';
import s from './Progress.module.css';

export function Progress({ value, tone = 'accent', live, muted, label }: { value: number; tone?: Tone; live?: boolean; muted?: boolean; label?: string }) {
  return (
    <div className={[s.track, live && s.live, muted && s.muted].filter(Boolean).join(' ')} role="progressbar" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} style={{ '--tone': toneVar[tone] } as CSSProperties}>
      <div className={s.fill} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}
