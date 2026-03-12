import { Command } from "commander";
import { getSDK } from "../utils/sdk-factory";
import { isJson, printJson, printTable, handleError, normalizeSymbol, formatWei } from "../utils/output";
import { OrderSide, OrderType } from "../../src/types";

/**
 * Parse amount string: "100USDC" -> 100, "100" -> 100
 */
function parseUsdcAmount(raw: string): number {
  const cleaned = raw.replace(/usdc$/i, "");
  const val = parseFloat(cleaned);
  if (isNaN(val) || val <= 0) throw new Error(`Invalid amount: ${raw}`);
  return val;
}

/**
 * Parse leverage string: "10x" -> "10", "10" -> "10"
 */
function parseLeverage(raw: string): string {
  const cleaned = raw.replace(/x$/i, "");
  const val = parseFloat(cleaned);
  if (isNaN(val) || val <= 0) throw new Error(`Invalid leverage: ${raw}`);
  return cleaned;
}

async function placeOrder(
  program: Command,
  side: OrderSide,
  symbol: string,
  amount: string,
  leverage: string,
  opts: any
) {
  try {
    const sdk = getSDK();

    const lev = parseLeverage(leverage);
    const orderType = opts.price ? OrderType.LIMIT : OrderType.MARKET;

    symbol = normalizeSymbol(symbol);

    let quantity: string;

    if (opts.qty) {
      // Explicit quantity mode
      quantity = opts.qty;
    } else {
      // Default: USDC margin mode
      const usdcAmount = parseUsdcAmount(amount);

      const tickerResult = await sdk.getTicker(symbol);
      if (!tickerResult.status || !tickerResult.data)
        return handleError("Failed to get market price for USDC conversion");
      const priceWei = parseFloat(tickerResult.data.lastPrice);
      if (!priceWei || priceWei <= 0) return handleError("Invalid market price");
      const price = priceWei / 1e18;
      const rawQty = (usdcAmount * parseFloat(lev)) / price;

      let stepSize = 0.01;
      const pairResult = await sdk.getTradingPairs();
      if (pairResult.status && pairResult.data) {
        const pair = pairResult.data.find((p: any) => p.symbol === symbol);
        if (pair?.stepSize) {
          const parsed = parseFloat(pair.stepSize);
          if (parsed > 0) stepSize = parsed > 1e10 ? parsed / 1e18 : parsed;
        } else if (pair?.minTradeQty) {
          const parsed = parseFloat(pair.minTradeQty);
          if (parsed > 0) stepSize = parsed > 1e10 ? parsed / 1e18 : parsed;
        }
      }
      const stepped = Math.floor(rawQty / stepSize) * stepSize;
      const decimals = stepSize < 1 ? Math.ceil(-Math.log10(stepSize)) : 0;
      quantity = stepped.toFixed(decimals);
      if (parseFloat(quantity) <= 0)
        return handleError(`USDC amount too small, minimum quantity step is ${stepSize}`);
      if (!isJson(program))
        console.log(
          `USDC ${usdcAmount} -> quantity ${quantity} (price: ${price}, leverage: ${lev}x, step: ${stepSize})`
        );
    }

    const perpId = await sdk.getPerpetualID(symbol);
    if (!perpId) return handleError(`PerpetualID not found for ${symbol}`);

    const params: any = {
      symbol,
      market: perpId,
      side,
      orderType,
      quantity,
      leverage: lev,
      reduceOnly: opts.reduceOnly || false,
    };

    if (opts.price) {
      params.price = opts.price;
    }

    // --vault <address> for trading on behalf of a vault
    if (opts.vault) {
      params.creator = opts.vault;
    }

    if (opts.tp) params.tpTriggerPrice = opts.tp;
    if (opts.sl) params.slTriggerPrice = opts.sl;

    const result = await sdk.placeOrder(params);
    if (!result.status) return handleError(result.error);

    if (isJson(program)) return printJson(result.data);
    console.log(`${side} ${orderType} order placed on ${symbol}: ${result.data?.message || "OK"}`);
    if (result.data?.data) console.log(JSON.stringify(result.data.data, null, 2));
  } catch (e) {
    handleError(e);
  }
}

export function registerTradeCommands(program: Command) {
  const trade = program.command("trade").description("Trading operations");

  const orderOpts = (cmd: Command) =>
    cmd
      .option("--qty <quantity>", "Specify order quantity instead of USDC margin")
      .option("--price <p>", "Limit order price (auto-enables limit order)")
      .option("--reduce-only", "Reduce only order")
      .option("--tp <price>", "Take profit trigger price")
      .option("--sl <price>", "Stop loss trigger price")
      .option("--vault <address>", "Vault/creator address");

  orderOpts(
    trade
      .command("buy")
      .description("Place a BUY order (e.g. trade buy BTC 100USDC 10x)")
      .argument("<symbol>", "Trading pair (e.g. BTC or BTC-PERP)")
      .argument("<amount>", "USDC margin amount (e.g. 100 or 100USDC)")
      .argument("<leverage>", "Leverage multiplier (e.g. 10 or 10x)")
  ).action((symbol, amount, leverage, opts) =>
    placeOrder(program, OrderSide.BUY, symbol, amount, leverage, opts)
  );

  orderOpts(
    trade
      .command("sell")
      .description("Place a SELL order (e.g. trade sell BTC 100USDC 10x)")
      .argument("<symbol>", "Trading pair (e.g. BTC or BTC-PERP)")
      .argument("<amount>", "USDC margin amount (e.g. 100 or 100USDC)")
      .argument("<leverage>", "Leverage multiplier (e.g. 10 or 10x)")
  ).action((symbol, amount, leverage, opts) =>
    placeOrder(program, OrderSide.SELL, symbol, amount, leverage, opts)
  );

  trade
    .command("cancel")
    .description("Cancel orders by hash")
    .argument("<symbol>", "Trading pair")
    .argument("<hashes...>", "Order hashes to cancel")
    .option("--vault <address>", "Parent address")
    .action(async (symbol, hashes, opts) => {
      try {
        symbol = normalizeSymbol(symbol);
        const sdk = getSDK();
        const parentAddress = opts.vault || sdk.address;
        const result = await sdk.cancelOrder({
          symbol,
          orderHashes: hashes,
          parentAddress,
        });
        if (!result.status) return handleError(result.error);
        if (isJson(program)) return printJson(result.data);
        console.log("Orders cancelled:", hashes.join(", "));
      } catch (e) {
        handleError(e);
      }
    });

  trade
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
          ...(opts.symbol ? { symbol: normalizeSymbol(opts.symbol) } : {}),
        };
        const result = await sdk.getOpenOrders(params as any);
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        if (!result.data?.length) return console.log("No open orders.");

        printTable(
          ["Hash", "Symbol", "Side", "Type", "Qty", "Price", "Leverage", "Status"],
          result.data.map((o: any) => [
            o.hash,
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
