import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import type { CompareStats } from '@/api/types';
import { useData, selectedTrack } from '@/store/data';
import { useUi } from '@/store/ui';
import { Workspace, PageHeader } from '@/components/layout/Page';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { CardHeader } from '@/components/ui/Card';
import { Legend } from '@/components/ui/Legend';
import { ScatterChart } from '@/components/charts/ScatterChart';
import { SavingsCurve } from '@/components/charts/SavingsCurve';
import { SavingsBars } from '@/components/charts/SavingsBars';
import { Sparkline } from '@/components/charts/Sparkline';
import { LAYOUT_GROUPS, layoutLegend, layoutToneVar } from '@/components/charts/useChartScales';
import { fmtDuration, layoutGroupLabel } from '@/lib/format';
import type { Tone } from '@/components/ui/tone';
import s from './Compare.module.css';

function Kpi({ label, value, valueColor, tag, tagTone, spark, sparkColor }: { label: string; value: string; valueColor?: string; tag: string; tagTone: Tone; spark?: number[]; sparkColor?: string }) {
  return (
    <div className={s.kpi}>
      <div className={s.kpiText}>
        <span className="t-caption t-upper c-muted">{label}</span>
        <span className={s.kpiValue} style={{ color: valueColor }}>{value}<Tag tone={tagTone}>{tag}</Tag></span>
      </div>
      {spark && spark.length > 1 && <Sparkline values={spark} color={sparkColor ?? 'var(--accent-primary)'} />}
    </div>
  );
}

export function CompareView() {
  const [stats, setStats] = useState<CompareStats | null>(null);
  const doneCount = useData(d => d.jobs.filter(j => j.status === 'done' || j.status === 'failed').length);
  const track = useData(selectedTrack); const updateSettings = useData(d => d.updateSettings); const select = useData(d => d.select);
  const group = useUi(u => u.compareLayout); const setUi = useUi(u => u.set); const toast = useUi(u => u.toast);
  const [hiddenScatter, setHiddenScatter] = useState<string[]>([]);
  const [hiddenCurve, setHiddenCurve] = useState<string[]>([]);
  const [scale, setScale] = useState<'linear' | 'log'>('linear');
  const [mode, setMode] = useState<'percent' | 'mb'>('percent');
  const [sort, setSort] = useState<'savings' | 'size' | 'name'>('savings');
  const nav = useNavigate();

  useEffect(() => { api.stats.compare().then(setStats).catch(e => toast({ tone: 'error', title: 'Could not load statistics', message: String(e) })); }, [doneCount, toast]);

  const files = useMemo(() => {
    const f = (stats?.sessionFiles ?? []).filter(r => group === 'all' || r.layout === group);
    const pct = (r: (typeof f)[number]) => (r.outputMB == null ? -1 : 1 - r.outputMB / r.inputMB);
    return [...f].sort((a, b) => (sort === 'name' ? a.file.localeCompare(b.file) : sort === 'size' ? b.inputMB - a.inputMB : pct(b) - pct(a)));
  }, [stats, group, sort]);
  const ok = files.filter(f => f.status === 'done' && f.outputMB != null);
  const inMB = ok.reduce((a, f) => a + f.inputMB, 0), outMB = ok.reduce((a, f) => a + (f.outputMB ?? 0), 0);
  const encTime = ok.reduce((a, f) => a + (f.encodeSeconds ?? 0), 0);
  const encodes = useMemo(() => (stats?.encodes ?? []).filter(e => group === 'all' || e.layout === group), [stats, group]);
  const cumulative = ok.reduce<number[]>((acc, f) => [...acc, (acc[acc.length - 1] ?? 0) + f.inputMB - (f.outputMB ?? 0)], [0]);
  const preset = track ? track.settings.bitrateKbps : null;

  return (
    <Workspace actions={<>
      <Button icon="download" disabled={!files.length} onClick={() => {
        const csv = ['file,layout,input_mb,output_mb,status,encode_seconds', ...files.map(f => [f.file, f.layout, f.inputMB, f.outputMB ?? '', f.status, f.encodeSeconds ?? ''].join(','))].join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'dts-compare.csv'; a.click(); URL.revokeObjectURL(a.href);
      }}>Export CSV</Button>
      <Button variant="dts" icon="bolt" onClick={() => nav('/queue')}>Open queue</Button>
    </>}>
      <PageHeader title="Compare" sub="Source WAV vs DTS output · this session">
        <Segmented label="Layout filter" value={group} onChange={v => setUi({ compareLayout: v })} options={[{ value: 'all', label: 'All' }, { value: 'mono', label: 'Mono' }, { value: 'stereo', label: 'Stereo' }, { value: 'surround', label: 'Surround' }]} />
      </PageHeader>

      <div className={s.kpis}>
        <Kpi label="Space saved" value={`${(inMB - outMB).toFixed(1)} MB`} valueColor="var(--accent-dts)" tag={(() => { const pct = inMB ? (1 - outMB / inMB) * 100 : 0; return `${pct >= 0 ? '−' : '+'}${Math.abs(pct).toFixed(1)}%`; })()} tagTone="dts" spark={cumulative} sparkColor="var(--accent-dts)" />
        <Kpi label="Average ratio" value={`×${outMB ? (inMB / outMB).toFixed(2) : '—'}`} tag={`Best ×${Math.max(0, ...ok.map(f => f.inputMB / (f.outputMB || 1))).toFixed(2)}`} tagTone="success" spark={ok.map(f => f.inputMB / (f.outputMB || 1))} />
        <Kpi label="Total encode time" value={fmtDuration(encTime)} tag={`${ok.length} files`} tagTone="neutral" />
      </div>

      <div className={s.row}>
        <section className={s.card}>
          <CardHeader title="Encode time vs file size" sub="Each dot is one encode · dashed lines are linear fits · hover a dot for details"
            right={<><Legend items={layoutLegend} hidden={hiddenScatter} onToggle={k => setHiddenScatter(h => (h.includes(k) ? h.filter(x => x !== k) : [...h, k]))} /><Segmented value={scale} onChange={setScale} options={[{ value: 'linear', label: 'Linear' }, { value: 'log', label: 'Log' }]} /></>} />
          {stats ? <ScatterChart data={encodes} hidden={hiddenScatter} scale={scale} height={300} highlight={track?.name} /> : <div className="skeleton" style={{ height: 356 }} />}
        </section>
        <section className={s.card}>
          <CardHeader title="Savings vs bitrate" sub="DTS Core at 48 kHz · drag the preset to change the selected track"
            right={<Legend items={[{ key: 'stereo', label: 'Stereo', tone: 'accent' }, { key: 'surround', label: '5.1', tone: 'dts' }]} hidden={hiddenCurve} onToggle={k => setHiddenCurve(h => (h.includes(k) ? h.filter(x => x !== k) : [...h, k]))} />} />
          {stats ? <SavingsCurve data={stats.savingsVsBitrate} hidden={hiddenCurve} height={356} preset={preset} onPreset={kbps => { if (track) { updateSettings(track.id, { bitrateKbps: kbps }); toast({ tone: 'info', title: `${track.name}: bitrate set to ${kbps} kbps` }); } }} /> : <div className="skeleton" style={{ height: 356 }} />}
        </section>
      </div>

      <div className={s.row}>
        <section className={s.card}>
          <CardHeader title="Savings by file" sub="Bar = % smaller than the source WAV · click a row to open the track"
            right={<><Segmented value={mode} onChange={setMode} options={[{ value: 'percent', label: 'Percent' }, { value: 'mb', label: 'Megabytes' }]} /><Select width={170} value={sort} onChange={setSort} options={[{ value: 'savings', label: 'Sort: savings ↓' }, { value: 'size', label: 'Sort: size ↓' }, { value: 'name', label: 'Sort: name' }]} aria-label="Sort" /></>} />
          {stats ? (files.length ? <SavingsBars rows={files} mode={mode} onOpen={id => { select(id); nav('/'); }} /> : <span className="t-body c-muted">No encodes for this layout yet.</span>) : <div className="skeleton" style={{ height: 240 }} />}
        </section>
        <section className={s.card}>
          <CardHeader title="Library total" sub={`${ok.length} encoded file${ok.length === 1 ? '' : 's'}${files.length > ok.length ? ` · ${files.length - ok.length} failed excluded` : ''}`} />
          <div className={s.headline}><span className={s.big}>{(inMB - outMB).toFixed(1)} MB</span><span className="t-body c-secondary">saved · {inMB ? ((1 - outMB / inMB) * 100).toFixed(1) : 0}% smaller</span></div>
          {[['Before · WAV', inMB, 'var(--accent-primary)'], ['After · DTS', outMB, 'var(--accent-dts)']].map(([l, v, c]) => (
            <div key={l as string} className={s.barBlock}>
              <div className={s.barTop}><span className="t-label">{l}</span><span className="t-caption c-secondary">{(v as number).toFixed(1)} MB</span></div>
              <div className={s.track}><div className={s.fill} style={{ width: `${inMB ? ((v as number) / inMB) * 100 : 0}%`, background: c as string }} /></div>
            </div>
          ))}
          <div className={s.divider} />
          <div className={s.groups}>
            {LAYOUT_GROUPS.map(c => {
              const g = ok.filter(f => f.layout === c); const i = g.reduce((a, f) => a + f.inputMB, 0), o = g.reduce((a, f) => a + (f.outputMB ?? 0), 0);
              return (
                <div key={c} className={s.group} style={{ opacity: group === 'all' || group === c ? 1 : 0.35, transition: 'opacity var(--dur-base)' }}>
                  <span className={s.groupName}><span className={s.dot} style={{ background: layoutToneVar[c] }} />{layoutGroupLabel[c]}</span>
                  <span className="t-numeric" style={{ color: layoutToneVar[c] }}>{i ? `${((1 - o / i) * 100).toFixed(1)}%` : '—'}</span>
                  <span className="t-small c-muted">{g.length} file{g.length === 1 ? '' : 's'} · {i.toFixed(1)} → {o.toFixed(1)} MB</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Workspace>
  );
}
