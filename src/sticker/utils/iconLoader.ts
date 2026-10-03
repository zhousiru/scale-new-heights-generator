import type { RenderIcon } from '../render/types'
import { isDuotoneIcon, svgHasHardcodedColor, svgIsRenderable } from './iconSource'

// Iconify 图标是 SVG。`createImageBitmap` 无法在 Web Worker 内解码 SVG blob。
/** 图标 SVG 在主线程栅格化后的目标边长 */
const ICON_RASTER_SIZE = 256

// 加载后的图标：位图 + 是否为「原生彩色」。
//   • colored=false（单色图标）：位图只作剪影折进蒙版，随后由文字配色统一重着色。
//   • colored=true（多色 / duotone）：剪影仍折进蒙版拿外描边包围带，但顶层以原生
//     颜色叠加，保留其真实配色。
export type LoadedIcon = RenderIcon

interface IconResource {
  blob: Blob
  colored: boolean
}

const iconResourceCache = new Map<string, Promise<IconResource | null>>()

// 把形如 `mdi:rocket` 或 `mdi-rocket` 的 Iconify id 解析成拉取 URL。
// 传入 color 时以该色请求（用于 duotone：让 currentColor 采用贴纸主色）；
// 否则拉取图标原始配色——单色图标的颜色不影响蒙版（蒙版只看 alpha），
// 多色图标则保留自身配色。
export function iconIdToUrl(iconId: string, color?: string): string | null {
  const trimmed = iconId.trim()
  if (trimmed.length === 0) return null

  const separator = trimmed.includes(':') ? ':' : '-'
  const splitAt = trimmed.indexOf(separator)
  if (splitAt <= 0 || splitAt >= trimmed.length - 1) return null

  const prefix = trimmed.slice(0, splitAt)
  const name = trimmed.slice(splitAt + 1)
  if (!/^[a-z0-9-]+$/i.test(prefix) || !/^[a-z0-9-]+$/i.test(name)) return null

  let url = `https://api.iconify.design/${prefix}/${name}.svg?height=${ICON_RASTER_SIZE}`
  if (color) url += `&color=${encodeURIComponent(color)}`
  return url
}

function loadIconResource(
  iconId: string,
  primaryColor: string,
): Promise<IconResource | null> {
  const duotone = isDuotoneIcon(iconId)
  // duotone 依赖注入主色，缓存键需带上颜色；其余图标按 id 缓存即可。
  const cacheKey = duotone ? `${iconId}|${primaryColor}` : iconId
  const cached = iconResourceCache.get(cacheKey)
  if (cached) return cached

  const promise = (async () => {
    const url = iconIdToUrl(iconId, duotone ? primaryColor : undefined)
    if (!url) return null

    try {
      const response = await fetch(url)
      if (!response.ok) return null
      const svg = await response.text()
      // Iconify 对未知图标会返回 "404" 文本。
      if (!svgIsRenderable(svg)) return null
      const colored = duotone || svgHasHardcodedColor(svg)
      return { blob: new Blob([svg], { type: 'image/svg+xml' }), colored }
    } catch {
      return null
    }
  })()

  iconResourceCache.set(cacheKey, promise)
  return promise
}

export async function loadIconBitmap(
  iconId: string,
  primaryColor = '#ffffff',
): Promise<LoadedIcon | null> {
  const resource = await loadIconResource(iconId, primaryColor)
  if (!resource) return null

  // `createImageBitmap(svgBlob)` 在各引擎间表现不稳定，因此用可移植的方式栅格化
  // SVG：通过 <img> 解码，按图标尺寸（保持宽高比）绘制到 canvas 上，再把该 canvas
  // 快照为位图。
  const objectUrl = URL.createObjectURL(resource.blob)
  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode()

    const naturalWidth = image.naturalWidth || ICON_RASTER_SIZE
    const naturalHeight = image.naturalHeight || ICON_RASTER_SIZE
    const scale = ICON_RASTER_SIZE / Math.max(naturalWidth, naturalHeight)
    const width = Math.max(1, Math.round(naturalWidth * scale))
    const height = Math.max(1, Math.round(naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, width, height)

    const bitmap = await createImageBitmap(canvas)
    return { bitmap, colored: resource.colored }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
