import type { ReactNode } from 'react';
import { Tabs } from '../ui/Tabs';
import { useData } from '@/store/data';
import s from './Layout.module.css';

/** Workspace column: top bar with route tabs + page actions, scrolling content, optional footer. */
export function Workspace({ actions, children, footer, contentStyle }: { actions?: ReactNode; children: ReactNode; footer?: ReactNode; contentStyle?: React.CSSProperties }) {
  const active = useData(d => d.jobs.filter(j => j.status === 'queued' || j.status === 'encoding').length);
  return (
    <section className={s.workspace}>
      <header className={s.topbar}>
        <Tabs items={[
          { to: '/', label: 'Compress', icon: 'compress', match: ['/', '/import'] },
          { to: '/queue', label: 'Queue', icon: 'queue_music', count: active },
          { to: '/compare', label: 'Compare', icon: 'tune' },
        ]} />
        <div className={s.topActions}>{actions}</div>
      </header>
      {/* page content fades in on navigation — a CSS animation runs once per mount and never restarts on re-render */}
      <div className={`${s.content} fade-in`} style={contentStyle}>{children}</div>
      {footer}
    </section>
  );
}

export function PageHeader({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className={s.pageHeader}>
      <h1 className={s.pageTitle} style={{ margin: 0 }}>{title}</h1>
      {sub && <span className={s.pageSub}>{sub}</span>}
      <span style={{ flex: 1 }} />
      {children}
    </div>
  );
}
