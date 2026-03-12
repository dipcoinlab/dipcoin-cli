// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import BigNumber from "bignumber.js";

export interface Order {
  market: string;
  creator: string;
  isLong: boolean;
  reduceOnly: boolean;
  postOnly: boolean;
  orderbookOnly: boolean;
  ioc: boolean;
  quantity: BigNumber;
  price: BigNumber;
  leverage: BigNumber;
  expiration: BigNumber;
  salt: BigNumber;
}

function computeOrderFlag(order: Order): number {
  let flag = 0;
  if (order.ioc) flag += 1;
  if (order.postOnly) flag += 2;
  if (order.reduceOnly) flag += 4;
  if (order.isLong) flag += 8;
  if (order.orderbookOnly) flag += 16;
  return flag;
}

function packPayload(fields: [string, string][]): string {
  let result = "{\n";
  for (const [key, value] of fields) {
    result += `"${key}":"${value}",\n`;
  }
  result += '"domain":"dipcoin.io"\n';
  result += "}";
  return result;
}

export function getOrderMessageForUIWallet(order: Order): string {
  const flag = computeOrderFlag(order);
  const fields: [string, string][] = [
    ["market", `${order.market}`],
    ["creator", `${order.creator}`],
    ["isLong", `${order.isLong}`],
    ["reduceOnly", `${order.reduceOnly}`],
    ["postOnly", `${order.postOnly}`],
    ["orderbookOnly", `${order.orderbookOnly}`],
    ["ioc", `${order.ioc || false}`],
    ["quantity", `${order.quantity.toFixed(0)}`],
    ["price", `${order.price.toFixed(0)}`],
    ["leverage", `${order.leverage.toFixed(0)}`],
    ["expiration", `${order.expiration.toFixed(0)}`],
    ["salt", `${order.salt.toFixed(0)}`],
    ["orderFlag", `${flag}`],
  ];
  return packPayload(fields);
}
