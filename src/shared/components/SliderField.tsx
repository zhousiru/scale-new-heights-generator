import type { ComponentProps, ReactNode } from 'react'
import { Slider } from '../ui/slider'
import { cn } from '../utils/cn'
import { FieldLabel } from './FieldLabel'

interface SliderFieldProps
  extends Pick<ComponentProps<typeof Slider>, 'className' | 'step' | 'value' | 'onValueChange'>,
  Required<Pick<ComponentProps<typeof Slider>, 'min' | 'max'>> {
  label: ReactNode
  defaultValue: number
  valueLabel?: ReactNode
}

export function SliderField({
  className,
  label,
  max,
  min,
  step,
  value,
  defaultValue,
  valueLabel = value,
  onValueChange,
}: SliderFieldProps) {
  const isDirty = value !== defaultValue
  const handleReset = () => {
    onValueChange(defaultValue)
  }

  return (
    <div className={cn('field field-slider', className)}>
      <FieldLabel isDirty={isDirty} onReset={handleReset}>
        {label}
      </FieldLabel>
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={onValueChange}
      />
      <span className="field-value">{valueLabel}</span>
    </div>
  )
}
