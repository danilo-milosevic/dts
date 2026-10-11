import type { CSSProperties, ReactNode } from 'react';
import { toneVar, type Tone } from './tone';
import s from './Tag.module.css';

export function Tag({ tone = 'neutral', children, solid, dot, pulse, title }: { tone?: Tone; children: ReactNode; solid?: boolean; dot?: boolean; pulse?: boolean; title?: string }) {
  return (
    <span title={title} className={[s.tag, solid && s.solid, pulse && s.pulse].filter(Boolean).join(' ')} style={{ '--tone': toneVar[tone] } as CSSProperties}>
      {dot && <span className={s.dot} />}
      {children}
    </span>
  );
}
