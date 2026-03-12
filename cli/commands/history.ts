import { Command } from "commander";
import { getSDK } from "../utils/sdk-factory";
import { isJson, printJson, printTable, handleError, formatWei, normalizeSymbol } from "../utils/output";

export function registerHistoryCommands(program: Command) {
  const history = program.command("history").description("History queries");

  history
    .command("orders")
    .description("Query history orders")
    .option("--symbol <s>", "Filter by symbol")
    .option("--page <n>", "Page number", "1")
    .option("--size <n>", "Page size", "20")
    .option("--vault <address>", "Vault address")
    .option("--begin-time <ms>", "Begin time filter (epoch ms)")
    .option("--end-time <ms>", "End time filter (epoch ms)")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        const parentAddress = opts.vault || sdk.address;
        const result = await sdk.getHistoryOrders({
          ...(opts.symbol ? { symbol: normalizeSymbol(opts.symbol) } : {}),
          page: Number(opts.page),
          pageSize: Number(opts.size),
          parentAddress,
          ...(opts.beginTime ? { beginTime: Number(opts.beginTime) } : {}),
          ...(opts.endTime ? { endTime: Number(opts.endTime) } : {}),
        });
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        if (!result.data?.data?.length) return console.log("No history orders.");

        printTable(
          ["Symbol", "Side", "Type", "Qty", "Price", "Status", "PnL", "Time"],
          result.data.data.map((o) => [
            o.symbol || "-",
            o.side || "-",
            o.orderType || "-",
            formatWei(o.quantity),
            formatWei(o.price),
            o.status || "-",
            formatWei(o.realizedPnl),
            o.createdAt ? new Date(o.createdAt).toLocaleString() : "-",
          ])
        );
      } catch (e) {
        handleError(e);
      }
    });

  history
    .command("funding")
    .description("Query funding settlements")
    .option("--symbol <s>", "Filter by symbol")
    .option("--page <n>", "Page number", "1")
    .option("--size <n>", "Page size", "20")
    .option("--vault <address>", "Vault address")
    .option("--begin-time <ms>", "Begin time filter (epoch ms)")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        const parentAddress = opts.vault || sdk.address;
        const result = await sdk.getFundingSettlements({
          ...(opts.symbol ? { symbol: normalizeSymbol(opts.symbol) } : {}),
          page: Number(opts.page),
          pageSize: Number(opts.size),
          parentAddress,
          ...(opts.beginTime ? { beginTime: Number(opts.beginTime) } : {}),
        });
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        if (!result.data?.data?.length) return console.log("No funding settlements.");

        printTable(
          ["Symbol", "Side", "Size", "Rate", "Settlement", "Price", "Time"],
          result.data.data.map((f: any) => [
            f.symbol || "-",
            f.positionIsLong === 1 ? "LONG" : f.positionIsLong === 0 ? "SHORT" : f.side || "-",
            formatWei(f.size || f.quantity),
            formatWei(f.fundingRate),
            formatWei(f.settlementAmount || f.fundingFee),
            formatWei(f.oraclePrice),
            f.createdAt ? new Date(f.createdAt).toLocaleString() : "-",
          ])
        );
      } catch (e) {
        handleError(e);
      }
    });

  history
    .command("balance")
    .description("Query balance changes")
    .option("--page <n>", "Page number", "1")
    .option("--size <n>", "Page size", "20")
    .option("--vault <address>", "Vault address")
    .option("--begin-time <ms>", "Begin time filter (epoch ms)")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        const parentAddress = opts.vault || sdk.address;
        const result = await sdk.getBalanceChanges({
          page: Number(opts.page),
          pageSize: Number(opts.size),
          parentAddress,
          ...(opts.beginTime ? { beginTime: Number(opts.beginTime) } : {}),
        });
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        if (!result.data?.data?.length) return console.log("No balance changes.");

        printTable(
          ["Type", "Amount", "TxDigest", "Time"],
          result.data.data.map((b: any) => [
            b.bizTypeDesc || b.type || "-",
            formatWei(b.settlementAmount || b.amount),
            b.txDigest ? b.txDigest.slice(0, 16) + "..." : "-",
            b.createdTime || b.createdAt
              ? new Date(b.createdTime || b.createdAt).toLocaleString()
              : "-",
          ])
        );
      } catch (e) {
        handleError(e);
      }
    });
}
