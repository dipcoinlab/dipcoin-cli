import { Command } from "commander";
import { getSDK, getOnChainSDK, resolveVaultAddress } from "../utils/sdk-factory";
import { getGlobalVaultIndex } from "../utils/vault-index";
import { isJson, printJson, printTable, handleError, formatWei, printTxResult } from "../utils/output";

export function registerAccountCommands(program: Command) {
  const account = program.command("account").description("Account operations");

  account
    .command("info")
    .description("Show account info (balance, margin, PnL)")
    .option("--vault <address>", "Vault address")
    .action(async (opts) => {
      try {
        const vaultIndex = getGlobalVaultIndex(program);
        const sdk = getSDK(vaultIndex);
        const parentAddress = opts.vault || resolveVaultAddress(vaultIndex) || sdk.address;
        const result = await sdk.getAccountInfo({ parentAddress });
        if (!result.status || !result.data) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        const d = result.data;
        const label = parentAddress !== sdk.address ? parentAddress : sdk.address;
        printTable(
          ["Field", "Value"],
          [
            ["Wallet", label],
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
        const vaultIndex = getGlobalVaultIndex(program);
        const sdk = getOnChainSDK(vaultIndex);
        const tx = await sdk.depositToBank(Number(amount));
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
        const vaultIndex = getGlobalVaultIndex(program);
        const sdk = getOnChainSDK(vaultIndex);
        const tx = await sdk.withdrawFromBank(Number(amount));
        printTxResult(program, tx, `Withdraw ${amount} USDC succeeded.`);
      } catch (e) {
        handleError(e);
      }
    });
}
