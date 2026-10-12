import type { ReactNode } from 'react';
import { InfoTip } from './InfoTip';
import s from './Field.module.css';

/** Label + optional hint + control (Figma "Field Row"). `info` adds an ⓘ with a longer explanation. */
export function Field({ label, hint, info, children, layout = 'inline', htmlFor }: { label: ReactNode; hint?: ReactNode; info?: ReactNode; children: ReactNode; layout?: 'inline' | 'stacked'; htmlFor?: string }) {
  return (
    <div className={layout === 'inline' ? s.inline : s.stacked}>
      <div className={s.text}>
        <span><label className={s.label} htmlFor={htmlFor}>{label}</label>{info && <InfoTip title={String(label)}>{info}</InfoTip>}</span>
        {hint && <span className={s.hint}>{hint}</span>}
      </div>
      <div className={s.control}>{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={s.section}><h3 className={s.sectionTitle}>{title}</h3>{children}</section>;
}
