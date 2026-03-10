import { Command } from "commander";
import { registerAccountCommands } from "./commands/account";
import { registerTradeCommands } from "./commands/trade";
import { registerPositionCommands } from "./commands/position";
import { registerMarketCommands } from "./commands/market";
import { registerHistoryCommands } from "./commands/history";
import { registerVaultCommands } from "./commands/vault";
import { registerOrdersCommand } from "./commands/orders";
import { registerSubAccountCommands } from "./commands/sub-account";
import { registerBalanceCommand } from "./commands/balance";

export { getGlobalVaultIndex } from "./utils/vault-index";

const program = new Command();

program
  .name("dipcoin-cli")
  .description("DipCoin Perpetual Trading CLI")
  .version("0.5.0")
  .option("--json", "Output in JSON format")
  .option("--vault-index <n>", "Vault index (1+ for HD-derived sub-accounts)");

registerAccountCommands(program);
registerTradeCommands(program);
registerPositionCommands(program);
registerMarketCommands(program);
registerHistoryCommands(program);
registerVaultCommands(program);
registerSubAccountCommands(program);
registerOrdersCommand(program);
registerBalanceCommand(program);

program.parseAsync(process.argv).catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
