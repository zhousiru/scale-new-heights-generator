import type { AvatarEditor } from '../../hooks/useAvatarEditor'
import { AdvancedSection } from '../../../shared/components/AdvancedSection'
import { HdrControls } from '../../../shared/components/HdrControls'
import { SliderField } from '../../../shared/components/SliderField'
import {
  DEFAULT_AVATAR_CONTROLS,
  AVATAR_FONT_SCALE_MAX,
  AVATAR_FONT_SCALE_MIN,
  AVATAR_FONT_WEIGHT_MAX,
  AVATAR_FONT_WEIGHT_MIN,
  AVATAR_FONT_WEIGHT_STEP,
  AVATAR_LINE_HEIGHT_MAX,
  AVATAR_LINE_HEIGHT_MIN,
  AVATAR_SIZE_MAX,
  AVATAR_SIZE_MIN,
} from '../../config/defaults'

type AvatarAdvancedControlsProps = Pick<AvatarEditor, 'controls' | 'updateControl'>

export function AvatarAdvancedControls({ controls, updateControl }: AvatarAdvancedControlsProps) {
  const defaults = DEFAULT_AVATAR_CONTROLS
  const hasAdvancedParams =
    controls.flash !== defaults.flash ||
    controls.flashStops !== defaults.flashStops ||
    controls.fontScale !== defaults.fontScale ||
    controls.fontWeight !== defaults.fontWeight ||
    controls.lineHeight !== defaults.lineHeight ||
    controls.size !== defaults.size

  return (
    <AdvancedSection defaultOpen={hasAdvancedParams}>
      <HdrControls
        flashStops={controls.flash ? controls.flashStops : 0}
        className="avatar-field field-slider"
        onFlashStopsChange={(value) => {
          updateControl('flashStops', value)
          updateControl('flash', value > 0)
        }}
      />

      <SliderField
        className="avatar-field"
        label="字号"
        min={AVATAR_FONT_SCALE_MIN}
        max={AVATAR_FONT_SCALE_MAX}
        step={0.01}
        value={controls.fontScale}
        defaultValue={DEFAULT_AVATAR_CONTROLS.fontScale}
        valueLabel={`${Math.round(controls.fontScale * 100)}%`}
        onValueChange={(value) => updateControl('fontScale', value)}
      />

      <SliderField
        className="avatar-field"
        label="字重"
        min={AVATAR_FONT_WEIGHT_MIN}
        max={AVATAR_FONT_WEIGHT_MAX}
        step={AVATAR_FONT_WEIGHT_STEP}
        value={controls.fontWeight}
        defaultValue={DEFAULT_AVATAR_CONTROLS.fontWeight}
        onValueChange={(value) => updateControl('fontWeight', value)}
      />

      <SliderField
        className="avatar-field"
        label="行距"
        min={AVATAR_LINE_HEIGHT_MIN}
        max={AVATAR_LINE_HEIGHT_MAX}
        step={0.01}
        value={controls.lineHeight}
        defaultValue={DEFAULT_AVATAR_CONTROLS.lineHeight}
        valueLabel={controls.lineHeight.toFixed(2)}
        onValueChange={(value) => updateControl('lineHeight', value)}
      />

      <SliderField
        className="avatar-field"
        label="尺寸"
        min={AVATAR_SIZE_MIN}
        max={AVATAR_SIZE_MAX}
        step={64}
        value={controls.size}
        defaultValue={DEFAULT_AVATAR_CONTROLS.size}
        onValueChange={(value) => updateControl('size', value)}
      />
    </AdvancedSection>
  )
}
