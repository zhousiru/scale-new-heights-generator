import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  STICKER_FLAVORS,
  normalizeAntialiasScale,
  normalizeRenderScale,
  normalizeStickerControls,
  type StickerControls,
  type StickerFlavor,
} from './config/defaults'
import {
  EMOJI_SYMBOL_FONT_DESCRIPTORS,
  type EmojiSymbolFontKey,
  LATIN_FONT_FAMILY,
  LATIN_FONT_PACKAGE_PATH,
} from './config/fonts'
import { stickerFontDescriptor } from './render/font'
import { renderSticker } from './render/sticker'
import {
  runtimeCanvasToPngBytes,
  setCanvasRuntime,
  type CanvasRuntime,
} from '../shared/render/runtime'
import { createNapiCanvasRuntime as createSharedNapiCanvasRuntime } from '../shared/render/node'
import { normalizeTextRenderInput, type TextRenderInput } from '../shared/render/input'
import {
  ULTRA_HDR_JPEG_EXTENSION,
  ULTRA_HDR_JPEG_MIME,
  encodeUltraHdrJpegBytes,
} from '../shared/hdr/ultraHdrJpeg'
import type { RenderIcon } from './render/types'
import { iconIdToUrl } from './utils/iconLoader'
import { isDuotoneIcon, svgHasHardcodedColor, svgIsRenderable } from './utils/iconSource'

export type StickerRenderInput = TextRenderInput<StickerControls>
export type { StickerFlavor }

/** 无头渲染的图片产物：字节流 + 内容类型 + 扩展名 */
export interface StickerImageResult {
  buffer: Buffer
  mime: string
  extension: string
}

export type StickerGeneratorRuntime = CanvasRuntime

export type NodeStickerFontFiles = Partial<Record<StickerFlavor | EmojiSymbolFontKey | 'inter', string>>

export interface RenderStickerNodeOptions {
  /**
   * 默认会从包内 public 目录加载字体；部署时如果字体被复制到别处，可以显式覆盖。
   */
  fontFiles?: NodeStickerFontFiles
  /** 是否加载 Iconify 前缀图标，无头机器人若禁止出网，可设为 false，默认 true */
  loadIcon?: boolean
  /** 输出像素倍率 */
  outputScale?: unknown
  /** 内部超采样抗锯齿倍率，支持 1-5x，默认跟随 controls，未配置时为 1.5 */
  antialiasScale?: unknown
  /** 限制输出图片最长边 */
  maxOutputEdge?: number
}

const registeredFontPaths = new Set<string>()
let defaultGeneratorPromise: Promise<StickerGenerator> | null = null

export function createNapiCanvasRuntime(): Promise<StickerGeneratorRuntime> {
  return createSharedNapiCanvasRuntime()
}

async function defaultGenerator(): Promise<StickerGenerator> {
  defaultGeneratorPromise ??= createNapiCanvasRuntime().then(
    (runtime) => new StickerGenerator(runtime),
  )
  return defaultGeneratorPromise
}

function candidateFontUrls(fileName: string): URL[] {
  return [
    new URL(`../../public/${fileName}`, import.meta.url),
    new URL(`../public/${fileName}`, import.meta.url),
    new URL(`./fonts/${fileName}`, import.meta.url),
  ]
}

function resolveBundledFontFile(fileName: string): string {
  const filePath = findBundledFontFile(fileName)
  if (filePath) return filePath

  throw new Error(
    `找不到字体文件 ${fileName}。请确认 npm 包包含 public 目录，或通过 fontFiles 显式传入字体路径。`,
  )
}

function findBundledFontFile(fileName: string): string {
  for (const url of candidateFontUrls(fileName)) {
    const filePath = fileURLToPath(url)
    if (existsSync(filePath)) return filePath
  }
  return ''
}

function resolveLatinFontFile(): string {
  try {
    const require = createRequire(import.meta.url)
    return require.resolve(LATIN_FONT_PACKAGE_PATH)
  } catch {
    return ''
  }
}

function resolveOptionalFontFile(
  explicitPath: string | undefined,
  bundledFile: string | undefined,
  systemFile: string | undefined,
): string {
  if (explicitPath) return explicitPath
  if (bundledFile) {
    const fontPath = findBundledFontFile(bundledFile)
    if (fontPath) return fontPath
  }
  return systemFile && existsSync(systemFile) ? systemFile : ''
}

function registerStickerFontsWithRuntime(
  runtime: StickerGeneratorRuntime,
  fontFiles: NodeStickerFontFiles = {},
): void {
  if (!runtime.registerFont) return

  for (const flavor of STICKER_FLAVORS) {
    const descriptor = stickerFontDescriptor(flavor)
    const fontPath = fontFiles[flavor] ?? resolveBundledFontFile(descriptor.file)
    if (registeredFontPaths.has(fontPath)) continue

    const registered = runtime.registerFont(fontPath, descriptor.family)
    if (!registered) {
      throw new Error(`注册字体失败：${fontPath}`)
    }
    registeredFontPaths.add(fontPath)
  }

  // 西文字体：Inter Bold 拉丁子集。缺失时静默跳过，退回系统 sans-serif。
  const interPath = fontFiles.inter ?? resolveLatinFontFile()
  if (interPath && !registeredFontPaths.has(interPath) && !runtime.hasFont?.(LATIN_FONT_FAMILY)) {
    if (runtime.registerFont(interPath, LATIN_FONT_FAMILY)) {
      registeredFontPaths.add(interPath)
    } else {
      console.warn(`[sticker] 字体注册失败：${LATIN_FONT_FAMILY}`)
    }
  }

  for (const descriptor of EMOJI_SYMBOL_FONT_DESCRIPTORS) {
    if (runtime.hasFont?.(descriptor.family)) continue
    const fontPath = resolveOptionalFontFile(
      fontFiles[descriptor.key],
      'bundledFile' in descriptor ? descriptor.bundledFile : undefined,
      'systemFile' in descriptor ? descriptor.systemFile : undefined,
    )
    if (!fontPath) continue
    if (registeredFontPaths.has(fontPath)) continue

    const registered = runtime.registerFont(fontPath, descriptor.family)
    if (!registered) {
      console.warn(`[sticker] fallback 字体注册失败：${descriptor.family}`)
      continue
    }
    registeredFontPaths.add(fontPath)
  }
}

export async function registerStickerFonts(
  fontFiles: NodeStickerFontFiles = {},
  runtime?: StickerGeneratorRuntime,
): Promise<void> {
  registerStickerFontsWithRuntime(runtime ?? (await createNapiCanvasRuntime()), fontFiles)
}

async function loadNodeIconImage(
  iconId: string,
  runtime: StickerGeneratorRuntime,
  primaryColor: string,
): Promise<RenderIcon | null> {
  const duotone = isDuotoneIcon(iconId)
  const url = iconIdToUrl(iconId, duotone ? primaryColor : undefined)
  if (!url) return null
  if (!runtime.loadImage) {
    throw new Error(
      '当前 canvas runtime 未提供 loadImage，无法加载前缀图标；可设置 loadIcon: false，或实现 runtime.loadImage。',
    )
  }

  // 与浏览器 iconLoader 一致：出网失败降级为「无图标」，不让整次渲染抛错。
  let svg: string
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    svg = await response.text()
  } catch {
    return null
  }
  if (!svgIsRenderable(svg)) return null

  const colored = duotone || svgHasHardcodedColor(svg)
  const bitmap = await runtime.loadImage(Buffer.from(svg))
  return { bitmap, colored }
}

export async function renderStickerToPngBytes(
  input: StickerRenderInput,
  options: RenderStickerNodeOptions = {},
): Promise<Uint8Array> {
  return await (await defaultGenerator()).renderPngBytes(input, options)
}

export async function renderStickerToBuffer(
  input: StickerRenderInput,
  options: RenderStickerNodeOptions = {},
): Promise<Buffer> {
  return await (await defaultGenerator()).renderBuffer(input, options)
}

/**
 * 渲染并按 `controls.flash` 选择输出格式：开启时导出 Ultra HDR JPEG gain map，
 * 否则导出 PNG。返回字节流及对应的 MIME 与扩展名。
 */
export async function renderStickerToImage(
  input: StickerRenderInput,
  options: RenderStickerNodeOptions = {},
): Promise<StickerImageResult> {
  return await (await defaultGenerator()).renderImage(input, options)
}

export class StickerGenerator {
  readonly runtime: StickerGeneratorRuntime

  constructor(runtime: StickerGeneratorRuntime) {
    this.runtime = runtime
    setCanvasRuntime(runtime)
  }

  registerFonts(fontFiles: NodeStickerFontFiles = {}): void {
    registerStickerFontsWithRuntime(this.runtime, fontFiles)
  }

  private async renderCanvas(
    input: StickerRenderInput,
    options: RenderStickerNodeOptions,
  ): Promise<{ canvas: OffscreenCanvas; controls: StickerControls }> {
    this.registerFonts(options.fontFiles)

    const controls = normalizeTextRenderInput(input, normalizeStickerControls)
    const icon =
      options.loadIcon === false
        ? null
        : await loadNodeIconImage(
            controls.icon,
            this.runtime,
            controls.envelope.colors[0] ?? '#ffffff',
          )
    const result = await renderSticker(controls, icon, {
      outputScale: normalizeRenderScale(options.outputScale),
      antialiasScale:
        options.antialiasScale === undefined
          ? undefined
          : normalizeAntialiasScale(options.antialiasScale),
      maxOutputEdge: options.maxOutputEdge,
    })
    return { canvas: result.canvas, controls }
  }

  async renderPngBytes(
    input: StickerRenderInput,
    options: RenderStickerNodeOptions = {},
  ): Promise<Uint8Array> {
    const { canvas } = await this.renderCanvas(input, options)
    return await runtimeCanvasToPngBytes(canvas)
  }

  async renderBuffer(
    input: StickerRenderInput,
    options: RenderStickerNodeOptions = {},
  ): Promise<Buffer> {
    const bytes = await this.renderPngBytes(input, options)
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  async renderImage(
    input: StickerRenderInput,
    options: RenderStickerNodeOptions = {},
  ): Promise<StickerImageResult> {
    const { canvas, controls } = await this.renderCanvas(input, options)
    if (controls.flash) {
      const bytes = encodeUltraHdrJpegBytes(canvas, { flashStops: controls.flashStops })
      return {
        buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        mime: ULTRA_HDR_JPEG_MIME,
        extension: ULTRA_HDR_JPEG_EXTENSION,
      }
    }
    const bytes = await runtimeCanvasToPngBytes(canvas)
    return {
      buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      mime: 'image/png',
      extension: 'png',
    }
  }
}
