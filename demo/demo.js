/* global buttery */
(function () {
  const $ = (selector) => document.querySelector(selector)
  const badge = $('#badge')

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

  // ?js forces the JavaScript fallback so the two modes can be compared
  const forceJs = new URLSearchParams(location.search).has('js')

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    badge.dataset.mode = 'off'
    badge.textContent = 'Reduced motion: animations off'
    badge.removeAttribute('href')
    $('.layers__front').style.opacity = 1
    return
  }

  buttery.mount({ timeline: !forceJs })

  const sky = $('#sky')
  const rocket = $('#rocket')
  const balloon = $('#balloon')
  const layers = $('#layers')
  const meadow = $('#meadow')

  // `elem` is the section, which never moves, so its measurements stay accurate.
  // `direct` is the element that receives the animated values.
  const configs = [
    // 1. Clouds: three depths, nearer = faster
    ...[['far', '-80px'], ['mid', '-200px'], ['near', '-420px']].map(([depth, to]) => ({
      elem: sky,
      direct: sky.querySelector(`[data-depth="${depth}"]`),
      from: 'top-top',
      to: 'bottom-top',
      props: { '--ty': { from: '0px', to } }
    })),

    // 2. Rocket cow
    {
      elem: rocket,
      direct: $('.rocket__cow'),
      from: 'top-bottom',
      to: 'bottom-top',
      props: {
        '--tx': { from: '-45vw', to: '45vw', timing: 'quadIn' },
        '--ty': { from: '40vh', to: '-60vh', timing: 'quadIn' },
        '--rot': { from: '-10deg', to: '15deg' }
      }
    },

    // 3. Balloon cow, using `via`
    {
      elem: balloon,
      direct: $('.balloon__cow'),
      from: 'top-bottom',
      to: 'bottom-top',
      props: {
        '--ty': { from: '120px', via: '-160px', to: '60px', timing: 'sineInOut' },
        '--rot': { from: '-6deg', via: '6deg', to: '-4deg', timing: 'sineInOut' }
      }
    },

    // 4. Layered parallax: slow back layer, fast front layer, front fades in
    {
      elem: layers,
      direct: $('.layers__back'),
      from: 'top-bottom',
      to: 'bottom-top',
      props: {
        '--ty': { from: '30vh', to: '-30vh' },
        '--scale': { from: 0.8, to: 1 }
      }
    },
    {
      elem: layers,
      direct: $('.layers__front'),
      from: 'top-bottom',
      to: 'bottom-top',
      props: { '--ty': { from: '90vh', to: '-90vh' } }
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
      props: { '--ty': { from, to: '0vh' } }
    }))
  ]

  const instances = configs.map((config) => buttery.create(config))
  instances.forEach((instance) => instance.start())

  const native = instances.every((instance) => instance.usesTimeline())
  badge.dataset.mode = native ? 'native' : 'js'
  badge.textContent = native
    ? 'Native ScrollTimeline · try JS'
    : `JS fallback${buttery.supportsTimeline() ? ' · try native' : ''}`
  badge.href = forceJs ? './' : '?js'
  badge.title = 'Switch rendering mode'
})()
