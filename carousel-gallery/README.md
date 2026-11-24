# Atlas of Elsewhere

A small Vite + React demo built around the React Bits `CircularCarousel` (JavaScript + CSS variant).

- `src/components/CircularCarousel/` holds the component, copied verbatim.
- `src/data/plates.js` draws each landscape as an SVG data URI, seeded by place name, so no remote images are needed.
- Switching volumes swaps all ten images at once, which triggers the carousel's crossfade.

```bash
npm install
npm run dev        # local dev server
npm run build      # production build in dist/
node build-artifact.mjs   # single-file page in artifact/index.html
```
