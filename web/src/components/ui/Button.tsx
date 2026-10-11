import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import s from './Button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'dts';
  size?: 'm' | 's';
  icon?: IconName;
  loading?: boolean;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'm', icon, loading, full, className, children, disabled, ...rest }, ref) {
  return (
    <button ref={ref} className={[s.btn, s[variant], size === 's' && s.s, full && s.full, className].filter(Boolean).join(' ')} disabled={disabled || loading} {...rest}>
      {loading ? <span className={s.spinner} /> : icon && <Icon name={icon} size={size === 's' ? 16 : 18} />}
      {children}
    </button>
  );
});
