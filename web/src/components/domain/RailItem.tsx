import type { Track } from '@/api/types';
import { Icon } from '../ui/Icon';
import s from './RailItem.module.css';

export const abbreviate = (name: string) => {
  const base = name.replace(/\.\w+$/, ''); const m = base.match(/(\d+)/);
  const letters = base.replace(/[^A-Za-z]/g, '');
  return (letters.slice(0, m ? 1 : 3) + (m ? m[1].slice(-2).padStart(2, '0') : '')).toUpperCase();
};

export function RailItem({ track, selected, onClick }: { track: Track; selected: boolean; onClick: () => void }) {
  const encoded = track.status === 'encoded';
  return (
    <button type="button" title={track.name} aria-pressed={selected} className={[s.item, selected && s.selected].filter(Boolean).join(' ')} onClick={onClick}>
      <Icon name={encoded ? 'surround' : 'graphic_eq'} size={20} color={selected ? 'var(--accent-primary)' : encoded ? 'var(--accent-dts)' : 'var(--accent-danger)'} />
      {abbreviate(track.name)}
    </button>
  );
}
