import { Command } from "commander";
import { registerAccountCommands } from "./commands/account";
import { registerTradeCommands } from "./commands/trade";
import { registerPositionCommands } from "./commands/position";
import { registerMarketCommands } from "./commands/market";
import { registerHistoryCommands } from "./commands/history";
import { registerVaultCommands, registerOrdersCommand } from "./commands/vault";
import { registerBalanceCommand } from "./commands/balance";

const program = new Command();

program
  .name("dipcoin-cli")
  .description("DipCoin Perpetual Trading CLI")
  .version("0.5.0")
  .option("--json", "Output in JSON format");

registerAccountCommands(program);
registerTradeCommands(program);
registerPositionCommands(program);
registerMarketCommands(program);
registerHistoryCommands(program);
registerVaultCommands(program);
registerOrdersCommand(program);
registerBalanceCommand(program);

program.parseAsync(process.argv).catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
