import { describe, expect, it } from 'vitest'
import { envelopePositionToTime, envelopeSliderMax, envelopeTimeToPosition } from './envelopeSliderScale'

describe('quadratic envelope slider scale', () => {
  for (const maximum of [20000, 22000, 30000]) {
    it(`preserves endpoints and exact millisecond values up to ${maximum}`, () => {
      expect(envelopePositionToTime(0, maximum)).toBe(0)
      expect(envelopePositionToTime(envelopeSliderMax, maximum)).toBe(maximum)
      expect(envelopeTimeToPosition(maximum / 4, maximum)).toBe(envelopeSliderMax / 2)
      for (let value = 0; value <= maximum; value++) {
        expect(envelopePositionToTime(envelopeTimeToPosition(value, maximum), maximum)).toBe(value)
      }
    })

    it(`provides finer short-time adjustment and monotonic travel up to ${maximum}`, () => {
      const shortStep = envelopePositionToTime(11, maximum) - envelopePositionToTime(10, maximum)
      const longStep = envelopePositionToTime(991, maximum) - envelopePositionToTime(990, maximum)
      expect(shortStep).toBeLessThanOrEqual(1)
      expect(longStep).toBeGreaterThanOrEqual(39)
      for (let position = 1; position <= envelopeSliderMax; position++) {
        expect(envelopePositionToTime(position, maximum)).toBeGreaterThanOrEqual(envelopePositionToTime(position - 1, maximum))
      }
    })
  }
})
