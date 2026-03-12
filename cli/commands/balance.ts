import { Command } from "commander";
import { getSDK } from "../utils/sdk-factory";
import { isJson, printJson, printTable, handleError } from "../utils/output";
import BigNumber from "bignumber.js";

function formatCoinBalance(totalBalance: string, decimals: number): string {
  const bn = new BigNumber(totalBalance);
  if (bn.isNaN() || bn.isZero()) return "0";
  return bn.dividedBy(new BigNumber(10).pow(decimals)).toFixed(decimals);
}

export function registerBalanceCommand(program: Command) {
  program
    .command("balance")
    .description("Show on-chain coin balances for the current wallet")
    .action(async () => {
      try {
        const sdk = getSDK();
        const result = await sdk.getAllBalances();
        if (!result.status || !result.data) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        if (!result.data.length) return console.log("No coins found.");

        const rows: string[][] = [];
        for (const b of result.data) {
          const meta = await sdk.getCoinMetadata(b.coinType);
          const symbol = meta.status && meta.data ? meta.data.symbol : b.coinType;
          const decimals = meta.status && meta.data ? meta.data.decimals : 9;
          rows.push([symbol, formatCoinBalance(b.totalBalance, decimals)]);
        }

        printTable(["Coin", "Balance"], rows);
      } catch (e) {
        handleError(e);
      }
    });
}
