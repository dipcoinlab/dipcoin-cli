import { Command } from "commander";
import { getSDK } from "../utils/sdk-factory";
import { isJson, printJson, printTable, handleError, formatWei } from "../utils/output";

export function registerOrdersCommand(program: Command) {
  program
    .command("orders")
    .description("List open orders")
    .option("--symbol <s>", "Filter by symbol")
    .option("--vault <address>", "Vault address")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        const parentAddress = opts.vault || sdk.address;
        const params: any = {
          parentAddress,
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
