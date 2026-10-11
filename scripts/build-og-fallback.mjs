import fs from 'node:fs';
import sharp from 'sharp';
await sharp(fs.readFileSync('public/og-fallback.svg')).png().toFile('public/og-fallback.png');
console.log('Built public/og-fallback.png from the repository SVG; no remote image service used.');
