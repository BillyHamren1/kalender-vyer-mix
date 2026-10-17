// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/styles/operations-surfaces.css', 'utf8')
const actions = readFileSync('src/index.css', 'utf8')
const planning = readFileSync('src/styles/planning.css', 'utf8')
function rgbHsl(hsl: string) {
  const [h, s, l] = hsl.match(/[\d.]+/g)?.map(Number) ?? []
  if (h === undefined || s === undefined || l === undefined) throw new Error('Invalid HSL')
  const a = s / 100 * Math.min(l / 100, 1 - l / 100)
  return [0, 8, 4].map(n => {
    const k = (n + h / 30) % 12
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  })
}
function token(source: string, name: string) {
  const value = source.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]
  if (!value) throw new Error(`Missing ${name}`)
  return rgbHsl(value)
}
function luminance(rgb: number[]) {
  return rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
}
function contrast(a: number[], b: number[]) {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y)
  return (high + 0.05) / (low + 0.05)
}
describe('Operations text accessibility', () => {
  it('neutral Operations heading text meets AA on white cards', () => {
    const theme = planning.slice(planning.indexOf('.theme-purple {')).split('}')[0]
    expect(contrast(token(theme, 'foreground'), token(actions, 'card'))).toBeGreaterThanOrEqual(4.5)
  })
  it('neutral Operations heading text meets AA on the calendar header', () => {
    const theme = planning.slice(planning.indexOf('.theme-purple {')).split('}')[0]
    expect(contrast(token(theme, 'foreground'), token(css, 'ops-resource'))).toBeGreaterThanOrEqual(4.5)
  })
  for (const mode of [':root', '.dark']) {
    const block = css.slice(css.indexOf(`${mode} {`)).split('}')[0]
    for (const surface of ['ops-lane', 'ops-row-alt', 'ops-resource']) {
      it(`${mode} secondary labels meet WCAG AA on ${surface}`, () => {
        expect(contrast(token(block, 'ops-label'), token(block, surface))).toBeGreaterThanOrEqual(4.5)
      })
    }
    it(`${mode} unstaffed warnings meet WCAG AA`, () => {
      expect(contrast(token(block, 'ops-warning-text'), token(block, 'ops-lane'))).toBeGreaterThanOrEqual(4.5)
    })
  }
  for (const state of ['action', 'action-end', 'action-hover']) {
    it(`white action text meets WCAG AA at ${state}`, () => {
      expect(contrast(token(actions, 'action-foreground'), token(actions, state))).toBeGreaterThanOrEqual(4.5)
    })
  }
})