import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

var rollup_config = [
  {
    input: "cli/index.ts",
    output: {
      file: "dist/cli.cjs",
      format: "cjs",
      banner: "#!/usr/bin/env node",
      sourcemap: true,
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
      "@pythnetwork/pyth-sui-js",
      "bignumber.js",
      "buffer",
      "node:buffer",
      "child_process",
      "cli-table3",
      "commander",
      "dotenv",
      "fs",
      "os",
      "path",
      "url",
    ],
  },
];
export { rollup_config as default };
