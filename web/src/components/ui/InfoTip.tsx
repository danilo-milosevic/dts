import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from './Icon';
import { useMotion } from '@/hooks/useMotion';
import s from './InfoTip.module.css';

const W = 300;

/** Small ⓘ next to a label; hover or focus shows an explanation. Rendered in a portal so side panels don't clip it. */
export function InfoTip({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, below: true });
  const ref = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const m = useMotion();

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const h = tip.current?.offsetHeight ?? 120;
    const below = r.bottom + 8 + h < innerHeight;
    setPos({ left: Math.max(8, Math.min(innerWidth - W - 8, r.left + r.width / 2 - W / 2)), top: below ? r.bottom + 8 : r.top - 8 - h, below });
  }, [open]);

  return (
    <>
      <button ref={ref} type="button" className={s.btn} aria-label={`About ${title}`} aria-expanded={open}
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onClick={e => { e.preventDefault(); setOpen(o => !o); }}>
        <Icon name="info" size={15} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={tip} role="tooltip" className={s.tip} style={{ left: pos.left, top: pos.top, width: W }}
              initial={{ opacity: 0, y: pos.below ? -4 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: m.fast }}>
              <span className={s.title}>{title}</span>
              <div className={s.body}>{children}</div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
