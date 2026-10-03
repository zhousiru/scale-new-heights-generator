import type { StickerEditor } from '../../hooks/useStickerEditor'
import { AdvancedSection } from '../../../shared/components/AdvancedSection'
import { Button } from '../../../shared/ui/button'
import { FieldLabel } from '../../../shared/components/FieldLabel'
import { HdrControls } from '../../../shared/components/HdrControls'
import { SliderField } from '../../../shared/components/SliderField'
import {
  DEFAULT_STICKER_CONTROLS,
  STICKER_DEFAULT_OUTLINE_WIDTH,
  STICKER_DEFAULT_MERGE_GRADIENT,
} from '../../config/defaults'

type StickerAdvancedControlsProps = Pick<
  StickerEditor,
  'controls' | 'updateControl' | 'updateEnvelope' | 'updatePadding'
>

export function StickerAdvancedControls({
  controls,
  updateControl,
  updateEnvelope,
  updatePadding,
}: StickerAdvancedControlsProps) {
  const defaultOutlineWidth = STICKER_DEFAULT_OUTLINE_WIDTH[controls.flavor]
  const defaultMergeGradient = STICKER_DEFAULT_MERGE_GRADIENT[controls.flavor]
  const defaults = DEFAULT_STICKER_CONTROLS
  const hasAdvancedParams =
    controls.mergeGradient !== defaultMergeGradient ||
    controls.iconTilt !== defaults.iconTilt ||
    controls.tilt !== defaults.tilt ||
    controls.peak !== defaults.peak ||
    controls.flash !== defaults.flash ||
    controls.flashStops !== defaults.flashStops ||
    controls.antialiasScale !== defaults.antialiasScale ||
    controls.envelope.outlineStrokeWidth !== defaultOutlineWidth ||
    controls.padding.x !== defaults.padding.x ||
    controls.padding.y !== defaults.padding.y ||
    controls.lineHeight !== defaults.lineHeight

  return (
    <AdvancedSection defaultOpen={hasAdvancedParams}>
      <div className="field">
        <FieldLabel
          isDirty={
            controls.iconTilt !== DEFAULT_STICKER_CONTROLS.iconTilt ||
            controls.tilt !== DEFAULT_STICKER_CONTROLS.tilt ||
            controls.peak !== DEFAULT_STICKER_CONTROLS.peak ||
            controls.mergeGradient !== defaultMergeGradient
          }
          onReset={() => {
            updateControl('iconTilt', DEFAULT_STICKER_CONTROLS.iconTilt)
            updateControl('tilt', DEFAULT_STICKER_CONTROLS.tilt)
            updateControl('peak', DEFAULT_STICKER_CONTROLS.peak)
            updateControl('mergeGradient', defaultMergeGradient)
          }}
        >
          变换
        </FieldLabel>
        <div className="toggle-group">
          <Button
            className="peak-toggle"
            variant="secondary"
            size="sm"
            active={controls.iconTilt}
            type="button"
            aria-pressed={controls.iconTilt}
            title="图标倾斜（开启时前缀图标跟随字面旋转/斜切）"
            onClick={() => updateControl('iconTilt', !controls.iconTilt)}
          >
            {controls.iconTilt ? '图标倾斜' : '图标直立'}
          </Button>
          <Button
            className="peak-toggle"
            variant="secondary"
            size="sm"
            active={controls.tilt}
            type="button"
            aria-pressed={controls.tilt}
            title="文本倾斜（开启应用字面固有的旋转/斜切，关闭则文字直立）"
            onClick={() => updateControl('tilt', !controls.tilt)}
          >
            {controls.tilt ? '文本倾斜' : '文本直立'}
          </Button>
          <Button
            className="peak-toggle"
            variant="secondary"
            size="sm"
            active={controls.peak}
            type="button"
            aria-pressed={controls.peak}
            title="错位攀登（开启为高低错落效果，关闭则对齐平铺）"
            onClick={() => updateControl('peak', !controls.peak)}
          >
            {controls.peak ? '错位攀登' : '对齐平铺'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            active={controls.mergeGradient}
            type="button"
            aria-pressed={controls.mergeGradient}
            title="开启后图标与文字共用一段渐变；关闭时分别显示完整渐变"
            onClick={() => updateControl('mergeGradient', !controls.mergeGradient)}
          >
            合并渐变
          </Button>
        </div>
      </div>

      <HdrControls
        flashStops={controls.flash ? controls.flashStops : 0}
        className="field-slider"
        onFlashStopsChange={(value) => {
          updateControl('flashStops', value)
          updateControl('flash', value > 0)
        }}
      />

      <SliderField
        label="抗锯齿"
        min={1}
        max={5}
        step={0.1}
        value={controls.antialiasScale}
        defaultValue={DEFAULT_STICKER_CONTROLS.antialiasScale}
        valueLabel={`${controls.antialiasScale.toFixed(1)}x`}
        onValueChange={(value) => updateControl('antialiasScale', value)}
      />

      <SliderField
        label="描边厚度"
        min={0}
        max={48}
        value={controls.envelope.outlineStrokeWidth}
        defaultValue={STICKER_DEFAULT_OUTLINE_WIDTH[controls.flavor]}
        onValueChange={(value) => updateEnvelope('outlineStrokeWidth', value)}
      />

      <SliderField
        label="左右边距"
        min={0}
        max={120}
        value={controls.padding.x}
        defaultValue={DEFAULT_STICKER_CONTROLS.padding.x}
        onValueChange={(value) => updatePadding('x', value)}
      />

      <SliderField
        label="上下边距"
        min={0}
        max={120}
        value={controls.padding.y}
        defaultValue={DEFAULT_STICKER_CONTROLS.padding.y}
        onValueChange={(value) => updatePadding('y', value)}
      />

      <SliderField
        label="行高"
        min={0.8}
        max={2}
        step={0.05}
        value={controls.lineHeight}
        defaultValue={DEFAULT_STICKER_CONTROLS.lineHeight}
        valueLabel={controls.lineHeight.toFixed(2)}
        onValueChange={(value) => updateControl('lineHeight', value)}
      />
    </AdvancedSection>
  )
}
