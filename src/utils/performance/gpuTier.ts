import type { GraphicsQuality } from '@/services/save/saveSchema';

/** Integrated or software GPUs, which run the realistic scene best on the Low preset. */
const LOW_END = /intel|uhd|iris|swiftshader|llvmpipe|software|mali|adreno|powervr/i;
const HIGH_END =
  /rtx|radeon rx|geforce gtx 1[06-9]|geforce gtx 20|apple m[2-9]|apple m1 (pro|max|ultra)/i;

/** Reads the GPU name, if the browser exposes it. */
export function detectGpuName(): string | null {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info
      ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    return typeof name === 'string' ? name : null;
  } catch {
    return null;
  }
}

/** Picks a starting graphics preset for first-time players from the GPU name. */
export function recommendQuality(gpuName: string | null = detectGpuName()): GraphicsQuality {
  if (!gpuName) return 'medium';
  if (LOW_END.test(gpuName)) return 'low';
  if (HIGH_END.test(gpuName)) return 'high';
  return 'medium';
}
