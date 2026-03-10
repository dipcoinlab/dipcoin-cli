import { Command } from "commander";
import { getSDK } from "../utils/sdk-factory";
import { isJson, printJson, printTable, handleError, normalizeSymbol } from "../utils/output";

export function registerMarketCommands(program: Command) {
  const market = program.command("market").description("Market data");

  market
    .command("pairs")
    .description("List trading pairs")
    .action(async () => {
      try {
        const sdk = getSDK();
        const result = await sdk.getTradingPairs();
        if (!result.status || !result.data) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        printTable(
          ["Symbol", "PerpID", "Max Leverage"],
          result.data.map((p) => [p.symbol, p.perpId.slice(0, 16) + "...", p.maxLeverage || "-"])
        );
      } catch (e) {
        handleError(e);
      }
    });

  market
    .command("ticker")
    .description("Get ticker for a symbol")
    .argument("<symbol>", "Trading pair")
    .action(async (symbol) => {
      try {
        symbol = normalizeSymbol(symbol);
        const sdk = getSDK();
        const result = await sdk.getTicker(symbol);
        if (!result.status || !result.data) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        const t = result.data;
        printTable(
          ["Field", "Value"],
          [
            ["Symbol", t.symbol],
            ["Last Price", t.lastPrice],
            ["Mark Price", t.markPrice || "-"],
            ["24h Change", `${t.change24h || "-"} (${t.rate24h || "-"})`],
            ["24h High/Low", `${t.high24h} / ${t.low24h}`],
            ["24h Volume", t.volume24h],
            ["Open Interest", t.openInterest || "-"],
            ["Funding Rate", t.fundingRate || "-"],
          ]
        );
      } catch (e) {
        handleError(e);
      }
    });

  market
    .command("orderbook")
    .description("Get order book for a symbol")
    .argument("<symbol>", "Trading pair")
    .action(async (symbol) => {
      try {
        symbol = normalizeSymbol(symbol);
        const sdk = getSDK();
        const result = await sdk.getOrderBook(symbol);
        if (!result.status || !result.data) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        const ob = result.data;
        console.log(`\n  Order Book: ${symbol}`);
        console.log("  --- Asks (sell) ---");
        ob.asks.slice(0, 10).reverse().forEach((a) => {
          console.log(`    ${a.price.padStart(14)}  |  ${a.quantity}`);
        });
        console.log("  --- Bids (buy) ---");
        ob.bids.slice(0, 10).forEach((b) => {
          console.log(`    ${b.price.padStart(14)}  |  ${b.quantity}`);
        });
      } catch (e) {
        handleError(e);
      }
    });

  market
    .command("oracle")
    .description("Get oracle price for a symbol")
    .argument("<symbol>", "Trading pair")
    .action(async (symbol) => {
      try {
        symbol = normalizeSymbol(symbol);
        const sdk = getSDK();
        const result = await sdk.getOraclePrice(symbol);
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson({ symbol, oraclePrice: result.data });
        console.log(`Oracle price for ${symbol}: ${result.data}`);
      } catch (e) {
        handleError(e);
      }
    });
}
