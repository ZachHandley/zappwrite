import { defineConfig } from 'tsup'

export default defineConfig([
  // Appwrite adapter bundle - standalone bundle
  {
    entry: ['lib/appwrite-adapter.ts'],
    format: ['cjs'],  // Changed to CommonJS for Appwrite function runtime
    platform: 'node',
    target: 'node18',
    bundle: true,
    clean: true,
    minify: false,
    sourcemap: "inline",
    dts: true,
    noExternal: [/.*/],
    outDir: 'dist',
    treeshake: true,
    splitting: false,
  },
  // Main integration bundle
  {
    entry: ['lib/index.ts'],
    format: ['esm'],  // Keep ESM for the integration
    platform: 'node',
    target: 'node18',
    bundle: true,
    clean: false,
    minify: false,
    sourcemap: true,
    dts: true,
    outDir: 'dist',
  }
])