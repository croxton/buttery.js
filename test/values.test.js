import { describe, it, expect, vi } from 'vitest'
import eases from 'eases'
import {
  isAbsoluteValue,
  parseAbsoluteValue,
  parsePropValue,
  hasSameStructure,
  isRelativeValue,
  relativeToAbsoluteValue,
  validate,
  getProgress,
  computeProps
} from '../lib/values.js'

// Fails if validate tries to convert a relative value
const noAbsolute = () => { throw new Error('unexpected relative value') }

/**
 * Validates data with an absolute range.
 * @param {Object} props
 * @param {Object} extra
 * @returns {Object}
 */
const validData = (props, extra = {}) => validate({ from: '0px', to: '100px', props, ...extra }, noAbsolute)

/**
 * A fake element with a fixed bounding rect.
 * @param {Number} top
 * @param {Number} height
 * @returns {Object}
 */
const fakeElem = (top, height) => ({ getBoundingClientRect: () => ({ top, height }) })

describe('absolute values', () => {

  it.each([
    ['100px', true],
    [100, true],
    ['-1.5em', true],
    ['top-bottom', false],
    ['px', false]
  ])('isAbsoluteValue(%o) is %o', (value, expected) => {
    expect(isAbsoluteValue(value)).toBe(expected)
  })

  it('parses value and unit', () => {
    expect(parseAbsoluteValue('120px')).toEqual({ value: 120, unit: 'px' })
    expect(parseAbsoluteValue(5)).toEqual({ value: 5, unit: '' })
  })

})

describe('isRelativeValue', () => {

  it.each([
    ['top-bottom', true],
    ['middle-top', true],
    ['50%-40%', true],
    ['top-50%', true],
    ['100px', false],
    ['top', false],
    ['Top-bottom', false],
    ['top-bottom-top', false]
  ])('isRelativeValue(%o) is %o', (value, expected) => {
    expect(isRelativeValue(value)).toBe(expected)
  })

})

describe('parsePropValue', () => {

  it('parses a single number with a unit', () => {
    expect(parsePropValue('-100px')).toEqual({ numbers: [{ value: -100, unit: 'px' }], parts: ['', ''] })
  })

  it('parses a number without a unit', () => {
    expect(parsePropValue(1)).toEqual({ numbers: [{ value: 1, unit: '' }], parts: ['', ''] })
  })

  it('parses decimals, including a leading dot', () => {
    expect(parsePropValue('.5').numbers[0].value).toBe(0.5)
    expect(parsePropValue('1.25rem').numbers[0]).toEqual({ value: 1.25, unit: 'rem' })
  })

  it('parses several numbers and keeps the text around them', () => {
    expect(parsePropValue('0 -100px')).toEqual({
      numbers: [{ value: 0, unit: '' }, { value: -100, unit: 'px' }],
      parts: ['', ' ', '']
    })
  })

  it('does not take the 3 of translate3d for a number', () => {
    const parsed = parsePropValue('translate3d(0, 10px, 0)')

    expect(parsed.numbers.map((n) => n.value)).toEqual([0, 10, 0])
    expect(parsed.parts[0]).toBe('translate3d(')
  })

  it('parses functions', () => {
    const parsed = parsePropValue('translateY(10px) rotate(5deg)')

    expect(parsed.numbers).toEqual([{ value: 10, unit: 'px' }, { value: 5, unit: 'deg' }])
    expect(parsed.parts).toEqual(['translateY(', ') rotate(', ')'])
  })

  it('does not read hex colors as numbers', () => {
    expect(parsePropValue('#fff')).toBeNull()
  })

  it('returns null without a number', () => {
    expect(parsePropValue('none')).toBeNull()
  })

  it('normalises whitespace', () => {
    expect(parsePropValue('  0   10px ').parts).toEqual(['', ' ', ''])
  })

})

describe('hasSameStructure', () => {

  it('is true for the same text around the same number of values', () => {
    expect(hasSameStructure(parsePropValue('0 0px'), parsePropValue('10px  -5px'))).toBe(true)
  })

  it('is false for a different number of values', () => {
    expect(hasSameStructure(parsePropValue('0'), parsePropValue('0 1'))).toBe(false)
  })

  it('is false for different text', () => {
    expect(hasSameStructure(parsePropValue('translateX(0)'), parsePropValue('translateY(10px)'))).toBe(false)
  })

})

describe('relativeToAbsoluteValue', () => {

  // Element 200px tall, 1000px from the top of the document, viewport 800px
  const elem = fakeElem(1000 - 300, 200)
  const scrollTop = 300
  const vh = 800

  it.each([
    ['top-top', 1000],
    ['top-bottom', 200],
    ['top-middle', 600],
    ['middle-top', 1100],
    ['bottom-top', 1200],
    ['bottom-bottom', 400],
    ['50%-40%', 1100 - 320],
    ['0%-100%', 200],
    ['top-0%', 1000]
  ])('%s is %s', (value, expected) => {
    expect(relativeToAbsoluteValue(value, elem, scrollTop, vh)).toBe(`${ expected }px`)
  })

})

describe('validate', () => {

  it('sets defaults', () => {
    const data = validData({})

    expect(data).toMatchObject({ direct: false, track: true, timeline: 'auto', hasCallbacks: false, propKeys: [] })
    expect(data.inside).toBeTypeOf('function')
    expect(data.from).toEqual({ value: 0, unit: 'px' })
    expect(data.to).toEqual({ value: 100, unit: 'px' })
  })

  it('remembers if callbacks were given', () => {
    expect(validData({}, { inside: () => {} }).hasCallbacks).toBe(true)
  })

  it('does not change the input', () => {
    const props = { opacity: { from: 0, to: 1 } }
    const input = { from: '0px', to: '100px', props }

    validate(input, noAbsolute)

    expect(input).toEqual({ from: '0px', to: '100px', props: { opacity: { from: 0, to: 1 } } })
  })

  it('converts relative values when there is an elem', () => {
    const toAbsolute = vi.fn((value) => (value === 'top-bottom' ? '10px' : '20px'))
    const elem = document.createElement('div')
    const data = validate({ from: 'top-bottom', to: 'bottom-top', elem, props: {} }, toAbsolute)

    expect(toAbsolute).toHaveBeenCalledWith('top-bottom', elem)
    expect(data.from.value).toBe(10)
    expect(data.to.value).toBe(20)
  })

  it('parses props', () => {
    const { props } = validData({ y: { from: '0', via: '50px', to: '-100px', timing: 'quadIn' } })

    expect(props.y).toMatchObject({ from: [0], via: [50], to: [-100], units: ['px'], parts: ['', ''] })
    expect(props.y.timing).toBe(eases.quadIn)
  })

  it('takes the unit of to or via when from has none', () => {
    expect(validData({ a: { from: '0 0', to: '0 10px' } }).props.a.units).toEqual(['', 'px'])
    expect(validData({ a: { from: '0', via: '5em', to: '0' } }).props.a.units).toEqual(['em'])
  })

  it('defaults to linear timing and accepts a function', () => {
    const fn = (t) => t * t

    expect(validData({ a: { from: 0, to: 1 } }).props.a.timing).toBe(eases.linear)
    expect(validData({ a: { from: 0, to: 1, timing: fn } }).props.a.timing).toBe(fn)
  })

  it.each([
    [{ to: '1px' }, 'Missing property `from`'],
    [{ from: '1px' }, 'Missing property `to`'],
    [{ from: '0px', to: '1px', inside: 1 }, 'Property `inside` must be undefined or a function'],
    [{ from: '0px', to: '1px', outside: 'x' }, 'Property `outside` must be undefined or a function'],
    [{ from: '0px', to: '1px', direct: 'yes' }, 'Property `direct` must be undefined, a boolean or a DOM element/node'],
    [{ from: '0px', to: '1px', direct: true }, 'Property `elem` is required when `direct` is true'],
    [{ from: '0px', to: '1px', track: 'yes' }, 'Property `track` must be undefined or a boolean'],
    [{ from: '0px', to: '1px', props: 'x' }, 'Property `props` must be undefined or an object'],
    [{ from: '0px', to: '1px', timeline: 'always' }, 'Property `timeline` must be undefined'],
    [{ from: 'top-bottom', to: '1px' }, 'Property `from` must be a absolute value when no `elem` has been provided'],
    [{ from: '0px', to: 'top-bottom' }, 'Property `to` must be a absolute value when no `elem` has been provided'],
    [{ from: '0px', to: '1px', props: { a: { from: 'x', to: 1 } } }, 'Property `from` of prop must contain a number'],
    [{ from: '0px', to: '1px', props: { a: { from: 0, to: 'x' } } }, 'Property `to` of prop must contain a number'],
    [{ from: '0px', to: '1px', props: { a: { from: 0, via: 'x', to: 1 } } }, 'Property `via` of prop must contain a number'],
    [{ from: '0px', to: '1px', props: { a: { from: '0', to: '0 1' } } }, 'Properties `from` and `to` of prop `a`'],
    [{ from: '0px', to: '1px', props: { a: { from: '0', via: 'x(1)', to: '1' } } }, 'Property `via` of prop `a`'],
    [{ from: '0px', to: '1px', props: { a: { from: 0, to: 1, timing: 5 } } }, 'Property `timing` of prop must be undefined, a string or a function'],
    [{ from: '0px', to: '1px', props: { a: { from: 0, to: 1, timing: 'wobble' } } }, 'Unknown timing']
  ])('throws for %o', (data, message) => {
    expect(() => validate(data, noAbsolute)).toThrow(message)
  })

})

describe('getProgress', () => {

  const data = validData({})

  it.each([
    [-50, -50, 0],
    [0, 0, 0],
    [25, 25, 0.25],
    [100, 100, 1],
    [150, 150, 1]
  ])('at %s is %s%% (time %s)', (scrollTop, percentage, time) => {
    expect(getProgress(data, scrollTop)).toEqual({ precisePercentage: percentage, normalizedTime: time })
  })

  it('handles a zero-length range without dividing by zero', () => {
    const empty = validate({ from: '100px', to: '100px', props: {} }, noAbsolute)

    expect(getProgress(empty, 99)).toEqual({ precisePercentage: 0, normalizedTime: 0 })
    expect(getProgress(empty, 100)).toEqual({ precisePercentage: 100, normalizedTime: 1 })
  })

  it('handles a reversed range', () => {
    const reversed = validate({ from: '100px', to: '0px', props: {} }, noAbsolute)

    expect(getProgress(reversed, 25).normalizedTime).toBe(0.75)
  })

})

describe('computeProps', () => {

  it('interpolates linearly', () => {
    const data = validData({ opacity: { from: 0, to: 1 }, y: { from: '0px', to: '-100px' } })

    expect(computeProps(data, 50).props).toEqual({ opacity: '0.5', y: '-50px' })
  })

  it('clamps outside the range', () => {
    const data = validData({ opacity: { from: 0, to: 1 } })

    expect(computeProps(data, -10).props.opacity).toBe('0')
    expect(computeProps(data, 200).props.opacity).toBe('1')
  })

  it('rebuilds values with several numbers', () => {
    const data = validData({ transform: { from: 'translateY(0px) rotate(0deg)', to: 'translateY(100px) rotate(10deg)' } })

    expect(computeProps(data, 50).props.transform).toBe('translateY(50px) rotate(5deg)')
  })

  it('goes through via at the midpoint', () => {
    const data = validData({ opacity: { from: 0, via: 1, to: 0 } })

    expect(computeProps(data, 0).props.opacity).toBe('0')
    expect(computeProps(data, 25).props.opacity).toBe('0.5')
    expect(computeProps(data, 50).props.opacity).toBe('1')
    expect(computeProps(data, 75).props.opacity).toBe('0.5')
    expect(computeProps(data, 100).props.opacity).toBe('0')
  })

  it('applies the timing function', () => {
    const data = validData({ a: { from: 0, to: 100, timing: 'quadIn' } })

    expect(computeProps(data, 50).props.a).toBe('25')
  })

  it('rounds to four decimals', () => {
    const data = validData({ a: { from: 0, to: 1 } })

    expect(computeProps(data, 100 / 3).props.a).toBe('0.3333')
  })

  it('uses the unit of to for a unitless from', () => {
    const data = validData({ y: { from: 0, to: '10px' } })

    expect(computeProps(data, 0).props.y).toBe('0px')
  })

})
