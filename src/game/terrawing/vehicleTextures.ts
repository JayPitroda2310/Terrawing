import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/** Woven carbon-fibre pattern for the rotor arms. */
export function createCarbonTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#16191b';
  ctx.fillRect(0, 0, size, size);
  const cell = size / 4;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const horizontal = (x + y) % 2 === 0;
      const gradient = horizontal
        ? ctx.createLinearGradient(0, y * cell, 0, (y + 1) * cell)
        : ctx.createLinearGradient(x * cell, 0, (x + 1) * cell, 0);
      gradient.addColorStop(0, '#1c2023');
      gradient.addColorStop(0.5, '#3a4045');
      gradient.addColorStop(1, '#1c2023');
      ctx.fillStyle = gradient;
      ctx.fillRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(2, 10);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** TerraWing brand green, from the logo. */
export const BRAND_GREEN = '#7fda59';
const LOGO_URL = '/assets/brand/terrawing-logo.png';

/** Draws the logo image once it has loaded, then refreshes the texture. */
function drawLogo(
  ctx: CanvasRenderingContext2D,
  texture: CanvasTexture,
  x: number,
  y: number,
  width: number,
): void {
  const image = new Image();
  image.onload = () => {
    ctx.drawImage(image, x, y, width, (width * image.height) / image.width);
    texture.needsUpdate = true;
  };
  image.src = LOGO_URL;
}

/**
 * Side livery decal: brand-green sweep with a white pinstripe, the TerraWing logo, unit markings,
 * a medical cross and reflective chevrons, on a transparent canvas applied to each hull side.
 */
export function createLiveryTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 208;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = BRAND_GREEN;
  ctx.beginPath();
  ctx.moveTo(0, 150);
  ctx.lineTo(1024, 120);
  ctx.lineTo(1024, 170);
  ctx.lineTo(0, 188);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8ecee';
  ctx.beginPath();
  ctx.moveTo(0, 138);
  ctx.lineTo(1024, 108);
  ctx.lineTo(1024, 114);
  ctx.lineTo(0, 144);
  ctx.closePath();
  ctx.fill();

  // Reflective chevrons at the rear.
  ctx.fillStyle = '#d9dee0';
  for (let i = 0; i < 4; i++) {
    const x = 850 + i * 34;
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x + 18, 20);
    ctx.lineTo(x + 34, 52);
    ctx.lineTo(x + 18, 84);
    ctx.lineTo(x, 84);
    ctx.lineTo(x + 16, 52);
    ctx.closePath();
    ctx.fill();
  }

  ctx.font = '600 24px "Exo 2", "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#b8c0c4';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('TW-1  ·  SEARCH & RESCUE', 64, 124);

  // Medical cross.
  ctx.fillStyle = BRAND_GREEN;
  ctx.fillRect(760, 28, 18, 54);
  ctx.fillRect(742, 46, 54, 18);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  drawLogo(ctx, texture, 60, 34, 620);
  return texture;
}

/** The logo alone on a transparent canvas, for the nose and roof. */
export function createLogoTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  drawLogo(ctx, texture, 12, 9, 1000);
  return texture;
}

/**
 * Tyre sidewall height map for the lathed carcass (u around the tyre, v across its profile):
 * raised moulded lettering and size code on both walls, radial ribs toward the shoulders, and
 * a smooth band at the rim.
 */
export function createSidewallTexture(): CanvasTexture {
  const w = 2048;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  // Profile v (0…1) → canvas y (textures are flipped on upload).
  const vy = (v: number) => (1 - v) * h;
  for (const [centre, flip] of [
    [0.2, false],
    [0.8, true],
  ] as const) {
    // Shoulder ribs.
    const outer = flip ? 0.86 : 0.14;
    ctx.fillStyle = '#8a8a8a';
    for (let i = 0; i < 90; i++) {
      const x = (i / 90) * w;
      ctx.fillRect(x, Math.min(vy(outer), vy(outer + (flip ? 0.04 : -0.04))), 7, h * 0.04);
    }
    // Lettering, twice around each wall.
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [k, text] of ['TERRAWING  TRAIL-X  A/T', 'LT 265/70 R17  121/118S  M+S'].entries()) {
      for (let r = 0; r < 2; r++) {
        const x = ((k * 0.5 + r) / 2 + 0.12) * w;
        ctx.save();
        ctx.translate(x, vy(centre));
        if (flip) ctx.scale(-1, -1);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
