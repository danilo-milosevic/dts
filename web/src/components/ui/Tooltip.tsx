import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMotion } from '@/hooks/useMotion';
import s from './Tooltip.module.css';

/**
 * Positioned tooltip for charts and canvases. (x, y) is the anchor inside the nearest
 * positioned parent; it flips left / below when it would leave `bounds`.
 */
export function FloatingTip({ show, x, y, title, detail, bounds, offset = 14 }: { show: boolean; x: number; y: number; title: ReactNode; detail?: ReactNode; bounds?: { w: number; h: number }; offset?: number }) {
  const m = useMotion();
  const flipX = bounds ? x > bounds.w - 220 : false;
  const flipY = y < 56;
  return (
    <AnimatePresence>
      {show && (
        <motion.div style={{ position: 'absolute', zIndex: 20, pointerEvents: 'none', left: x, top: y }} initial={{ opacity: 0 }} animate={{ opacity: 1, left: x, top: y }} exit={{ opacity: 0 }}
          transition={{ duration: m.fast, left: { duration: m.fast * 0.7 }, top: { duration: m.fast * 0.7 } }}>
          <div className={s.tip} style={{ transform: `translate(${flipX ? `calc(-100% - ${offset}px)` : `${offset}px`}, ${flipY ? `${offset}px` : `calc(-100% - ${offset / 2}px)`})` }}>
            <span className={s.title}>{title}</span>
            {detail && <span className={s.detail}>{detail}</span>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
