import { describe, expect, it } from 'vitest'
import { colorInputValue, deriveDepthColor, deriveHighlightColor } from './color'

describe('CSS color input', () => {
  it.each([
    ['#9f6', '#99ff66'],
    ['#1234', '#11223344'],
    ['rgb(10, 20, 30)', '#0a141e'],
    ['RGB(100% 0% 50% / 50%)', '#ff008080'],
    ['hsl(120, 100%, 50%)', '#00ff00'],
    ['hsl(0.5turn 100% 50% / 25%)', '#00ffff40'],
    ['rgb(300 -20 128)', '#ff0080'],
    ['not-a-color', '#000000'],
  ])('normalizes %s to %s', (input, hex) => {
    expect(colorInputValue(input)).toBe(hex)
  })

  it('preserves the calibrated companion colors after replacing the parser', () => {
    expect(deriveDepthColor('#4c9acc')).toBe('#367aa5')
    expect(deriveHighlightColor('#4c9acc')).toBe('#61a8d6')
  })
})
