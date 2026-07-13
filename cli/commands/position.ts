import { Command } from "commander";
import BigNumber from "bignumber.js";
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
    .option("--vault <address>", "Target a vault position (vault object ID)")
    .option("--tp-plan-id <id>", "Existing TP plan ID to edit")
    .option("--sl-plan-id <id>", "Existing SL plan ID to edit")
    .action(async (symbol, opts) => {
      try {
        const sdk = getSDK();
        symbol = normalizeSymbol(symbol);
        const perpId = await sdk.getPerpetualID(symbol);
        if (!perpId) return handleError(`PerpetualID not found for ${symbol}`);

        const sideInput = String(opts.side).toUpperCase();
        if (sideInput !== OrderSide.BUY && sideInput !== OrderSide.SELL) {
          return handleError(`--side must be buy or sell, got ${opts.side}`);
        }
        const side = sideInput as OrderSide;
        const isLong = side === OrderSide.SELL;

        if (!opts.tpTrigger && !opts.slTrigger) {
          return handleError("At least one of --tp-trigger or --sl-trigger is required.");
        }
        if (opts.tpPlanId && !opts.tpTrigger) {
          return handleError("--tp-plan-id requires --tp-trigger.");
        }
        if (opts.slPlanId && !opts.slTrigger) {
          return handleError("--sl-plan-id requires --sl-trigger.");
        }

        let tpPlanId = opts.tpPlanId as string | number | undefined;
        let slPlanId = opts.slPlanId as string | number | undefined;
        const shouldFindTpPlan = Boolean(opts.tpTrigger && !tpPlanId);
        const shouldFindSlPlan = Boolean(opts.slTrigger && !slPlanId);

        const parentAddress = opts.vault || sdk.address;
        const positionsResult = await sdk.getPositions({ parentAddress, symbol });
        if (!positionsResult.status) {
          return handleError(positionsResult.error || "Failed to fetch position");
        }

        const matchingPositions = (positionsResult.data || []).filter(
          (position) => position.symbol === symbol
        );
        if (matchingPositions.length !== 1) {
          return handleError(
            matchingPositions.length === 0
              ? `No open position for ${symbol}.`
              : `Multiple positions found for ${symbol}; cannot choose one safely.`
          );
        }

        const activePosition = matchingPositions[0];
        const positionSide = String(activePosition.side).toUpperCase();
        const expectedClosingSide =
          positionSide === "BUY" || positionSide === "LONG"
            ? OrderSide.SELL
            : positionSide === "SELL" || positionSide === "SHORT"
            ? OrderSide.BUY
            : undefined;
        if (!expectedClosingSide) {
          return handleError(`Unsupported position side: ${activePosition.side}`);
        }
        if (side !== expectedClosingSide) {
          return handleError(
            `--side must be ${expectedClosingSide.toLowerCase()} to close a ${positionSide} position.`
          );
        }

        const requestedQuantity = new BigNumber(opts.quantity);
        const positionQuantity = new BigNumber(activePosition.quantity).shiftedBy(-18);
        if (
          !requestedQuantity.isFinite() ||
          requestedQuantity.lte(0) ||
          requestedQuantity.gt(positionQuantity)
        ) {
          return handleError(
            `--quantity must be greater than 0 and no more than the position quantity (${positionQuantity.toFixed()}).`
          );
        }

        const requestedLeverage = new BigNumber(opts.leverage);
        const positionLeverage = new BigNumber(activePosition.leverage).shiftedBy(-18);
        if (!requestedLeverage.isFinite() || !requestedLeverage.eq(positionLeverage)) {
          return handleError(
            `--leverage must match the position leverage (${positionLeverage.toFixed()}).`
          );
        }

        // Editing a plan requires its existing ID. Resolve it automatically for the
        // position-wide TP/SL pair so repeating this command updates instead of duplicates.
        if (shouldFindTpPlan || shouldFindSlPlan) {
          const positionId = activePosition.id ?? activePosition.positionId;
          if (positionId === undefined || positionId === null) {
            return handleError(`Position ID missing for ${symbol}.`);
          }

          const plansResult = await sdk.getPositionTpSl(positionId, "position", opts.vault);
          if (!plansResult.status) {
            return handleError(plansResult.error || "Failed to fetch existing TP/SL orders");
          }

          const findExistingPlanId = (planOrderType: "takeProfit" | "stopLoss") => {
            const matches = (plansResult.data || []).filter(
              (order) => String(order.planOrderType).toLowerCase() === planOrderType.toLowerCase()
            );
            if (matches.length > 1) {
              throw new Error(
                `Multiple ${planOrderType} plans found; use --${
                  planOrderType === "takeProfit" ? "tp" : "sl"
                }-plan-id to choose one.`
              );
            }
            if (!matches.length) return undefined;
            const planId =
              planOrderType === "takeProfit" ? matches[0].tpPlanId : matches[0].slPlanId;
            if (planId === undefined || planId === null) {
              throw new Error(`${planOrderType} plan is missing its editable plan ID.`);
            }
            return planId;
          };

          if (shouldFindTpPlan) tpPlanId = findExistingPlanId("takeProfit");
          if (shouldFindSlPlan) slPlanId = findExistingPlanId("stopLoss");
        }

        const params: any = {
          symbol,
          market: perpId,
          ...(opts.vault ? { creator: opts.vault } : {}),
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
            ...(tpPlanId !== undefined ? { planId: tpPlanId } : {}),
            tpslType: "position" as const,
          };
        }

        if (opts.slTrigger) {
          params.sl = {
            triggerPrice: opts.slTrigger,
            orderType: opts.slType?.toUpperCase() === "LIMIT" ? OrderType.LIMIT : OrderType.MARKET,
            ...(opts.slPrice ? { orderPrice: opts.slPrice } : {}),
            ...(slPlanId !== undefined ? { planId: slPlanId } : {}),
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
