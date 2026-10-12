#!/usr/bin/env node
/**
 * Builds the unpacked extension into dist/ (or dist-e2e/ with --e2e):
 *  1. pages + service worker (Vite, ES modules)
 *  2. the injected extractor as a single classic script (IIFE)
 *  3. manifest.json + _locales generated from the PRODUCT constant
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { buildManifest } from './manifest.config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const e2e = process.argv.includes('--e2e');
const watch = process.argv.includes('--watch');
const outDir = resolve(here, e2e ? 'dist-e2e' : 'dist');
const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8'));

// Read the product constant without a TS loader: it is a plain object literal.
const productSrc = readFileSync(resolve(here, '../../packages/core/src/config/product.ts'), 'utf8');
const pick = (re) => re.exec(productSrc)?.[1];
const product = {
  name: pick(/name:\s*'([^']+)'/),
  slug: pick(/slug:\s*'([^']+)'/),
  description: { el: pick(/el:\s*'([^']+)'/), en: pick(/en:\s*'([^']+)'/) },
};
if (!product.name || !product.description.el || !product.description.en) throw new Error('Could not read PRODUCT from product.ts');

const common = {
  configFile: false,
  logLevel: 'warn',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
};

await build({
  ...common,
  root: resolve(here, 'src'),
  publicDir: resolve(here, 'public'),
  base: '',
  plugins: [{ name: 'product-name', transformIndexHtml: (html) => html.replaceAll('%PRODUCT_NAME%', product.name) }],
  build: {
    outDir,
    emptyOutDir: true,
    target: 'chrome116',
    sourcemap: watch,
    minify: !watch,
    modulePreload: false,
    watch: watch ? {} : null,
    rollupOptions: {
      input: {
        popup: resolve(here, 'src/popup/index.html'),
        history: resolve(here, 'src/pages/history/index.html'),
        settings: resolve(here, 'src/pages/settings/index.html'),
        privacy: resolve(here, 'src/pages/privacy/index.html'),
        background: resolve(here, 'src/background.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});

await build({
  ...common,
  root: here,
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: false,
    target: 'chrome116',
    minify: !watch,
    watch: watch ? {} : null,
    lib: { entry: resolve(here, 'src/extract/index.ts'), formats: ['iife'], name: 'timoulaExtract', fileName: () => 'extract.js' },
  },
});

const { manifest, locales } = buildManifest({ product, version: pkg.version, e2e });
writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
for (const [lang, messages] of Object.entries(locales)) {
  mkdirSync(resolve(outDir, '_locales', lang), { recursive: true });
  writeFileSync(resolve(outDir, '_locales', lang, 'messages.json'), JSON.stringify(messages, null, 2));
}
console.log(`Built ${product.name} ${pkg.version} → ${outDir}`);
