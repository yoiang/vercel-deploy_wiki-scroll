/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig(({ mode }) => ({
  // vite-plugin-solid injects solid-refresh for HMR, which cannot resolve
  // under the test runner. Keep HMR everywhere except `vitest`.
  plugins: [solid({ hot: mode !== 'test' })],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
}))
