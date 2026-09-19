import { defineConfig } from 'vitest/config'

export default defineConfig(() => ({
  root:     import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/audit',
  test:     {
    name:        '@scanmate/audit',
    watch:       false,
    globals:     true,
    environment: 'node',
    include:     ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters:   ['default'],
    coverage:    {
      reportsDirectory: './test-output/vitest/coverage',
      provider:         'v8' as const,
    },
  },
}))
