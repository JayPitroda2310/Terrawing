/**
 * Procedural placeholder audio. Each generator renders mono samples which are encoded to WAV and
 * handed to Howler like a normal file. Real recordings replace these via the sound manifest.
 */
import { createRandom } from '@/utils/math/random';

export const SAMPLE_RATE = 22050;
const TAU = Math.PI * 2;

type Generator = () => Float32Array;

function buffer(seconds: number): Float32Array {
  return new Float32Array(Math.floor(seconds * SAMPLE_RATE));
}

function noiseSource(seed: number): () => number {
  const random = createRandom(seed);
  return () => random() * 2 - 1;
}

/** One-pole low-pass filter state machine. */
function lowpass(cutoffHz: number): (x: number) => number {
  const a = 1 - Math.exp((-TAU * cutoffHz) / SAMPLE_RATE);
  let y = 0;
  return (x) => (y += a * (x - y));
}

function highpass(cutoffHz: number): (x: number) => number {
  const lp = lowpass(cutoffHz);
  return (x) => x - lp(x);
}

/** Crossfades the tail into the head so the buffer loops without a click. */
function makeSeamless(samples: Float32Array, fadeSeconds: number): Float32Array {
  const fade = Math.floor(fadeSeconds * SAMPLE_RATE);
  const length = samples.length - fade;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = samples[i]!;
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = samples[length + i]! * (1 - t) + samples[i]! * t;
  }
  return out;
}

function normalize(samples: Float32Array, peak = 0.9): Float32Array {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  if (max === 0) return samples;
  const gain = peak / max;
  for (let i = 0; i < samples.length; i++) samples[i]! *= gain;
  return samples;
}

function envelope(t: number, attack: number, decay: number): number {
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) / decay);
}

const generators = {
  rotorLoop(): Float32Array {
    const out = buffer(1.1);
    const noise = noiseSource(1);
    const lp = lowpass(900);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const blade = 0.5 + 0.5 * Math.sin(TAU * 36 * t);
      const hum = Math.sin(TAU * 118 * t) * 0.35 + Math.sin(TAU * 236 * t) * 0.15;
      out[i] = lp(noise()) * (0.5 + 0.9 * blade) + hum * 0.4;
    }
    return normalize(makeSeamless(out, 0.1), 0.7);
  },
  engineLoop(): Float32Array {
    const out = buffer(1.1);
    const noise = noiseSource(2);
    const lp = lowpass(400);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      out[i] =
        Math.sin(TAU * 160 * t) * 0.3 +
        Math.sin(TAU * 320 * t) * 0.12 +
        Math.sin(TAU * 480 * t) * 0.05 +
        lp(noise()) * 0.6;
    }
    return normalize(makeSeamless(out, 0.1), 0.6);
  },
  windLoop(): Float32Array {
    const out = buffer(6.5);
    const noise = noiseSource(3);
    const lp = lowpass(260);
    const lp2 = lowpass(700);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const gust = 0.55 + 0.45 * Math.sin((TAU * t) / 6) * Math.sin((TAU * t) / 2.3 + 1);
      out[i] = (lp(noise()) * 0.8 + lp2(noise()) * 0.2 * gust) * gust;
    }
    return normalize(makeSeamless(out, 0.5), 0.8);
  },
  rainLoop(): Float32Array {
    const out = buffer(4.3);
    const noise = noiseSource(4);
    const random = createRandom(44);
    const hp = highpass(1800);
    const lp = lowpass(6000);
    for (let i = 0; i < out.length; i++) out[i] = lp(hp(noise())) * 0.35;
    // Individual drops.
    for (let d = 0; d < 900; d++) {
      const start = Math.floor(random() * (out.length - 400));
      const amp = 0.2 + random() * 0.6;
      const freq = 2500 + random() * 3500;
      for (let k = 0; k < 300; k++)
        out[start + k]! += Math.sin((TAU * freq * k) / SAMPLE_RATE) * amp * Math.exp(-k / 40);
    }
    return normalize(makeSeamless(out, 0.3), 0.7);
  },
  waterLoop(): Float32Array {
    const out = buffer(5.3);
    const noise = noiseSource(5);
    const lp = lowpass(1200);
    const hp = highpass(200);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const burble = 0.6 + 0.4 * Math.sin(TAU * 1.3 * t + Math.sin(TAU * 0.4 * t) * 3);
      out[i] = hp(lp(noise())) * burble;
    }
    return normalize(makeSeamless(out, 0.3), 0.7);
  },
  forestLoop(): Float32Array {
    const out = buffer(8.3);
    const noise = noiseSource(6);
    const random = createRandom(66);
    const lp = lowpass(3000);
    const hp = highpass(900);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const rustle = Math.max(0, Math.sin((TAU * t) / 4.1)) ** 3;
      out[i] = hp(lp(noise())) * (0.1 + 0.4 * rustle);
    }
    for (let d = 0; d < 40; d++) {
      const start = Math.floor(random() * (out.length - 3000));
      const freq = 600 + random() * 500;
      for (let k = 0; k < 2500; k++) {
        out[start + k]! +=
          Math.sin(((TAU * freq * k) / SAMPLE_RATE) * (1 - k / 5000)) * 0.35 * Math.exp(-k / 300);
      }
    }
    return normalize(makeSeamless(out, 0.4), 0.6);
  },
  machineryLoop(): Float32Array {
    const out = buffer(2.1);
    const noise = noiseSource(7);
    const lp = lowpass(300);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      out[i] =
        Math.sin(TAU * 50 * t) * 0.4 +
        Math.sin(TAU * 100 * t) * 0.25 +
        Math.sin(TAU * 150 * t) * 0.1 +
        lp(noise()) * 0.3;
    }
    return normalize(makeSeamless(out, 0.1), 0.6);
  },
  radioStaticLoop(): Float32Array {
    const out = buffer(1.6);
    const noise = noiseSource(8);
    const hp = highpass(700);
    const lp = lowpass(3500);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const crackle = Math.sin(TAU * 7 * t) > 0.6 ? 1.6 : 1;
      out[i] = lp(hp(noise())) * crackle;
    }
    return normalize(makeSeamless(out, 0.1), 0.6);
  },
  thunder(): Float32Array {
    const out = buffer(6);
    const noise = noiseSource(9);
    const lp = lowpass(140);
    const crackLp = lowpass(1800);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const rumble = lp(noise()) * envelope(t, 0.25, 1.8) * (0.7 + 0.3 * Math.sin(TAU * 1.7 * t));
      const crack = crackLp(noise()) * envelope(t, 0.01, 0.25) * 0.5;
      out[i] = rumble * 2.5 + crack;
    }
    return normalize(out, 0.95);
  },
  transform(): Float32Array {
    const out = buffer(1.3);
    const noise = noiseSource(10);
    const lp = lowpass(2000);
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const freq = 300 + 500 * Math.sin(Math.min(1, t / 1.1) * Math.PI * 0.5);
      phase += (TAU * freq) / SAMPLE_RATE;
      const whine = (Math.sin(phase) + 0.3 * Math.sin(phase * 2)) * 0.3 * envelope(t, 0.05, 0.9);
      const clunkTimes = [0.05, 0.55, 1.05];
      let clunk = 0;
      for (const ct of clunkTimes)
        if (t >= ct) clunk += lp(noise()) * Math.exp(-(t - ct) / 0.04) * 0.9;
      out[i] = whine + clunk;
    }
    return normalize(out, 0.85);
  },
  rotorSpinUp(): Float32Array {
    const out = buffer(0.9);
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const k = t / 0.9;
      phase += (TAU * (40 + 90 * k)) / SAMPLE_RATE;
      out[i] = Math.sin(phase) * (0.5 + 0.5 * Math.sin(phase * 0.33)) * k;
    }
    return normalize(out, 0.7);
  },
  rotorSpinDown(): Float32Array {
    const out = buffer(0.9);
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const k = 1 - t / 0.9;
      phase += (TAU * (40 + 90 * k)) / SAMPLE_RATE;
      out[i] = Math.sin(phase) * (0.5 + 0.5 * Math.sin(phase * 0.33)) * k;
    }
    return normalize(out, 0.7);
  },
  scanPing(): Float32Array {
    const out = buffer(1.8);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const ping = Math.sin(TAU * 1250 * t) * envelope(t, 0.005, 0.35);
      const echo =
        t > 0.45 ? Math.sin(TAU * 1250 * (t - 0.45)) * envelope(t - 0.45, 0.005, 0.4) * 0.35 : 0;
      const sub = Math.sin(TAU * 180 * t) * envelope(t, 0.01, 0.2) * 0.4;
      out[i] = ping + echo + sub;
    }
    return normalize(out, 0.75);
  },
  scanDetect(): Float32Array {
    const out = buffer(0.25);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const freq = t < 0.1 ? 900 : 1350;
      out[i] = Math.sin(TAU * freq * t) * envelope(t % 0.1, 0.003, 0.05);
    }
    return normalize(out, 0.6);
  },
  warning(): Float32Array {
    const out = buffer(0.6);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const freq = t < 0.3 ? 880 : 660;
      const gate = t % 0.3 < 0.22 ? 1 : 0;
      out[i] =
        (Math.sin(TAU * freq * t) > 0 ? 0.6 : -0.6) * gate * 0.5 +
        Math.sin(TAU * freq * t) * gate * 0.4;
    }
    return normalize(out, 0.55);
  },
  impact(): Float32Array {
    const out = buffer(0.6);
    const noise = noiseSource(11);
    const lp = lowpass(500);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      out[i] =
        lp(noise()) * envelope(t, 0.002, 0.08) * 2 +
        Math.sin(TAU * 55 * t) * envelope(t, 0.002, 0.15);
    }
    return normalize(out, 0.9);
  },
  radio(): Float32Array {
    const out = buffer(0.4);
    const noise = noiseSource(12);
    const hp = highpass(900);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const chirp = t < 0.08 ? Math.sin(TAU * 1600 * t) * 0.5 : 0;
      out[i] = hp(noise()) * 0.5 * envelope(t, 0.01, 0.12) + chirp;
    }
    return normalize(out, 0.5);
  },
  uiClick(): Float32Array {
    const out = buffer(0.06);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      out[i] = Math.sin(TAU * 2200 * t) * envelope(t, 0.001, 0.012);
    }
    return normalize(out, 0.4);
  },
  uiConfirm(): Float32Array {
    const out = buffer(0.25);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const freq = t < 0.08 ? 1100 : 1650;
      out[i] = Math.sin(TAU * freq * t) * envelope(t % 0.08, 0.002, 0.05);
    }
    return normalize(out, 0.45);
  },
  objective(): Float32Array {
    const out = buffer(1.2);
    const notes = [659.25, 987.77];
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      let v = 0;
      notes.forEach((f, n) => {
        const start = n * 0.14;
        if (t >= start) v += Math.sin(TAU * f * (t - start)) * envelope(t - start, 0.01, 0.45);
      });
      out[i] = v;
    }
    return normalize(out, 0.5);
  },
  interact(): Float32Array {
    const out = buffer(0.5);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      out[i] = Math.sin(TAU * (500 + 700 * t) * t) * envelope(t, 0.02, 0.2);
    }
    return normalize(out, 0.45);
  },
  missionComplete(): Float32Array {
    const out = buffer(2.8);
    const notes = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      let v = 0;
      notes.forEach((f, n) => {
        const start = n * 0.18;
        if (t >= start)
          v +=
            (Math.sin(TAU * f * (t - start)) + 0.3 * Math.sin(TAU * f * 2 * (t - start))) *
            envelope(t - start, 0.02, 1.2);
      });
      out[i] = v;
    }
    return normalize(out, 0.55);
  },
  missionFail(): Float32Array {
    const out = buffer(2.2);
    const notes = [392, 349.23, 293.66];
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      let v = 0;
      notes.forEach((f, n) => {
        const start = n * 0.3;
        if (t >= start) v += Math.sin(TAU * f * (t - start)) * envelope(t - start, 0.02, 0.9);
      });
      out[i] = v;
    }
    return normalize(out, 0.5);
  },
  survivorCall(): Float32Array {
    const out = buffer(1.3);
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const blast = [0, 0.4, 0.8].some((s) => t >= s && t < s + 0.28) ? 1 : 0;
      const vibrato = Math.sin(TAU * 28 * t) * 60;
      out[i] = Math.sin(TAU * (2900 + vibrato) * t) * blast * 0.6;
    }
    return normalize(out, 0.5);
  },
  musicAmbient(): Float32Array {
    return pad(
      [
        [110, 130.81, 164.81],
        [98, 123.47, 146.83],
        [87.31, 110, 130.81],
        [98, 116.54, 146.83],
      ],
      16,
      13,
    );
  },
  musicMenu(): Float32Array {
    return pad(
      [
        [73.42, 110, 146.83, 174.61],
        [65.41, 98, 130.81, 164.81],
        [58.27, 87.31, 116.54, 146.83],
        [65.41, 98, 130.81, 155.56],
      ],
      20,
      14,
    );
  },
} satisfies Record<string, Generator>;

/** Slow evolving pad for placeholder music. */
function pad(chords: number[][], seconds: number, seed: number): Float32Array {
  const out = buffer(seconds + 1);
  const noise = noiseSource(seed);
  const air = lowpass(500);
  const chordLength = seconds / chords.length;
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const index = Math.floor(t / chordLength) % chords.length;
    const local = (t % chordLength) / chordLength;
    const fadeIn = Math.min(1, local * 4);
    const fadeOut = Math.min(1, (1 - local) * 4);
    const chord = chords[index]!;
    let v = 0;
    chord.forEach((f, n) => {
      const detune = 1 + 0.002 * Math.sin(TAU * 0.1 * t + n);
      v += Math.sin(TAU * f * detune * t) * (0.6 - n * 0.08);
      v += Math.sin(TAU * f * 2.001 * t) * 0.08;
    });
    out[i] = v * fadeIn * fadeOut * 0.3 + air(noise()) * 0.08;
  }
  return normalize(makeSeamless(out, 1), 0.5);
}

export type SynthSoundId = keyof typeof generators;

/** Encodes mono float samples as a 16-bit PCM WAV blob URL. */
export function encodeWavUrl(samples: Float32Array): string {
  const dataSize = samples.length * 2;
  const bytes = new ArrayBuffer(44 + dataSize);
  const view = new DataView(bytes);
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

export function synthesize(id: SynthSoundId): string {
  return encodeWavUrl(generators[id]());
}
