import s from './Toggle.module.css';

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={s.toggle} onClick={() => onChange(!checked)}>
      <span className={s.knob} />
    </button>
  );
}
