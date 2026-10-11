import { forwardRef, type InputHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import s from './Input.module.css';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  icon?: IconName;
  value: string;
  onChange: (v: string) => void;
  clearable?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ icon, value, onChange, clearable, className, ...rest }, ref) {
  return (
    <label className={[s.wrap, className].filter(Boolean).join(' ')}>
      {icon && <Icon name={icon} size={18} />}
      <input ref={ref} className={s.input} value={value} onChange={e => onChange(e.target.value)} {...rest} />
      {clearable && value && <button type="button" className={s.clear} aria-label="Clear" onClick={() => onChange('')}><Icon name="close" size={16} /></button>}
    </label>
  );
});
