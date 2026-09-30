export interface FontFaceSource {
  source: string
  unicodeRange: string
}

/** Bound CDN waits so an unreachable font service can fall back locally. */
export const FONT_CDN_TIMEOUT_MS = 5_000

export async function withFontLoadTimeout<T>(loading: Promise<T>, timeoutMs = FONT_CDN_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Font CDN timed out')), timeoutMs)
  })
  try {
    return await Promise.race([loading, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

export function getFontFaceSet(): FontFaceSet | undefined {
  return typeof document !== 'undefined'
    ? document.fonts
    : (globalThis as unknown as { fonts?: FontFaceSet }).fonts
}

interface FontFaceLoadOptions {
  family: string
  source: string
  style: string
  weight: string
  featureSettings?: string
  timeoutMs?: number
  verify?: {
    spec: string
    text: string
  }
}

export async function loadFontFace({
  family,
  source,
  style,
  weight,
  featureSettings,
  timeoutMs,
  verify,
}: FontFaceLoadOptions): Promise<void> {
  if (typeof FontFace === 'undefined') return

  const fonts = getFontFaceSet()
  if (!fonts) return

  const fontFace = new FontFace(family, source, {
    style,
    weight,
    featureSettings,
  })
  const loading = fontFace.load()
  const loaded = await (timeoutMs === undefined ? loading : withFontLoadTimeout(loading, timeoutMs))
  fonts.add(loaded)

  if (verify) {
    await fonts.load(verify.spec, verify.text)
  }
}
