import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '@iconify/react'
import { AngleKnob } from '../../../shared/components/AngleKnob'
import { Button } from '../../../shared/ui/button'
import { Select } from '../../../shared/ui/select'
import {
  defaultGradientAngle,
  STICKER_FLAVORS,
  type StickerControls,
  type StickerEnvelopeControls,
} from '../../config/defaults'
import {
  STICKER_PRESET_GROUPS,
  STICKER_PRESET_LIST,
  type StickerPreset,
} from '../../config/presets'
import { colorInputValue } from '../../utils/color'
import { ensureStickerFontLoaded, installStickerFontSources, stickerFontDescriptor } from '../../render/font'
import { loadStickerFontSources } from '../../worker/fontStylesheet'

interface PresetInkBounds { height: number; top: number }

async function loadPresetFonts(): Promise<void> {
  await Promise.all(STICKER_FLAVORS.map(async (flavor) => {
    installStickerFontSources(flavor, await loadStickerFontSources(flavor))
    const text = STICKER_PRESET_LIST.filter(preset => preset.flavor === flavor).map(preset => preset.text).join('')
    await ensureStickerFontLoaded(flavor, text)
  }))
}

let presetMeasurementContext: CanvasRenderingContext2D | null = null

function measurePresetInk(element: HTMLElement): PresetInkBounds | undefined {
  presetMeasurementContext ??= document.createElement('canvas').getContext('2d')
  if (!presetMeasurementContext) return
  const style = getComputedStyle(element)
  presetMeasurementContext.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  const metrics = presetMeasurementContext.measureText(element.textContent ?? '')
  return {
    height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
    top: (parseFloat(style.lineHeight) - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2
      + metrics.fontBoundingBoxAscent - metrics.actualBoundingBoxAscent,
  }
}

interface StickerPresetToolbarProps {
  controls: StickerControls
  updateEnvelope: <K extends keyof StickerEnvelopeControls>(
    key: K,
    value: StickerEnvelopeControls[K],
  ) => void
  randomizeColors: () => void
  updateColorAt: (index: number, value: string) => void
  addColor: (at?: number) => void
  removeColor: (index: number) => void
  applyPresetText: (value: string) => void
}

export function StickerPresetToolbar({
  controls,
  updateEnvelope,
  randomizeColors,
  updateColorAt,
  addColor,
  removeColor,
  applyPresetText,
}: StickerPresetToolbarProps) {
  const [selectedPresetText, setSelectedPresetText] = useState('')
  const [fontsReady, setFontsReady] = useState(false)
  const activePreset = STICKER_PRESET_LIST.find((p) => p.text === selectedPresetText)
  const presetDirty =
    activePreset !== undefined &&
    (controls.flavor !== activePreset.flavor ||
      controls.icon !== activePreset.icon ||
      controls.iconTilt !== activePreset.iconTilt ||
      controls.envelope.gradientAngle !== activePreset.gradientAngle ||
      controls.envelope.outlineStrokeWidth !== activePreset.outlineStrokeWidth ||
      controls.envelope.colors.join(',') !== activePreset.colors.join(','))

  return (
    <div className="toolbar-row">
      <div className="preset-cell">
        <Select
          className="preset-select"
          contentClassName="preset-select-content"
          viewportClassName="preset-select-viewport"
          value={selectedPresetText}
          placeholder="选择预设文案…"
          onOpenChange={(open) => {
            if (open) void loadPresetFonts().then(() => setFontsReady(true)).catch(() => undefined)
          }}
          groups={Object.entries(STICKER_PRESET_GROUPS).map(([group, presets]) => ({
            label: group,
            options: presets.map((preset) => ({
              value: preset.text,
              label: <PresetOption preset={preset} fontsReady={fontsReady} />,
            })),
          }))}
          onValueChange={(value) => {
            setSelectedPresetText(value)
            applyPresetText(value)
          }}
        />
        {presetDirty && (
          <Button
            className="preset-reset"
            variant="secondary"
            size="sm"
            type="button"
            title="重置为预设初始参数"
            onClick={() => applyPresetText(activePreset.text)}
          >
            重置
          </Button>
        )}
      </div>

      <div className="color-pair">
        {controls.envelope.colors.map((color, index) => (
          <Fragment key={index}>
            {controls.envelope.colors.length < 3 && (
              <button
                className="swatch-insert"
                type="button"
                aria-label="在此处插入颜色"
                title="在此处插入颜色"
                onClick={() => addColor(index)}
              >
                <Icon icon="tabler:circle-dashed-plus" />
              </button>
            )}
            <div className="color-swatch" style={{ backgroundColor: color }}>
              <input
                type="color"
                value={colorInputValue(color)}
                onChange={(e) => updateColorAt(index, e.target.value)}
              />
              {controls.envelope.colors.length > 1 && (
                <Button
                  className="swatch-remove"
                  variant="secondary"
                  size="icon"
                  type="button"
                  title="移除该颜色"
                  onClick={() => removeColor(index)}
                >
                  ×
                </Button>
              )}
            </div>
          </Fragment>
        ))}
        {controls.envelope.colors.length < 3 && (
          <button
            className="swatch-insert"
            type="button"
            aria-label="在末尾添加颜色"
            title="在末尾添加颜色"
            onClick={() => addColor(controls.envelope.colors.length)}
          >
            <Icon icon="tabler:circle-dashed-plus" />
          </button>
        )}
      </div>

      <Button
        className="icon-btn"
        variant="secondary"
        size="icon"
        type="button"
        title="随机同色系/邻色系配色"
        onClick={randomizeColors}
      >
        🎲
      </Button>
      <AngleKnob
        value={controls.envelope.gradientAngle}
        defaultValue={activePreset ? activePreset.gradientAngle : defaultGradientAngle(controls.icon)}
        onChange={(value) => updateEnvelope('gradientAngle', value)}
      />
    </div>
  )
}

function PresetOption({
  preset,
  fontsReady,
}: {
  preset: StickerPreset
  fontsReady: boolean
}) {
  const textRef = useRef<HTMLSpanElement>(null)
  const [ink, setInk] = useState<PresetInkBounds>()
  useLayoutEffect(() => {
    if (textRef.current) setInk(measurePresetInk(textRef.current))
  }, [fontsReady, preset.text])
  return (
    <span
      className={`preset-option${preset.icon ? '' : ' preset-option-text-only'}`}
      style={{
        '--preset-gradient': `linear-gradient(${preset.gradientAngle}deg, ${preset.colors.join(', ')})`,
      } as CSSProperties}
    >
      {preset.icon ? (
        <Icon
          className="preset-option-icon"
          icon={preset.icon}
          mode="mask"
        />
      ) : null}
      <span
        ref={textRef}
        className={`preset-option-text preset-option-text-${preset.flavor}`}
        style={{
          fontFamily: `"${stickerFontDescriptor(preset.flavor).family}", sans-serif`,
          ...(ink ? { backgroundSize: `100% ${ink.height}px`, backgroundPosition: `0 ${ink.top}px` } : {}),
        }}
      >{preset.text}</span>
      <span className="preset-option-gradient" />
    </span>
  )
}
