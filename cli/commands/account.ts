import { Command } from "commander";
import { getSDK } from "../utils/sdk-factory";
import {
  isJson,
  printJson,
  printTable,
  handleError,
  formatWei,
  printTxResult,
  parseAmount,
} from "../utils/output";

export function registerAccountCommands(program: Command) {
  const account = program.command("account").description("Account operations");

  account
    .command("info")
    .description("Show account info (balance, margin, PnL)")
    .option("--vault <address>", "Vault address")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        const parentAddress = opts.vault || sdk.address;
        const result = await sdk.getAccountInfo({ parentAddress });
        if (!result.status || !result.data) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        const d = result.data;
        printTable(
          ["Field", "Value"],
          [
            ["Wallet", parentAddress],
            ["Wallet Balance", formatWei(d.walletBalance)],
            ["Account Value", formatWei(d.accountValue)],
            ["Free Collateral", formatWei(d.freeCollateral)],
            ["Total Margin", formatWei(d.totalMargin)],
            ["Unrealized PnL", formatWei(d.totalUnrealizedProfit)],
          ]
        );
      } catch (e) {
        handleError(e);
      }
    });

  account
    .command("deposit")
    .description("Deposit USDC to exchange")
    .argument("<amount>", "Amount in USDC")
    .action(async (amount) => {
      try {
        const sdk = getSDK();
        const tx = await sdk.depositToBank(parseAmount(amount));
        printTxResult(program, tx, `Deposit ${amount} USDC succeeded.`);
      } catch (e) {
        handleError(e);
      }
    });

  account
    .command("withdraw")
    .description("Withdraw USDC from exchange")
    .argument("<amount>", "Amount in USDC")
    .action(async (amount) => {
      try {
        const sdk = getSDK();
        const tx = await sdk.withdrawFromBank(parseAmount(amount));
        printTxResult(program, tx, `Withdraw ${amount} USDC succeeded.`);
      } catch (e) {
        handleError(e);
      }
    });
}
