import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, type IconName } from './Icon';
import { useMotion } from '@/hooks/useMotion';
import s from './Menu.module.css';

export type MenuItem = { label: string; icon?: IconName; onClick: () => void; danger?: boolean; disabled?: boolean } | 'separator';

/** Popover menu attached to a trigger element (rendered via render-prop). */
export function Menu({ items, trigger }: { items: MenuItem[]; trigger: (p: { onClick: () => void; ref: (el: HTMLElement | null) => void; 'aria-expanded': boolean }) => ReactElement }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const anchor = useRef<HTMLElement | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const m = useMotion();
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect(); const h = items.length * 38 + 8;
    setPos({ left: Math.min(r.right - 180, innerWidth - 190), top: r.bottom + h > innerHeight ? r.top - h - 4 : r.bottom + 4 });
  }, [open, items.length]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!menu.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('mousedown', close); addEventListener('scroll', close, true); addEventListener('keydown', esc);
    return () => { removeEventListener('mousedown', close); removeEventListener('scroll', close, true); removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <>
      {trigger({ onClick: () => setOpen(o => !o), ref: el => (anchor.current = el), 'aria-expanded': open })}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={menu} role="menu" className={s.menu} style={pos} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: m.fast }}>
              {items.map((it, i) => it === 'separator' ? <div key={i} className={s.sep} /> : (
                <button key={it.label} role="menuitem" type="button" disabled={it.disabled} className={[s.item, it.danger && s.danger].filter(Boolean).join(' ')} onClick={() => { setOpen(false); it.onClick(); }}>
                  {it.icon && <Icon name={it.icon} size={18} />}{it.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
