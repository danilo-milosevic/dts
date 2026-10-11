import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import s from './Card.module.css';

export function Card({ children, pad, gap, variant = 'card', outlined, className, style, ...rest }: HTMLAttributes<HTMLDivElement> & { pad?: number; gap?: number; variant?: 'card' | 'inset' | 'panel'; outlined?: boolean }) {
  const st = { ...(pad != null ? { '--pad': `var(--space-${pad})` } : {}), ...(gap != null ? { '--gap': `var(--space-${gap})` } : {}), ...style } as CSSProperties;
  return <div className={[s.card, variant !== 'card' && s[variant], outlined && s.outlined, className].filter(Boolean).join(' ')} style={st} {...rest}>{children}</div>;
}

export function CardHeader({ title, sub, icon, iconColor, right }: { title: ReactNode; sub?: ReactNode; icon?: IconName; iconColor?: string; right?: ReactNode }) {
  return (
    <div className={s.header}>
      {icon && <Icon name={icon} size={20} color={iconColor ?? 'var(--accent-primary)'} />}
      <div className={s.titles}><span className={s.title}>{title}</span>{sub && <span className={s.sub}>{sub}</span>}</div>
      <span className={s.spacer} />
      {right}
    </div>
  );
}
