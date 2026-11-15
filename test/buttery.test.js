import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mockViewport } from './helpers.js'

// The library keeps module state (mounted, instances, caches), so each test imports a fresh copy
let buttery = null
let viewport = null
let page = null
let currentWidth = 1024

const VH = 800

/**
 * Fakes the layout of the document: viewport height, scroll height and scroll position.
 * @param {Number} scrollHeight
 * @returns {Object} { scrollTo }
 */
const fakePage = function(scrollHeight = 5000) {

  const root = document.documentElement
  let scrollTop = 0

  Object.defineProperty(document, 'scrollingElement', { configurable: true, get: () => root })
  Object.defineProperty(root, 'clientHeight', { configurable: true, get: () => VH })
  Object.defineProperty(root, 'clientWidth', { configurable: true, get: () => viewport.width })
  Object.defineProperty(root, 'scrollHeight', { configurable: true, get: () => scrollHeight })
  Object.defineProperty(root, 'scrollTop', { configurable: true, get: () => scrollTop, set: (value) => { scrollTop = value } })

  return {
    get scrollTop() { return scrollTop },
    scrollTo(value) {
      scrollTop = value
      window.dispatchEvent(new Event('scroll'))
    }
  }

}

/**
 * Creates an element at a fixed document position.
 * @param {Number} top - Document position.
 * @param {Number} height
 * @param {Object} attrs
 * @returns {Element}
 */
const box = function(top, height = 200, attrs = {}) {

  const node = document.createElement('div')

  for (const name in attrs) node.setAttribute(name, attrs[name])

  node.getBoundingClientRect = () => ({ top: top - page.scrollTop, height, bottom: top - page.scrollTop + height, left: 0, right: 0, width: 0 })
  document.body.appendChild(node)

  return node

}

/** Runs pending animation frames. */
const frame = () => vi.advanceTimersToNextFrame()

/** Scrolls and runs the next frame. */
const scrollTo = (value) => {
  page.scrollTo(value)
  frame()
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] })
  viewport = mockViewport(1024)
  Object.defineProperty(viewport, 'width', { get: () => currentWidth })
  currentWidth = 1024
  page = fakePage()
  vi.resetModules()
  buttery = await import('../lib/buttery.js')
})

/** Changes the viewport width, as a resize. */
const resize = (width) => {
  currentWidth = width
  viewport.setWidth(width)
  window.dispatchEvent(new Event('resize'))
}

afterEach(() => {
  buttery.unmount()
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('style')
  viewport.restore()
  vi.useRealTimers()
})

describe('create', () => {

  it('uses the JavaScript fallback without ScrollTimeline', () => {
    expect(buttery.supportsTimeline()).toBe(false)

    const instance = buttery.create({ from: '0px', to: '100px', props: { '--x': { from: 0, to: 1 } } })

    expect(instance.usesTimeline()).toBe(false)
  })

  it('throws for invalid data and does not keep the instance', () => {
    expect(() => buttery.create({ to: '100px' })).toThrow('Missing property `from`')
  })

  it('returns props from update()', () => {
    buttery.mount()
    page.scrollTo(50)

    const instance = buttery.create({ from: '0px', to: '100px', props: { '--x': { from: 0, to: 1 } } })

    expect(instance.update()).toEqual({ '--x': '0.5' })
  })

})

describe('rendering on scroll', () => {

  it('writes global props to the document element', () => {
    buttery.mount()
    buttery.create({ from: '0px', to: '1000px', props: { '--progress': { from: 0, to: 1 } } }).start()
    frame()

    expect(document.documentElement.style.getPropertyValue('--progress')).toBe('0')

    scrollTo(250)
    expect(document.documentElement.style.getPropertyValue('--progress')).toBe('0.25')

    scrollTo(2000)
    expect(document.documentElement.style.getPropertyValue('--progress')).toBe('1')
  })

  it('writes props to the element with direct: true, using its relative range', () => {
    const elem = box(1000)

    buttery.mount()
    // From the element's top meeting the viewport bottom (200) to its bottom meeting the viewport top (1200)
    buttery.create({ elem, direct: true, from: 'top-bottom', to: 'bottom-top', props: { opacity: { from: 0, to: 1 } } }).start()

    scrollTo(700)
    expect(elem.style.getPropertyValue('opacity')).toBe('0.5')
  })

  it('writes props to another element with direct: <element>', () => {
    const elem = box(0)
    const target = box(0)

    buttery.mount()
    buttery.create({ elem, direct: target, from: 'top-top', to: 'bottom-top', props: { '--y': { from: '0px', to: '100px' } } }).start()

    scrollTo(100)
    expect(target.style.getPropertyValue('--y')).toBe('50px')
    expect(elem.style.getPropertyValue('--y')).toBe('')
  })

  it('clamps the scroll position to the scrollable range (overscroll)', () => {
    buttery.mount()
    buttery.create({ from: '4000px', to: '5000px', props: { '--x': { from: 0, to: 1 } } }).start()

    // Max scroll is 5000 - 800 = 4200
    scrollTo(4600)
    expect(document.documentElement.style.getPropertyValue('--x')).toBe('0.2')
  })

  it('does not write while out of range', () => {
    buttery.mount()
    buttery.create({ from: '1000px', to: '2000px', props: { '--x': { from: 0, to: 1 } } }).start()
    frame()

    const spy = vi.spyOn(document.documentElement.style, 'setProperty')

    scrollTo(100)
    scrollTo(200)

    expect(spy).not.toHaveBeenCalled()
  })

  it('does not render before mount()', () => {
    buttery.create({ from: '0px', to: '100px', props: { '--x': { from: 0, to: 1 } } }).start()
    frame()

    expect(document.documentElement.style.getPropertyValue('--x')).toBe('')
  })

  it('stops rendering after stop()', () => {
    buttery.mount()
    const instance = buttery.create({ from: '0px', to: '100px', props: { '--x': { from: 0, to: 1 } } })
    instance.start()
    scrollTo(10)
    instance.stop()
    scrollTo(90)

    expect(document.documentElement.style.getPropertyValue('--x')).toBe('0.1')
  })

})

describe('callbacks', () => {

  it('calls inside and outside with the precise percentage', () => {
    const inside = vi.fn()
    const outside = vi.fn()

    buttery.mount()
    const instance = buttery.create({ from: '100px', to: '200px', inside, outside, props: {} })
    instance.start()
    frame()

    expect(outside).toHaveBeenLastCalledWith(instance, -100, {})

    scrollTo(150)
    expect(inside).toHaveBeenLastCalledWith(instance, 50, {})

    scrollTo(300)
    expect(outside).toHaveBeenLastCalledWith(instance, 200, {})
  })

})

describe('mount and unmount', () => {

  it('ignores a second mount()', () => {
    const spy = vi.spyOn(window, 'addEventListener')

    buttery.mount()
    buttery.mount()

    expect(spy.mock.calls.filter(([ type ]) => type === 'scroll')).toHaveLength(1)
  })

  it.each([ 'from', 'props', 'max-md' ])('rejects the reserved breakpoint name %s', (name) => {
    expect(() => buttery.mount({ breakpoints: { [name]: 100 } })).toThrow(`Breakpoint name \`${ name }\` is reserved`)
  })

  it('rejects breakpoints that are not an object', () => {
    expect(() => buttery.mount({ breakpoints: 'md' })).toThrow('Option `breakpoints` must be an object')
  })

  it('removes its listeners on unmount', () => {
    const spy = vi.spyOn(window, 'removeEventListener')

    buttery.mount()
    buttery.unmount()

    expect(spy.mock.calls.map(([ type ]) => type)).toEqual(expect.arrayContaining([ 'scroll', 'resize', 'orientationchange', 'pageshow' ]))
  })

  it('stops rendering after unmount', () => {
    buttery.mount()
    buttery.create({ from: '0px', to: '100px', props: { '--x': { from: 0, to: 1 } } }).start()
    scrollTo(10)
    buttery.unmount()
    scrollTo(90)

    expect(document.documentElement.style.getPropertyValue('--x')).toBe('0.1')
  })

  it('destroys instances whose element left the document and keeps the others', () => {
    const kept = box(0)
    const removed = box(0)

    buttery.mount()
    buttery.create({ elem: kept, direct: true, from: 'top-top', to: 'bottom-top', props: { '--x': { from: 0, to: 1 } } }).start()
    buttery.create({ elem: removed, direct: true, from: 'top-top', to: 'bottom-top', props: { '--x': { from: 0, to: 1 } } }).start()
    frame()

    removed.remove()
    buttery.unmount()
    buttery.mount()
    scrollTo(100)

    expect(kept.style.getPropertyValue('--x')).toBe('0.5')
    expect(removed.style.getPropertyValue('--x')).toBe('0')
  })

  it('recalculates on a width change when recalculateOnResize is set', () => {
    let top = 1000
    const elem = box(0)
    elem.getBoundingClientRect = () => ({ top: top - page.scrollTop, height: 200 })

    buttery.mount({ recalculateOnResize: true })
    buttery.create({ elem, direct: true, from: 'top-top', to: 'bottom-top', props: { '--x': { from: 0, to: 1 } } }).start()

    top = 2000
    resize(900)
    vi.advanceTimersByTime(200)
    scrollTo(2100)

    expect(elem.style.getPropertyValue('--x')).toBe('0.5')
  })

  it('does not recalculate on a height-only resize', () => {
    let top = 1000
    const elem = box(0)
    elem.getBoundingClientRect = () => ({ top: top - page.scrollTop, height: 200 })

    buttery.mount({ recalculateOnResize: true })
    buttery.create({ elem, direct: true, from: 'top-top', to: 'bottom-top', props: { '--x': { from: 0, to: 1 } } }).start()

    top = 2000
    window.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(200)
    scrollTo(1100)

    expect(elem.style.getPropertyValue('--x')).toBe('0.5')
  })

})

describe('breakpoints', () => {

  it('applies the overrides that match the viewport', () => {
    buttery.mount({ breakpoints: { md: 768 } })
    buttery.create({ from: '0px', to: '100px', props: { '--x': { from: 0, to: 1, md: { to: 2 } } } }).start()

    scrollTo(50)
    expect(document.documentElement.style.getPropertyValue('--x')).toBe('1')
  })

  it('re-applies overrides when the viewport crosses a breakpoint', () => {
    buttery.mount({ breakpoints: { md: 768 } })
    buttery.create({ from: '0px', to: '100px', props: { '--x': { from: 0, to: 1, md: { to: 2 } }, '--y': { 'max-md': { from: 0, to: 10 } } } }).start()
    scrollTo(50)

    resize(500)
    frame()
    frame()

    const style = document.documentElement.style

    expect(style.getPropertyValue('--x')).toBe('0.5')
    expect(style.getPropertyValue('--y')).toBe('5')

    resize(1024)
    frame()
    frame()

    expect(style.getPropertyValue('--x')).toBe('1')
    expect(style.getPropertyValue('--y')).toBe('')
  })

  it('removes styles when the instance turns off at a breakpoint', () => {
    buttery.mount({ breakpoints: { md: 768 } })
    buttery.create({ from: '0px', to: '100px', 'max-md': false, props: { '--x': { from: 0, to: 1 } } }).start()
    scrollTo(50)

    resize(500)
    frame()
    frame()

    expect(document.documentElement.style.getPropertyValue('--x')).toBe('')
  })

})

describe('Lenis', () => {

  /** A fake Lenis instance. */
  const fakeLenis = () => {
    const listeners = new Set()

    return {
      scroll: 0,
      limit: 4200,
      options: {},
      on: vi.fn((type, fn) => { listeners.add(fn); return () => listeners.delete(fn) }),
      emit(scroll) { this.scroll = scroll; for (const fn of listeners) fn() },
      listeners
    }
  }

  it('updates lenis instances synchronously from its scroll event', () => {
    const lenis = fakeLenis()

    buttery.mount({ lenis })
    const instance = buttery.create({ from: '0px', to: '100px', timeline: 'lenis', props: { '--x': { from: 0, to: 1 } } })
    instance.start()
    frame()

    expect(instance.usesLenis()).toBe(true)

    lenis.emit(25.5)
    expect(document.documentElement.style.getPropertyValue('--x')).toBe('0.255')
  })

  it('unsubscribes on unmount', () => {
    const lenis = fakeLenis()

    buttery.mount({ lenis })
    buttery.unmount()

    expect(lenis.listeners.size).toBe(0)
  })

  it('rejects something that is not a Lenis instance', () => {
    expect(() => buttery.mount({ lenis: {} })).toThrow('Option `lenis` must be a Lenis instance')
  })

})

describe('scan and release', () => {

  it('creates started instances from attributes', () => {
    const elem = box(1000, 200, { 'data-buttery': '', 'data-buttery-opacity': '0 | 1' })

    buttery.mount()
    const created = buttery.scan()

    expect(created).toHaveLength(1)
    expect(created[0].isActive()).toBe(true)

    scrollTo(700)
    expect(elem.style.getPropertyValue('opacity')).toBe('0.5')
  })

  it('scans the root itself and skips elements that were scanned before', () => {
    const elem = box(0, 200, { 'data-buttery': '', 'data-buttery-opacity': '0 | 1' })

    expect(buttery.scan(elem)).toHaveLength(1)
    expect(buttery.scan()).toHaveLength(0)
  })

  it('merges defaults under the attributes', () => {
    box(0, 200, { 'data-buttery': '', 'data-buttery-opacity': '0 | 1' })

    const [ instance ] = buttery.scan(document, { defaults: { track: false } })

    expect(instance.getData().track).toBe(false)
  })

  it('warns and skips invalid elements, once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    box(0, 200, { 'data-buttery': 'nope: 1', 'data-buttery-opacity': '0 | 1' })

    expect(buttery.scan()).toHaveLength(0)
    expect(buttery.scan()).toHaveLength(0)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('drops every instance of an element when one of its props is invalid', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    box(0, 200, { 'data-buttery': '', 'data-buttery-opacity': '0 | 1', 'data-buttery-y': '0 | x; to: bottom-top' })

    expect(buttery.scan()).toHaveLength(0)
  })

  it('lets a fixed element be scanned again after release()', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const elem = box(0, 200, { 'data-buttery': 'nope: 1', 'data-buttery-opacity': '0 | 1' })

    buttery.scan()
    elem.setAttribute('data-buttery', '')
    buttery.release(elem)

    expect(buttery.scan()).toHaveLength(1)
  })

  it('destroys instances on release() so the element can be scanned again', () => {
    const wrapper = box(0)
    const elem = box(0, 200, { 'data-buttery': '', 'data-buttery-opacity': '0 | 1' })
    wrapper.appendChild(elem)

    const [ instance ] = buttery.scan()
    buttery.release(wrapper)

    expect(instance.getData()).not.toBeNull()
    expect(buttery.scan()).toHaveLength(1)
  })

  it('destroys instances of removed elements on the next scan', () => {
    const elem = box(0, 200, { 'data-buttery': '', 'data-buttery-opacity': '0 | 1' })

    buttery.scan()
    elem.remove()
    document.body.appendChild(elem)

    // Still scanned: same element, back in the document
    expect(buttery.scan()).toHaveLength(0)

    elem.remove()
    buttery.scan()
    document.body.appendChild(elem)

    expect(buttery.scan()).toHaveLength(1)
  })

  it('does nothing when the user prefers reduced motion', () => {
    viewport.setReducedMotion(true)
    box(0, 200, { 'data-buttery': '', 'data-buttery-opacity': '0 | 1' })

    expect(buttery.scan()).toHaveLength(0)
    expect(buttery.scan(document, { reducedMotion: true })).toHaveLength(1)
  })

  it('uses configured breakpoint names', () => {
    const elem = box(1000, 200, { 'data-buttery': '', 'data-buttery-opacity': '0 | 1', 'data-buttery-opacity-desktop': '0 | 0.5' })

    buttery.mount({ breakpoints: { desktop: 900 } })
    buttery.scan()
    scrollTo(700)

    expect(elem.style.getPropertyValue('opacity')).toBe('0.25')
  })

})
