import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
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
    external: ['dotenv', 'buffer', 'canvas'],
    plugins: [
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
    external: ['dotenv', 'buffer', 'canvas'],
    plugins: [
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