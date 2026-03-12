import { Command } from "commander";
import { getSDK } from "../utils/sdk-factory";
import {
  isJson,
  printJson,
  printTable,
  handleError,
  formatWei,
  normalizeSymbol,
  parseAmount,
} from "../utils/output";
import { OrderSide, OrderType } from "../../src/types";

export function registerPositionCommands(program: Command) {
  const position = program.command("position").description("Position operations");

  position
    .command("list")
    .description("List open positions")
    .option("--symbol <s>", "Filter by symbol")
    .option("--vault <address>", "Vault address")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        const parentAddress = opts.vault || sdk.address;
        const params: any = {
          parentAddress,
          ...(opts.symbol ? { symbol: normalizeSymbol(opts.symbol) } : {}),
        };
        const result = await sdk.getPositions(params as any);
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        if (!result.data?.length) return console.log("No open positions.");

        printTable(
          ["Symbol", "Side", "Qty", "Entry", "Leverage", "Liq Price", "uPnL", "Margin"],
          result.data.map((p) => [
            p.symbol,
            p.side,
            formatWei(p.quantity),
            formatWei(p.avgEntryPrice),
            formatWei(p.leverage) + "x",
            formatWei(p.liquidationPrice),
            formatWei(p.unrealizedProfit),
            formatWei(p.margin),
          ])
        );
      } catch (e) {
        handleError(e);
      }
    });

  position
    .command("tpsl")
    .description("Place TP/SL orders on a position")
    .argument("<symbol>", "Trading pair")
    .requiredOption("--side <side>", "Closing side: buy or sell")
    .requiredOption("--quantity <q>", "Quantity")
    .requiredOption("--leverage <n>", "Leverage")
    .option("--tp-trigger <price>", "TP trigger price")
    .option("--tp-type <type>", "TP order type: market or limit", "market")
    .option("--tp-price <price>", "TP order price (for limit)")
    .option("--sl-trigger <price>", "SL trigger price")
    .option("--sl-type <type>", "SL order type: market or limit", "market")
    .option("--sl-price <price>", "SL order price (for limit)")
    .action(async (symbol, opts) => {
      try {
        const sdk = getSDK();
        symbol = normalizeSymbol(symbol);
        const perpId = await sdk.getPerpetualID(symbol);
        if (!perpId) return handleError(`PerpetualID not found for ${symbol}`);

        const side = opts.side.toUpperCase() === "BUY" ? OrderSide.BUY : OrderSide.SELL;
        const isLong = side === OrderSide.SELL;

        const params: any = {
          symbol,
          market: perpId,
          side,
          isLong,
          quantity: opts.quantity,
          leverage: opts.leverage,
        };

        if (opts.tpTrigger) {
          params.tp = {
            triggerPrice: opts.tpTrigger,
            orderType: opts.tpType?.toUpperCase() === "LIMIT" ? OrderType.LIMIT : OrderType.MARKET,
            ...(opts.tpPrice ? { orderPrice: opts.tpPrice } : {}),
            tpslType: "position" as const,
          };
        }

        if (opts.slTrigger) {
          params.sl = {
            triggerPrice: opts.slTrigger,
            orderType: opts.slType?.toUpperCase() === "LIMIT" ? OrderType.LIMIT : OrderType.MARKET,
            ...(opts.slPrice ? { orderPrice: opts.slPrice } : {}),
            tpslType: "position" as const,
          };
        }

        const result = await sdk.placePositionTpSlOrders(params);
        if (!result.status) return handleError(result.error);
        if (isJson(program)) return printJson(result.data);
        console.log("TP/SL orders placed:", JSON.stringify(result.data, null, 2));
      } catch (e) {
        handleError(e);
      }
    });

  const margin = position.command("margin").description("Margin operations");

  margin
    .command("add")
    .description("Add margin to position")
    .argument("<symbol>", "Trading pair")
    .argument("<amount>", "Amount in USDC")
    .action(async (symbol, amount) => {
      try {
        const sdk = getSDK();
        symbol = normalizeSymbol(symbol);
        const tx = await sdk.addMargin({ symbol, amount: parseAmount(amount) });
        if (isJson(program)) return printJson({ digest: tx?.digest, status: "ok" });
        console.log(`Added ${amount} margin to ${symbol}. Tx: ${tx?.digest || JSON.stringify(tx)}`);
      } catch (e) {
        handleError(e);
      }
    });

  margin
    .command("remove")
    .description("Remove margin from position")
    .argument("<symbol>", "Trading pair")
    .argument("<amount>", "Amount in USDC")
    .action(async (symbol, amount) => {
      try {
        const sdk = getSDK();
        symbol = normalizeSymbol(symbol);
        const tx = await sdk.removeMargin({ symbol, amount: parseAmount(amount) });
        if (isJson(program)) return printJson({ digest: tx?.digest, status: "ok" });
        console.log(
          `Removed ${amount} margin from ${symbol}. Tx: ${tx?.digest || JSON.stringify(tx)}`
        );
      } catch (e) {
        handleError(e);
      }
    });
}
