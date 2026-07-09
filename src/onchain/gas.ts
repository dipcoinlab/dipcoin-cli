// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { SuiClient, SuiTransactionBlockResponse } from "@mysten/sui/client";
import { Keypair } from "@mysten/sui/cryptography";
import { Transaction, type ObjectRef } from "@mysten/sui/transactions";

const SUI_COIN_TYPE = "0x2::sui::SUI";
const STALE_GAS_RETRY_DELAY_MS = 1000;

type ExecuteOptions = Parameters<SuiClient["signAndExecuteTransaction"]>[0]["options"];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isStaleObjectVersionError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return (
    message.includes("Transaction needs to be rebuilt") ||
    message.includes("unavailable for consumption") ||
    message.includes("current version:")
  );
}

async function getFreshGasObjectRef(suiClient: SuiClient, owner: string): Promise<ObjectRef> {
  const coins: Awaited<ReturnType<SuiClient["getCoins"]>>["data"] = [];
  let cursor: string | null | undefined;

  do {
    const page = await suiClient.getCoins({ owner, coinType: SUI_COIN_TYPE, cursor });
    coins.push(...page.data);
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  if (!coins.length) {
    throw new Error(`No SUI gas coins found for ${owner}`);
  }

  const gasCoin = coins.slice().sort((a, b) => {
    const aBalance = BigInt(a.balance);
    const bBalance = BigInt(b.balance);
    if (aBalance === bBalance) return 0;
    return aBalance < bBalance ? 1 : -1;
  })[0];
  const fresh = await suiClient.getObject({ id: gasCoin.coinObjectId });
  const ref = fresh.data;
  if (!ref?.objectId || !ref.version || !ref.digest) {
    throw new Error(`Failed to refresh gas coin object ref for ${gasCoin.coinObjectId}`);
  }

  return {
    objectId: ref.objectId,
    version: ref.version,
    digest: ref.digest,
  };
}

async function setFreshGasPayment(
  suiClient: SuiClient,
  tx: Transaction,
  owner: string
): Promise<void> {
  tx.setGasPayment([await getFreshGasObjectRef(suiClient, owner)]);
}

export async function signAndExecuteTransactionWithFreshGas(
  suiClient: SuiClient,
  tx: Transaction,
  signer: Keypair,
  options: ExecuteOptions
): Promise<SuiTransactionBlockResponse> {
  const sender = signer.getPublicKey().toSuiAddress();
  tx.setSender(sender);
  await setFreshGasPayment(suiClient, tx, sender);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await suiClient.signAndExecuteTransaction({
        signer,
        transaction: tx,
        options,
      });
    } catch (error) {
      if (attempt === 0 && isStaleObjectVersionError(error)) {
        await sleep(STALE_GAS_RETRY_DELAY_MS);
        await setFreshGasPayment(suiClient, tx, sender);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Transaction failed after refreshing gas payment");
}
