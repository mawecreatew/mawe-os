/** Descobre quais arquivos de logo existem em public/brand/ (sem inventar substitutos). */
import { BRAND } from '../config/brand.ts';
import { brandAssets } from './context.ts';

function probe(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

async function firstAvailable(candidates: readonly string[]): Promise<string | null> {
  for (const src of candidates) if (await probe(src)) return src;
  return null;
}

export async function loadBrandAssets(): Promise<void> {
  const [logo, monogram] = await Promise.all([firstAvailable(BRAND.logoHorizontal), firstAvailable(BRAND.monogram)]);
  brandAssets.logoHorizontal = logo;
  brandAssets.monogram = monogram;
  if (monogram) {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = monogram;
    document.head.append(link);
  }
}
