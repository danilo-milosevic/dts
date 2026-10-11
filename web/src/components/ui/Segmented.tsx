import { useId } from 'react';
import { motion } from 'framer-motion';
import { Icon, type IconName } from './Icon';
import { useMotion } from '@/hooks/useMotion';
import s from './Segmented.module.css';

export interface SegmentOption<T extends string> { value: T; label: string; icon?: IconName; /** Not selectable; `title` explains why (native tooltip). */ disabled?: boolean; title?: string; }

export function Segmented<T extends string>({ value, options, onChange, size = 'm', full, label }: { value: T; options: SegmentOption<T>[]; onChange: (v: T, e: React.MouseEvent) => void; size?: 'm' | 's'; full?: boolean; label?: string }) {
  const id = useId();
  const m = useMotion();
  return (
    <div role="radiogroup" aria-label={label} className={[s.root, size === 's' && s.s, full && s.full].filter(Boolean).join(' ')}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={s.item} disabled={o.disabled} title={o.title} onClick={e => onChange(o.value, e)}>
          {o.value === value && <motion.span layoutId={`seg-${id}`} className={s.indicator} transition={m.spring} />}
          <span className={s.content}>{o.icon && <Icon name={o.icon} size={16} className={s.icon} />}{o.label}</span>
        </button>
      ))}
    </div>
  );
}
