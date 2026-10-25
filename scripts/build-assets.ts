import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { BAR_COLORS, COLORS, logoSvg, markPaths, PUBLIC, TILE_COLORS, tileSvg } from './assets/brand';

// Writes the brand files in apps/web/public: logo.svg, favicon.svg, favicon.ico, apple-touch-icon.png,
// icon-512.png (the extension's icon) and og.png (the link preview). Run with `npm run assets`.
mkdirSync(PUBLIC, { recursive: true });
writeFileSync(path.join(PUBLIC, 'logo.svg'), logoSvg());
writeFileSync(path.join(PUBLIC, 'favicon.svg'), tileSvg(32));

const font = readFileSync(path.join(PUBLIC, 'fonts/geist-latin-variable.woff2')).toString('base64');
const fontFace = `@font-face{font-family:'Geist';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}`;
const bars = (size: number, colors = BAR_COLORS) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">${markPaths(colors)}</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function tile(size: number, markSize: number, file: string) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:${TILE_COLORS.tile};display:grid;place-items:center;width:${size}px;height:${size}px">${bars(markSize, TILE_COLORS.bars)}</body>`,
  );
  const png = await page.screenshot({ type: 'png' });
  writeFileSync(path.join(PUBLIC, file), png);
  return png;
}

const fav = await tile(32, 24, 'favicon-32.png');
// A one-image .ico: the header, one directory entry, then the PNG itself.
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt8(32, 6);
ico.writeUInt8(32, 7);
ico.writeUInt16LE(1, 12);
ico.writeUInt16LE(32, 14);
ico.writeUInt32LE(fav.length, 14 + 4);
ico.writeUInt32LE(22, 18);
writeFileSync(path.join(PUBLIC, 'favicon.ico'), Buffer.concat([ico, fav]));
await tile(180, 112, 'apple-touch-icon.png');
await tile(512, 320, 'icon-512.png');

// Open Graph image: mark 64px, "Loam" 56px, tagline 28px in the muted colour with the lime highlight. No screenshots, no people.
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<style>${fontFace}
  body{margin:0;width:1200px;height:630px;background:${COLORS.bg};display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Geist';-webkit-font-smoothing:antialiased;color:${COLORS.text}}
  .name{font-size:56px;font-weight:600;letter-spacing:-0.03em;margin-top:24px;line-height:1.1}
  .tag{font-size:28px;font-weight:400;color:${COLORS.muted};margin-top:12px}
  .hl{color:${COLORS.text};background:linear-gradient(${COLORS.accent},${COLORS.accent}) no-repeat 0 92%/100% 0.38em}
</style><body>${bars(64)}<div class="name">Loam</div><div class="tag">Work context for <span class="hl">AI agents</span></div></body>`);
await page.evaluate(() => document.fonts.ready);
writeFileSync(path.join(PUBLIC, 'og.png'), await page.screenshot({ type: 'png' }));
await browser.close();
console.log('Brand assets written to apps/web/public:', BAR_COLORS.join(' '));
