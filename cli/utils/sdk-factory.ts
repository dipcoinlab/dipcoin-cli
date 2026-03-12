import dotenv from "dotenv";
import path from "path";
import os from "os";
import fs from "fs";
import { Keypair } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromExportedKeypair } from "../../src/utils";

const globalEnv = path.join(os.homedir(), ".config", "dipcoin", "env");
const localEnv = path.resolve(process.cwd(), ".env");

if (fs.existsSync(localEnv)) {
  dotenv.config({ path: localEnv });
} else if (fs.existsSync(globalEnv)) {
  dotenv.config({ path: globalEnv });
}

import { initDipCoinPerpSDK, DipCoinPerpSDK } from "../../src/sdk";

// Cache SDK instance
let cachedSDK: DipCoinPerpSDK | null = null;

/**
 * Resolve a keypair from DIPCOIN_PRIVATE_KEY or DIPCOIN_MNEMONIC.
 * - DIPCOIN_PRIVATE_KEY: Sui private key string (suiprivkey1...), supports ED25519/Secp256k1/Secp256r1
 * - DIPCOIN_MNEMONIC: 12-word mnemonic, derives keypair at m/44'/784'/0'/0'/0'
 */
function getKeypair(): Keypair {
  const privateKey = process.env.DIPCOIN_PRIVATE_KEY;
  const mnemonic = process.env.DIPCOIN_MNEMONIC;

  if (privateKey) {
    return fromExportedKeypair(privateKey);
  }

  if (mnemonic) {
    return Ed25519Keypair.deriveKeypair(mnemonic, `m/44'/784'/0'/0'/0'`);
  }

  console.error(`Error: DIPCOIN_PRIVATE_KEY or DIPCOIN_MNEMONIC not set.\n`);
  console.error(`Option 1 — Private key (recommended):\n`);
  console.error(`  mkdir -p ~/.config/dipcoin`);
  console.error(`  cat > ~/.config/dipcoin/env << 'EOF'`);
  console.error(`DIPCOIN_PRIVATE_KEY=suiprivkey1...`);
  console.error(`DIPCOIN_NETWORK=testnet`);
  console.error(`EOF\n`);
  console.error(`Option 2 — Mnemonic:\n`);
  console.error(`  cat > ~/.config/dipcoin/env << 'EOF'`);
  console.error(`DIPCOIN_MNEMONIC=word1 word2 word3 ... word12`);
  console.error(`DIPCOIN_NETWORK=testnet`);
  console.error(`EOF\n`);
  process.exit(1);
}

/**
 * Get the network from env.
 */
function getNetwork(): "mainnet" | "testnet" {
  return (process.env.DIPCOIN_NETWORK as "mainnet" | "testnet") || "testnet";
}

/**
 * Get or create the SDK instance (singleton).
 */
export function getSDK(): DipCoinPerpSDK {
  if (cachedSDK) return cachedSDK;

  const keypair = getKeypair();
  const network = getNetwork();
  cachedSDK = initDipCoinPerpSDK(keypair, { network });
  return cachedSDK;
}

export async function ensureAuth(sdk: DipCoinPerpSDK): Promise<void> {
  const auth = await sdk.authenticate();
  if (!auth.status) {
    console.error("Authentication failed:", auth.error);
    process.exit(1);
  }
}
