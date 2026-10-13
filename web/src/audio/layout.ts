/**
 * Output channel layout of a DTS encode — mirrors the server (api/dts_api/media.py, plan_encode) so the preview
 * before encoding shows the same channels the encode will produce.
 *
 *   1.0  → mono                       2.0 → stereo (Lo/Ro, Lt/Rt or front-only downmix from surround)
 *   5.1 / 7.1 → 5.1 (7.1 is downmixed; mono / stereo sources are upmixed: stereo on L/R, mono on C,
 *               LFE = 80 Hz low-pass of the input, surrounds silent)
 *   auto → keep the source layout (3–4 ch → quad, 5 → 5.0, 6+ → 5.1)
 */
import type { EncodeSettings, Track } from '@/api/types';

type Role = 'L' | 'R' | 'C' | 'LFE' | 'Ls' | 'Rs' | 'Lb' | 'Rb';

/** Channel roles of a WAV with `n` channels (WAVE_FORMAT_EXTENSIBLE default order). */
export function rolesFor(n: number): Role[] {
  return ({ 1: ['C'], 2: ['L', 'R'], 3: ['L', 'R', 'C'], 4: ['L', 'R', 'Ls', 'Rs'], 5: ['L', 'R', 'C', 'Ls', 'Rs'], 6: ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'], 7: ['L', 'R', 'C', 'LFE', 'Lb', 'Ls', 'Rs'], 8: ['L', 'R', 'C', 'LFE', 'Lb', 'Rb', 'Ls', 'Rs'] } as Record<number, Role[]>)[n] ?? ['L', 'R'];
}

/** Output channel roles for a source with `srcCh` channels and these settings. */
export function outputRoles(srcCh: number, s: Pick<EncodeSettings, 'layout'>): Role[] {
  if (s.layout === '1.0') return ['C'];
  if (s.layout === '2.0') return ['L', 'R'];
  if (s.layout === '5.1' || s.layout === '7.1') return rolesFor(6);
  return srcCh <= 2 ? rolesFor(srcCh) : srcCh <= 4 ? rolesFor(4) : srcCh === 5 ? rolesFor(5) : rolesFor(6);
}

export const outputChannelCount = (t: Track) => outputRoles(t.channels, t.settings).length;

const H = Math.SQRT1_2; // −3 dB

/**
 * Mix matrix out × in, plus which output (if any) gets a generated LFE (low-passed sum of the given input weights).
 * Rows are normalised so a channel can't sum above full scale.
 */
export function mixMatrix(srcCh: number, s: Pick<EncodeSettings, 'layout' | 'downmix'>) {
  const inR = rolesFor(srcCh), outR = outputRoles(srcCh, s);
  const idx = (r: Role) => inR.indexOf(r);
  const rows = outR.map(() => new Array<number>(srcCh).fill(0));
  const add = (o: Role, i: Role, w: number) => { const oi = outR.indexOf(o), ii = idx(i); if (oi >= 0 && ii >= 0) rows[oi][ii] += w; };
  let lfe: { out: number; weights: number[] } | null = null;

  if (outR.length === 1) {
    inR.forEach((r, i) => { if (r !== 'LFE') rows[0][i] = 1; });                       // mono: average of everything but LFE
  } else {
    outR.forEach(o => add(o, o, 1));                                                     // same role → straight through
    const has = (r: Role) => outR.includes(r);
    if (srcCh === 1 && outR.length === 2) { add('L', 'C', 1); add('R', 'C', 1); }        // mono → stereo: both sides
    if (!has('C') && srcCh > 1) { add('L', 'C', H); add('R', 'C', H); }                  // fold centre into L/R
    if (!has('Ls')) {                                                                    // fold surrounds into L/R
      if (s.downmix === 'ltrt') { for (const sr of ['Ls', 'Rs', 'Lb', 'Rb'] as Role[]) { add('L', sr, -0.5); add('R', sr, 0.5); } }
      else if (s.downmix !== 'none') { add('L', 'Ls', H); add('R', 'Rs', H); add('L', 'Lb', H); add('R', 'Rb', H); }
    } else { add('Ls', 'Lb', H); add('Rs', 'Rb', H); }                                   // 7.1 → 5.1: rear into side
    if (has('LFE') && srcCh <= 2) {                                                      // upmix: LFE from the input's bass
      lfe = { out: outR.indexOf('LFE'), weights: new Array<number>(srcCh).fill(1 / srcCh) };
    }
  }
  rows.forEach(r => { const sum = r.reduce((a, w) => a + Math.abs(w), 0); if (sum > 1) r.forEach((_, i) => (r[i] /= sum)); });
  return { rows, lfe, roles: outR };
}
