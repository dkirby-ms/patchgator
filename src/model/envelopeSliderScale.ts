export const envelopeSliderMax = 1000

/** Maps milliseconds to a quadratic slider position, giving short times more travel. */
export function envelopeTimeToPosition(milliseconds: number, maximum: number) {
  return Math.sqrt(milliseconds / maximum) * envelopeSliderMax
}

/** Maps slider travel to whole milliseconds; zero and the maximum remain exact. */
export function envelopePositionToTime(position: number, maximum: number) {
  return Math.round((position / envelopeSliderMax) ** 2 * maximum)
}
