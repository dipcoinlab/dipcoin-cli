import { Command } from "commander";
import { getSDK } from "../utils/sdk-factory";
import { isJson, printJson, printTable, handleError, printTxResult as printTxResultShared, parseAmount } from "../utils/output";
import BigNumber from "bignumber.js";

/**
 * On-chain vault contract stores values with 9-decimal precision.
 * The API server multiplies by 10^9 to convert to 18-decimal (exchange convention).
 */
const VAULT_DECIMALS = 9;

/**
 * Format an on-chain vault value (9 decimals) to human-readable.
 */
function formatWeiValue(value: string | number | null | undefined): string {
  if (value === undefined || value === null || value === "") return "0";
  const bn = new BigNumber(String(value));
  if (bn.isNaN()) return "0";
  const num = bn.dividedBy(new BigNumber(10).pow(VAULT_DECIMALS));
  return num.lt(1) ? num.toFixed(6) : num.toFixed(2);
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
  return new BigNumber(val).multipliedBy(new BigNumber(10).pow(16)).toFixed(0);
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

  // === vault list-all ===
  vault
    .command("list-all")
    .description("List all public vaults")
    .option("--page <num>", "Page number (default: 1)", "1")
    .option("--page-size <num>", "Items per page (default: 10)", "10")
    .option("--filter <type>", "Filter type: All, Leading, Newest, HotDeposit (default: All)", "All")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        const result = await sdk.listPublicVaults();
        if (!result.status) return handleError(result.error);

        let vaults: any[] = result.data || [];
        if (!vaults.length) return isJson(program) ? printJson({ records: [], total: 0, pageNum: 1, pageSize: 10 }) : console.log("No vaults found.");

        // Client-side filter
        const filter = opts.filter;
        if (filter && filter !== "All") {
          if (filter === "Leading") {
            vaults = vaults.filter((v: any) => new BigNumber(v.tvl || "0").gt(0));
          } else if (filter === "Newest") {
            vaults = [...vaults].sort((a: any, b: any) => (b.age ?? 0) - (a.age ?? 0)).reverse();
          } else if (filter === "HotDeposit") {
            vaults = [...vaults].sort((a: any, b: any) => {
              const da = new BigNumber(a.currentDepositors || "0");
              const db = new BigNumber(b.currentDepositors || "0");
              return db.minus(da).toNumber();
            });
          }
        }

        const pageNum = Math.max(1, parseInt(opts.page, 10) || 1);
        const pageSize = Math.max(1, parseInt(opts.pageSize, 10) || 10);
        const total = vaults.length;
        const totalPages = Math.ceil(total / pageSize);
        const start = (pageNum - 1) * pageSize;
        const pageVaults = vaults.slice(start, start + pageSize);

        if (isJson(program)) return printJson({ records: pageVaults, total, pageNum, pageSize, totalPages });

        if (!pageVaults.length) return console.log(`No vaults on page ${pageNum}. Total: ${total}, pages: ${totalPages}.`);

        printTable(
          ["Name", "Vault ID", "TVL (USDC)", "APR (%)", "Depositors", "Age (d)", "Deposit", "Status"],
          pageVaults.map((v: any) => {
            const tvl = new BigNumber(v.tvl || "0").dividedBy(new BigNumber(10).pow(18)).toFixed(2);
            const apr = new BigNumber(v.apr || "0").dividedBy(new BigNumber(10).pow(14)).toFixed(2);
            const depositors = new BigNumber(v.currentDepositors || "0")
              .dividedBy(new BigNumber(10).pow(18))
              .toFixed(0);
            return [
              v.name || "-",
              v.vaultId,
              tvl,
              apr,
              depositors,
              String(v.age ?? "-"),
              v.depositStatus ? "Open" : "Closed",
              v.closedAt > 0 ? "Closed" : "Active",
            ];
          })
        );
        console.log(`\nPage ${pageNum}/${totalPages} (total: ${total}, filter: ${filter})`);
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
            ["Total Shares", formatWeiValue(d.total_shares)],
            ["Max Cap", formatWeiValue(d.max_cap)],
            ["Min Deposit", formatWeiValue(d.min_deposit_amount)],
            ["Creator Min Share Ratio", formatRatio(d.creator_minimum_share_ratio)],
            ["Creator Profit Share Ratio", formatRatio(d.creator_profit_share_ratio)],
            ["Auto Close on Withdraw", String(d.auto_close_on_withdraw ?? "-")],
          ]
        );
      } catch (e) {
        handleError(e);
      }
    });

  // === vault position ===
  vault
    .command("position")
    .description("Show your shares in a vault (e.g. vault position <vaultId>)")
    .argument("<vaultId>", "Vault object ID")
    .option("--address <addr>", "Query a specific address (default: current wallet)")
    .action(async (vaultId, opts) => {
      try {
        const sdk = getSDK();
        const result = await sdk.getVaultUserPosition(vaultId, opts.address);
        if (!result.status || !result.data) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        const d = result.data;
        const shares = formatWeiValue(d.shares);
        const totalShares = formatWeiValue(d.vaultTotalShares);
        const sharePrice = formatWeiValue(d.lastSharePrice);
        const avgPrice = formatWeiValue(d.averagePrice);
        const estimatedValue = new BigNumber(d.shares || "0")
          .multipliedBy(new BigNumber(d.lastSharePrice || "0"))
          .dividedBy(new BigNumber(10).pow(VAULT_DECIMALS * 2))
          .toFixed(2);
        const depositTime = d.lastDepositTimeMs
          ? new Date(Number(d.lastDepositTimeMs)).toISOString()
          : "-";

        printTable(
          ["Field", "Value"],
          [
            ["Your Shares", shares],
            ["Total Vault Shares", totalShares],
            ["Share Price", sharePrice],
            ["Avg Entry Price", avgPrice],
            ["Estimated Value (USDC)", estimatedValue],
            ["Last Deposit", depositTime],
          ]
        );
        console.log(
          `\nTo withdraw all shares, run: vault withdraw ${vaultId} --all`
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
        const tx = await sdk.depositToVault({ vaultID: vaultId, amount: parseAmount(amount) });
        printTxResultShared(program, tx, `Deposited ${amount} USDC.`);
      } catch (e) {
        handleError(e);
      }
    });

  // === vault withdraw ===
  vault
    .command("withdraw")
    .description("Request withdrawal from vault (e.g. vault withdraw <vaultId> [shares])")
    .argument("<vaultId>", "Vault object ID")
    .argument("[shares]", "Number of shares to withdraw (omit if using --all)")
    .option("--all", "Withdraw all shares")
    .action(async (vaultId, shares, opts) => {
      try {
        const sdk = getSDK();

        // Always fetch user position to check lock period
        const pos = await sdk.getVaultUserPosition(vaultId);
        if (!pos.status || !pos.data?.shares) {
          return handleError(pos.error || "No position found in this vault");
        }

        // Check lock period (24h by default)
        if (pos.data.lastDepositTimeMs) {
          const lockMs = await sdk.getVaultLockPeriodMs();
          const unlockAt = Number(pos.data.lastDepositTimeMs) + lockMs;
          const now = Date.now();
          if (now < unlockAt) {
            const remainMs = unlockAt - now;
            const hours = Math.floor(remainMs / 3600000);
            const mins = Math.ceil((remainMs % 3600000) / 60000);
            const unlockTime = new Date(unlockAt).toLocaleString();
            return handleError(
              `Withdrawal locked: must wait ${hours}h ${mins}m after last deposit.\n` +
                `  Last deposit:  ${new Date(Number(pos.data.lastDepositTimeMs)).toLocaleString()}\n` +
                `  Unlocks at:    ${unlockTime}`
            );
          }
        }

        let withdrawShares: number;
        if (opts.all) {
          // Convert from 9-decimal on-chain value to human-readable for the SDK
          withdrawShares = new BigNumber(pos.data.shares)
            .dividedBy(new BigNumber(10).pow(VAULT_DECIMALS))
            .toNumber();
          console.log(`Withdrawing all shares (${withdrawShares})...`);
        } else if (shares) {
          withdrawShares = Number(shares);
        } else {
          return handleError("Provide <shares> amount or use --all to withdraw everything");
        }
        console.log(`Requesting withdrawal of ${withdrawShares} shares from vault ${vaultId}...`);
        const tx = await sdk.requestWithdrawFromVault({ vaultID: vaultId, shares: withdrawShares });
        printTxResultShared(program, tx, `Withdrawal request submitted for ${withdrawShares} shares.`);
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
        const tx = await sdk.setVaultMaxCap({ vaultID: vaultId, maxCap: parseAmount(amount) });
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
        const tx = await sdk.setVaultMinDepositAmount({ vaultID: vaultId, minDepositAmount: parseAmount(amount) });
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
