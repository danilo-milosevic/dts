import { useMemo, type CSSProperties, type ReactNode } from 'react';
import type { BenchmarkResult, CompareStats } from '@/api/types';
import { fmtDuration, MB } from '@/lib/format';
import { Tag } from '../ui/Tag';
import { InfoTip } from '../ui/InfoTip';
import s from './FormatComparison.module.css';

type Row = CompareStats['sessionFiles'][number];

/** One measurement: a file in one format. */
interface Cell { bytes: number; encode: number | null; decode: number | null; note?: string | null; error?: string | null }
interface Column { id: string; label: string; sub: string; description: string; color: string; lossless?: boolean; baseline?: boolean }

const COLORS: Record<string, string> = { wav: 'var(--accent-primary)', dts: 'var(--accent-dts)', flac: 'var(--accent-success)', ac3: 'var(--accent-info)', aac: 'var(--accent-warning)', mp3: 'var(--text-secondary)', opus: 'var(--accent-danger)' };
const ORDER = ['flac', 'ac3', 'aac', 'mp3', 'opus'];

const mb = (b: number) => `${(b / MB).toFixed(b / MB < 10 ? 2 : 1)} MB`;
const kbpsLabel = (set: Set<number>) => { const k = [...set]; return k.length === 1 ? `${k[0]} kbps` : k.length ? `${Math.min(...k)}–${Math.max(...k)} kbps` : ''; };

/**
 * Format comparison table: one row per encoded file, one column per format (WAV source, DTS Core, then FLAC, AC-3,
 * AAC, MP3, Opus measured on the same audio). Each cell: compressed size, reduction vs the WAV, encode / decode time.
 * The smallest file in each row is marked; the last row totals every file that has all formats.
 */
export function FormatComparison({ rows, onOpen }: { rows: Row[]; onOpen?: (trackId: string) => void }) {
  const files = rows.filter(r => r.status === 'done' && r.inputBytes && r.outputBytes);

  const { columns, cells } = useMemo(() => {
    const bench = new Map<string, { label: string; description: string; lossless: boolean; kbps: Set<number> }>();
    const cells = new Map<string, Map<string, Cell>>(); // trackId → column → cell
    for (const r of files) {
      const m = new Map<string, Cell>();
      m.set('wav', { bytes: r.inputBytes!, encode: null, decode: null });
      m.set('dts', { bytes: r.outputBytes!, encode: r.encodeSeconds, decode: r.decodeSeconds ?? null });
      for (const b of (r.benchmarks ?? []) as BenchmarkResult[]) {
        const c = bench.get(b.format) ?? { label: b.label, description: b.description, lossless: b.lossless, kbps: new Set<number>() };
        if (b.bitrateKbps) c.kbps.add(b.bitrateKbps);
        bench.set(b.format, c);
        m.set(b.format, { bytes: b.sizeBytes ?? 0, encode: b.encodeSeconds, decode: b.decodeSeconds, note: b.note, error: b.error ?? (b.sizeBytes == null ? 'not measured' : null) });
      }
      cells.set(r.trackId, m);
    }
    const dtsKbps = new Set(files.map(r => (r.outputBytes && r.durationSec ? Math.round((r.outputBytes * 8) / r.durationSec / 1000 / 10) * 10 : 0)).filter(Boolean));
    const columns: Column[] = [
      { id: 'wav', label: 'WAV', sub: 'Source', description: 'Uncompressed source PCM', color: COLORS.wav, baseline: true, lossless: true },
      { id: 'dts', label: 'DTS Core', sub: kbpsLabel(dtsKbps) ? `≈ ${kbpsLabel(dtsKbps)}` : '', description: 'This app — ffmpeg dca encoder', color: COLORS.dts },
      ...[...bench.entries()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0])).map(([id, c]) =>
        ({ id, label: c.label, sub: c.lossless ? 'Lossless' : kbpsLabel(c.kbps), description: c.description, color: COLORS[id] ?? 'var(--text-muted)', lossless: c.lossless })),
    ];
    return { columns, cells };
  }, [files]);

  if (!files.length) return <div className={s.empty}>No encodes yet. Encode a track — FLAC, AC-3, AAC, MP3 and Opus are measured on the same audio right after the DTS encode (Settings → Benchmark other formats).</div>;

  // totals over the files that have every column (so each column sums the same audio)
  const complete = files.filter(r => columns.every(c => { const x = cells.get(r.trackId)?.get(c.id); return x && !x.error; }));
  const total = new Map<string, Cell>(columns.map(c => {
    const xs = complete.map(r => cells.get(r.trackId)!.get(c.id)!);
    const sum = (k: 'encode' | 'decode') => (xs.some(x => x[k] == null) ? null : xs.reduce((a, x) => a + (x[k] ?? 0), 0));
    return [c.id, { bytes: xs.reduce((a, x) => a + x.bytes, 0), encode: sum('encode'), decode: sum('decode') }];
  }));
  const running = files.filter(r => r.benchmarkStatus === 'running').length;

  const renderRow = (key: string, name: ReactNode, row: Map<string, Cell> | undefined, measuring: boolean, isTotal = false) => {
    const wav = row?.get('wav')?.bytes ?? 0;
    const best = Math.min(...columns.filter(c => !c.baseline).map(c => { const x = row?.get(c.id); return x && !x.error && x.bytes ? x.bytes : Infinity; }));
    return (
      <tr key={key} className={isTotal ? s.total : undefined}>
        <th scope="row" className={s.file}>{name}</th>
        {columns.map(c => {
          const x = row?.get(c.id);
          if (!x) return <td key={c.id} className={s.missing}>{measuring ? 'measuring…' : '—'}</td>;
          if (x.error) return <td key={c.id} className={s.missing} title={x.error}>failed</td>;
          const saved = wav ? (1 - x.bytes / wav) * 100 : 0;
          return (
            <td key={c.id} className={[c.id === 'dts' && s.dtsCol, !c.baseline && x.bytes === best && s.best].filter(Boolean).join(' ')} title={x.note ?? undefined}>
              <div className={s.size}>{mb(x.bytes)}</div>
              {c.baseline
                ? <div className={s.dim}>{isTotal ? `${complete.length} file${complete.length === 1 ? '' : 's'}` : 'original'}</div>
                : <div className={s.saved} style={{ color: saved >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>{saved >= 0 ? '−' : '+'}{Math.abs(saved).toFixed(1)}%</div>}
              {!c.baseline && <div className={s.times}><span title="Encode (compress)">⇣ {x.encode != null ? fmtDuration(x.encode) : '—'}</span><span title="Decode (decompress)">⇡ {x.decode != null ? fmtDuration(x.decode) : '—'}</span></div>}
              {x.note && <div className={s.note}>{x.note.includes('downmixed') ? 'downmixed' : x.note.includes('resampled') ? 'resampled' : ''}</div>}
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div className={s.wrap}>
      <div className={s.legend}>
        <span>Size · reduction vs WAV · <b>⇣</b> encode · <b>⇡</b> decode time</span>
        <span className={s.bestKey}>smallest in row</span>
        {running > 0 && <span>measuring {running} file{running === 1 ? '' : 's'}…</span>}
      </div>
      <div className={s.scroll}>
        <table className={s.table} style={{ '--cols': columns.length } as CSSProperties}>
          <thead>
            <tr>
              <th scope="col" className={s.file}>File</th>
              {columns.map(c => (
                <th key={c.id} scope="col" className={c.id === 'dts' ? s.dtsCol : undefined} style={{ '--c': c.color } as CSSProperties}>
                  <div className={s.colHead}>
                    <span className={s.dot} />
                    <span className={s.colName}>{c.label}</span>
                    <InfoTip title={c.label}><span>{c.description}</span></InfoTip>
                  </div>
                  <div className={s.colSub}>{c.lossless && !c.baseline ? <Tag tone="success">Lossless</Tag> : c.sub}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {files.map(r => renderRow(r.trackId,
              onOpen ? <button type="button" className={s.fileBtn} onClick={() => onOpen(r.trackId)} title="Open track">{r.file}</button> : r.file,
              cells.get(r.trackId), r.benchmarkStatus === 'running'))}
            {files.length > 1 && complete.length > 0 && renderRow('total', <>Total{complete.length < files.length && <span className={s.dim}> · {complete.length} of {files.length}</span>}</>, total, false, true)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
