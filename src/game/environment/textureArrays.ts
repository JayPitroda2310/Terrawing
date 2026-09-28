import {
  DataArrayTexture,
  LinearMipmapLinearFilter,
  LinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type ColorSpace,
} from 'three';
import { logger } from '@/utils/helpers/logger';

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => {
      logger.warn('assets', `Texture failed to load: ${url} (using a neutral fallback)`);
      resolve(null);
    };
    image.src = url;
  });
}

/**
 * Loads same-sized images into a single `DataArrayTexture` (one layer per image). Images are
 * resized to `size` and flipped to GL's bottom-up row order so normal maps keep their orientation.
 * Missing images become a neutral layer instead of failing the whole world.
 */
export async function loadTextureArray(
  urls: readonly string[],
  size: number,
  colorSpace: ColorSpace,
  fallback: readonly [number, number, number],
): Promise<DataArrayTexture> {
  const images = await Promise.all(urls.map(loadImage));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const layerBytes = size * size * 4;
  const data = new Uint8Array(layerBytes * urls.length);

  images.forEach((image, layer) => {
    if (!ctx || !image) {
      for (let i = 0; i < layerBytes; i += 4) {
        data[layer * layerBytes + i] = fallback[0];
        data[layer * layerBytes + i + 1] = fallback[1];
        data[layer * layerBytes + i + 2] = fallback[2];
        data[layer * layerBytes + i + 3] = 255;
      }
      return;
    }
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.translate(0, size);
    ctx.scale(1, -1);
    ctx.drawImage(image, 0, 0, size, size);
    ctx.restore();
    data.set(ctx.getImageData(0, 0, size, size).data, layer * layerBytes);
  });

  const texture = new DataArrayTexture(data, size, size, urls.length);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

export const COLOR_SPACE = { color: SRGBColorSpace, data: NoColorSpace } as const;
