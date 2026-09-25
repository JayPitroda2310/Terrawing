/** Detects WebGL2 support before we try to mount the 3D canvas. */
export function detectWebGL(): { supported: boolean; reason?: string } {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) return { supported: false, reason: 'WebGL2 is not available in this browser.' };
    return { supported: true };
  } catch (error) {
    return { supported: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
