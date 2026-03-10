import { Command } from "commander";
import { getSDK, resolveVaultAddress } from "../utils/sdk-factory";
import { getGlobalVaultIndex } from "../utils/vault-index";
import { isJson, printJson, printTable, handleError, formatWei } from "../utils/output";

export function registerOrdersCommand(program: Command) {
  program
    .command("orders")
    .description("List open orders")
    .option("--symbol <s>", "Filter by symbol")
    .option("--vault <address>", "Vault address")
    .action(async (opts) => {
      try {
        const vaultIndex = getGlobalVaultIndex(program);
        const sdk = getSDK(vaultIndex);
        const vault = opts.vault || resolveVaultAddress(vaultIndex) || sdk.address;
        const params: any = {
          parentAddress: vault,
          ...(opts.symbol ? { symbol: opts.symbol } : {}),
        };
        const result = await sdk.getOpenOrders(params as any);
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        if (!result.data?.length) return console.log("No open orders.");

        printTable(
          ["Hash", "Symbol", "Side", "Type", "Qty", "Price", "Leverage", "Status"],
          result.data.map((o) => [
            o.hash.slice(0, 12) + "...",
            o.symbol,
            o.side,
            o.orderType,
            formatWei(o.quantity),
            formatWei(o.price),
            formatWei(o.leverage) + "x",
            o.status,
          ])
        );
      } catch (e) {
        handleError(e);
      }
    });
}
