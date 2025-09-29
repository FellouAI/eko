import { builtinModules, createRequire } from "node:module";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import json from "@rollup/plugin-json";

const require = createRequire(import.meta.url);
const pkg = require("./package.json");

const external = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

export default {
  input: "src/index.ts",
  output: {
    file: "dist/index.cjs",
    format: "cjs",
    sourcemap: true,
  },
  external,
  plugins: [
    json(),
    resolve({ preferBuiltins: true }),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json" }),
  ],
};
