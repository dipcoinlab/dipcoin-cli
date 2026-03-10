import { Command } from "commander";
import { getSDK } from "../utils/sdk-factory";
import { isJson, printJson, printTable, handleError, printTxResult as printTxResultShared } from "../utils/output";
import BigNumber from "bignumber.js";

const USDC_DECIMALS = 6;

/**
 * Format a USDC atomic value (6 decimals) to human-readable.
 */
function formatUsdc(value: string | number | null | undefined): string {
  if (value === undefined || value === null || value === "") return "0";
  const bn = new BigNumber(String(value));
  if (bn.isNaN()) return "0";
  return bn.dividedBy(new BigNumber(10).pow(USDC_DECIMALS)).toFixed(USDC_DECIMALS);
}

/**
 * Format a ratio (9-decimal, where 10^9 = 100%) to percentage string.
 */
function formatRatio(value: string | number | null | undefined): string {
  if (value === undefined || value === null || value === "") return "0%";
  const bn = new BigNumber(String(value));
  if (bn.isNaN()) return "0%";
  return bn.dividedBy(new BigNumber(10).pow(7)).toFixed(2) + "%";
}

/**
 * Convert percentage to 9-decimal ratio string.
 * E.g., "10" (10%) -> "100000000" (10 * 10^7)
 */
function percentToRatio(pct: string): string {
  const val = parseFloat(pct);
  if (isNaN(val) || val < 0) throw new Error(`Invalid percentage: ${pct}`);
  return new BigNumber(val).multipliedBy(new BigNumber(10).pow(7)).toFixed(0);
}

export function registerVaultCommands(program: Command) {
  const vault = program.command("vault").description("On-chain vault operations");

  // === vault create ===
  vault
    .command("create")
    .description("Create a new on-chain vault")
    .requiredOption("--name <name>", "Vault display name")
    .requiredOption("--trader <address>", "Trader address")
    .requiredOption("--max-cap <usdc>", "Maximum USDC cap")
    .requiredOption("--min-deposit <usdc>", "Minimum deposit amount in USDC")
    .requiredOption("--creator-share <pct>", "Creator minimum share ratio (%)")
    .requiredOption("--profit-share <pct>", "Creator profit share ratio (%)")
    .requiredOption("--initial <usdc>", "Initial deposit in USDC")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        console.log(`Creating vault "${opts.name}"...`);
        const tx = await sdk.createVault({
          name: opts.name,
          trader: opts.trader,
          maxCap: Number(opts.maxCap),
          minDepositAmount: Number(opts.minDeposit),
          creatorMinimumShareRatio: percentToRatio(opts.creatorShare),
          creatorProfitShareRatio: percentToRatio(opts.profitShare),
          initialAmount: Number(opts.initial),
        });
        printTxResultShared(program, tx, `Vault "${opts.name}" created.`);
      } catch (e) {
        handleError(e);
      }
    });

  // === vault list ===
  vault
    .command("list")
    .description("List vaults created by current wallet")
    .action(async () => {
      try {
        const sdk = getSDK();
        const result = await sdk.listVaults();
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        if (!result.data?.length) return console.log("No vaults found.");

        printTable(
          ["Vault ID", "Name", "Trader", "Deposit", "Status"],
          result.data.map((v: any) => [
            v.vaultId,
            v.name || "-",
            v.trader,
            v.depositStatus === 1 ? "Open" : "Closed",
            v.closedAt > 0 ? "Closed" : "Active",
          ])
        );
      } catch (e) {
        handleError(e);
      }
    });

  // === vault info ===
  vault
    .command("info")
    .description("Show vault details (e.g. vault info <vaultId>)")
    .argument("<vaultId>", "Vault object ID")
    .action(async (vaultId) => {
      try {
        const sdk = getSDK();
        const result = await sdk.getVaultInfo(vaultId);
        if (!result.status || !result.data) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        const d = result.data;
        printTable(
          ["Field", "Value"],
          [
            ["Vault ID", vaultId],
            ["Name", d.name || "-"],
            ["Creator", d.creator || "-"],
            ["Trader", d.trader || "-"],
            ["Deposit Status", d.deposit_status === true || d.deposit_status === "true" ? "Open" : "Closed"],
            ["Total Shares", formatUsdc(d.total_shares)],
            ["Max Cap", formatUsdc(d.max_cap)],
            ["Min Deposit", formatUsdc(d.min_deposit_amount)],
            ["Creator Min Share Ratio", formatRatio(d.creator_minimum_share_ratio)],
            ["Creator Profit Share Ratio", formatRatio(d.creator_profit_share_ratio)],
            ["Auto Close on Withdraw", String(d.auto_close_on_withdraw ?? "-")],
          ]
        );
      } catch (e) {
        handleError(e);
      }
    });

  // === vault deposit ===
  vault
    .command("deposit")
    .description("Deposit USDC into a vault (e.g. vault deposit <vaultId> <amount>)")
    .argument("<vaultId>", "Vault object ID")
    .argument("<amount>", "USDC amount to deposit")
    .action(async (vaultId, amount) => {
      try {
        const sdk = getSDK();
        console.log(`Depositing ${amount} USDC to vault ${vaultId}...`);
        const tx = await sdk.depositToVault({ vaultID: vaultId, amount: Number(amount) });
        printTxResultShared(program, tx, `Deposited ${amount} USDC.`);
      } catch (e) {
        handleError(e);
      }
    });

  // === vault withdraw ===
  vault
    .command("withdraw")
    .description("Request withdrawal from vault (e.g. vault withdraw <vaultId> <shares>)")
    .argument("<vaultId>", "Vault object ID")
    .argument("<shares>", "Number of shares to withdraw")
    .action(async (vaultId, shares) => {
      try {
        const sdk = getSDK();
        console.log(`Requesting withdrawal of ${shares} shares from vault ${vaultId}...`);
        const tx = await sdk.requestWithdrawFromVault({ vaultID: vaultId, shares: Number(shares) });
        printTxResultShared(program, tx, `Withdrawal request submitted for ${shares} shares.`);
      } catch (e) {
        handleError(e);
      }
    });

  // === vault fill ===
  vault
    .command("fill")
    .description("Fill pending withdrawal requests (e.g. vault fill <vaultId> <requestIDs...>)")
    .argument("<vaultId>", "Vault object ID")
    .argument("<requestIDs...>", "Withdrawal request object IDs")
    .option("--markets <ids>", "Comma-separated market PerpetualIDs for share price update")
    .action(async (vaultId, requestIDs, opts) => {
      try {
        const sdk = getSDK();
        const markets = opts.markets ? opts.markets.split(",") : undefined;
        console.log(`Filling ${requestIDs.length} withdrawal request(s)...`);
        const tx = await sdk.fillWithdrawalRequests({
          vaultID: vaultId,
          withdrawalRequestIDs: requestIDs,
          markets,
        });
        printTxResultShared(program, tx, `Filled ${requestIDs.length} withdrawal request(s).`);
      } catch (e) {
        handleError(e);
      }
    });

  // === vault close ===
  vault
    .command("close")
    .description("Close a vault (e.g. vault close <vaultId>)")
    .argument("<vaultId>", "Vault object ID")
    .option("--markets <ids>", "Comma-separated market PerpetualIDs")
    .action(async (vaultId, opts) => {
      try {
        const sdk = getSDK();
        const markets = opts.markets ? opts.markets.split(",") : undefined;
        console.log(`Closing vault ${vaultId}...`);
        const tx = await sdk.closeVault({ vaultID: vaultId, markets });
        printTxResultShared(program, tx, "Vault closed.");
      } catch (e) {
        handleError(e);
      }
    });

  // === vault remove ===
  vault
    .command("remove")
    .description("Remove a closed vault (e.g. vault remove <vaultId>)")
    .argument("<vaultId>", "Vault object ID")
    .action(async (vaultId) => {
      try {
        const sdk = getSDK();
        console.log(`Removing vault ${vaultId}...`);
        const tx = await sdk.removeVault({ vaultID: vaultId });
        printTxResultShared(program, tx, "Vault removed.");
      } catch (e) {
        handleError(e);
      }
    });

  // === vault claim ===
  vault
    .command("claim")
    .description("Claim funds from a closed vault (e.g. vault claim <vaultId>)")
    .argument("<vaultId>", "Vault object ID")
    .action(async (vaultId) => {
      try {
        const sdk = getSDK();
        console.log(`Claiming funds from vault ${vaultId}...`);
        const tx = await sdk.claimClosedVaultFunds({ vaultID: vaultId });
        printTxResultShared(program, tx, "Funds claimed.");
      } catch (e) {
        handleError(e);
      }
    });

  // === vault set-trader ===
  vault
    .command("set-trader")
    .description("Change the trader address (e.g. vault set-trader <vaultId> <address>)")
    .argument("<vaultId>", "Vault object ID")
    .argument("<address>", "New trader address")
    .action(async (vaultId, address) => {
      try {
        const sdk = getSDK();
        const tx = await sdk.setVaultTrader({ vaultID: vaultId, newTrader: address });
        printTxResultShared(program, tx, `Trader set to ${address}.`);
      } catch (e) {
        handleError(e);
      }
    });

  // === vault set-sub-trader ===
  vault
    .command("set-sub-trader")
    .description("Add or remove a sub-trader (e.g. vault set-sub-trader <vaultId> <address>)")
    .argument("<vaultId>", "Vault object ID")
    .argument("<address>", "Sub-trader address")
    .option("--disable", "Remove sub-trader (default: add)")
    .action(async (vaultId, address, opts) => {
      try {
        const sdk = getSDK();
        const status = !opts.disable;
        const tx = await sdk.setVaultSubTrader({ vaultID: vaultId, subTrader: address, status });
        printTxResultShared(program, tx, `Sub-trader ${address} ${status ? "added" : "removed"}.`);
      } catch (e) {
        handleError(e);
      }
    });

  // === vault set-deposit-status ===
  vault
    .command("set-deposit-status")
    .description("Enable or disable deposits (e.g. vault set-deposit-status <vaultId>)")
    .argument("<vaultId>", "Vault object ID")
    .option("--disable", "Disable deposits (default: enable)")
    .action(async (vaultId, opts) => {
      try {
        const sdk = getSDK();
        const status = !opts.disable;
        const tx = await sdk.setVaultDepositStatus({ vaultID: vaultId, status });
        printTxResultShared(program, tx, `Deposits ${status ? "enabled" : "disabled"}.`);
      } catch (e) {
        handleError(e);
      }
    });

  // === vault set-max-cap ===
  vault
    .command("set-max-cap")
    .description("Set maximum USDC cap (e.g. vault set-max-cap <vaultId> <amount>)")
    .argument("<vaultId>", "Vault object ID")
    .argument("<amount>", "Max cap in USDC")
    .action(async (vaultId, amount) => {
      try {
        const sdk = getSDK();
        const tx = await sdk.setVaultMaxCap({ vaultID: vaultId, maxCap: Number(amount) });
        printTxResultShared(program, tx, `Max cap set to ${amount} USDC.`);
      } catch (e) {
        handleError(e);
      }
    });

  // === vault set-min-deposit ===
  vault
    .command("set-min-deposit")
    .description("Set minimum deposit amount (e.g. vault set-min-deposit <vaultId> <amount>)")
    .argument("<vaultId>", "Vault object ID")
    .argument("<amount>", "Min deposit in USDC")
    .action(async (vaultId, amount) => {
      try {
        const sdk = getSDK();
        const tx = await sdk.setVaultMinDepositAmount({ vaultID: vaultId, minDepositAmount: Number(amount) });
        printTxResultShared(program, tx, `Min deposit set to ${amount} USDC.`);
      } catch (e) {
        handleError(e);
      }
    });

  // === vault set-auto-close ===
  vault
    .command("set-auto-close")
    .description("Enable or disable auto-close on withdrawal (e.g. vault set-auto-close <vaultId>)")
    .argument("<vaultId>", "Vault object ID")
    .option("--disable", "Disable auto-close (default: enable)")
    .action(async (vaultId, opts) => {
      try {
        const sdk = getSDK();
        const enabled = !opts.disable;
        const tx = await sdk.setVaultAutoCloseOnWithdraw({ vaultID: vaultId, autoCloseOnWithdraw: enabled });
        printTxResultShared(program, tx, `Auto-close on withdraw ${enabled ? "enabled" : "disabled"}.`);
      } catch (e) {
        handleError(e);
      }
    });
}
