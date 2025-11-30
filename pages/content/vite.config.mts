import { resolve } from 'node:path';
import { makeEntryPointPlugin } from '@extension/hmr';
import { isDev, withPageConfig } from '@extension/vite-config';

const rootDir = resolve(__dirname);
const srcDir = resolve(rootDir, 'src');

export default withPageConfig({
  resolve: {
    alias: {
      '@src': srcDir,
    },
  },
  publicDir: resolve(rootDir, 'public'),
  plugins: [isDev && makeEntryPointPlugin()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['iife'],
      name: 'ContentScript',
      fileName: 'index',
    },
    outDir: resolve(rootDir, '..', '..', 'dist', 'content'),
  },
});
