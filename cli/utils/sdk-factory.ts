import dotenv from "dotenv";
import path from "path";
import os from "os";
import fs from "fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const globalEnv = path.join(os.homedir(), ".config", "dipcoin", "env");
const localEnv = path.resolve(process.cwd(), ".env");

if (fs.existsSync(globalEnv)) {
  dotenv.config({ path: globalEnv });
} else if (fs.existsSync(localEnv)) {
  dotenv.config({ path: localEnv });
}

import { initDipCoinPerpSDK, DipCoinPerpSDK } from "../../src";

// Cache SDK instances by a composite key
const sdkCache = new Map<string, DipCoinPerpSDK>();

/**
 * Derive an Ed25519 keypair from a mnemonic at a given account index.
 * Uses SLIP-0010 path: m/44'/784'/{index}'/0'/0'
 */
export function deriveKeypairFromMnemonic(mnemonic: string, index: number): Ed25519Keypair {
  const path = `m/44'/784'/${index}'/0'/0'`;
  return Ed25519Keypair.deriveKeypair(mnemonic, path);
}

/**
 * Read and validate MNEMONIC from env.
 */
function getMnemonic(): string {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    console.error(`Error: MNEMONIC not set. Create config at ${globalEnv}`);
    process.exit(1);
  }
  return mnemonic;
}

/**
 * Get the network from env.
 */
function getNetwork(): "mainnet" | "testnet" {
  return (process.env.NETWORK as "mainnet" | "testnet") || "testnet";
}

/**
 * Trading mode SDK: main keypair = index 0, sub keypair = index N.
 * Used for order signing where creator = main address, signer = sub keypair.
 * When no vaultIndex provided, returns SDK with main account only (index 0).
 */
export function getSDK(vaultIndex?: number): DipCoinPerpSDK {
  const cacheKey = `trading:${vaultIndex ?? "main"}`;
  if (sdkCache.has(cacheKey)) return sdkCache.get(cacheKey)!;

  const mnemonic = getMnemonic();
  const network = getNetwork();
  const mainKeypair = deriveKeypairFromMnemonic(mnemonic, 0);

  if (vaultIndex !== undefined && vaultIndex > 0) {
    const subKeypair = deriveKeypairFromMnemonic(mnemonic, vaultIndex);
    const sdk = initDipCoinPerpSDK(mainKeypair, { network, subAccountKey: subKeypair });
    sdkCache.set(cacheKey, sdk);
    return sdk;
  }

  const sdk = initDipCoinPerpSDK(mainKeypair, { network });
  sdkCache.set(cacheKey, sdk);
  return sdk;
}

/**
 * Vault on-chain mode SDK: main keypair = index N.
 * Used for vault's own deposit/withdraw/balance where the vault keypair signs the tx.
 */
export function getVaultSDK(vaultIndex: number): DipCoinPerpSDK {
  const cacheKey = `vault:${vaultIndex}`;
  if (sdkCache.has(cacheKey)) return sdkCache.get(cacheKey)!;

  const mnemonic = getMnemonic();
  const network = getNetwork();
  const vaultKeypair = deriveKeypairFromMnemonic(mnemonic, vaultIndex);
  const sdk = initDipCoinPerpSDK(vaultKeypair, { network });
  sdkCache.set(cacheKey, sdk);
  return sdk;
}

/**
 * Resolve vault address from vault index or explicit address.
 * Returns undefined for main account (no vault).
 */
export function resolveVaultAddress(vaultIndex?: number, vaultAddr?: string): string | undefined {
  if (vaultAddr) return vaultAddr;
  if (vaultIndex !== undefined && vaultIndex > 0) {
    const keypair = deriveKeypairFromMnemonic(getMnemonic(), vaultIndex);
    return keypair.getPublicKey().toSuiAddress();
  }
  return undefined;
}

/**
 * List derived vault addresses from mnemonic.
 */
export function listVaultAddresses(count: number): { index: number; address: string; path: string }[] {
  const mnemonic = getMnemonic();
  const results: { index: number; address: string; path: string }[] = [];
  for (let i = 0; i < count; i++) {
    const path = `m/44'/784'/${i}'/0'/0'`;
    const keypair = deriveKeypairFromMnemonic(mnemonic, i);
    results.push({ index: i, address: keypair.getPublicKey().toSuiAddress(), path });
  }
  return results;
}

/**
 * Get the appropriate SDK for on-chain operations (deposit/withdraw/margin).
 * Uses the vault's own keypair when vault-index > 0, otherwise main account.
 */
export function getOnChainSDK(vaultIndex?: number): DipCoinPerpSDK {
  return (vaultIndex !== undefined && vaultIndex > 0) ? getVaultSDK(vaultIndex) : getSDK();
}

export async function ensureAuth(sdk: DipCoinPerpSDK): Promise<void> {
  const auth = await sdk.authenticate();
  if (!auth.status) {
    console.error("Authentication failed:", auth.error);
    process.exit(1);
  }
}
