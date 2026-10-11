import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from './Icon';
import { useMotion } from '@/hooks/useMotion';
import s from './Select.module.css';

export interface Option<T extends string | number> { value: T; label: string; hint?: string; /** Shown but not selectable; `hint` explains why. */ disabled?: boolean; }

export interface SelectProps<T extends string | number> {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  width?: number | string;
  disabled?: boolean;
  prefix?: string;
  'aria-label'?: string;
}

export function Select<T extends string | number>({ value, options, onChange, width, disabled, prefix, ...aria }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0, up: false });
  const ref = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const m = useMotion();
  const current = options.find(o => o.value === value);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect(); const h = Math.min(320, options.length * 40 + 8);
    const up = r.bottom + h + 8 > innerHeight && r.top > h;
    setPos({ left: r.left, top: up ? r.top - h - 4 : r.bottom + 4, width: r.width, up });
    setActive(Math.max(0, options.findIndex(o => o.value === value)));
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setOpen(false); };
    const onScroll = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('mousedown', close); addEventListener('scroll', onScroll, true); addEventListener('resize', onScroll);
    return () => { removeEventListener('mousedown', close); removeEventListener('scroll', onScroll, true); removeEventListener('resize', onScroll); };
  }, [open]);

  const pick = (o: Option<T>) => { if (o.disabled) return; onChange(o.value); setOpen(false); ref.current?.focus(); };
  const step = (from: number, dir: 1 | -1) => { for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i; return from; };
  const onKey = (e: KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === 'Escape') { setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => step(a, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => step(a, -1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(options[active]); }
  };

  return (
    <div className={[s.root, open && s.open].filter(Boolean).join(' ')} style={{ width }}>
      <button ref={ref} type="button" className={s.trigger} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)} onKeyDown={onKey} aria-label={aria['aria-label']}>
        <span className={s.value}>{prefix}{current?.label ?? '—'}</span>
        <Icon name="expand_more" size={18} className={s.chev} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={menuRef} id={id} role="listbox" className={s.menu} style={{ left: pos.left, top: pos.top, minWidth: pos.width }}
              initial={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.98 }} transition={{ duration: m.fast }}>
              {options.map((o, i) => (
                <button key={String(o.value)} type="button" role="option" aria-selected={o.value === value} aria-disabled={o.disabled || undefined} data-active={i === active && !o.disabled} className={s.option} onMouseEnter={() => !o.disabled && setActive(i)} onClick={() => pick(o)}>
                  <span className={s.optionText}><span>{o.label}</span>{o.hint && <span className={s.hint}>{o.hint}</span>}</span>
                  {o.value === value && <Icon name="check" size={16} />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
