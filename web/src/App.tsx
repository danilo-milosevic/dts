import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { useData } from '@/store/data';
import { useMotion } from '@/hooks/useMotion';
import { SidePanel } from '@/components/layout/SidePanel';
import { Toasts } from '@/components/domain/Toasts';
import { EncoderView } from '@/views/EncoderView';
import { QueueView } from '@/views/QueueView';
import { CompareView } from '@/views/CompareView';
import { ImportView } from '@/views/ImportView';
import s from '@/components/layout/Layout.module.css';

function Routed() {
  const location = useLocation();
  // the main column itself never animates on navigation (no flash of the top bar); each page fades its own content in
  return (
    <main className={s.main}>
        <Routes location={location}>
          <Route path="/" element={<EncoderView />} />
          <Route path="/import" element={<ImportView />} />
          <Route path="/queue" element={<QueueView />} />
          <Route path="/compare" element={<CompareView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
  );
}

export function App() {
  const init = useData(d => d.init);
  const m = useMotion();
  useEffect(() => { init(); }, [init]);
  return (
    <MotionConfig reducedMotion={m.factor === 0 ? 'always' : 'never'}>
      <BrowserRouter>
        <div className={s.shell}>
          <SidePanel />
          <Routed />
        </div>
        <Toasts />
      </BrowserRouter>
    </MotionConfig>
  );
}
