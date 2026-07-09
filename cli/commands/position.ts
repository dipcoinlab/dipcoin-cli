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

  // Helper: align a human-readable quantity to the market's step size.
  async function alignToStepSize(sdk: any, symbol: string, qty: number): Promise<number> {
    let stepSize = 0.001;
    try {
      const pairResult = await sdk.getTradingPairs();
      if (pairResult.status && pairResult.data) {
        const pair = pairResult.data.find((p: any) => p.symbol === symbol);
        const raw = pair?.stepSize ?? pair?.minTradeQty;
        if (raw) {
          const parsed = parseFloat(raw);
          if (parsed > 0) stepSize = parsed > 1e10 ? parsed / 1e18 : parsed;
        }
      }
    } catch {
      // fall through with default stepSize
    }
    const stepped = Math.floor(qty / stepSize) * stepSize;
    const decimals = stepSize < 1 ? Math.ceil(-Math.log10(stepSize)) : 0;
    return parseFloat(stepped.toFixed(decimals));
  }

  // Helper: close one position with a reduce-only market order. Returns the API response.
  async function closeOnePosition(
    sdk: any,
    pos: any,
    percent: number,
    vault?: string
  ): Promise<{ ok: boolean; message: string; data?: any }> {
    const symbol = pos.symbol as string;
    const sideStr = String(pos.side).toUpperCase();
    const closingSide = sideStr === "BUY" ? OrderSide.SELL : OrderSide.BUY;
    const totalQtyHuman = Number(pos.quantity) / 1e18;
    const wanted = totalQtyHuman * (percent / 100);
    const aligned = await alignToStepSize(sdk, symbol, wanted);
    if (aligned <= 0) {
      return {
        ok: false,
        message: `Closing ${percent}% of ${totalQtyHuman} ${symbol} would round to 0 at market step size — try a larger percentage.`,
      };
    }
    const perpId = await sdk.getPerpetualID(symbol);
    if (!perpId) return { ok: false, message: `PerpetualID not found for ${symbol}` };
    const leverageHuman = String(Number(pos.leverage) / 1e18);
    const params: any = {
      symbol,
      market: perpId,
      side: closingSide,
      orderType: OrderType.MARKET,
      quantity: String(aligned),
      leverage: leverageHuman,
      reduceOnly: true,
    };
    if (vault) params.creator = vault;
    const result = await sdk.placeOrder(params);
    if (!result.status) return { ok: false, message: result.error || "placeOrder failed" };
    return {
      ok: true,
      message: `Closed ${aligned} ${symbol} (${closingSide} reduce-only).`,
      data: result.data,
    };
  }

  position
    .command("close")
    .description("Close a position with a reduce-only market order (default: 100%)")
    .argument("<symbol>", "Trading pair (e.g. BTC or BTC-PERP)")
    .option("--percent <n>", "Percent of position to close (1-100, default: 100)", "100")
    .option("--vault <address>", "Target a vault's position instead of personal")
    .action(async (symbol, opts) => {
      try {
        symbol = normalizeSymbol(symbol);
        const percent = Number(opts.percent);
        if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
          return handleError(`--percent must be in (0, 100], got ${opts.percent}`);
        }
        const sdk = getSDK();
        const parentAddress = opts.vault || sdk.address;
        const result = await sdk.getPositions({ parentAddress, symbol });
        if (!result.status) return handleError(result.error);
        const pos = (result.data || []).find((p: any) => p.symbol === symbol);
        if (!pos) return handleError(`No open position for ${symbol}.`);
        const r = await closeOnePosition(sdk, pos, percent, opts.vault);
        if (!r.ok) return handleError(r.message);
        if (isJson(program)) return printJson(r.data);
        console.log(r.message);
      } catch (e) {
        handleError(e);
      }
    });

  position
    .command("close-all")
    .description("Close every open position with reduce-only market orders")
    .option("--percent <n>", "Percent of each position to close (1-100, default: 100)", "100")
    .option("--vault <address>", "Target vault positions instead of personal")
    .action(async (opts) => {
      try {
        const percent = Number(opts.percent);
        if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
          return handleError(`--percent must be in (0, 100], got ${opts.percent}`);
        }
        const sdk = getSDK();
        const parentAddress = opts.vault || sdk.address;
        const result = await sdk.getPositions({ parentAddress });
        if (!result.status) return handleError(result.error);
        const positions = result.data || [];
        if (!positions.length) {
          if (isJson(program)) return printJson({ closed: 0, results: [] });
          return console.log("No open positions to close.");
        }
        const results: Array<{ symbol: string; ok: boolean; message: string }> = [];
        for (const pos of positions) {
          const r = await closeOnePosition(sdk, pos, percent, opts.vault);
          results.push({ symbol: pos.symbol, ok: r.ok, message: r.message });
          if (!isJson(program))
            console.log(`  ${pos.symbol}: ${r.ok ? "OK" : "FAILED"} — ${r.message}`);
        }
        if (isJson(program)) printJson({ closed: results.filter((r) => r.ok).length, results });
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
    .option("--vault <address>", "Target a vault's position (vault id) instead of personal account")
    .action(async (symbol, amount, opts) => {
      try {
        const sdk = getSDK();
        symbol = normalizeSymbol(symbol);
        const tx = await sdk.addMargin({
          symbol,
          amount: parseAmount(amount),
          accountAddress: opts.vault,
        });
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
    .option("--vault <address>", "Target a vault's position (vault id) instead of personal account")
    .action(async (symbol, amount, opts) => {
      try {
        const sdk = getSDK();
        symbol = normalizeSymbol(symbol);
        const tx = await sdk.removeMargin({
          symbol,
          amount: parseAmount(amount),
          accountAddress: opts.vault,
        });
        if (isJson(program)) return printJson({ digest: tx?.digest, status: "ok" });
        console.log(
          `Removed ${amount} margin from ${symbol}. Tx: ${tx?.digest || JSON.stringify(tx)}`
        );
      } catch (e) {
        handleError(e);
      }
    });
}
