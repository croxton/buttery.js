import { describe, it, expect, afterEach } from 'vitest'
import { splitTopLevel, parseElement } from '../lib/attributes.js'

const BREAKPOINTS = ['sm', 'md', 'lg']

/**
 * Creates an element with the given attributes and adds it to the document.
 * @param {Object} attrs
 * @param {?Element} parent
 * @returns {Element}
 */
const el = function(attrs, parent = document.body) {
  const node = document.createElement('div')
  for (const name in attrs) node.setAttribute(name, attrs[name])
  parent.appendChild(node)
  return node
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('splitTopLevel', () => {

  it('splits on a separator', () => {
    expect(splitTopLevel('a;b;c', ';')).toEqual(['a', 'b', 'c'])
  })

  it('returns one part when there is no separator', () => {
    expect(splitTopLevel('abc', ';')).toEqual(['abc'])
  })

  it('keeps empty parts', () => {
    expect(splitTopLevel('a;;b;', ';')).toEqual(['a', '', 'b', ''])
  })

  it('ignores separators inside parentheses and brackets', () => {
    expect(splitTopLevel('translate(0, 1px) | rotate(5deg)', '|')).toEqual(['translate(0, 1px) ', ' rotate(5deg)'])
    expect(splitTopLevel('a[b;c];d', ';')).toEqual(['a[b;c]', 'd'])
    expect(splitTopLevel('f(g(a;b);c);d', ';')).toEqual(['f(g(a;b);c)', 'd'])
  })

  it('ignores separators inside quotes', () => {
    expect(splitTopLevel('"a;b";\'c;d\';e', ';')).toEqual(['"a;b"', '\'c;d\'', 'e'])
  })

  it('does not go below depth zero on an extra closing bracket', () => {
    expect(splitTopLevel('a);b', ';')).toEqual(['a)', 'b'])
  })

})

describe('parseElement', () => {

  describe('values and options', () => {

    it('parses from | to with default range', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-opacity': '0 | 1' })

      expect(parseElement(node, BREAKPOINTS)).toEqual([
        { from: 'top-bottom', to: 'bottom-top', elem: node, direct: true, props: { opacity: { from: '0', via: null, to: '1' } } }
      ])
    })

    it('parses from | via | to', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-opacity': '0 | 1 | 0' })

      expect(parseElement(node, BREAKPOINTS)[0].props.opacity).toEqual({ from: '0', via: '1', to: '0' })
    })

    it('keeps values with several numbers and functions', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-transform': 'translate(0, 0px) | translate(0, -100px)' })

      expect(parseElement(node, BREAKPOINTS)[0].props.transform).toEqual({ from: 'translate(0, 0px)', via: null, to: 'translate(0, -100px)' })
    })

    it('parses timing and prop options', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-y': '0px | -100px; timing: quadIn; prop: --y' })

      expect(parseElement(node, BREAKPOINTS)[0].props).toEqual({
        '--y': { from: '0px', via: null, to: '-100px', timing: 'quadIn' }
      })
    })

    it('reads instance options from data-buttery', () => {
      const node = el({ 'data-buttery': 'from: top-middle; to: bottom-middle; timeline: lenis; track: false', 'data-buttery-opacity': '0 | 1' })

      expect(parseElement(node, BREAKPOINTS)[0]).toMatchObject({ from: 'top-middle', to: 'bottom-middle', timeline: 'lenis', track: false })
    })

    it('parses timeline booleans', () => {
      const on = el({ 'data-buttery': 'timeline: true', 'data-buttery-opacity': '0 | 1' })
      const off = el({ 'data-buttery': 'timeline: false', 'data-buttery-opacity': '0 | 1' })

      expect(parseElement(on, BREAKPOINTS)[0].timeline).toBe(true)
      expect(parseElement(off, BREAKPOINTS)[0].timeline).toBe(false)
    })

    it('treats option keys case-insensitively and keeps colons in values', () => {
      const node = el({ 'data-buttery': 'FROM: 50%-40%', 'data-buttery-opacity': '0 | 1' })

      expect(parseElement(node, BREAKPOINTS)[0].from).toBe('50%-40%')
    })

    it('groups props without their own range into one instance', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-opacity': '0 | 1', 'data-buttery-scale': '1 | 2' })
      const configs = parseElement(node, BREAKPOINTS)

      expect(configs).toHaveLength(1)
      expect(Object.keys(configs[0].props)).toEqual(['opacity', 'scale'])
    })

  })

  describe('off', () => {

    it('returns no configs when data-buttery is off', () => {
      const node = el({ 'data-buttery': 'off', 'data-buttery-opacity': '0 | 1' })

      expect(parseElement(node, BREAKPOINTS)).toEqual([])
    })

    it('turns a prop off at its base until a breakpoint gives it values', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-opacity': 'off', 'data-buttery-opacity-md': '0 | 1' })

      expect(parseElement(node, BREAKPOINTS)[0].props.opacity).toEqual({ md: { from: '0', via: null, to: '1' } })
    })

    it('turns a prop off at a breakpoint', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-opacity': '0 | 1', 'data-buttery-opacity-md': 'off' })

      expect(parseElement(node, BREAKPOINTS)[0].props.opacity).toEqual({ from: '0', via: null, to: '1', md: false })
    })

    it('turns the instance off at a breakpoint', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-md': 'off', 'data-buttery-opacity': '0 | 1' })

      expect(parseElement(node, BREAKPOINTS)[0].md).toBe(false)
    })

  })

  describe('breakpoints', () => {

    it('reads instance overrides', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-md': 'to: bottom-middle', 'data-buttery-opacity': '0 | 1' })

      expect(parseElement(node, BREAKPOINTS)[0].md).toEqual({ to: 'bottom-middle' })
    })

    it('reads prop overrides', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-y': '0px | -100px', 'data-buttery-y-md': '0px | -300px' })

      expect(parseElement(node, BREAKPOINTS)[0].props.y).toEqual({ from: '0px', via: null, to: '-100px', md: { from: '0px', via: null, to: '-300px' } })
    })

    it('reads max- overrides before plain ones, so -max-md is not read as -md', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-y': '0 | 1', 'data-buttery-y-max-md': '0 | 2', 'data-buttery-max-md': 'to: bottom-middle' })
      const config = parseElement(node, BREAKPOINTS)[0]

      expect(config.props.y['max-md']).toEqual({ from: '0', via: null, to: '2' })
      expect(config.props.y.md).toBeUndefined()
      expect(config['max-md']).toEqual({ to: 'bottom-middle' })
      expect(config.props['y-max']).toBeUndefined()
    })

    it('treats an unknown suffix as part of the prop name', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-y-xl': '0 | 1' })

      expect(parseElement(node, BREAKPOINTS)[0].props['y-xl']).toEqual({ from: '0', via: null, to: '1' })
    })

    it('does not take a prop named like a breakpoint as an override', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-x-md': '0 | 1' })

      expect(parseElement(node, ['md'])[0].props.x).toEqual({ md: { from: '0', via: null, to: '1' } })
    })

    it('only allows range and timeline options in instance overrides', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-md': 'track: false', 'data-buttery-opacity': '0 | 1' })

      expect(() => parseElement(node, BREAKPOINTS)).toThrow('Unknown option "track" in data-buttery-md')
    })

  })

  describe('props with their own range', () => {

    it('get their own instance, after the shared one', () => {
      const node = el({ 'data-buttery': 'to: bottom-middle', 'data-buttery-scale': '1 | 2', 'data-buttery-opacity': '0 | 1; to: 50%-40%' })
      const configs = parseElement(node, BREAKPOINTS)

      expect(configs).toHaveLength(2)
      expect(configs[0]).toMatchObject({ from: 'top-bottom', to: 'bottom-middle', props: { scale: { from: '1', via: null, to: '2' } } })
      expect(configs[1]).toMatchObject({ from: 'top-bottom', to: '50%-40%', props: { opacity: { from: '0', via: null, to: '1' } } })
    })

    it('change only the range when no values are given at a breakpoint', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-opacity': '0 | 1', 'data-buttery-opacity-md': 'to: bottom-top' })
      const configs = parseElement(node, BREAKPOINTS)

      expect(configs).toHaveLength(1)
      expect(configs[0].props.opacity).toEqual({ from: '0', via: null, to: '1', md: {} })
      expect(configs[0].md).toEqual({ to: 'bottom-top' })
    })

    it('keep their own range over instance overrides at a breakpoint', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-md': 'from: top-top; to: bottom-bottom', 'data-buttery-opacity': '0 | 1; to: 50%-40%' })
      const [ config ] = parseElement(node, BREAKPOINTS)

      expect(config.to).toBe('50%-40%')
      expect(config.md).toEqual({ from: 'top-top' })
    })

    it('stay off at a breakpoint where the instance is off', () => {
      const node = el({ 'data-buttery': '', 'data-buttery-md': 'off', 'data-buttery-opacity': '0 | 1; to: 50%-40%', 'data-buttery-opacity-md': 'to: bottom-top' })

      expect(parseElement(node, BREAKPOINTS)[0].md).toBe(false)
    })

  })

  describe('elem', () => {

    it('uses a matching ancestor and applies styles to the element', () => {
      const section = document.createElement('section')
      section.className = 'hero'
      document.body.appendChild(section)
      const node = el({ 'data-buttery': 'elem: .hero', 'data-buttery-opacity': '0 | 1' }, section)

      const [ config ] = parseElement(node, BREAKPOINTS)

      expect(config.elem).toBe(section)
      expect(config.direct).toBe(node)
    })

    it('falls back to a document match', () => {
      const other = el({ id: 'other' })
      const node = el({ 'data-buttery': 'elem: #other', 'data-buttery-opacity': '0 | 1' })

      expect(parseElement(node, BREAKPOINTS)[0].elem).toBe(other)
    })

    it('is direct when the selector matches the element itself', () => {
      const node = el({ class: 'self', 'data-buttery': 'elem: .self', 'data-buttery-opacity': '0 | 1' })
      const [ config ] = parseElement(node, BREAKPOINTS)

      expect(config.elem).toBe(node)
      expect(config.direct).toBe(true)
    })

  })

  describe('errors', () => {

    it.each([
      [{ 'data-buttery': '' }, 'No props'],
      [{ 'data-buttery': 'nope: 1', 'data-buttery-o': '0 | 1' }, 'Unknown option "nope" in data-buttery'],
      [{ 'data-buttery': 'from', 'data-buttery-o': '0 | 1' }, 'Expected "key: value" in data-buttery, got "from"'],
      [{ 'data-buttery': 'track: maybe', 'data-buttery-o': '0 | 1' }, 'Option "track" must be true or false'],
      [{ 'data-buttery': 'timeline: sometimes', 'data-buttery-o': '0 | 1' }, 'Option "timeline" must be true or false'],
      [{ 'data-buttery': '', 'data-buttery-o': '0 | 1 | 2 | 3' }, 'Expected "from | to" or "from | via | to" in data-buttery-o'],
      [{ 'data-buttery': '', 'data-buttery-o': '0 | ' }, 'Expected "from | to"'],
      [{ 'data-buttery': '', 'data-buttery-o': '0 | 1; elem: x' }, 'Unknown option "elem" in data-buttery-o'],
      [{ 'data-buttery': 'elem: #missing', 'data-buttery-o': '0 | 1' }, 'No element matches elem selector "#missing"'],
      [{ 'data-buttery': 'elem: [[', 'data-buttery-o': '0 | 1' }, 'Invalid elem selector "[["']
    ])('throws for %o', (attrs, message) => {
      expect(() => parseElement(el(attrs), BREAKPOINTS)).toThrow(message)
    })

  })

})
