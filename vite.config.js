import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

// Two builds:
// - default: ES + CJS for npm, with dependencies left as imports
// - `--mode browser`: a minified IIFE for <script> tags, with dependencies bundled
export default defineConfig(({ mode }) => {
  const browser = mode === 'browser'

  return {
    build: {
      emptyOutDir: !browser, // the browser build runs second and must keep the npm files
      minify: browser,
      sourcemap: true,
      lib: {
        entry: 'lib/buttery.js',
        name: 'buttery', // exposed as window.buttery
        formats: browser ? ['iife'] : ['es', 'cjs'],
        fileName: (format) => {
          if (browser) return 'buttery.min.js'
          return format === 'es' ? 'buttery.js' : 'buttery.cjs'
        }
      },
      rolldownOptions: {
        external: browser ? [] : Object.keys(pkg.dependencies)
      }
    }
  }
})
