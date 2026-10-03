import { Button } from '../ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog'
import { cn } from '../utils/cn'
import { FieldLabel } from './FieldLabel'
import { SliderField } from './SliderField'
import {
  DEFAULT_FLASH_STOPS,
  ENABLED_FLASH_STOPS,
  FLASH_STOPS_MAX,
  FLASH_STOPS_MIN,
  FLASH_STOPS_STEP,
} from '../config/hdr'

interface HdrControlsProps {
  flashStops: number
  label?: string
  className?: string
  onFlashStopsChange: (value: number) => void
}

export function HdrControls({
  flashStops,
  label = '色彩增益',
  className,
  onFlashStopsChange,
}: HdrControlsProps) {
  if (flashStops === 0) {
    return (
      <div className={cn('field', className)}>
        <FieldLabel>{label}</FieldLabel>
        <Dialog>
          <DialogTrigger asChild>
            <Button
              className="field-action"
              variant="secondary"
              size="sm"
              type="button"
            >
              启用 HDR 亮度
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>开启色彩增益？</DialogTitle>
            <DialogDescription>
              色彩增益（HDR）会让图片在支持的屏幕上明显变亮。提醒：不要高频发送打扰他人；日常建议控制在 +1 EV 以内。
            </DialogDescription>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary" size="sm" type="button">
                  取消
                </Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  size="sm"
                  type="button"
                  onClick={() => onFlashStopsChange(ENABLED_FLASH_STOPS)}
                >
                  开启
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <SliderField
      className={className}
      label={label}
      min={FLASH_STOPS_MIN}
      max={FLASH_STOPS_MAX}
      step={FLASH_STOPS_STEP}
      value={flashStops}
      defaultValue={DEFAULT_FLASH_STOPS}
      valueLabel={formatEv(flashStops)}
      onValueChange={onFlashStopsChange}
    />
  )
}

function formatEv(value: number): string {
  return `+${Number(value.toFixed(2))} EV`
}
