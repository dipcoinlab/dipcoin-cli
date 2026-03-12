import { Command } from "commander";
import { registerAccountCommands } from "./commands/account";
import { registerTradeCommands } from "./commands/trade";
import { registerPositionCommands } from "./commands/position";
import { registerMarketCommands } from "./commands/market";
import { registerHistoryCommands } from "./commands/history";
import { registerVaultCommands } from "./commands/vault";
import { registerBalanceCommand } from "./commands/balance";
import { registerReferralCommands } from "./commands/point";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

function getPackageVersion(): string {
  try {
    // Works in both ESM and CJS after bundling
    const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), "../package.json");
    return JSON.parse(readFileSync(pkgPath, "utf-8")).version;
  } catch {
    try {
      // Fallback: resolve from cwd
      return JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8")).version;
    } catch {
      return "0.0.0";
    }
  }
}

const program = new Command();

program
  .name("dipcoin-cli")
  .description("DipCoin Perpetual Trading CLI")
  .version(getPackageVersion())
  .option("--json", "Output in JSON format");

registerAccountCommands(program);
registerTradeCommands(program);
registerPositionCommands(program);
registerMarketCommands(program);
registerHistoryCommands(program);
registerVaultCommands(program);
registerBalanceCommand(program);
registerReferralCommands(program);

program.parseAsync(process.argv).catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
