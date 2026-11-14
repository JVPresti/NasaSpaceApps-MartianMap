import { describe, expect, it } from 'vitest'
import { decodeHeightGrid } from './heightGrid.js'

describe('decodeHeightGrid', () => {
  it('converts raw samples to metres with scale and offset', () => {
    const raw = [
      [0, 100],
      [200, 65535],
    ]

    expect(decodeHeightGrid(raw, { scale: 0.5, offset: -100 })).toEqual([
      [-100, -50],
      [0, 32667.5],
    ])
  })

  it('returns a new grid and leaves the raw samples untouched', () => {
    const raw = [[1, 2], [3, 4]]
    const decoded = decodeHeightGrid(raw, { scale: 2, offset: 1 })

    expect(decoded).toEqual([[3, 5], [7, 9]])
    expect(decoded).not.toBe(raw)
    expect(decoded[0]).not.toBe(raw[0])
    decoded[0][0] = 99
    expect(raw).toEqual([[1, 2], [3, 4]])
  })
})
