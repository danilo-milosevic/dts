import type { ReactNode } from 'react';
import s from './Field.module.css';

/** Label + optional hint + control (Figma "Field Row"). */
export function Field({ label, hint, children, layout = 'inline', htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; layout?: 'inline' | 'stacked'; htmlFor?: string }) {
  return (
    <div className={layout === 'inline' ? s.inline : s.stacked}>
      <div className={s.text}>
        <label className={s.label} htmlFor={htmlFor}>{label}</label>
        {hint && <span className={s.hint}>{hint}</span>}
      </div>
      <div className={s.control}>{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={s.section}><h3 className={s.sectionTitle}>{title}</h3>{children}</section>;
}
