// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { SuiClient, SuiTransactionBlockResponse } from "@mysten/sui/client";
import { Keypair } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import {
  buildDepositTx,
  buildWithdrawTx,
  buildAddMarginTx,
  buildRemoveMarginTx,
  buildSetSubAccountTx,
  getPackageId,
  getProtocolConfigId,
  getBankId,
  getTxIndexerId,
  getCurrencyType,
  getPerpetualId,
  getPriceOracleObjectId,
} from "./transaction-builder";

export async function executeTxBlock(
  suiClient: SuiClient,
  tx: Transaction,
  signer: Keypair
): Promise<SuiTransactionBlockResponse> {
  return suiClient.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: {
      showObjectChanges: true,
      showEffects: true,
      showEvents: true,
      showInput: true,
    },
  });
}

export function getDeploymentPerpetualID(deployment: any, market?: string): string {
  return getPerpetualId(deployment, market);
}

export async function getOraclePrice(
  suiClient: SuiClient,
  deployment: any,
  market: string
): Promise<number> {
  const objId = getPriceOracleObjectId(deployment, market);
  const obj = await suiClient.getObject({ id: objId, options: { showContent: true } });
  const fields = (obj.data?.content as any)?.fields?.price_info?.fields?.price_feed?.fields?.price?.fields;
  if (!fields) throw new Error(`Failed to read oracle price for ${market}`);
  return Number(fields.price.fields.magnitude) / Math.pow(10, Number(fields.expo.fields.magnitude));
}

export async function depositToBank(
  suiClient: SuiClient,
  deployment: any,
  args: { amount: string; accountAddress?: string; bankID?: string; gasBudget?: number },
  signer: Keypair
): Promise<SuiTransactionBlockResponse> {
  const sender = signer.getPublicKey().toSuiAddress();
  const coinType = getCurrencyType(deployment);

  // Fetch user's USDC coins to use for deposit (not SUI gas)
  const coins = await suiClient.getCoins({ owner: sender, coinType });
  if (!coins.data.length) throw new Error(`No ${coinType} coins found for ${sender}`);

  const tx = new Transaction();
  if (args.gasBudget) tx.setGasBudget(args.gasBudget);
  tx.setSender(sender);

  // Use first coin, merge others if needed to ensure sufficient balance
  const primaryCoin = tx.object(coins.data[0].coinObjectId);
  if (coins.data.length > 1) {
    tx.mergeCoins(
      primaryCoin,
      coins.data.slice(1).map((c) => tx.object(c.coinObjectId))
    );
  }
  const depositCoin = tx.splitCoins(primaryCoin, [BigInt(args.amount)]);

  const packageId = getPackageId(deployment);
  tx.moveCall({
    target: `${packageId}::bank::deposit_v2`,
    arguments: [
      tx.object(getProtocolConfigId(deployment)),
      tx.object(args.bankID || getBankId(deployment)),
      tx.object(getTxIndexerId(deployment)),
      tx.pure.address(args.accountAddress || sender),
      tx.pure.u64(args.amount),
      depositCoin,
    ],
    typeArguments: [coinType],
  });

  return executeTxBlock(suiClient, tx, signer);
}

export async function withdrawFromBank(
  suiClient: SuiClient,
  deployment: any,
  args: { amount: string; accountAddress?: string; bankID?: string; gasBudget?: number },
  signer: Keypair
): Promise<SuiTransactionBlockResponse> {
  const tx = buildWithdrawTx(deployment, args, undefined, args.gasBudget, signer.getPublicKey().toSuiAddress());
  return executeTxBlock(suiClient, tx, signer);
}

export async function addMargin(
  suiClient: SuiClient,
  deployment: any,
  args: {
    amount: number | string;
    account?: string;
    perpID?: string;
    subAccountsMapID?: string;
    market?: string;
    gasBudget?: number;
  },
  signer: Keypair
): Promise<SuiTransactionBlockResponse> {
  const tx = buildAddMarginTx(deployment, args, undefined, args.gasBudget, signer.getPublicKey().toSuiAddress());
  return executeTxBlock(suiClient, tx, signer);
}

export async function removeMargin(
  suiClient: SuiClient,
  deployment: any,
  args: {
    amount: number | string;
    account?: string;
    perpID?: string;
    subAccountsMapID?: string;
    market?: string;
    gasBudget?: number;
  },
  signer: Keypair
): Promise<SuiTransactionBlockResponse> {
  const tx = buildRemoveMarginTx(deployment, args, undefined, args.gasBudget, signer.getPublicKey().toSuiAddress());
  return executeTxBlock(suiClient, tx, signer);
}

export async function setSubAccount(
  suiClient: SuiClient,
  deployment: any,
  args: { account: string; status: boolean; subAccountsMapID?: string; gasBudget?: number },
  signer: Keypair
): Promise<SuiTransactionBlockResponse> {
  const tx = buildSetSubAccountTx(deployment, args, undefined, args.gasBudget, signer.getPublicKey().toSuiAddress());
  return executeTxBlock(suiClient, tx, signer);
}
