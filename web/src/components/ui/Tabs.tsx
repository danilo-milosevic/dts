import { useId } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Icon, type IconName } from './Icon';
import { useMotion } from '@/hooks/useMotion';
import s from './Tabs.module.css';

export interface TabItem { to: string; label: string; icon: IconName; count?: number; match?: string[]; }

/** Route tabs with a sliding underline. */
export function Tabs({ items }: { items: TabItem[] }) {
  const id = useId();
  const m = useMotion();
  const { pathname } = useLocation();
  const isActive = (t: TabItem) => (t.match ?? [t.to]).some(p => (p === '/' ? pathname === '/' : pathname.startsWith(p)));
  return (
    <nav className={s.tabs} aria-label="Workspace">
      {items.map(t => {
        const active = isActive(t);
        return (
          <NavLink key={t.to} to={t.to} className={[s.tab, active && s.active].filter(Boolean).join(' ')} aria-current={active ? 'page' : undefined}>
            <Icon name={t.icon} size={18} />
            {t.label}
            {!!t.count && <span className={s.count}>{t.count}</span>}
            {active && <motion.span layoutId={`tab-${id}`} className={s.underline} transition={m.spring} />}
          </NavLink>
        );
      })}
    </nav>
  );
}
