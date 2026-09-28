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

// ---------------------------------------------------------------------------------------------
// Mechanical building blocks for the transformation (physically modelled, not random noise).
// ---------------------------------------------------------------------------------------------

/**
 * End of travel: the actuator reaches its stop and the load settles. A soft, damped low thump
 * (the chassis taking the load) and a brief muffled knock — no ringing metal.
 */
function addClunk(out: Float32Array, at: number, weight: number, seed: number): void {
  const noise = noiseSource(seed);
  const knock = lowpass(450);
  const start = Math.floor(at * SAMPLE_RATE);
  for (let i = start; i < out.length; i++) {
    const t = (i - start) / SAMPLE_RATE;
    if (t > 0.3) break;
    const thump = Math.sin(TAU * (72 - 20 * t) * t) * Math.exp(-t / 0.05);
    const body = knock(noise()) * Math.exp(-t / 0.018) * 1.6;
    out[i]! += (thump + body) * weight;
  }
}

/** Two-pole resonant band-pass (state-variable filter): gives noise a "body" at a frequency. */
function bandpass(centerHz: number, q: number): (x: number) => number {
  const f = 2 * Math.sin((Math.PI * centerHz) / SAMPLE_RATE);
  const damp = 1 / q;
  let low = 0;
  let band = 0;
  return (x) => {
    low += f * band;
    const high = x - low - damp * band;
    band += f * high;
    return band;
  };
}

/**
 * Actuator run from `start` for `length` s — a brushless servo motor driving a gearbox:
 *  - motor whine: the electrical commutation tone (a few hundred Hz → ~1.5 kHz with speed), with
 *    its natural wobble (speed ripple under load) and rough harmonics, blended with noise so it is
 *    never a clean musical note;
 *  - gearbox: band-passed noise that rises with speed (meshing teeth heard as a gritty "zzz");
 *  - structure-borne hum through the chassis at the motor's rotation rate.
 * Speed ramps up, sags under load mid-travel and ramps down.
 */
function addServo(
  out: Float32Array,
  start: number,
  length: number,
  baseHz: number,
  seed: number,
  gain = 1,
): void {
  const noise = noiseSource(seed);
  const gear = bandpass(1900, 3);
  const gearHi = bandpass(3400, 4);
  const hum = bandpass(140, 2);
  const random = createRandom(seed + 9);
  let phase = 0;
  let wobble = 0;
  const a = Math.floor(start * SAMPLE_RATE);
  const n = Math.floor(length * SAMPLE_RATE);
  const ramp = Math.min(0.16, length * 0.3);
  for (let k = 0; k < n && a + k < out.length; k++) {
    const t = k / SAMPLE_RATE;
    const speed = Math.max(0, Math.min(1, t / ramp, (length - t) / ramp));
    const strain = 1 - 0.14 * Math.sin((Math.PI * t) / length);
    if (k % 180 === 0) wobble = wobble * 0.7 + (random() - 0.5) * 0.3;
    const f = (baseHz * 0.9 + 900 * speed) * strain * (1 + wobble * 0.04);
    phase += (TAU * f) / SAMPLE_RATE;
    const whine =
      (Math.sin(phase) * 0.55 + Math.sin(phase * 2.01) * 0.25 + Math.sin(phase * 3.03) * 0.1) *
      (0.75 + 0.25 * Math.sin(phase * 0.125));
    const n0 = noise();
    const grit = gear(n0) * 0.9 + gearHi(n0) * 0.5;
    const body = hum(n0) * 1.6;
    out[a + k]! += (whine * 0.16 + grit * 0.35 + body * 0.5) * speed * gain;
  }
}

/**
 * Hydraulics from `start` for `length` s: the gear pump's pressure whine (a slightly unstable
 * tone around 300–420 Hz with ripple at the pump's piston rate), fluid rushing through the lines
 * and valve (bright hiss), and a pressure-release "psst" when the stroke ends. Lowering vents
 * pressure (falling pitch), raising builds it (rising pitch).
 */
function addHydraulic(
  out: Float32Array,
  start: number,
  length: number,
  seed: number,
  lowering: boolean,
): void {
  const noise = noiseSource(seed);
  const hiss = bandpass(4200, 1.2);
  const flow = bandpass(900, 0.9);
  let phase = 0;
  const a = Math.floor(start * SAMPLE_RATE);
  const n = Math.floor(length * SAMPLE_RATE);
  for (let k = 0; k < n && a + k < out.length; k++) {
    const t = k / n;
    const env = Math.min(1, t * 10) * Math.min(1, (1 - t) * 5);
    const pressure = lowering ? 1 - t * 0.35 : 0.65 + t * 0.35;
    phase += (TAU * (300 + 120 * pressure)) / SAMPLE_RATE;
    const ripple = 0.7 + 0.3 * Math.sin(phase * 0.1);
    const pump = (Math.sin(phase) * 0.5 + Math.sin(phase * 2) * 0.2) * ripple;
    const n0 = noise();
    out[a + k]! += (pump * 0.1 + flow(n0) * 0.45 + hiss(n0) * 0.3 * pressure) * env;
  }
  // Pressure release at the end of the stroke.
  const vent = bandpass(5200, 1.5);
  const v0 = a + n;
  for (let k = 0; k < 0.22 * SAMPLE_RATE && v0 + k < out.length; k++) {
    const t = k / SAMPLE_RATE;
    out[v0 + k]! += vent(noise()) * Math.exp(-t / 0.06) * 0.5;
  }
}

/**
 * Places the dry mechanism in a space so it doesn't sound "boxed": early reflections off the
 * ground and hull plus a short diffuse tail, then a gentle high-shelf lift for presence.
 */
function addSpace(out: Float32Array): Float32Array {
  const taps = [
    [0.011, 0.32],
    [0.019, 0.24],
    [0.029, 0.18],
    [0.043, 0.13],
    [0.061, 0.09],
    [0.089, 0.06],
  ] as const;
  const dry = Float32Array.from(out);
  for (const [delay, gain] of taps) {
    const d = Math.floor(delay * SAMPLE_RATE);
    for (let i = d; i < out.length; i++) out[i]! += dry[i - d]! * gain;
  }
  const lp = lowpass(2500);
  for (let i = 0; i < out.length; i++) {
    const x = out[i]!;
    out[i] = x + (x - lp(x)) * 0.35;
  }
  return out;
}

/**
 * Rotor speed ramp: blade-pass tone (3-blade rotor) with harmonics, broadband blade noise chopped
 * by each passing blade and scaling with tip speed, and the motors' electrical whine.
 * `rpmAt(fraction)` gives rotor speed 0..1 over the buffer.
 */
function addRotorRamp(out: Float32Array, rpmAt: (t: number) => number, seed: number): void {
  const noise = noiseSource(seed);
  const air = lowpass(1400);
  const airHp = highpass(120);
  let blade = 0;
  let motor = 0;
  for (let i = 0; i < out.length; i++) {
    const rpm = rpmAt(i / out.length);
    blade += (TAU * 115 * rpm) / SAMPLE_RATE;
    motor += (TAU * (420 + 2600 * rpm)) / SAMPLE_RATE;
    const pass = Math.sin(blade) * 0.55 + Math.sin(blade * 2) * 0.25 + Math.sin(blade * 3) * 0.12;
    const chop = 0.6 + 0.4 * Math.max(0, Math.sin(blade));
    const wash = air(airHp(noise())) * chop * rpm * rpm * 0.9;
    const whine = Math.sin(motor) * 0.07 * rpm;
    out[i]! += (pass * rpm * 0.6 + wash + whine) * Math.min(1, rpm * 3);
  }
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
  sirenLoop(): Float32Array {
    // Two-tone emergency horn (hi-lo, 0.55 s per note): a driven horn — odd harmonics through a
    // throaty resonance — with a little road/engine rumble underneath.
    const note = 0.55;
    const out = buffer(note * 4);
    const noise = noiseSource(31);
    const rumble = lowpass(120);
    const horn = bandpass(1400, 1.2);
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const k = Math.floor(t / note) % 2;
      const local = (t % note) / note;
      // Notes glide into each other over a few ms, like a real compressor horn.
      const f = (k === 0 ? 925 : 740) * (1 + 0.004 * Math.sin(TAU * 5.5 * t));
      phase += (TAU * f) / SAMPLE_RATE;
      let v = 0;
      for (let h = 1; h <= 9; h += 2) v += Math.sin(phase * h) / h;
      const edge = Math.min(1, local * 40, (1 - local) * 40);
      const tone = Math.tanh(v * 1.8) * (0.85 + 0.15 * edge);
      out[i] = tone * 0.6 + horn(tone) * 0.35 + rumble(noise()) * 0.25;
    }
    return normalize(makeSeamless(out, 0.02), 0.8);
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
  /** Arms swing back and telescope in: two servo runs, then the arm locks hit home. */
  armFold(): Float32Array {
    const out = buffer(1.05);
    addServo(out, 0.0, 0.62, 610, 11);
    addServo(out, 0.36, 0.42, 820, 12, 0.7);
    addHydraulic(out, 0.0, 0.8, 15, true);
    addClunk(out, 0.8, 0.8, 13);
    addClunk(out, 0.86, 0.55, 14);
    return normalize(addSpace(out), 0.85);
  },
  /** Arms unlock with a click, telescope out and swing into flight position, then latch. */
  armUnfold(): Float32Array {
    const out = buffer(1.05);
    addClunk(out, 0.0, 0.45, 21);
    addServo(out, 0.05, 0.4, 820, 22, 0.7);
    addServo(out, 0.2, 0.6, 640, 23);
    addHydraulic(out, 0.05, 0.78, 25, false);
    addClunk(out, 0.82, 0.75, 24);
    return normalize(addSpace(out), 0.85);
  },
  /**
   * Wheels swing down on their arms and lock (≈1.3 s), the tyres take the weight, then the landing
   * legs telescope in and fold away (≈0.9 s).
   */
  wheelsDeploy(): Float32Array {
    const out = buffer(2.45);
    addServo(out, 0.0, 1.3, 380, 31);
    addHydraulic(out, 0.0, 1.3, 35, true);
    addClunk(out, 1.3, 1, 32);
    const thud = lowpass(140);
    const noise = noiseSource(34);
    for (let i = Math.floor(1.36 * SAMPLE_RATE); i < Math.floor(1.8 * SAMPLE_RATE); i++) {
      const t = i / SAMPLE_RATE - 1.36;
      out[i]! += thud(noise()) * Math.exp(-t / 0.08) * 1.6;
    }
    addServo(out, 1.3, 0.85, 520, 36, 0.6);
    addHydraulic(out, 1.3, 0.85, 37, false);
    addClunk(out, 2.18, 0.55, 38);
    return normalize(addSpace(out), 0.9);
  },
  /** Landing legs unfold and extend to the ground (≈0.9 s), then the wheels lift into their wells. */
  wheelsRetract(): Float32Array {
    const out = buffer(2.4);
    addServo(out, 0.0, 0.9, 520, 41, 0.6);
    addHydraulic(out, 0.0, 0.9, 44, true);
    addClunk(out, 0.92, 0.6, 45);
    addServo(out, 0.95, 1.2, 400, 42);
    addHydraulic(out, 0.95, 1.2, 46, false);
    addClunk(out, 2.18, 0.7, 43);
    return normalize(addSpace(out), 0.85);
  },
  chassisLower(): Float32Array {
    const out = buffer(0.6);
    addHydraulic(out, 0, 0.5, 51, true);
    addClunk(out, 0.48, 0.35, 52);
    return normalize(addSpace(out), 0.6);
  },
  chassisRaise(): Float32Array {
    const out = buffer(0.6);
    addHydraulic(out, 0, 0.5, 61, false);
    addClunk(out, 0.47, 0.3, 62);
    return normalize(addSpace(out), 0.6);
  },
  /** Generic actuation, kept for phase data that still asks for it. */
  transform(): Float32Array {
    const out = buffer(1.05);
    addServo(out, 0.0, 0.7, 600, 71);
    addClunk(out, 0.78, 0.8, 72);
    return normalize(addSpace(out), 0.85);
  },
  /** Rotors accelerate against air resistance (torque-limited start, then drag). */
  rotorSpinUp(): Float32Array {
    const out = buffer(1.2);
    addRotorRamp(out, (t) => (t < 0.05 ? 0 : 1 - Math.exp(-(t - 0.05) * 4.2)), 81);
    return normalize(out, 0.8);
  },
  rotorSpinDown(): Float32Array {
    const out = buffer(1.1);
    addRotorRamp(out, (t) => Math.max(0, 1 / (1 + t * 7) - 0.12), 91);
    addClunk(out, 0.95, 0.25, 92);
    return normalize(out, 0.8);
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
  /** One pulse of the machine alarm buzzer: the unit the continuous danger alarm repeats. */
  alarmBeep(): Float32Array {
    const out = buffer(0.16);
    const hp = highpass(280);
    const lp = lowpass(2600);
    let a = 0;
    let b = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const gate = Math.min(1, t / 0.004, (0.13 - t) / 0.01);
      a = (a + 415 / SAMPLE_RATE) % 1;
      b = (b + 431 / SAMPLE_RATE) % 1;
      const driven = Math.tanh(((a * 2 - 1) * 0.6 + (b * 2 - 1) * 0.6) * 3.5);
      out[i] = lp(hp(driven)) * Math.max(0, gate);
    }
    return normalize(out, 0.6);
  },
  /**
   * Machine caution alarm: three short pulses from an overdriven electronic buzzer (two detuned
   * sawtooth oscillators beating against each other through a small speaker's band), the harsh
   * blare of equipment alarms rather than a beeping clock.
   */
  warning(): Float32Array {
    const out = buffer(0.78);
    const hp = highpass(280);
    const lp = lowpass(2600);
    const pulses = [0, 0.22, 0.44];
    let a = 0;
    let b = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      let gate = 0;
      for (const p0 of pulses) {
        const u = t - p0;
        if (u >= 0 && u < 0.16) gate = Math.min(1, u / 0.004, (0.16 - u) / 0.01);
      }
      a = (a + 415 / SAMPLE_RATE) % 1;
      b = (b + 431 / SAMPLE_RATE) % 1;
      const saw = (a * 2 - 1) * 0.6 + (b * 2 - 1) * 0.6;
      // Speaker overdrive, then the speaker's narrow band.
      const driven = Math.tanh(saw * 3.5);
      out[i] = lp(hp(driven)) * gate;
    }
    return normalize(out, 0.6);
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
