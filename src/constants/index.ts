// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Default values and constants
 */
export const DEFAULT_SLIPPAGE = 0.05; // 5% default slippage

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  AUTHORIZE: "/api/authorize",
  PLACE_ORDER: "/api/perp-trade-api/trade/placeorder",
  CANCEL_ORDER: "/api/perp-trade-api/trade/cancelorder",
  PLAN_CLOSE_ORDER: "/api/perp-trade-api/plan/batch/plancloseorder",
  CANCEL_PLAN_ORDER: "/api/perp-trade-api/plan/cancelplanorder",
  ADJUST_LEVERAGE: "/api/perp-trade-api/user-config/adjust-leverage",
  GET_USER_CONFIG: "/api/perp-trade-api/user-config/config",
  GET_ACCOUNT_INFO: "/api/perp-trade-api/curr-info/account",
  GET_POSITIONS: "/api/perp-trade-api/curr-info/positions",
  GET_OPEN_ORDERS: "/api/perp-trade-api/curr-info/orders",
  GET_TRADING_PAIRS: "/api/perp-market-api/list",
  GET_ORDER_BOOK: "/api/perp-market-api/orderBook",
  GET_TICKER: "/api/perp-market-api/ticker",
  GET_POSITION_TPSL: "/api/perp-trade-api/plan/position/tpsl",
  HISTORY_ORDERS: "/api/perp-trade-api/history/orders",
  FUNDING_SETTLEMENTS: "/api/perp-trade-api/history/funding-settlements",
  BALANCE_CHANGES: "/api/perp-trade-api/history/balance-changes",
  ORACLE: "/api/perp-market-api/oracle",
  VAULTS_BY_CREATOR: "/api/perp-vault-api/public/vaults/by-creator",
  VAULTS_PUBLIC: "/api/perp-vault-api/public/vaults",
  // Points & Referral
  POINT_JOIN_TEAM: "/api/dipcoin-point/team/join",
  POINT_REFERRAL_LINK: "/api/dipcoin-point/referral/link",
  POINT_REFERRAL_CHANGE: "/api/dipcoin-point/referral/change",
  POINT_REFERRAL_INVITEES: "/api/dipcoin-point/referral/invitee",
} as const;

/**
 * Onboarding message for authentication
 */
export const ONBOARDING_MESSAGE = '{"onboardingUrl":"dipcoin.io"}';

/**
 * Decimal precision for formatting
 */
export const DECIMALS = {
  USDC: 6,
  SUI: 9,
  DEFAULT: 18,
} as const;

/**
 * Pyth + Wormhole configuration per network
 */
export const PYTH_CONFIG = {
  mainnet: {
    wormholeStateId: "0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c",
    pythStateId: "0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8",
    priceServiceUrl: "https://hermes.pyth.network/",
  },
  testnet: {
    wormholeStateId: "0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790",
    pythStateId: "0x243759059f4c3111179da5878c12f68d612c21a8d54d85edc86164bb18be1c7c",
    priceServiceUrl: "https://hermes-beta.pyth.network",
  },
} as const;
