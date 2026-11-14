/* global buttery, Lenis */
(function () {
  const $ = (selector) => document.querySelector(selector)
  const badge = $('#badge')
  const status = $('.badge__status')

  // Grass blades drawn as an SVG background tile, so each layer is one plain <div>
  function grassTile(color, blades) {
    let d = ''
    for (let i = 0; i < blades; i++) {
      const x = (i + 0.5) * (100 / blades)
      const lean = (i % 2 ? 1 : -1) * (4 + (i * 7) % 6)
      const top = 10 + (i * 37) % 45
      d += `M${x - 4} 100 Q${x + lean / 2} ${(top + 100) / 2} ${x + lean} ${top} Q${x + lean / 3} ${(top + 100) / 2} ${x + 4} 100Z`
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><rect y="78" width="100" height="22" fill="${color}"/><path fill="${color}" d="${d}"/></svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  }
  $('.grass--back').style.backgroundImage = grassTile('#4f9a45', 9)
  $('.grass--mid').style.backgroundImage = grassTile('#62b356', 7)
  $('.grass--front').style.backgroundImage = grassTile('#79c96a', 6)

  // ?js forces the JavaScript fallback, ?lenis smooth-scrolls with Lenis and drives every instance from it
  const params = new URLSearchParams(location.search)
  const useLenis = params.has('lenis')
  const syncTouch = params.has('synctouch')
  const forceJs = params.has('js') && !useLenis

  // Highlight the requested mode. The status line shows what actually runs.
  const choice = useLenis ? (syncTouch ? 'synctouch' : 'lenis') : forceJs ? 'js' : 'native'
  badge.querySelector(`[data-choice="${choice}"]`).setAttribute('aria-current', 'page')

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    badge.dataset.mode = 'off'
    status.textContent = 'Reduced motion: animations off'
    $('.layers__front').style.opacity = 1
    return
  }

  if (useLenis) {
    const LENIS = 'https://unpkg.com/lenis@1.3.27/dist/'
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = LENIS + 'lenis.css'
    document.head.append(css)

    const script = document.createElement('script')
    script.src = LENIS + 'lenis.min.js'
    script.onload = () => run(new Lenis({ autoRaf: true, syncTouch }))
    script.onerror = () => run(null)
    document.head.append(script)
  } else {
    run(null)
  }

  function run(lenis) {
    // Exposed for debugging
    window.lenis = lenis

    buttery.mount({ timeline: !forceJs, lenis })

    const sky = $('#sky')
    const rocket = $('#rocket')
    const balloon = $('#balloon')
    const layers = $('#layers')
    const meadow = $('#meadow')

    // `elem` is the section, which never moves, so its measurements stay accurate.
    // `direct` is the element that receives the animated values.
    const configs = [
      // Values with two numbers (`translate: x y`) animate the individual transform
      // properties directly, which browsers can run on the compositor thread.

      // 1. Clouds: three depths, nearer = faster
      ...[['far', '-80px'], ['mid', '-200px'], ['near', '-420px']].map(([depth, to]) => ({
        elem: sky,
        direct: sky.querySelector(`[data-depth="${depth}"]`),
        from: 'top-top',
        to: 'bottom-top',
        props: { translate: { from: '0 0px', to: `0 ${to}` } }
      })),

      // 2. Rocket cow
      {
        elem: rocket,
        direct: $('.rocket__cow'),
        from: 'top-bottom',
        to: 'bottom-top',
        props: {
          translate: { from: '-45vw 40vh', to: '45vw -60vh', timing: 'quadIn' },
          rotate: { from: '-10deg', to: '15deg' }
        }
      },

      // 3. Balloon cow, using `via`
      {
        elem: balloon,
        direct: $('.balloon__cow'),
        from: 'top-bottom',
        to: 'bottom-top',
        props: {
          translate: { from: '0 120px', via: '0 -160px', to: '0 60px', timing: 'sineInOut' },
          rotate: { from: '-6deg', via: '6deg', to: '-4deg', timing: 'sineInOut' }
        }
      },

      // 4. Layered parallax: slow back layer, fast front layer, front fades in
      {
        elem: layers,
        direct: $('.layers__back'),
        from: 'top-bottom',
        to: 'bottom-top',
        props: {
          translate: { from: '0 30vh', to: '0 -30vh' },
          scale: { from: 0.8, to: 1 }
        }
      },
      {
        elem: layers,
        direct: $('.layers__front'),
        from: 'top-bottom',
        to: 'bottom-top',
        props: { translate: { from: '0 90vh', to: '0 -90vh' } }
      },
      {
        elem: layers,
        direct: $('.layers__front'),
        from: 'top-bottom',
        to: '50%-40%',
        props: { opacity: { from: 0, to: 1 } }
      },

      // 5. Landscape settles as the page ends. The back field moves with the page.
      // Layers behind it start raised and sink (slower than the page);
      // layers in front start lowered and rise (faster than the page).
      ...[
        ['.mountains--far', '-28vh'],
        ['.mountains--near', '-14vh'],
        ['.fields--back', '0vh'],
        ['.fields--front', '8vh'],
        ['.grass--back', '14vh'],
        ['.grass--mid', '20vh'],
        ['.meadow__cow', '34vh'],
        ['.grass--front', '28vh']
      ].map(([selector, from]) => ({
        elem: meadow,
        direct: $(selector),
        from: 'top-bottom',
        to: 'bottom-bottom',
        props: { translate: { from: `0 ${from}`, to: '0 0vh' } }
      }))
    ]

    const instances = configs.map((config) => buttery.create(lenis ? { ...config, timeline: 'lenis' } : config))
    instances.forEach((instance) => instance.start())

    // What actually runs (e.g. Lenis instances use native timelines on touch devices)
    const native = instances.every((instance) => instance.usesTimeline())
    const driven = instances.every((instance) => instance.usesLenis())
    const mode = driven ? 'lenis' : native ? 'native' : 'js'
    badge.dataset.mode = mode
    status.textContent = {
      native: lenis ? 'Running: native timelines on touch' : 'Running: native timelines',
      js: 'Running: JS fallback',
      lenis: lenis && lenis.options.syncTouch ? 'Running: Lenis with syncTouch' : 'Running: Lenis'
    }[mode]

  }
})()
