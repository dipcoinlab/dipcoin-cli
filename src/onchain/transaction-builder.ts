// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";

const CLOCK_OBJECT_ID = "0x6";

// ---------------------------------------------------------------------------
// Deployment config helpers
// ---------------------------------------------------------------------------

function getPackageId(deployment: any): string {
  const pkgs = deployment?.packages;
  if (!pkgs || !pkgs.length) throw new Error("Deployment config missing packages array");
  return pkgs[pkgs.length - 1];
}

function getProtocolConfigId(deployment: any): string {
  const id = deployment?.objects?.ProtocolConfig?.id;
  if (!id) throw new Error("Deployment config missing ProtocolConfig id");
  return id;
}

function getBankId(deployment: any): string {
  const id = deployment?.objects?.Bank?.id;
  if (!id) throw new Error("Deployment config missing Bank id");
  return id;
}

function getSubAccountsId(deployment: any): string {
  const id = deployment?.objects?.SubAccounts?.id;
  if (!id) throw new Error("Deployment config missing SubAccounts id");
  return id;
}

function getTxIndexerId(deployment: any): string {
  const id = deployment?.objects?.TxIndexer?.id;
  if (!id) throw new Error("Deployment config missing TxIndexer id");
  return id;
}

function getCurrencyType(deployment: any): string {
  const dt = deployment?.objects?.Currency?.dataType;
  if (!dt) throw new Error("Deployment config missing Currency dataType");
  return dt;
}

function getPerpetualId(deployment: any, market?: string): string {
  const m = market?.toUpperCase();
  const id = deployment?.markets?.[m!]?.Objects?.Perpetual?.id;
  if (!id) throw new Error(`Deployment config missing Perpetual id for ${m}`);
  return id;
}

function getPriceOracleObjectId(deployment: any, market?: string): string {
  const m = market?.toUpperCase() || "ETH-PERP";
  const id = deployment?.markets?.[m]?.Objects?.PriceInfoObject?.id;
  if (!id) throw new Error(`Deployment config missing PriceInfoObject id for ${m}`);
  return id;
}

function getPriceOracleFeedId(deployment: any, market?: string): string {
  const m = market?.toUpperCase() || "ETH-PERP";
  const feedId = deployment?.markets?.[m]?.Config?.priceInfoFeedId;
  if (!feedId) throw new Error(`Deployment config missing priceInfoFeedId for ${m}`);
  return feedId;
}

function getPythPkgId(deployment: any, market?: string): string {
  const m = market?.toUpperCase() || "ETH-PERP";
  const dataType = deployment?.markets?.[m]?.Objects?.PriceInfoObject?.dataType;
  if (!dataType) throw new Error(`Deployment config missing PriceInfoObject dataType for ${m}`);
  return dataType.split("::")[0];
}

function hexToBytes(hex: string): number[] {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i < h.length; i += 2) {
    bytes.push(parseInt(h.substr(i, 2), 16));
  }
  return bytes;
}

function toBigIntStr(value: number, decimals: number): string {
  // Equivalent to library's J(value, decimals) → multiply by 10^decimals and return integer string
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor).toString();
}

// ---------------------------------------------------------------------------
// Transaction builders
// ---------------------------------------------------------------------------

export function buildAddMarginTx(
  deployment: any,
  args: {
    amount: number;
    account?: string;
    perpID?: string;
    subAccountsMapID?: string;
    market?: string;
  },
  tx?: Transaction,
  gasBudget?: number,
  sender?: string
): Transaction {
  const t = tx || new Transaction();
  if (gasBudget) t.setGasBudget(gasBudget);
  if (sender) t.setSender(sender);

  const packageId = getPackageId(deployment);
  t.moveCall({
    target: `${packageId}::exchange::add_margin_v2`,
    arguments: [
      t.object(getProtocolConfigId(deployment)),
      t.object(CLOCK_OBJECT_ID),
      t.object(args.perpID || getPerpetualId(deployment, args.market)),
      t.object(getBankId(deployment)),
      t.object(args.subAccountsMapID || getSubAccountsId(deployment)),
      t.object(getTxIndexerId(deployment)),
      t.object(getPriceOracleObjectId(deployment, args.market)),
      t.pure.address(args.account || sender || ""),
      t.pure.u128(args.amount.toString()),
    ],
    typeArguments: [getCurrencyType(deployment)],
  });
  return t;
}

export function buildRemoveMarginTx(
  deployment: any,
  args: {
    amount: number;
    account?: string;
    perpID?: string;
    subAccountsMapID?: string;
    market?: string;
  },
  tx?: Transaction,
  gasBudget?: number,
  sender?: string
): Transaction {
  const t = tx || new Transaction();
  if (gasBudget) t.setGasBudget(gasBudget);
  if (sender) t.setSender(sender);

  const packageId = getPackageId(deployment);
  t.moveCall({
    target: `${packageId}::exchange::remove_margin_v2`,
    arguments: [
      t.object(getProtocolConfigId(deployment)),
      t.object(CLOCK_OBJECT_ID),
      t.object(args.perpID || getPerpetualId(deployment, args.market)),
      t.object(getBankId(deployment)),
      t.object(args.subAccountsMapID || getSubAccountsId(deployment)),
      t.object(getTxIndexerId(deployment)),
      t.object(getPriceOracleObjectId(deployment, args.market)),
      t.pure.address(args.account || sender || ""),
      t.pure.u128(args.amount.toString()),
    ],
    typeArguments: [getCurrencyType(deployment)],
  });
  return t;
}

export function buildDepositTx(
  deployment: any,
  args: {
    amount: string;
    accountAddress?: string;
    bankID?: string;
  },
  tx?: Transaction,
  gasBudget?: number,
  sender?: string
): Transaction {
  const t = tx || new Transaction();
  if (gasBudget) t.setGasBudget(gasBudget);
  if (sender) t.setSender(sender);

  // The library uses a coin-splitting intent for deposit.
  // We replicate the same Move call structure: bank::deposit_v2
  // with a SplitCoins + the amount.
  const coinType = getCurrencyType(deployment);
  const coin = t.splitCoins(t.gas, [BigInt(args.amount)]);

  const packageId = getPackageId(deployment);
  t.moveCall({
    target: `${packageId}::bank::deposit_v2`,
    arguments: [
      t.object(getProtocolConfigId(deployment)),
      t.object(args.bankID || getBankId(deployment)),
      t.object(getTxIndexerId(deployment)),
      t.pure.address(args.accountAddress || sender || ""),
      t.pure.u64(args.amount),
      coin,
    ],
    typeArguments: [coinType],
  });
  return t;
}

export function buildWithdrawTx(
  deployment: any,
  args: {
    amount: string;
    accountAddress?: string;
    bankID?: string;
  },
  tx?: Transaction,
  gasBudget?: number,
  sender?: string
): Transaction {
  const t = tx || new Transaction();
  if (gasBudget) t.setGasBudget(gasBudget);
  if (sender) t.setSender(sender);

  const packageId = getPackageId(deployment);
  t.moveCall({
    target: `${packageId}::bank::withdraw_v2`,
    arguments: [
      t.object(getProtocolConfigId(deployment)),
      t.object(args.bankID || getBankId(deployment)),
      t.object(getTxIndexerId(deployment)),
      t.pure.address(args.accountAddress || sender || ""),
      t.pure.u128(args.amount),
    ],
    typeArguments: [getCurrencyType(deployment)],
  });
  return t;
}

export function buildSetSubAccountTx(
  deployment: any,
  args: {
    account: string;
    status: boolean;
    subAccountsMapID?: string;
  },
  tx?: Transaction,
  gasBudget?: number,
  sender?: string
): Transaction {
  const t = tx || new Transaction();
  if (gasBudget) t.setGasBudget(gasBudget);
  if (sender) t.setSender(sender);

  const packageId = getPackageId(deployment);
  t.moveCall({
    target: `${packageId}::sub_accounts::set_sub_account`,
    arguments: [
      t.object(getProtocolConfigId(deployment)),
      t.object(args.subAccountsMapID || getSubAccountsId(deployment)),
      t.pure.address(args.account),
      t.pure.bool(args.status),
    ],
    typeArguments: [],
  });
  return t;
}

export function buildSetOraclePriceTx(
  deployment: any,
  args: {
    price: number;
    confidence?: string;
    market?: string;
  },
  tx?: Transaction,
  gasBudget?: number,
  sender?: string
): Transaction {
  const t = tx || new Transaction();
  if (gasBudget) t.setGasBudget(gasBudget);
  if (sender) t.setSender(sender);

  const pythPkgId = getPythPkgId(deployment, args.market);
  const oracleObjId = getPriceOracleObjectId(deployment, args.market);
  const feedIdHex = getPriceOracleFeedId(deployment, args.market);
  const feedIdBytes = hexToBytes(feedIdHex);

  const priceU64 = toBigIntStr(args.price, 6);

  t.moveCall({
    target: `${pythPkgId}::price_info::update_price_info_object_for_test`,
    arguments: [
      t.object(oracleObjId),
      t.object(CLOCK_OBJECT_ID),
      t.pure.u64(priceU64),
      t.pure.u64(args.confidence || "10"),
      t.pure(bcs.vector(bcs.u8()).serialize(new Uint8Array(feedIdBytes))),
    ],
    typeArguments: [],
  });
  return t;
}

export function buildBatchSetOraclePriceTx(
  deployment: any,
  args: {
    prices: { price: number; confidence?: string; market?: string }[];
  },
  tx?: Transaction,
  gasBudget?: number,
  sender?: string
): Transaction {
  let t = tx || new Transaction();
  for (const priceArgs of args.prices) {
    t = buildSetOraclePriceTx(deployment, priceArgs, t, undefined, undefined);
  }
  if (gasBudget) t.setGasBudget(gasBudget);
  if (sender) t.setSender(sender);
  return t;
}

// Re-export helpers needed by sdk.ts
export { getPerpetualId, getPriceOracleObjectId };
