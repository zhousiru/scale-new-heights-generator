import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  deriveDepthColor,
  randomGradientPair,
  randomVividColors,
} from '../utils/color'
import { generatedFileName } from '../../shared/utils/fileName'
import { copyImageToClipboard } from '../../shared/utils/clipboard'
import { saveToolSearch, searchRecordKey, toolUrl } from '../../shared/utils/tool'
import { useRenderedPreview } from '../../shared/hooks/useRenderedPreview'
import {
  cancelPendingPreviews,
  exportStickerBlob,
  renderStickerPreview,
} from '../worker/stickerWorker'
import {
  DEFAULT_STICKER_CONTROLS,
  defaultGradientAngle,
  type StickerControls,
  type StickerEnvelopeControls,
  STICKER_DEFAULT_OUTLINE_WIDTH,
  type StickerFlavor,
  type StickerPaddingControls,
} from '../config/defaults'
import { STICKER_PRESET_LIST, type StickerPreset } from '../config/presets'
import { controlsToSearch, searchToControls } from '../config/searchParams'

export type CopiedTarget = 'image' | 'link'

/** 简易模式 URL 参数名 */
const SIMPLE_MODE_PARAM = 'm'
/** 简易模式 URL 参数值 */
const SIMPLE_MODE_VALUE = 'simple'

function buildStickerUrl(controls: StickerControls, simpleMode = false): string {
  const search = controlsToSearch(controls)
  if (simpleMode) search[SIMPLE_MODE_PARAM] = SIMPLE_MODE_VALUE
  return toolUrl('sticker', search)
}

function hasStickerText(controls: StickerControls): boolean {
  return controls.text.length > 0
}

export function useStickerEditor() {
  const search = useSearch({ from: '__root__' })
  const navigate = useNavigate()
  const isSimpleMode = search[SIMPLE_MODE_PARAM] === SIMPLE_MODE_VALUE
  const currentSearchKey = useMemo(() => searchRecordKey(search), [search])
  const lastWrittenSearchKey = useRef(currentSearchKey)

  const [controls, setControls] = useState<StickerControls>(() =>
    searchToControls(search),
  )
  const [isExporting, setIsExporting] = useState(false)
  // 复制反馈：记录刚复制成功的按钮，短暂显示「已复制」。
  const [copied, setCopied] = useState<CopiedTarget | null>(null)
  const {
    renderControls,
    setRenderControls,
    preview,
    previewError,
    setPreviewError,
    isRendering,
  } = useRenderedPreview({
    controls,
    delayMs: 250,
    hasContent: hasStickerText,
    render: renderStickerPreview,
    cancel: cancelPendingPreviews,
  })

  useEffect(() => {
    saveToolSearch('sticker', controlsToSearch(controls))
  }, [controls])

  // URL query 发生外部变化（例如浏览器前进/后退）时，回灌到编辑状态。
  useEffect(() => {
    if (currentSearchKey === lastWrittenSearchKey.current) return

    const nextControls = searchToControls(search)
    setControls(nextControls)
    setRenderControls(nextControls)
    lastWrittenSearchKey.current = currentSearchKey
  }, [currentSearchKey, search, setRenderControls])

  // 同步控件 → URL query（用 replace，避免刷屏历史记录）。
  useEffect(() => {
    const nextSearch = controlsToSearch(renderControls)
    if (isSimpleMode) nextSearch[SIMPLE_MODE_PARAM] = SIMPLE_MODE_VALUE
    lastWrittenSearchKey.current = searchRecordKey(nextSearch)
    void navigate({
      to: '.',
      search: () => nextSearch,
      replace: true,
    })
  }, [renderControls, isSimpleMode, navigate])

  const hasText = hasStickerText(controls)

  const updateControl = <K extends keyof StickerControls>(
    key: K,
    value: StickerControls[K],
  ) => {
    setControls((c) => ({ ...c, [key]: value }))
  }

  const updateEnvelope = <K extends keyof StickerEnvelopeControls>(
    key: K,
    value: StickerEnvelopeControls[K],
  ) => {
    setControls((c) => ({ ...c, envelope: { ...c.envelope, [key]: value } }))
  }

  const updateFlavor = (flavor: StickerFlavor) => {
    setControls((c) => ({
      ...c,
      flavor,
      envelope: {
        ...c.envelope,
        outlineStrokeWidth: STICKER_DEFAULT_OUTLINE_WIDTH[flavor],
      },
    }))
  }

  const updatePadding = <K extends keyof StickerPaddingControls>(
    key: K,
    value: StickerPaddingControls[K],
  ) => {
    setControls((c) => ({ ...c, padding: { ...c.padding, [key]: value } }))
  }

  const randomizeColors = () => {
    setControls((c) => ({
      ...c,
      envelope: c.flavor === 'bs'
        ? {
            ...c.envelope,
            colors: randomGradientPair(
              c.envelope.colors[0] ?? '#76baf4',
            ),
            gradientAngle: defaultGradientAngle(c.icon),
          }
        : {
            ...c.envelope,
            colors: randomVividColors(c.envelope.colors[0] ?? '#76baf4'),
            gradientAngle: defaultGradientAngle(c.icon),
          },
    }))
  }

  const updateColorAt = (index: number, value: string) => {
    setControls((c) => {
      const colors = [...c.envelope.colors]
      colors[index] = value
      return { ...c, envelope: { ...c.envelope, colors } }
    })
  }

  const addColor = (at?: number) => {
    setControls((c) => {
      if (c.envelope.colors.length >= 3) return c
      const colors = [...c.envelope.colors]
      const index = at ?? colors.length
      // 新增色以相邻色块派生的深色作为初值，避免凭空插入突兀颜色。
      const seed = colors[index - 1] ?? colors[index] ?? '#76baf4'
      colors.splice(index, 0, deriveDepthColor(seed))
      return { ...c, envelope: { ...c.envelope, colors } }
    })
  }

  const removeColor = (index: number) => {
    setControls((c) => {
      if (c.envelope.colors.length <= 1) return c
      const colors = c.envelope.colors.filter((_, i) => i !== index)
      return { ...c, envelope: { ...c.envelope, colors } }
    })
  }

  const applyPreset = (preset: StickerPreset) => {
    setControls((c) => ({
      ...c,
      text: preset.text,
      flavor: preset.flavor ?? DEFAULT_STICKER_CONTROLS.flavor,
      icon: preset.icon ?? DEFAULT_STICKER_CONTROLS.icon,
      iconTilt: preset.iconTilt ?? DEFAULT_STICKER_CONTROLS.iconTilt,
      shadow: { ...c.shadow, opacity: preset.shadowOpacity },
      envelope: {
        ...c.envelope,
        colors: preset.colors,
        gradientAngle:
          preset.gradientAngle ?? DEFAULT_STICKER_CONTROLS.envelope.gradientAngle,
        outlineStrokeWidth: preset.outlineStrokeWidth,
        edgeWidth: preset.edgeWidth,
        edgeOpacity: preset.edgeOpacity,
      },
    }))
  }

  const applyPresetText = (value: string) => {
    const preset = STICKER_PRESET_LIST.find((p) => p.text === value)
    if (preset) applyPreset(preset)
  }

  const handleExport = async () => {
    if (!hasText) return
    setIsExporting(true)
    try {
      const result = await exportStickerBlob(controls)
      const url = URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = generatedFileName('sticker', controls.text, result.extension)
      a.click()
      URL.revokeObjectURL(url)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '导出失败。'
      setPreviewError(message)
    } finally {
      setIsExporting(false)
    }
  }

  const flashCopied = (which: CopiedTarget) => {
    setCopied(which)
    setTimeout(() => setCopied((prev) => (prev === which ? null : prev)), 1500)
  }

  const handleCopyImage = async () => {
    if (!hasText) return
    try {
      const result = await exportStickerBlob(controls)
      const copy = await copyImageToClipboard(result.blob, result.mime)
      if (copy.ok) {
        flashCopied('image')
      } else {
        setPreviewError(copy.message ?? '复制失败。')
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '复制失败。'
      setPreviewError(message)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(buildStickerUrl(controls, true))
      flashCopied('link')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '复制链接失败。'
      setPreviewError(message)
    }
  }

  return {
    controls,
    preview,
    previewError,
    isExporting,
    isRendering,
    copied,
    hasText,
    isSimpleMode,
    shareUrl: buildStickerUrl(controls, true),
    editorUrl: buildStickerUrl(controls),
    updateControl,
    updateFlavor,
    updateEnvelope,
    updatePadding,
    randomizeColors,
    updateColorAt,
    addColor,
    removeColor,
    applyPresetText,
    handleExport,
    handleCopyImage,
    handleCopyLink,
    exportLabel: controls.flash ? '导出 HDR 图' : '导出 PNG',
  }
}
