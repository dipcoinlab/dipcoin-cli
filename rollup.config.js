import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

var rollup_config = [
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/index.esm.js",
        format: "esm",
        sourcemap: true,
        exports: "named",
      },
      {
        file: "dist/index.cjs.js",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
      {
        file: "./dist/index.mjs",
        format: "es",
        sourcemap: true,
        exports: "named",
      },
    ],
    plugins: [
      nodeResolve({
        preferBuiltins: false,
      }),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: true,
        declarationDir: "./dist",
      }),
      terser({
        compress: {
          drop_console: true,
        },
      }),
    ],
    external: [
      "axios",
      "@mysten/sui",
      "@dipcoinlab/perp-ts-library",
      "bignumber.js",
      "buffer",
      "node:buffer",
      "fs",
      "path",
      "url",
    ],
  },
  {
    input: "cli/index.ts",
    output: {
      file: "dist/cli.cjs",
      format: "cjs",
      banner: "#!/usr/bin/env node",
    },
    plugins: [
      nodeResolve({
        preferBuiltins: true,
      }),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: false,
        declarationMap: false,
      }),
    ],
    external: [
      "axios",
      "@mysten/sui",
      "@mysten/sui/keypairs/ed25519",
      "@mysten/sui/transactions",
      "@mysten/sui/utils",
      "@dipcoinlab/perp-ts-library",
      "@pythnetwork/pyth-sui-js",
      "bignumber.js",
      "buffer",
      "node:buffer",
      "fs",
      "path",
      "url",
      "dotenv",
      "commander",
      "cli-table3",
    ],
  },
];
export { rollup_config as default };

