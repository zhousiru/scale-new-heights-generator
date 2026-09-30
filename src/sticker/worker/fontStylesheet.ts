import type { StickerFlavor } from '../config/defaults'
import { withFontLoadTimeout, type FontFaceSource } from '../render/fontFace'

interface FontStylesheet {
  url: string
  family: string
  retain?: boolean
}

const FONT_STYLESHEETS: Record<StickerFlavor, FontStylesheet> = {
  snh: {
    url: 'https://fonts.bytedance.com/dfd/api/v1/css?family=DOUYINSANSBOLD-GB&display=swap',
    family: 'DOUYINSANSBOLD-GB',
  },
  bs: {
    url: 'https://cn-font.claude-code-best.win/packages/ysbth/dist/优设标题黑/result.css',
    family: 'YouSheBiaoTiHei',
  },
}

const INTER_STYLESHEET: FontStylesheet = { url: 'https://rsms.me/inter/inter.css', family: 'InterVariable', retain: true }
const stylesheetPromises = new Map<string, Promise<FontFaceSource[] | undefined>>()

export function loadInterFontSources(): Promise<FontFaceSource[] | undefined> {
  return loadStylesheet(INTER_STYLESHEET)
}

/** Read declarations with native CSSOM, then send them to the worker.
 * Some font CDNs accept stylesheet requests but reject fetch() requests.
 * These families are used only on the worker canvas, not in the page DOM.
 */
export function loadStickerFontSources(flavor: StickerFlavor): Promise<FontFaceSource[] | undefined> {
  return loadStylesheet(FONT_STYLESHEETS[flavor])
}

function loadStylesheet(stylesheet: FontStylesheet): Promise<FontFaceSource[] | undefined> {
  let promise = stylesheetPromises.get(stylesheet.url)
  if (!promise) {
    promise = readFontStylesheet(stylesheet).catch(() => undefined)
    stylesheetPromises.set(stylesheet.url, promise)
  }
  return promise
}

async function readFontStylesheet({ url, family, retain = false }: FontStylesheet): Promise<FontFaceSource[]> {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.crossOrigin = 'anonymous'
  link.href = url
  const loading = new Promise<void>((resolve, reject) => {
    link.onload = () => resolve()
    link.onerror = () => reject(new Error('Font stylesheet unavailable'))
  })
  document.head.append(link)
  try {
    await withFontLoadTimeout(loading)
    const faces: FontFaceSource[] = []
    for (const rule of link.sheet?.cssRules ?? []) {
      if (!(rule instanceof CSSFontFaceRule)) continue
      const faceFamily = rule.style.getPropertyValue('font-family').replace(/^['"]|['"]$/g, '')
      if (faceFamily !== family) continue
      if (rule.style.getPropertyValue('font-style') === 'italic') continue
      // CSSOM parses the declarations; only URL resolution is needed here.
      const source = rule.style.getPropertyValue('src').replace(/url\(["']?([^"')]+)["']?\)/g,
        (_, path: string) => `url("${new URL(path, url).href}")`)
      if (source) faces.push({ source, unicodeRange: rule.style.getPropertyValue('unicode-range') || 'U+0-10FFFF' })
    }
    if (!faces.length) throw new Error('No matching font faces in stylesheet')
    return faces
  } finally {
    if (!retain || !link.sheet) link.remove()
  }
}
