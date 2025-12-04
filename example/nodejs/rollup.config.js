import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

export default {
  input: "src/index.ts",
  output: [
    {
      file: "dist/index.cjs",
      format: "cjs",
    },
  ],
  external: (id) =>
    [
      "chrome-cookies-secure",
      "sqlite3",
      "keytar",
      "bindings",
      "level",
      "leveldown",
    ].some((mod) => id === mod || id.startsWith(mod + "/")) ||
    id.endsWith(".node"),
  plugins: [
    json(),
    commonjs({
      ignoreDynamicRequires: true,
    }),
    resolve({
      preferBuiltins: true,
    }),
    typescript(),
  ],
};
