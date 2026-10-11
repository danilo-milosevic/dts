import type { ReactNode } from 'react';
import { Icon } from './Icon';
import s from './Checkbox.module.css';

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  return (
    <label className={[s.label, checked && s.checked].filter(Boolean).join(' ')}>
      <input type="checkbox" className={s.hidden} checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className={s.box}><Icon name="check" size={14} /></span>
      {children}
    </label>
  );
}

export function Radio({ checked, onChange, name, children }: { checked: boolean; onChange: () => void; name: string; children?: ReactNode }) {
  return (
    <label className={[s.label, s.radio, checked && s.checked].filter(Boolean).join(' ')}>
      <input type="radio" name={name} className={s.hidden} checked={checked} onChange={onChange} />
      <span className={s.box}><span className={s.dot} /></span>
      {children}
    </label>
  );
}
