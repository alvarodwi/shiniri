import path from 'path'

import UnoCSS from '@unocss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

import packageJson from './package.json' with { type: 'json' }

export default defineConfig(({ command, mode }) => {
  // Mock mode is dev-server only; a build with its placeholder IDs would be a broken app.
  if (command === 'build' && mode === 'mock')
    throw new Error('Mock mode is dev only: use yarn dev:mock.')
  return {
    plugins: [vue(), UnoCSS()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      // yarn dev:mock only. A literal false in every build, so mock code is dropped from the bundle.
      __MOCK__: JSON.stringify(command === 'serve' && mode === 'mock'),
    },
    test: {
      environment: 'happy-dom',
    },
  }
})
