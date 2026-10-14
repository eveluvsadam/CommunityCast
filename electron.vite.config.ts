import { resolve } from 'path'
import { cpSync, existsSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Vite only bundles JS/TS reachable via imports. The migration .sql files and
// the public website's static HTML are read/served from disk at runtime
// (see src/main/db/index.ts and src/main/server/publicStreamServer.ts), so
// they need to be copied into the build output explicitly rather than
// picked up by the bundler.
function copyStaticAssetsPlugin(): Plugin {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      const copies = [
        ['src/main/db/migrations', 'out/main/migrations'],
        ['src/main/server/public-site', 'out/main/public-site']
      ] as const
      for (const [src, dest] of copies) {
        const srcPath = resolve(src)
        if (existsSync(srcPath)) cpSync(srcPath, resolve(dest), { recursive: true })
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyStaticAssetsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
