import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    include: ['test/browser/**/*.test.js'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      viewport: { width: 1024, height: 800 },
      instances: [
        { browser: 'chromium' },
        { browser: 'firefox' }
      ]
    }
  }
})
