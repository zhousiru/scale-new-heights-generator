

# Peak Sticker Generator

A browser-based generator for Chinese "Scale New Heights" stickers and Feishu avatars. Input text to instantly generate stickers with color gradients, outlines, and staggered climbing effects, or generate Feishu group avatars in specified dimensions.

**Online Demo** · [GitHub Pages](https://zhousiru.github.io/scale-new-heights-generator)

It can also be used as an npm package in Node headless environments to directly generate PNG `Buffer`s, making it suitable for Feishu bots, scheduled tasks, CLIs, and other scenarios without a browser UI.

## v3 Updates

- Added `/avatar` Feishu avatar generator: fixed square, edge-aligned circular, colored background with white text / white background with colored ring & same-color text, manual style selection, text rotation, and adaptive multi-line layout.
- Both stickers and avatars support HDR highlights: enabling it exports an Ultra HDR JPEG gain map; disabling it still exports a standard PNG.
- UI updated to Radix/shadcn-style local components, with shared splitting for the control panel, preview, footer, worker communication, and rendering runtime.
- State is saved in the URL and local tool entry points, so switching between stickers and avatars won't lose recently adjusted parameters.

## Features

- **Two Styles**
  - **Scale New Heights** (Douyin Sans Bold): White character shapes placed within a colored gradient envelope, paired with a dark edge outline.
  - **ByteDance Style** (YouSheBiaoTiHei): Colored gradient characters, paired with a dark outline of the same color family.
- **Staggered Climbing**: Words "climb" along uneven baselines, or can be switched to aligned horizontal layout.
- **Text / Icon Tilt**: Independently toggle inherent rotation and skew; circular/badge-style icons automatically remain upright.
- **Font Strategy**: Chinese uses custom fonts, Western text defaults to Inter Latin Bold; SNH decides whether to include a few English/numeric characters in the Douyin Sans layout based on the Chinese ratio.
- **Prefix Icons**: Integrated with [Iconify](https://iconify.design/), enter IDs like `mdi:rocket` or `tabler:planet` to use as prefix glyphs; supports single-color, multi-color, and `-duotone` icons.
- **Smart Coloring**
  - Supports 1~3 gradient stops with a direction knob; defaults to 90° with icons, 180° without.
  - Single colors automatically generate a darker matching tone, defaulting to a "dark top to light bottom" vertical gradient.
  - Random coloring directly randomizes hues while avoiding colors too close to the current one; ByteDance Style uses a two-tone baseline of the same family, with the rendering layer deriving dark outlines and light foregrounds.
- **27 Built-in Presets** grouped by "ByteDance Style / Scale New Heights / Pragmatic Romance Series / Earthquake-level Creative".
- **Advanced Settings**: Anti-aliasing scale, stroke thickness, line height, top/bottom/left/right padding, etc.
- **Shareable URL**: All control states sync to the query string (only non-default values are serialized); copying the link defaults to `m=simple` simplified mode, suitable for iframe previews.
- **Feishu Avatar**: `/avatar` path generates fixed-size rectangular avatars; supports "colored bg/white text" and "white bg/colored ring/same-color text" modes, adaptive multi-line group names within the circle, manual gradient style selection, and text rotation.
- **HDR Highlights**: Both stickers and avatars support Ultra HDR JPEG gain map output, with intensity expressed in EV stops (`maxContentBoost = 2^EV`); disabled, it exports a standard PNG.
- **Export**: Copy image to clipboard, export image (opens in a new tab within iframe), copy generation link; restricted iframes will prompt to right-click to copy the image.
- Follows system dark mode.

## Tech Stack

- [React 19](https://react.dev/)
- [Vite 8](https://vite.dev/) (Rolldown) + TypeScript (strict)
- [TanStack Router](https://tanstack.com/router) — URL state synchronization
- [Radix UI](https://www.radix-ui.com/) + Local shadcn-style components — Select, Slider, Collapsible, Button, etc.
- Web Worker + `OffscreenCanvas` — Off-main-thread rendering
- [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas) — Optional default Node headless PNG runtime
- [Inter](https://rsms.me/inter/) ( `inter-ui` Latin subset) — Western font
- [colord](https://github.com/omgovich/colord) — Color processing
- [hdrify](https://www.npmjs.com/package/hdrify) — Ultra HDR JPEG gain map encoding
- [@iconify/react](https://iconify.design/) — Icons
- [Vitest](https://vitest.dev/) + oxlint

## Quick Start

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm dev        # Start dev server
```

### Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start dev server |
| `pnpm build` | Build browser app and npm package artifacts |
| `pnpm build:app` | Browser app production build |
| `pnpm build:package` | Build npm package entry, type declarations, and sync package exports via `tsdown.config.ts` |
| `pnpm preview` | Locally preview production build |
| `pnpm test` | Run Vitest unit tests |
| `pnpm lint` | Run oxlint according to `.oxlintrc.json` |

## Node Headless Usage

For bot server-side usage, use the `@syru/byted-sticker-generator/node` sub-entry. It does not depend on React, DOM, Web Workers, or Chromium; it dynamically loads the optional dependency `@napi-rs/canvas` upon actual rendering. If your deployment environment prefers not to install native dependencies, you can inject your own canvas runtime via `new StickerGenerator(runtime)`.

```ts
import { renderStickerToBuffer } from '@syru/byted-sticker-generator/node'

const png = await renderStickerToBuffer({
  text: 'Peak Stickers Are Rare',
  envelope: {
    colors: ['#1688ff', '#44b305'],
    gradientAngle: 45,
  },
  icon: '',
}, {
  outputScale: 2,
})

// Feishu bots can directly pass the png to existing image upload logic:
// const imageKey = await uploadImage(bot, png, 'sticker.png')
// await sendImageToChat(bot, chatId, imageKey)
```

Both web advanced settings and Node rendering support 1-5x internal supersampling anti-aliasing, defaulting to 1.5x, to eliminate staircase aliasing on diagonal and skewed edges. It can be temporarily disabled in extreme performance or troubleshooting scenarios:

```ts
await renderStickerToBuffer('Peak Stickers Are Rare', {
  antialiasScale: 1,
})
```

If the runtime environment blocks outbound network requests, you can disable Iconify icon fetching:

```ts
const png = await renderStickerToBuffer('Peak Stickers Are Rare', { loadIcon: false })
```

When using a custom runtime, `@napi-rs/canvas` installation is unnecessary. The runtime must at least provide `createCanvas` and `toPngBytes`; to auto-register fonts or load prefix icons, add `registerFont` / `hasFont` / `loadImage`:

```ts
import { StickerGenerator, type StickerGeneratorRuntime } from '@syru/byted-sticker-generator/node'

const runtime: StickerGeneratorRuntime = {
  createCanvas: (width, height) => myCanvasFactory(width, height),
  toPngBytes: async (canvas) => await encodePng(canvas),
}

const generator = new StickerGenerator(runtime)
const png = await generator.renderBuffer('Peak Stickers Are Rare', { loadIcon: false })
```

The package registers `public/DouyinSansBold.woff2` and `public/YouSheBiaoTiHei.ttf` by default. If your deployment system copies fonts to other directories, you can pass them explicitly:

```ts
await renderStickerToBuffer('Peak Stickers Are Rare', {
  fontFiles: {
    snh: '/opt/fonts/DouyinSansBold.woff2',
    bs: '/opt/fonts/YouSheBiaoTiHei.ttf',
    inter: '/opt/fonts/Inter-Bold-subset.woff2',
  },
})
```

Inter Latin Bold is resolved from `inter-ui/web-latin/Inter-Bold-subset.woff2` by default and registered as an independent font family `Inter Latin Bold`; it falls back to system sans-serif if missing. Emoji / Symbol fallback fonts are registered based on runtime environment availability: macOS prefers Apple Color Emoji / Apple Symbols, Windows uses Segoe UI Emoji / Segoe UI Symbol, and Linux or container environments can use Noto fonts provided by the package or passed explicitly.

The root entry only exports pure logic such as configuration, presets, URL encoding/decoding, and color utilities:

```ts
import { DEFAULT_STICKER_CONTROLS, STICKER_PRESET_LIST } from '@syru/byted-sticker-generator'
```

The core sub-entry exports a Node-agnostic rendering core, suitable for reuse in web or custom Canvas runtimes:

```ts
import { renderSticker, setCanvasRuntime } from '@syru/byted-sticker-generator/core'
```

Feishu avatars use an independent entry and do not depend on the sticker glyph/stroke pipeline:

```ts
import { renderAvatarToBuffer } from '@syru/byted-sticker-generator/avatar/node'

const png = await renderAvatarToBuffer({
  text: 'Frontend Group',
  style: 'sunset',
  mode: 'outline',
  size: 512,
  rotation: -8,
})
```

## How It Works

Rendering is the core of this project, divided as follows:

- **Rendering Pipeline** (`[sticker.ts](src/sticker/render/sticker.ts)`): Completes layout, glyph shaping, mask dilation (stroke), gradient filling, and cropping on an `OffscreenCanvas`. Core capabilities are split across render modules like `layout`, `mask`, `gradient`, and `glyphs`; to avoid blocking the UI, the main process runs inside a [Web Worker](src/sticker/worker/renderSticker.worker.ts).
- **Headless Rendering** (`[node.ts](src/sticker/node.ts)`): Dynamically loads the optional `@napi-rs/canvas` runtime by default, and also supports injecting a custom runtime via `StickerGenerator(runtime)` to output PNG bytes / `Buffer` for direct upload by Node bots.
- **Gradient Mapping Along Actual Shapes**: `createLinearGradient` coordinates are canvas-global and don't follow shapes. The engine scans the projection range of text mask pixels along the gradient direction to define the gradient line, ensuring endpoint colors truly fall at the ends of visible pixels rather than being "eaten" by off-canvas areas.
- **Font Selection** (`[font.ts](src/sticker/render/font.ts)`): Determines fonts based on graphemes. YouSheBiaoTiHei covers Chinese, English, and numbers; Douyin Sans Bold handles a few English/numbers only when Chinese dominates, otherwise Western text goes to Inter; Emojis & Symbols fall back to system color fonts.
- **Native Emoji Color + Stroke**: The rendering layer splits `shapeMask` and `foregroundMask`. Emojis participate in outlines/strokes but are ultimately composited in their original colors; stray corner pixels from Apple Color Emoji are isolated and cropped per character to avoid polluting the stroke.
- **Icon Rasterization on Main Thread** (`[iconLoader.ts](src/sticker/utils/iconLoader.ts)`): Chromium can only rasterize SVGs on the main thread, so icons are fetched and drawn as `ImageBitmap` on the main thread first, then transferred to the worker. Single-color icons are recolored as silhouettes matching the text colors; multi-color and duotone icons retain original colors and also participate in outlines.
- **Memory-Friendly Export**: Cropping, scaling, and padding are composited in one step to avoid repeatedly creating large intermediate canvases; paint buffers and mask canvases are reused to reduce peak Node/Worker rendering memory.
- **Sticker HDR Pipeline**: When `HDR Highlights` is enabled, the worker converts the final sticker canvas to a linear HDR float image, then uses `hdrify` to write an Ultra HDR JPEG gain map. Standard PNGs still retain the alpha channel; HDR JPEGs composite a white background due to format limitations.
- **Color Algorithm** (`[color.ts](src/sticker/utils/color.ts)`): Covers single-color darkening, random color picking, ByteDance two-tone baselines, etc., all covered by [unit tests](src/sticker/utils/color.test.ts).
- **Feishu Avatar Pipeline** (`[avatar.ts](src/avatar/render/avatar.ts)`): Independently handles edge-aligned circles, manual styles, adaptive multi-line group names, and text rotation. `fill` mode features a full-width gradient background with white text, while `outline` mode uses a full white background with a colored ring and same-color text; `HDR Highlights` converts the avatar canvas to a linear HDR float image inside the worker, then uses `hdrify` to write an Ultra HDR JPEG gain map. HDR preview uses `<img>` Blobs directly to avoid losing HDR data when drawn back to a Canvas.

### URL State

Controls are encoded into a compact short-key query string (e.g., `?t=勇攀高峰&fl=bs&gc=08e-9cf`), writing only items that differ from defaults. See [`searchParams.ts`](src/sticker/config/searchParams.ts) for encoding/decoding logic. `m=simple` enters simplified mode: the page only displays the generated image and a "Back to Edit" button, facilitating iframe embedding previews.

## Project Structure

```
src/
├── App.tsx                    # Page shell: combines control panel & preview panel
├── router/router.ts           # TanStack Router configuration
├── shared/                    # Truly shared components & underlying runtime, business-rule free
├── styles/                    # Layout, controls, preview & base UI styles
├── avatar/
│   ├── index.ts               # Avatar root entry: config, URL & rendering core
│   ├── core.ts                # Avatar core entry: rendering core with injectable runtime
│   ├── node.ts                # Avatar node entry: PNG Buffer API
│   ├── components/            # Avatar control & preview panels
│   ├── hooks/                 # State, URL sync, preview & export side effects
│   ├── config/                # Control models, URL query, worker protocol
│   ├── render/                # Circular avatar rendering & adaptive layout
│   └── worker/                # Worker entry & communication encapsulation
└── sticker/
    ├── index.ts               # NPM root entry: presets, config, URL & color pure logic
    ├── core.ts                # NPM core entry: rendering core with injectable runtime
    ├── node.ts                # NPM node entry: default Node runtime & PNG Buffer API
    ├── components/            # Control & preview panels
    ├── hooks/                 # State, URL sync, preview & export side effects
    ├── config/                # Control models, presets, URL query, worker protocol
    ├── render/                # Rendering pipeline, layout, mask, gradient, canvas runtime
    ├── utils/                 # Color algorithms, Iconify rasterization & other utilities
    └── worker/                # Worker entry & communication encapsulation
```

## Usage Tips

Copy and paste the image into the chat box when sending. After sending, right-click and select "Add as Sticker/Emoji" for correct size and shape.

## Deployment

Pushing to `main` triggers [GitHub Actions](.github/workflows/deploy.yml) to automatically build and deploy to GitHub Pages. The `VITE_BASE` environment variable injects the repository name as the base path during build.

## Fonts

- **Scale New Heights**: Douyin Sans Bold (`DouyinSansBold.woff2`)
- **ByteDance Style**: YouSheBiaoTiHei (`YouSheBiaoTiHei.ttf`)
- **Western Fonts**: Inter Latin Bold subset (from `inter-ui/web-latin/Inter-Bold-subset.woff2`, with `ss01` / `ss04` enabled)
- **Emoji / Symbol Fallback**: Prioritizes available environment fonts like Apple Color Emoji, Apple Symbols, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji, Noto Sans Symbols 2

Douyin Sans Bold and YouSheBiaoTiHei are free for commercial use; Inter follows its open-source license.

## Disclaimer

Texts in built-in presets are for demonstration purposes only, do not represent any stance, and are not officially affiliated with any related companies. Please do not use them in contexts that may cause misunderstanding or infringement.
