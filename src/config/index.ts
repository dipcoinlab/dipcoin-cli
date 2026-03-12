// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { DipCoinPerpSDKOptions } from "../types";

/**
 * Default API base URLs
 */
export const DEFAULT_API_URLS = {
  mainnet: "https://gray-api.dipcoin.io",
  testnet: "https://demoapi.dipcoin.io/exchange",
};

/**
 * Initialize SDK options with defaults
 */
export function initSDKOptions(
  options: Partial<DipCoinPerpSDKOptions> & { network: "mainnet" | "testnet" }
): DipCoinPerpSDKOptions {
  return {
    apiBaseUrl: options.apiBaseUrl || DEFAULT_API_URLS[options.network],
    network: options.network,
    customRpc: options.customRpc,
    subAccountKey: options.subAccountKey,
  };
}


