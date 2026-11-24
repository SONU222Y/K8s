// Builds a single self-contained HTML page (CSS and JS inlined) from dist/.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';

const files = readdirSync('dist/assets');
const js = readFileSync(`dist/assets/${files.find(f => f.endsWith('.js'))}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(`dist/assets/${files.find(f => f.endsWith('.css'))}`, 'utf8');

const html = `<title>Atlas of Elsewhere</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;

mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/index.html', html);
console.log(`artifact/index.html: ${(html.length / 1024).toFixed(1)} KB`);
