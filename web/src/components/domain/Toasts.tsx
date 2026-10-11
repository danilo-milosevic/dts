import { AnimatePresence, motion } from 'framer-motion';
import { useUi, type ToastTone } from '@/store/ui';
import { Icon, type IconName } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Button } from '../ui/Button';
import { useMotion } from '@/hooks/useMotion';
import s from './Toasts.module.css';

const look: Record<ToastTone, [IconName, string]> = { success: ['check_circle', 'var(--accent-success)'], error: ['error', 'var(--accent-danger)'], info: ['info', 'var(--accent-info)'], warning: ['warning', 'var(--accent-warning)'] };

export function Toasts() {
  const toasts = useUi(st => st.toasts);
  const dismiss = useUi(st => st.dismiss);
  const m = useMotion();
  return (
    <div className={s.host} aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map(t => (
          <motion.div key={t.id} layout className={s.toast} initial={{ opacity: 0, x: 48, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 48, transition: { duration: m.fast } }} transition={m.spring}>
            <Icon name={look[t.tone][0]} size={22} color={look[t.tone][1]} />
            <div className={s.text}>
              <span className={s.title}>{t.title}</span>
              {t.message && <span className={s.msg}>{t.message}</span>}
              {t.action && <Button size="s" variant="ghost" className={s.action} onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</Button>}
            </div>
            <IconButton icon="close" label="Dismiss" onClick={() => dismiss(t.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
