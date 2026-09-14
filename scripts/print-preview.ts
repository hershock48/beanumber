/**
 * Render the Printful print files locally and LOOK at them before any
 * order goes out. Writes the full-size PNGs Printful would receive plus
 * 600px previews composited on a shirt-colored ground.
 *
 *   npx tsx scripts/print-preview.ts [number] [outDir]
 *
 * Defaults: number 47, outDir ./out/print-preview. Same renderer the
 * live /print routes use (src/lib/printful/print-files.ts), so what
 * you see here is what Printful gets.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { backPlacementSvg, frontPlacementSvg, renderPng, CANVAS_PX } from '../src/lib/printful/print-files';

async function main() {
  const num = parseInt(process.argv[2] || '47', 10);
  const out = path.resolve(process.argv[3] || 'out/print-preview');
  await mkdir(out, { recursive: true });

  const jobs: Array<[string, Promise<string>, string]> = [
    [`back-${num}-white`, backPlacementSvg(num, 'white'), '#1a1a1a'],
    [`back-${num}-black`, backPlacementSvg(num, 'black'), '#ffffff'],
    ['front-globe-white', frontPlacementSvg('white'), '#1a1a1a'],
  ];
  for (const [name, svgP, ground] of jobs) {
    const t = Date.now();
    const png = await renderPng(await svgP);
    await writeFile(path.join(out, `${name}.png`), png);
    // sharp runs resize before composite whatever the call order, so
    // composite onto the full canvas first, then shrink in a second pass.
    const onGround = await sharp({ create: { width: CANVAS_PX.w, height: CANVAS_PX.h, channels: 4, background: ground } })
      .composite([{ input: png }])
      .png()
      .toBuffer();
    await sharp(onGround).resize(600).png().toFile(path.join(out, `${name}-preview.png`));
    console.log(name, `${(png.length / 1024).toFixed(0)}KB`, `${Date.now() - t}ms`);
  }
  console.log('written to', out);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
