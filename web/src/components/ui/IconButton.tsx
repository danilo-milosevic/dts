import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import s from './IconButton.module.css';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  variant?: 'ghost' | 'soft' | 'accent' | 'danger';
  size?: 32 | 40;
  active?: boolean;
  badge?: number | string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ icon, label, variant = 'ghost', size = 32, active, badge, className, ...rest }, ref) {
  return (
    <button ref={ref} aria-label={label} title={label} className={[s.btn, s[variant], size === 40 && s.md, active && s.active, className].filter(Boolean).join(' ')} {...rest}>
      <Icon name={icon} size={size === 40 ? 22 : 18} />
      {badge != null && <span className={s.badge}>{badge}</span>}
    </button>
  );
});
