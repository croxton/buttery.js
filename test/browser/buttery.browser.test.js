import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { page, server } from 'vitest/browser'
import * as buttery from '../../lib/buttery.js'

const TOP = 1500
const HEIGHT = 200

/** Waits for two frames, so scroll timelines and the rAF fallback have rendered. */
const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

/**
 * Creates an absolutely positioned box.
 * @returns {Element}
 */
const box = function() {
  const node = document.createElement('div')
  node.style.cssText = `position: absolute; left: 0; top: ${ TOP }px; width: 100px; height: ${ HEIGHT }px`
  document.body.appendChild(node)
  return node
}

/**
 * Scrolls the document and waits for rendering.
 * @param {Number} y
 */
const scrollTo = async (y) => {
  window.scrollTo(0, y)
  await frames()
}

/** Range of a `top-bottom` → `bottom-top` instance on the box. */
const range = () => {
  const vh = document.documentElement.clientHeight
  return { from: TOP - vh, to: TOP + HEIGHT }
}

const opacity = (node) => parseFloat(getComputedStyle(node).opacity)

beforeEach(async () => {
  await page.viewport(1024, 800)
  document.body.style.cssText = 'margin: 0; height: 5000px; position: relative'
  window.scrollTo(0, 0)
})

afterEach(() => {
  buttery.unmount()
  document.body.innerHTML = ''
})

describe(`rendering in ${ server.browser }`, () => {

  it('picks the native timeline where it is supported', () => {
    if (server.browser === 'chromium') expect(buttery.supportsTimeline()).toBe(true)

    buttery.mount()
    const instance = buttery.create({ elem: box(), direct: true, from: 'top-bottom', to: 'bottom-top', props: { opacity: { from: 0, to: 1 } } })

    expect(instance.usesTimeline()).toBe(buttery.supportsTimeline())
  })

  it('renders the same values with the native timeline and the JavaScript fallback', async () => {
    const auto = box()
    const fallback = box()
    const props = { opacity: { from: 0, via: 1, to: 0.2, timing: 'quadInOut' } }

    buttery.mount()
    buttery.create({ elem: auto, direct: true, from: 'top-bottom', to: 'bottom-top', props }).start()
    buttery.create({ elem: fallback, direct: true, from: 'top-bottom', to: 'bottom-top', timeline: false, props }).start()

    const { from, to } = range()

    for (const t of [ 0, 0.1, 0.25, 0.5, 0.8, 1 ]) {
      await scrollTo(from + (to - from) * t)

      // Timelines sample non-linear easing, so allow a small difference
      expect(opacity(auto), `at ${ t }`).toBeCloseTo(opacity(fallback), 1)
    }
  })

  it('animates through the range', async () => {
    const node = box()

    buttery.mount()
    buttery.create({ elem: node, direct: true, from: 'top-bottom', to: 'bottom-top', props: { opacity: { from: 0, to: 1 } } }).start()

    const { from, to } = range()

    await scrollTo(from - 100)
    expect(opacity(node)).toBeCloseTo(0, 2)

    await scrollTo((from + to) / 2)
    expect(opacity(node)).toBeCloseTo(0.5, 2)

    await scrollTo(to + 100)
    expect(opacity(node)).toBeCloseTo(1, 2)
  })

  it('re-applies breakpoint overrides when the viewport crosses a breakpoint', async () => {
    const node = box()

    buttery.mount({ breakpoints: { md: 768 } })
    buttery.create({ elem: node, direct: true, from: 'top-bottom', to: 'bottom-top', props: { opacity: { from: 0, to: 1, 'max-md': { to: 0.5 } } } }).start()

    await scrollTo(range().to + 100)
    expect(opacity(node)).toBeCloseTo(1, 2)

    await page.viewport(500, 800)
    await frames()
    await scrollTo(range().to + 100)
    expect(opacity(node)).toBeCloseTo(0.5, 2)

    await page.viewport(1024, 800)
    await frames()
    await scrollTo(range().to + 100)
    expect(opacity(node)).toBeCloseTo(1, 2)
  })

  it('applies declarative attributes', async () => {
    const node = box()
    node.setAttribute('data-buttery', '')
    node.setAttribute('data-buttery-opacity', '0 | 1')

    buttery.mount()
    buttery.scan()

    const { from, to } = range()

    await scrollTo((from + to) / 2)
    expect(opacity(node)).toBeCloseTo(0.5, 2)
  })

})
