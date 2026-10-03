import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

interface AngleKnobProps {
  value: number
  defaultValue: number
  label?: string
  signed?: boolean
  onChange: (angle: number) => void
}

/** 角度旋钮 SVG 视口尺寸 */
const SIZE = 40
/** 角度旋钮中心点坐标 */
const CENTER = SIZE / 2
/** 角度旋钮轨道半径 */
const TRACK_R = CENTER - 3
/** 角度旋钮拖拽点半径 */
const DOT_R = 3.5

function angleFromPointer(cx: number, cy: number, clientX: number, clientY: number): number {
  const dx = clientX - cx
  const dy = clientY - cy
  return ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360
}

export function AngleKnob({
  value,
  defaultValue,
  label = '渐变角度',
  signed = false,
  onChange,
}: AngleKnobProps) {
  const wrapRef = useRef<HTMLButtonElement | null>(null)
  const knobRef = useRef<SVGSVGElement | null>(null)
  const normalizedValue = normalizeAngle(value)
  const displayValue = signed ? circularToSigned(normalizedValue) : normalizedValue

  const changeBy = (delta: number) => {
    emitValue(normalizeAngle(normalizedValue + delta))
  }

  const emitValue = (angle: number) => {
    onChange(signed ? circularToSigned(angle) : angle)
  }

  const startDrag = (e: ReactPointerEvent) => {
    e.preventDefault()
    const wrap = wrapRef.current
    const knob = knobRef.current
    if (!wrap || !knob) return
    wrap.focus()

    const rect = knob.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2

    emitValue(normalizeAngle(angleFromPointer(cx, cy, e.clientX, e.clientY)))

    const onMove = (ev: globalThis.PointerEvent) => {
      ev.preventDefault()
      emitValue(normalizeAngle(angleFromPointer(cx, cy, ev.clientX, ev.clientY)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    const step = event.shiftKey ? 15 : 1
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault()
      changeBy(step)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      changeBy(-step)
    } else if (event.key === 'Home') {
      event.preventDefault()
      onChange(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      onChange(signed ? 180 : 359)
    }
  }

  const rad = ((normalizedValue - 90) * Math.PI) / 180
  const dotX = CENTER + (TRACK_R - DOT_R) * Math.cos(rad)
  const dotY = CENTER + (TRACK_R - DOT_R) * Math.sin(rad)
  const lineX = CENTER + (TRACK_R - 7) * Math.cos(rad)
  const lineY = CENTER + (TRACK_R - 7) * Math.sin(rad)

  const isDirty = value !== defaultValue
  const handleReset = () => {
    onChange(defaultValue)
  }

  return (
    <button
      ref={wrapRef}
      type="button"
      className="knob-wrap"
      title={`${label} ${displayValue}°${isDirty ? '\n双击重置' : ''}`}
      aria-label={label}
      onPointerDown={startDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={handleReset}
    >
      <svg
        ref={knobRef}
        className="knob"
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
      >
        <circle
          className="knob-track"
          cx={CENTER}
          cy={CENTER}
          r={TRACK_R}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        />
        <line
          className="knob-hand"
          x1={CENTER}
          y1={CENTER}
          x2={lineX}
          y2={lineY}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth={2}
        />
        <circle className="knob-center" cx={CENTER} cy={CENTER} r={2.25} />
        <circle className="knob-dot" cx={dotX} cy={dotY} r={DOT_R} />
      </svg>
      <span className="knob-value">{displayValue}°</span>
    </button>
  )
}

function normalizeAngle(value: number): number {
  return ((Math.round(value) % 360) + 360) % 360
}

function circularToSigned(value: number): number {
  const angle = normalizeAngle(value)
  return angle > 180 ? angle - 360 : angle
}
