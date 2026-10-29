// Renders the extension icons from one SVG source so every size in the
// manifest is a real file at the exact pixel dimensions Chrome expects.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const SIZES = [16, 32, 48, 128];
const OUT_DIR = resolve(import.meta.dirname, '../public/icons');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#0f172a"/>
  <ellipse cx="64" cy="66" rx="52" ry="20" fill="none" stroke="#38bdf8" stroke-width="7"
           transform="rotate(-20 64 66)"/>
  <circle cx="64" cy="58" r="27" fill="#f8fafc"/>
  <path d="M46 56a18 18 0 0 1 36 0 18 18 0 0 1-36 0z" fill="#0f172a"/>
  <path d="M52 50a12 12 0 0 1 14-5" stroke="#38bdf8" stroke-width="5" stroke-linecap="round" fill="none"/>
</svg>`;

await mkdir(OUT_DIR, { recursive: true });
await writeFile(resolve(OUT_DIR, 'icon.svg'), `${svg}\n`);

for (const size of SIZES) {
  const file = resolve(OUT_DIR, `icon-${size}.png`);
  await mkdir(dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
  console.log(`icons/icon-${size}.png (${size}x${size})`);
}
