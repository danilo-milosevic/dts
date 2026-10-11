import { accents, type AccentName } from '@/theme/tokens';
import { useSettings } from '@/store/settings';
import s from './Swatch.module.css';

export function SwatchPicker({ value, onChange }: { value: AccentName; onChange: (a: AccentName) => void }) {
  const theme = useSettings(st => st.theme);
  return (
    <div className={s.row} role="radiogroup" aria-label="Accent color">
      {(Object.keys(accents) as AccentName[]).map(a => (
        <button key={a} type="button" role="radio" aria-checked={a === value} aria-label={a} title={a} className={s.sw} onClick={() => onChange(a)}>
          <span className={s.dot} style={{ background: accents[a][theme] }} />
        </button>
      ))}
    </div>
  );
}
