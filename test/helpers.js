import { vi } from 'vitest'

/**
 * Evaluates a simple media query (`min-width`, `max-width`, `prefers-reduced-motion`) against a width.
 * @param {String} query
 * @param {Number} width
 * @param {Boolean} reducedMotion
 * @returns {Boolean}
 */
const evaluate = function(query, width, reducedMotion) {

  if (query.includes('prefers-reduced-motion')) return reducedMotion

  const match = query.match(/\((min|max)-width:\s*([\d.]+)(px|rem|em)?\)/)

  if (match == null) return false

  const px = parseFloat(match[2]) * (match[3] === 'rem' || match[3] === 'em' ? 16 : 1)

  return match[1] === 'min' ? width >= px : width <= px

}

/**
 * Replaces window.matchMedia with one driven by a fake viewport width.
 * Changing the width fires `change` on the media query lists whose result changed.
 * @param {Number} width
 * @param {Object} options
 * @param {Boolean} options.reducedMotion
 * @returns {Object} { setWidth, setReducedMotion, restore }
 */
export const mockViewport = function(width, { reducedMotion = false } = {}) {

  const lists = []
  const original = window.matchMedia

  window.matchMedia = vi.fn((query) => {
    const listeners = new Set()
    const mql = {
      media: query,
      matches: evaluate(query, width, reducedMotion),
      addEventListener: (type, fn) => listeners.add(fn),
      removeEventListener: (type, fn) => listeners.delete(fn),
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
      listeners
    }

    lists.push(mql)

    return mql
  })

  const update = () => {
    for (const mql of lists) {
      const matches = evaluate(mql.media, width, reducedMotion)

      if (matches !== mql.matches) {
        mql.matches = matches
        for (const fn of Array.from(mql.listeners)) fn({ matches, media: mql.media })
      }
    }
  }

  return {
    lists,
    setWidth(value) {
      width = value
      update()
    },
    setReducedMotion(value) {
      reducedMotion = value
      update()
    },
    restore() {
      window.matchMedia = original
    }
  }

}
