import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
  Points,
  ShaderMaterial,
  type Blending,
} from 'three';

export interface EmitOptions {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  startSize: number;
  endSize: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
}

export interface ParticlePoolOptions {
  capacity: number;
  gravity: number;
  drag: number;
  additive: boolean;
  /** Buoyancy for smoke-like particles (m/s² upwards). */
  lift?: number;
  /** 0 = hard dot, 1 = very soft puff. */
  softness: number;
  /** Irregular, torn-edged wisps (dust, spray) instead of round puffs. */
  wispy?: boolean;
  /** Random swirling acceleration (m/s²): smoke curls instead of travelling in straight lines. */
  turbulence?: number;
  /** Colour particles blend towards over their life (smoke thins from black to pale grey). */
  fadeTo?: readonly [number, number, number];
}

/**
 * Fixed-capacity CPU particle pool rendered as one `Points` draw call. No allocations after
 * construction: dead particles are recycled in ring order.
 */
export class ParticlePool {
  readonly points: Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly ages: Float32Array;
  private readonly lives: Float32Array;
  private readonly sizeRange: Float32Array;
  private readonly baseAlpha: Float32Array;
  private readonly startColors: Float32Array;
  private time = 0;
  private cursor = 0;
  /** Extra wind acceleration applied to all particles. */
  readonly wind = { x: 0, z: 0 };

  constructor(private readonly options: ParticlePoolOptions) {
    const n = options.capacity;
    this.positions = new Float32Array(n * 3);
    this.velocities = new Float32Array(n * 3);
    this.colors = new Float32Array(n * 3);
    this.sizes = new Float32Array(n);
    this.alphas = new Float32Array(n);
    this.ages = new Float32Array(n);
    this.lives = new Float32Array(n);
    this.sizeRange = new Float32Array(n * 2);
    this.baseAlpha = new Float32Array(n);
    this.startColors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.positions[i * 3 + 1] = -10000;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    geometry.setAttribute('size', new BufferAttribute(this.sizes, 1));
    geometry.setAttribute('alpha', new BufferAttribute(this.alphas, 1));
    geometry.boundingSphere = null;

    const blending: Blending = options.additive ? AdditiveBlending : NormalBlending;
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending,
      uniforms: { uScale: { value: 400 }, uSoftness: { value: options.softness } },
      defines: options.wispy ? { WISPY: '' } : {},
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        uniform float uScale;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vSeed;
        void main() {
          vSeed = fract(float(gl_VertexID) * 0.6180339);
          vAlpha = alpha;
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uSoftness;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vSeed;
        float twHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float twNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(twHash(i), twHash(i + vec2(1, 0)), f.x),
                     mix(twHash(i + vec2(0, 1)), twHash(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          #ifdef WISPY
            // Rotate each particle's pattern, then tear the edge with two octaves of noise so it
            // reads as a drifting wisp of dust rather than a disc.
            float ang = vSeed * 6.2831;
            p = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p;
            vec2 q = p * vec2(3.2, 5.0) + vSeed * 17.0;
            float n = twNoise(q) * 0.65 + twNoise(q * 2.3 + 5.1) * 0.35;
            float a = (1.0 - smoothstep(0.15, 1.0, d + (n - 0.5) * 0.9)) * smoothstep(0.25, 0.75, n + 0.2);
            a *= a;
          #else
            float a = 1.0 - smoothstep(1.0 - uSoftness, 1.0, d);
          #endif
          if (a <= 0.0 || vAlpha <= 0.0) discard;
          gl_FragColor = vec4(vColor, a * vAlpha);
          #include <fog_fragment>
        }
      `,
      fog: false,
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
  }

  emit(o: EmitOptions): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.options.capacity;
    this.positions[i * 3] = o.x;
    this.positions[i * 3 + 1] = o.y;
    this.positions[i * 3 + 2] = o.z;
    this.velocities[i * 3] = o.vx;
    this.velocities[i * 3 + 1] = o.vy;
    this.velocities[i * 3 + 2] = o.vz;
    this.colors[i * 3] = o.r;
    this.colors[i * 3 + 1] = o.g;
    this.colors[i * 3 + 2] = o.b;
    this.startColors[i * 3] = o.r;
    this.startColors[i * 3 + 1] = o.g;
    this.startColors[i * 3 + 2] = o.b;
    this.ages[i] = 0;
    this.lives[i] = o.life;
    this.sizeRange[i * 2] = o.startSize;
    this.sizeRange[i * 2 + 1] = o.endSize;
    this.baseAlpha[i] = o.alpha;
  }

  update(dt: number): void {
    const { gravity, drag, lift = 0, turbulence = 0, fadeTo } = this.options;
    const dragFactor = Math.exp(-drag * dt);
    this.time += dt;
    const time = this.time;
    for (let i = 0; i < this.options.capacity; i++) {
      const life = this.lives[i]!;
      if (life <= 0) continue;
      const age = (this.ages[i]! += dt);
      if (age >= life) {
        this.lives[i] = 0;
        this.alphas[i] = 0;
        this.positions[i * 3 + 1] = -10000;
        continue;
      }
      const t = age / life;
      const p = i * 3;
      let tx = 0;
      let ty = 0;
      let tz = 0;
      if (turbulence > 0) {
        // Cheap swirl field: smooth in space and time, different for each particle.
        const px = this.positions[p]!;
        const py = this.positions[p + 1]!;
        const pz = this.positions[p + 2]!;
        tx = Math.sin(py * 1.7 + time * 1.9 + i * 0.37) * turbulence;
        ty = Math.sin(pz * 1.3 - time * 1.4 + i * 0.61) * turbulence * 0.5;
        tz = Math.cos(px * 1.5 + time * 1.6 + i * 0.83) * turbulence;
      }
      this.velocities[p] = this.velocities[p]! * dragFactor + (this.wind.x + tx) * dt;
      this.velocities[p + 1] = this.velocities[p + 1]! * dragFactor + (lift - gravity + ty) * dt;
      this.velocities[p + 2] = this.velocities[p + 2]! * dragFactor + (this.wind.z + tz) * dt;
      if (fadeTo) {
        const k = Math.min(1, t * 1.4);
        this.colors[p] = this.startColors[p]! + (fadeTo[0] - this.startColors[p]!) * k;
        this.colors[p + 1] = this.startColors[p + 1]! + (fadeTo[1] - this.startColors[p + 1]!) * k;
        this.colors[p + 2] = this.startColors[p + 2]! + (fadeTo[2] - this.startColors[p + 2]!) * k;
      }
      this.positions[p] = this.positions[p]! + this.velocities[p]! * dt;
      this.positions[p + 1] = this.positions[p + 1]! + this.velocities[p + 1]! * dt;
      this.positions[p + 2] = this.positions[p + 2]! + this.velocities[p + 2]! * dt;
      this.sizes[i] =
        this.sizeRange[i * 2]! + (this.sizeRange[i * 2 + 1]! - this.sizeRange[i * 2]!) * t;
      // Fade in quickly, fade out over the second half of life.
      this.alphas[i] = this.baseAlpha[i]! * Math.min(1, t * 8) * (t < 0.5 ? 1 : 1 - (t - 0.5) * 2);
    }
    const geometry = this.points.geometry;
    geometry.getAttribute('position').needsUpdate = true;
    geometry.getAttribute('size').needsUpdate = true;
    geometry.getAttribute('alpha').needsUpdate = true;
    geometry.getAttribute('color').needsUpdate = true;
  }

  /** Scales point sizes with the viewport height so particles look the same at any resolution. */
  setViewportHeight(height: number): void {
    (this.points.material as ShaderMaterial).uniforms.uScale!.value = height * 0.5;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as ShaderMaterial).dispose();
  }
}
