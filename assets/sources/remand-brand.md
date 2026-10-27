# Remand card source

Updated 27 October 2026.

- `remand-r.svg`: the Remand "R" from the app icon served at https://nybblers.vercel.app/favicon.ico (a 1024x1024 PNG), retrieved 27 October 2026. The icon fades the letter out towards the foot, so the full letterform was recovered from its alpha channel and traced with potrace. Coordinates are the icon's own 1024 grid.
- Fill: the icon's own yellow-to-orange run (#FFC32F at the top through #FF7A00 to #F23D00), carried to the foot rather than fading out.
- Ground: a warm near-black, so the card sits with the other brand marks and the phosphor duotone reads the letter rather than a bright plate.

Rebuild with `node scripts/build-images.mjs --remand-only`.
