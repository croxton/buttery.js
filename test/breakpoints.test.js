import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  DEFAULT_BREAKPOINTS,
  setBreakpoints,
  breakpointToPx,
  getBreakpoints,
  isBreakpointKey,
  hasBreakpointKeys,
  withoutBreakpointKeys,
  getMatchingOverrides,
  resolveProp,
  resolveBreakpoints
} from '../lib/breakpoints.js'
import { mockViewport } from './helpers.js'

let viewport = null

beforeEach(() => {
  viewport = mockViewport(1024)
  setBreakpoints({ sm: 640, md: '48rem', lg: '64rem' })
})

afterEach(() => {
  viewport.restore()
  setBreakpoints(DEFAULT_BREAKPOINTS)
})

/**
 * Sets the viewport width and clears the cached media queries.
 * @param {Number} width
 */
const resize = (width) => {
  viewport.setWidth(width)
  setBreakpoints({ sm: 640, md: '48rem', lg: '64rem' })
}

describe('breakpointToPx', () => {

  it.each([
    [640, 640],
    ['640px', 640],
    ['48rem', 768],
    ['2em', 32],
    [' 3rem ', 48]
  ])('%o is %spx', (value, px) => {
    expect(breakpointToPx(value)).toBe(px)
  })

})

describe('getBreakpoints', () => {

  it('sorts smallest first and builds min-width queries', () => {
    setBreakpoints({ lg: '64rem', sm: 640, md: '48rem' })

    expect(getBreakpoints()).toEqual([
      { name: 'sm', px: 640, query: '(min-width: 640px)' },
      { name: 'md', px: 768, query: '(min-width: 48rem)' },
      { name: 'lg', px: 1024, query: '(min-width: 64rem)' }
    ])
  })

  it('uses Tailwind breakpoints by default', () => {
    setBreakpoints(DEFAULT_BREAKPOINTS)

    expect(getBreakpoints().map((b) => b.name)).toEqual(['sm', 'md', 'lg', 'xl', '2xl'])
  })

})

describe('breakpoint keys', () => {

  it('recognises names and max- names', () => {
    expect(isBreakpointKey('md')).toBe(true)
    expect(isBreakpointKey('max-md')).toBe(true)
    expect(isBreakpointKey('xl')).toBe(false)
    expect(isBreakpointKey('from')).toBe(false)
  })

  it('finds breakpoint keys on data and on props', () => {
    expect(hasBreakpointKeys({ from: 0, md: {} })).toBe(true)
    expect(hasBreakpointKeys({ from: 0, props: { a: { from: 0, 'max-sm': false } } })).toBe(true)
    expect(hasBreakpointKeys({ from: 0, props: { a: { from: 0 } } })).toBe(false)
    expect(hasBreakpointKeys({ from: 0, props: null })).toBe(false)
  })

  it('removes breakpoint keys', () => {
    expect(withoutBreakpointKeys({ from: 0, md: {}, 'max-lg': false })).toEqual({ from: 0 })
  })

})

describe('getMatchingOverrides', () => {

  const object = { sm: 'sm', md: 'md', lg: 'lg', 'max-sm': 'max-sm', 'max-md': 'max-md', 'max-lg': 'max-lg' }

  it('applies max- keys largest first, then min-width keys smallest first', () => {
    resize(700)

    expect(getMatchingOverrides(object)).toEqual(['max-lg', 'max-md', 'sm'])
  })

  it('matches all min-width keys on a wide viewport', () => {
    resize(1200)

    expect(getMatchingOverrides(object)).toEqual(['sm', 'md', 'lg'])
  })

  it('matches all max- keys on a narrow viewport', () => {
    resize(320)

    expect(getMatchingOverrides(object)).toEqual(['max-lg', 'max-md', 'max-sm'])
  })

  it('matches a breakpoint at exactly its width', () => {
    resize(768)

    expect(getMatchingOverrides({ md: 'md', 'max-md': 'max-md' })).toEqual(['md'])
  })

})

describe('resolveProp', () => {

  it('merges matching overrides over the base', () => {
    resize(800)

    expect(resolveProp({ from: 0, to: 1, md: { to: 2 }, lg: { to: 3 } })).toEqual({ from: 0, to: 2 })
  })

  it('turns a prop off with false', () => {
    resize(800)

    expect(resolveProp({ from: 0, to: 1, md: false })).toBeNull()
  })

  it('turns it back on at a larger breakpoint', () => {
    resize(1100)

    expect(resolveProp({ from: 0, to: 1, md: false, lg: { to: 3 } })).toEqual({ from: 0, to: 3 })
  })

  it('keeps a prop without base values off until a breakpoint matches', () => {
    resize(500)
    expect(resolveProp({ md: { from: 0, to: 1 } })).toBeNull()

    resize(800)
    expect(resolveProp({ md: { from: 0, to: 1 } })).toEqual({ from: 0, to: 1 })
  })

  it('returns null for something other than an object', () => {
    expect(resolveProp(false)).toBeNull()
  })

})

describe('resolveBreakpoints', () => {

  const raw = {
    from: 'top-bottom',
    to: 'bottom-top',
    props: { opacity: { from: 0, to: 1 }, y: { md: { from: '0px', to: '10px' } } },
    md: { to: 'bottom-middle', props: { opacity: { to: 0.5 } } },
    'max-sm': false
  }

  it('applies instance and prop overrides', () => {
    resize(800)

    expect(resolveBreakpoints(raw)).toEqual({
      from: 'top-bottom',
      to: 'bottom-middle',
      props: { opacity: { from: 0, to: 0.5 }, y: { from: '0px', to: '10px' } }
    })
  })

  it('leaves out props that are off', () => {
    resize(700)

    expect(resolveBreakpoints(raw)).toEqual({ from: 'top-bottom', to: 'bottom-top', props: { opacity: { from: 0, to: 1 } } })
  })

  it('returns false when the instance is off', () => {
    resize(400)

    expect(resolveBreakpoints(raw)).toBe(false)
  })

  it('replaces a prop that is not an object', () => {
    resize(800)

    expect(resolveBreakpoints({ from: 0, to: 1, props: { a: { from: 0, to: 1 } }, md: { props: { a: false } } }).props).toEqual({})
  })

  it('does not change the input', () => {
    resize(800)
    const copy = structuredClone(raw)

    resolveBreakpoints(raw)

    expect(raw).toEqual(copy)
  })

})
