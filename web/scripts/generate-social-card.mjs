import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync(new URL('./social-card.svg', import.meta.url), 'utf8');
const logo = readFileSync(new URL('../static/zenwriter-garden-mark.png', import.meta.url));
// Inline the existing logo so the renderer never silently drops an external image.
const svg = source.replace('../static/zenwriter-garden-mark.png', `data:image/png;base64,${logo.toString('base64')}`);
const png = execFileSync('rsvg-convert', { input: svg });
writeFileSync(new URL('../static/og.png', import.meta.url), png);
