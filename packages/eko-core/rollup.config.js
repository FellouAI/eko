import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';
import json from '@rollup/plugin-json';

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.cjs.js',
        format: 'cjs',
        sourcemap: true
      }
    ],
    external: ['dotenv', '@langfuse/otel', '@opentelemetry/sdk-node'],
    plugins: [
      json(),
      commonjs(),
      resolve({
        preferBuiltins: true,
      }),
      typescript(),
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
        sourcemap: true
      }
    ],
    external: ['dotenv', 'buffer', '@langfuse/otel', '@opentelemetry/sdk-node'],
    plugins: [
      json(),
      commonjs(),
      resolve({
        browser: true,
        preferBuiltins: true,
      }),
      typescript({
        tsconfig: './tsconfig.json',
      }),
      copy({
        targets: [
          { src: '../../README.md', dest: './' }
        ]
      })
    ]
  }
];