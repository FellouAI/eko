import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.cjs.js',
        format: 'cjs',
        sourcemap: 'inline'
      }
    ],
    external: ["@eko-ai/eko"],
    plugins: [
      commonjs(),
      resolve({
        preferBuiltins: true,
      }),
      typescript({
        sourceMap: true,
        inlineSources: true,
      }),
      copy({
        targets: [
          { src: '../../README.md', dest: './' }
        ]
      })
    ]
  },
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.esm.js',
        format: 'esm',
        sourcemap: 'inline'
      }
    ],
    external: ["@eko-ai/eko"],
    plugins: [
      commonjs(),
      resolve({
        browser: true,
        preferBuiltins: true,
      }),
      typescript({
        sourceMap: true,
        inlineSources: true,
      }),
      copy({
        targets: [
          { src: '../../README.md', dest: './' }
        ]
      })
    ]
  }
];