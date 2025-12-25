import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import copy from 'rollup-plugin-copy';

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
        interop: 'auto'
      }
    ],
    external: ["dotenv", "@eko-ai/eko", "canvas", "playwright", "playwright-extra", "puppeteer-extra-plugin-stealth"],
    plugins: [
      json(),
      commonjs(),
      resolve({
        preferBuiltins: true,
      }),
      typescript({
        declaration: true,
        declarationMap: true,
        compilerOptions: {
          declaration: true,
          declarationMap: true,
          moduleResolution: 'Bundler',
        }
      }),
      copy({
        targets: [
          { src: '../../README.md', dest: './' }
        ],
        hook: 'writeBundle'
      })
    ]
  },
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.esm.js',
        format: 'esm',
        sourcemap: true
      }
    ],
    external: ["dotenv", "@eko-ai/eko", "canvas", "playwright"],
    plugins: [
      json(),
      commonjs(),
      resolve({
        browser: true,
        preferBuiltins: true,
      }),
      typescript({
        declaration: false,
        declarationMap: false,
      })
    ]
  }
];