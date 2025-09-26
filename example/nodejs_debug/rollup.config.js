import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
      inlineDynamicImports: true
    }
  ],
  external: ['@opentelemetry/sdk-node', '@langfuse/otel'],
  plugins: [
    json(),
    commonjs(),
    resolve({
      preferBuiltins: true,
    }),
    typescript(
      {
        tsconfig: './tsconfig.json',
      }
    )
  ]
};