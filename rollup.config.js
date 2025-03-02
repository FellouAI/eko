import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import copy from 'rollup-plugin-copy';
import replace from '@rollup/plugin-replace';
import { execSync } from 'child_process';

const commitHash = execSync('git rev-parse HEAD').toString().trim();

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.cjs.js',
        format: 'cjs'
      },
      {
        file: 'dist/index.esm.js',
        format: 'esm'
      }
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: 'dist',
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist', 'src/extension/**/*', 'src/web/**/*', 'src/nodejs/**/*', 'src/fellou/**/*']
      }),
      replace({
        'process.env.COMMIT_HASH': JSON.stringify(commitHash),
      }),
    ]
  },
  {
    input: 'src/extension/index.ts',
    output: [
      {
        file: 'dist/extension.cjs.js',
        format: 'cjs'
      },
      {
        file: 'dist/extension.esm.js',
        format: 'esm'
      }
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({ 
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: 'dist',
        include: ['src/common/**/*', 'src/types/*', 'src/extension/**/*'],
        exclude: ['src/extension/script']
      }),
      replace({
        'process.env.COMMIT_HASH': JSON.stringify(commitHash),
      }),
      copy({
        targets: [
          { src: 'src/extension/script', dest: 'dist/extension' }
        ]
      })
    ]
  },
  {
    input: 'src/extension/content/index.ts',
    output: {
      file: 'dist/extension_content_script.js',
      format: 'esm'
    },
    plugins: [
      resolve(),
      commonjs(),
      typescript({ 
        tsconfig: './tsconfig.json',
        declaration: false,
        include: ['src/common/**/*', 'src/extension/content/*'],
        declarationDir: 'dist'
      }),
      replace({
        'process.env.COMMIT_HASH': JSON.stringify(commitHash),
      }),
    ]
  },
  {
    input: 'src/web/index.ts',
    output: [
      {
        file: 'dist/web.cjs.js',
        format: 'cjs'
      },
      {
        file: 'dist/web.esm.js',
        format: 'esm'
      }
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({ 
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: 'dist',
        include: ['src/common/**/*', 'src/types/*', 'src/web/**/*']
      }),
      replace({
        'process.env.COMMIT_HASH': JSON.stringify(commitHash),
      }),
    ]
  },
  {
    input: 'src/nodejs/index.ts',
    output: [
      {
        file: 'dist/nodejs.cjs.js',
        format: 'cjs'
      }
    ],
    plugins: [
      json(),
      resolve(),
      commonjs(),
      typescript({ 
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: 'dist',
        include: ['src/common/**/*', 'src/types/*', 'src/nodejs/**/*']
      }),
      replace({
        'process.env.COMMIT_HASH': JSON.stringify(commitHash),
      }),
    ]
  },
  {
    input: 'src/nodejs/index.ts',
    output: [
      {
        file: 'dist/nodejs.esm.js',
        format: 'esm'
      }
    ],
    plugins: [
      json(),
      resolve(),
      commonjs(),
      typescript({ 
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: 'dist',
        include: ['src/common/**/*', 'src/types/*', 'src/nodejs/**/*']
      }),
      replace({
        'process.env.COMMIT_HASH': JSON.stringify(commitHash),
      }),
      replace({
        preventAssignment: true,
        values: {
          __dirname: "'.'" // Temporary Solution
        }
      })
    ]
  },
  {
    input: 'src/fellou/index.ts',
    output: [
      {
        file: 'dist/fellou.cjs.js',
        format: 'cjs'
      },
      {
        file: 'dist/fellou.esm.js',
        format: 'esm'
      }
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({ 
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: 'dist',
        include: ['src/common/**/*', 'src/types/*', 'src/fellou/**/*']
      }),
      replace({
        'process.env.COMMIT_HASH': JSON.stringify(commitHash),
      }),
    ]
  }
];