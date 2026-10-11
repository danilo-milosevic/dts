/// <reference lib="webworker" />
/**
 * Mock-only audio synthesizer (runs in a worker). Renders believable music / ambience / dialog / FX
 * with wavetables and one-pole filters so seeded tracks have real audio to play, meter and analyze.
 */
export interface SynthRequest { id: number; seed: number; style: 'music' | 'ambience' | 'dialog' | 'fx' | 'score'; duration: number; sampleRate: number; channels: 1 | 2; peakDb: number; }
export interface SynthResponse { id: number; channels: Float32Array[]; }

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const TBL = 2048;
function table(harm: (h: number) => number, maxH: number) {
  const t = new Float32Array(TBL + 1);
  for (let h = 1; h <= maxH; h++) { const a = harm(h); if (!a) continue; for (let i = 0; i < TBL; i++) t[i] += a * Math.sin((2 * Math.PI * h * i) / TBL); }
  let m = 0; for (let i = 0; i < TBL; i++) m = Math.max(m, Math.abs(t[i])); for (let i = 0; i < TBL; i++) t[i] /= m || 1; t[TBL] = t[0]; return t;
}
const SINE = table(h => (h === 1 ? 1 : 0), 1);
const SAW = table(h => 1 / h, 48);
const SOFT = table(h => 1 / (h * h), 24);
const VOCAL = table(h => { const f = 440 * h; return (Math.exp(-(((f - 800) / 500) ** 2)) + 0.6 * Math.exp(-(((f - 2600) / 900) ** 2)) + 0.08) / Math.sqrt(h); }, 32);

self.onmessage = (e: MessageEvent<SynthRequest>) => {
  const q = e.data; const sr = q.sampleRate; const N = Math.ceil(q.duration * sr);
  const L = new Float32Array(N), R = q.channels === 2 ? new Float32Array(N) : L;
  const rnd = mulberry32(q.seed); const RR = (a: number, b: number) => a + (b - a) * rnd();
  const dur = q.duration; const sec = (x: number) => x * dur;

  const tone = (t0: number, f: number, len: number, amp: number, o: { tbl?: Float32Array; att?: number; pan?: number; lp?: number; glide?: number; vib?: number; decay?: number } = {}) => {
    const tbl = o.tbl ?? SAW, att = o.att ?? 0.01, pan = o.pan ?? 0, decay = o.decay ?? len * 0.6;
    const s0 = Math.max(0, Math.floor(t0 * sr)), s1 = Math.min(N, Math.floor((t0 + len) * sr));
    const gl = 1 - pan, gr = 1 + pan; const a = o.lp ? 1 - Math.exp((-2 * Math.PI * o.lp) / sr) : 1;
    let ph = rnd() * TBL, y = 0;
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / sr; let fr = f;
      if (o.glide) fr = o.glide + (f - o.glide) * Math.exp(-t / 0.03);
      if (o.vib) fr *= 1 + o.vib * Math.sin(2 * Math.PI * 5.5 * t);
      ph += (fr * TBL) / sr; if (ph >= TBL) ph -= TBL * Math.floor(ph / TBL);
      const k = ph | 0; const v = tbl[k] + (tbl[k + 1] - tbl[k]) * (ph - k);
      const env = (t < att ? t / att : Math.exp(-(t - att) / decay)) * Math.min(1, (s1 - i) / (sr * 0.02));
      y += a * (v - y); const out = y * env * amp;
      L[i] += out * gl; if (R !== L) R[i] += out * gr;
    }
  };
  const noise = (t0: number, len: number, amp: number, o: { lp?: number; hp?: number; att?: number; decay?: number; pan?: number; sweepTo?: number } = {}) => {
    const s0 = Math.max(0, Math.floor(t0 * sr)), s1 = Math.min(N, Math.floor((t0 + len) * sr));
    const att = o.att ?? 0.001, decay = o.decay ?? len * 0.4, pan = o.pan ?? 0, gl = 1 - pan, gr = 1 + pan;
    let lp = 0, hpState = 0, prev = 0;
    const lpA = o.lp ? 1 - Math.exp((-2 * Math.PI * o.lp) / sr) : 0, hpA = o.hp ? Math.exp((-2 * Math.PI * o.hp) / sr) : 0;
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / sr; let x = rnd() * 2 - 1;
      if (o.lp) { const a = o.sweepTo ? 1 - Math.exp((-2 * Math.PI * o.lp * Math.pow(o.sweepTo / o.lp, t / len)) / sr) : lpA; lp += a * (x - lp); x = lp; }
      if (o.hp) { hpState = hpA * (hpState + x - prev); prev = x; x = hpState; }
      const env = t < att ? t / att : Math.exp(-(t - att) / decay);
      const out = x * env * amp; L[i] += out * gl; if (R !== L) R[i] += out * gr;
    }
  };

  const bpm = 110 + Math.round(RR(0, 18)), beat = 60 / bpm, bar = beat * 4;
  const roots = [55, 43.65, 65.41, 49], chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]], mel = [440, 523.3, 587.3, 659.3, 587.3, 523.3, 493.9, 440];

  if (q.style === 'music' || q.style === 'score') {
    const drums = q.style === 'music';
    for (let b = 0; b * bar < dur; b++) {
      const tb = b * bar, i = b % 4; const fade = tb < sec(0.12) ? 0.5 : tb > sec(0.88) ? Math.max(0.05, 1 - (tb - sec(0.88)) / (dur * 0.12)) : 1;
      for (const f of chords[i]) for (const det of [-0.003, 0.003]) tone(tb, f * (1 + det), bar * 1.05, 0.05 * fade, { att: q.style === 'score' ? 1 : 0.3, decay: bar * 2, pan: det * 100, lp: 2600 });
      if (tb >= sec(0.12)) tone(tb, roots[i], bar * 0.95, 0.3 * fade, { lp: 700, decay: bar * 0.8 });
      if (q.style === 'score' && b % 4 === 0) { tone(tb, 65, 1.4, 0.5, { tbl: SINE, glide: 90, decay: 0.5 }); noise(tb, 0.8, 0.25, { lp: 300, decay: 0.3 }); }
    }
    for (let k = 0; k * beat < dur; k++) {
      const tb = k * beat, inChorus = tb >= sec(0.53) && tb < sec(0.88), inVerse = tb >= sec(0.2) && tb < sec(0.45) && Math.floor(k / 8) % 2 === 0;
      if (drums && tb >= sec(0.12) && tb < sec(0.94)) {
        tone(tb, 45, 0.35, 0.9, { tbl: SINE, glide: 120, att: 0.002, decay: 0.12 }); noise(tb, 0.01, 0.4, { decay: 0.003 });
        if (k % 2 === 1) { noise(tb, 0.22, 0.45, { lp: 6000, hp: 300, decay: 0.07 }); tone(tb, 185, 0.12, 0.2, { tbl: SOFT, decay: 0.04 }); }
        noise(tb, 0.06, 0.2, { hp: 8000, decay: 0.015, pan: k % 2 ? 0.4 : -0.4 });
        if (tb >= sec(0.47)) noise(tb + beat / 2, 0.05, 0.14, { hp: 9000, decay: 0.012, pan: -0.3 });
      }
      if (inChorus || inVerse) tone(tb, mel[k % 8] * (inChorus ? 1 : 0.5), beat * 0.95, inChorus ? 0.14 : 0.09, { tbl: VOCAL, att: 0.02, decay: 0.6, vib: 0.006, pan: 0.1 });
    }
    if (drums) noise(sec(0.47), sec(0.06), 0.18, { lp: 400, sweepTo: 14000, att: sec(0.06), decay: 10 });
  } else if (q.style === 'ambience') {
    noise(0, dur, 0.35, { lp: 600, att: 2, decay: 1e9 });
    noise(0, dur, 0.06, { hp: 3500, lp: 9000, att: 2, decay: 1e9, pan: 0.3 });
    for (let tb = 0; tb < dur; tb += RR(1.5, 5)) { const f = RR(2500, 6000); tone(tb, f * 1.4, 0.14, 0.05, { tbl: SINE, glide: f, decay: 0.05, pan: RR(-1, 1) }); }
    for (let b = 0; b * 8 < dur; b++) for (const f of chords[b % 4]) tone(b * 8, f / 2, 9, 0.035, { tbl: SOFT, att: 3, decay: 6, lp: 1200 });
  } else if (q.style === 'dialog') {
    let tb = 0.4;
    while (tb < dur - 0.5) {
      const words = 3 + Math.floor(RR(0, 8));
      for (let w = 0; w < words && tb < dur - 0.3; w++) {
        const syl = 1 + Math.floor(RR(0, 3));
        for (let s = 0; s < syl; s++) {
          const d = RR(0.09, 0.22); const f0 = RR(105, 140);
          tone(tb, f0, d + 0.05, 0.6, { tbl: VOCAL, att: 0.02, decay: d, lp: RR(1800, 3200), vib: 0.01 });
          if (rnd() < 0.3) noise(tb + d, 0.07, 0.12, { hp: 4500, decay: 0.03 });
          tb += d + 0.03;
        }
        tb += RR(0.05, 0.18);
      }
      tb += RR(0.4, 1.2);
    }
  } else {
    for (let tb = 0.2; tb < dur - 0.5; tb += RR(1.6, 3.2)) {
      tone(tb, 32, 1.2, 0.9, { tbl: SINE, glide: 90, att: 0.003, decay: 0.4 }); noise(tb, 0.6, 0.7, { lp: 2500, decay: 0.15, pan: RR(-0.5, 0.5) });
      noise(tb - 0.6, 0.6, 0.15, { lp: 300, sweepTo: 4000, att: 0.55, decay: 0.05, pan: RR(-1, 1) });
      if (rnd() < 0.5) noise(tb + 0.05, 0.3, 0.3, { hp: 6000, decay: 0.08, pan: RR(-1, 1) });
    }
  }

  // soft-clip + normalise to the reported peak
  let peak = 0; for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i]); if (R !== L) R[i] = Math.tanh(R[i]); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const k = Math.pow(10, Math.min(q.peakDb, 1) / 20) / (peak || 1);
  for (let i = 0; i < N; i++) { L[i] *= k; if (R !== L) R[i] *= k; }
  const chans = R === L ? [L] : [L, R];
  (self as unknown as Worker).postMessage({ id: q.id, channels: chans } satisfies SynthResponse, chans.map(c => c.buffer));
};
