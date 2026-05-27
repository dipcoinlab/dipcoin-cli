import { Command } from "commander";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import path from "path";
import os from "os";
import fs from "fs";
import readline from "readline";
import { fromExportedKeypair } from "../../src/utils";

const CONFIG_DIR = path.join(os.homedir(), ".config", "dipcoin");
const ENV_PATH = path.join(CONFIG_DIR, "env");

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    })
  );
}

async function confirmOverwrite(): Promise<boolean> {
  if (!fs.existsSync(ENV_PATH)) return true;
  const answer = await ask(`${ENV_PATH} already exists. Overwrite? [y/N]: `);
  return /^y(es)?$/i.test(answer.trim());
}

function readHiddenInput(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let buffer = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk: string) => {
        buffer += chunk;
      });
      stdin.on("end", () => {
        resolve(buffer.split(/\r?\n/)[0] || "");
      });
      return;
    }

    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let input = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (ch === "\n" || ch === "\r") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(input);
          return;
        }
        if (code === 3) {
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write("\n");
          reject(new Error("Aborted"));
          return;
        }
        if (code === 127 || code === 8) {
          input = input.slice(0, -1);
          continue;
        }
        input += ch;
      }
    };
    stdin.on("data", onData);
  });
}

function writeEnvFile(privateKey: string, network: "mainnet" | "testnet") {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const content = `DIPCOIN_PRIVATE_KEY=${privateKey}\nDIPCOIN_NETWORK=${network}\n`;
  fs.writeFileSync(ENV_PATH, content, { mode: 0o600 });
  try {
    fs.chmodSync(ENV_PATH, 0o600);
  } catch {
    // best-effort on platforms without POSIX perms
  }
}

function resolveNetwork(input: unknown): "mainnet" | "testnet" {
  return input === "testnet" ? "testnet" : "mainnet";
}

export function registerSetupCommands(program: Command) {
  const setup = program
    .command("setup")
    .description("Configure credentials (~/.config/dipcoin/env)");

  setup
    .command("import")
    .description("Import an existing Sui private key (interactive, hidden input)")
    .option("--network <network>", "mainnet | testnet", "mainnet")
    .action(async (opts) => {
      try {
        const network = resolveNetwork(opts.network);
        if (!(await confirmOverwrite())) {
          console.error("Aborted.");
          process.exit(1);
        }
        const key = (await readHiddenInput("Paste your Sui private key (suiprivkey1...): ")).trim();
        if (!key) {
          console.error("No input provided.");
          process.exit(1);
        }
        if (!key.startsWith("suiprivkey1")) {
          console.error("Invalid format. Sui private keys must start with 'suiprivkey1'.");
          process.exit(1);
        }
        let address: string;
        try {
          decodeSuiPrivateKey(key);
          address = fromExportedKeypair(key).toSuiAddress();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`Failed to decode private key: ${msg}`);
          process.exit(1);
        }
        writeEnvFile(key, network);
        console.log(`Saved to ${ENV_PATH} (chmod 600).`);
        console.log(`Network: ${network}`);
        console.log(`Address: ${address}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("Error:", msg);
        process.exit(1);
      }
    });

  setup
    .command("generate")
    .description("Generate a new Sui keypair and save it as your credentials")
    .option("--network <network>", "mainnet | testnet", "mainnet")
    .action(async (opts) => {
      try {
        const network = resolveNetwork(opts.network);
        if (!(await confirmOverwrite())) {
          console.error("Aborted.");
          process.exit(1);
        }
        const kp = new Ed25519Keypair();
        const privateKey = kp.getSecretKey();
        const address = kp.toSuiAddress();
        writeEnvFile(privateKey, network);
        console.log(`Generated new keypair and saved to ${ENV_PATH} (chmod 600).`);
        console.log(`Network: ${network}`);
        console.log(`Address: ${address}`);
        console.log("");
        console.log(
          "Next: transfer USDC on Sui to the address above, then run: dipcoin-cli account deposit <amount>"
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("Error:", msg);
        process.exit(1);
      }
    });
}
