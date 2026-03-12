// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import type { Keypair } from "@mysten/sui/cryptography";

/**
 * SDK Configuration Interface
 */
export interface DipCoinPerpSDKOptions {
  /** API base URL for perp trading */
  apiBaseUrl: string;
  /** Network type, either mainnet or testnet */
  network: "mainnet" | "testnet";
  /** Optional custom RPC endpoint for Sui */
  customRpc?: string;
  /** Optional sub-account private key or keypair for trading operations (main/sub separation) */
  subAccountKey?: string | Keypair;
}

/**
 * Order side (BUY or SELL)
 */
export enum OrderSide {
  BUY = "BUY",
  SELL = "SELL",
}

/**
 * Trading pair information
 */
export interface TradingPair {
  symbol: string;
  perpId: string; // PerpetualID
  coinName?: string;
  maxLeverage?: string;
  [key: string]: any; // Allow additional fields
}

/**
 * Trading pairs response
 */
export interface TradingPairsResponse {
  code: number;
  data: TradingPair[];
  message?: string;
}

/**
 * User configuration (preferred leverage, margin type, etc.)
 */
export interface UserConfig {
  /** Trading symbol the config applies to */
  symbol: string;
  /** Preferred leverage in normal units (human-readable) */
  leverage: string;
  /** Margin type, e.g. ISOLATED or CROSS */
  marginType?: string;
  /** Raw leverage value returned by backend (wei string) */
  leverageWei?: string;
  /** Other backend specific fields */
  [key: string]: any;
}

/**
 * Order type (MARKET or LIMIT)
 */
export enum OrderType {
  MARKET = "MARKET",
  LIMIT = "LIMIT",
}

/**
 * Parameters for placing an order
 */
export interface PlaceOrderParams {
  /** Trading symbol (e.g., "BTC-PERP") */
  symbol: string;
  /** Order side: BUY or SELL */
  side: OrderSide;
  /** Order type: MARKET or LIMIT */
  orderType: OrderType;
  /** Order quantity */
  quantity: number | string;
  /** Order price (required for LIMIT orders) */
  price?: number | string;
  /** Leverage multiplier */
  leverage: number | string;
  /** Market ID (PerpetualID) - REQUIRED. This is the PerpetualID for the trading pair (e.g., "0xc1b1cf3d774bcfcbd6d71158a4259f2d99fccbf64ffc34f32700f8a771587d99") */
  market: string;
  /** Reduce only flag - order will only reduce position, not increase */
  reduceOnly?: boolean;
  /** Client order ID for tracking */
  clientId?: string;
  /** Creator address - can be wallet address or vault address */
  creator?: string;
  /** Take profit trigger price */
  tpTriggerPrice?: number | string;
  /** Take profit order type */
  tpOrderType?: OrderType;
  /** Take profit order price */
  tpOrderPrice?: number | string;
  /** Stop loss trigger price */
  slTriggerPrice?: number | string;
  /** Stop loss order type */
  slOrderType?: OrderType;
  /** Stop loss order price */
  slOrderPrice?: number | string;
}

/**
 * Parameters for canceling an order
 */
export interface CancelOrderParams {
  /** Trading symbol */
  symbol: string;
  /** Array of order hashes to cancel */
  orderHashes: string[];
  /** Parent address (optional, defaults to wallet address) */
  parentAddress?: string;
}

/**
 * Parameters for adjusting preferred leverage on server
 */
export interface AdjustLeverageParams {
  /** Trading symbol */
  symbol: string;
  /** Desired leverage in normal units (e.g. 5 means 5x) */
  leverage: number | string;
  /** Margin type (defaults to ISOLATED to match frontend) */
  marginType?: string;
}

/**
 * Parameters for querying account info
 */
export interface AccountInfoParams {
  /** Vault address for querying vault account */
  parentAddress?: string;
}

/**
 * Account information
 */
export interface AccountInfo {
  /** Wallet balance in USDC */
  walletBalance: string;
  /** Total unrealized profit/loss */
  totalUnrealizedProfit: string;
  /** Account value */
  accountValue: string;
  /** Free collateral available for trading */
  freeCollateral: string;
  /** Total margin used */
  totalMargin: string;
}

/**
 * Parameters for querying positions
 */
export interface PositionsParams {
  symbol?: string;
  /** Vault address for querying vault positions */
  parentAddress?: string;
}

/**
 * Parameters for querying open orders
 */
export interface OpenOrdersParams {
  symbol?: string;
  page?: number;
  pageSize?: number;
  /** Vault address for querying vault orders */
  parentAddress?: string;
}

/**
 * Position data
 */
export interface Position {
  /** Position ID */
  id?: string;
  positionId?: string;
  /** User address */
  userAddress: string;
  /** Trading symbol */
  symbol: string;
  /** Average entry price */
  avgEntryPrice: string;
  /** Margin amount */
  margin: string;
  /** Leverage */
  leverage: string;
  /** Position quantity */
  quantity: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Selected leverage for position */
  positionSelectedLeverage: string;
  /** Margin type */
  marginType: string;
  /** Oracle price */
  oraclePrice: string;
  /** Mid market price */
  midMarketPrice: string;
  /** Liquidation price */
  liquidationPrice: string;
  /** Position side (LONG or SHORT) */
  side: string;
  /** Position value */
  positionValue: string;
  /** Unrealized profit/loss */
  unrealizedProfit: string;
  /** Return on equity */
  roe: string;
  /** Funding due */
  fundingDue: string;
  /** Next funding fee */
  fundingFeeNext: string;
  /** Settlement funding fee */
  settlementFundingFee: string;
  /** Net margin */
  netMargin: string;
  /** Is delisted */
  isDeliste: number;
  /** Is long position */
  isLong: boolean;
  /** Unrealized PnL */
  unrealizedPnL: string;
  /** Liquidation price (alias) */
  liqPrice: string;
  /** Funding */
  funding: string;
  /** Reducible position quantity */
  positionQtyReducible: string;
  /** Take profit price */
  tpPrice?: string;
  /** Stop loss price */
  slPrice?: string;
  /** TP/SL order count */
  tpslNum?: number;
}

/**
 * Open order data
 */
export interface OpenOrder {
  /** Order hash */
  hash: string;
  /** Trading symbol */
  symbol: string;
  /** Order side */
  side: string;
  /** Order type */
  orderType: string;
  /** Order price */
  price: string;
  /** Order quantity */
  quantity: string;
  /** Filled quantity */
  filledQty: string;
  /** Leverage */
  leverage: string;
  /** Order status */
  status: string;
  /** Creation timestamp */
  createdAt: number;
  /** Update timestamp */
  updatedAt: number;
  /** Is long */
  isLong: boolean;
  /** Reduce only flag */
  reduceOnly: boolean;
}

/**
 * Generic SDK response wrapper
 */
export interface SDKResponse<T = any> {
  /** Operation success status */
  status: boolean;
  /** Response data if successful */
  data?: T;
  /** Error message if failed */
  error?: string;
}

/**
 * API response structure
 */
export interface ApiResponse<T = any> {
  /** Response code */
  code: number;
  /** Response data */
  data: T;
  /** Response message */
  message?: string;
}

/**
 * Order response
 */
export interface OrderResponse {
  /** Response code */
  code: number;
  /** Response data */
  data?: any;
  /** Response message */
  message?: string;
}

/**
 * Account info response data
 */
export interface AccountInfoResponse {
  walletBalance: string;
  totalUnrealizedProfit: string;
  accountValue: string;
  freeCollateral: string;
  totalMargin?: string;
}

/**
 * Positions list response
 */
export interface PositionsResponse {
  data: Position[];
  pageNum?: number;
  pageSize?: number;
  total?: number;
}

/**
 * Open orders list response
 */
export interface OpenOrdersResponse {
  data: OpenOrder[];
  pageNum?: number;
  pageSize?: number;
  total?: number;
}

/**
 * Margin adjustment payload for on-chain operations
 */
export interface MarginAdjustmentParams {
  /** Amount of USDC margin to add/remove (in normal units) */
  amount: number | string;
  /** Trading symbol (alias for market) */
  symbol?: string;
  /** Market symbol, e.g. BTC-PERP */
  market?: string;
  /** Optional PerpetualID (if already known) */
  perpId?: string;
  /** Override account address (defaults to SDK wallet) */
  accountAddress?: string;
  /** Optional sub account table ID */
  subAccountsMapId?: string;
  /** Optional gas budget for transaction */
  gasBudget?: number;
  /** Optional tx hash tag */
  txHash?: string;
}

/**
 * Order book entry (price and quantity)
 */
export interface OrderBookEntry {
  /** Price level */
  price: string;
  /** Quantity at this price level */
  quantity: string;
}

/**
 * Order book data
 */
export interface OrderBook {
  /** Buy orders (bids) - sorted from highest to lowest price */
  bids: OrderBookEntry[];
  /** Sell orders (asks) - sorted from lowest to highest price */
  asks: OrderBookEntry[];
  /** Optional timestamp */
  timestamp?: number;
  /** Optional symbol */
  symbol?: string;
}

/**
 * Order book response
 */
export interface OrderBookResponse {
  code: number;
  data: OrderBook;
  message?: string;
}

/**
 * TP/SL order mode
 */
export type TpSlMode = "position" | "normal";

/**
 * TP/SL order configuration
 */
export interface TpSlOrderConfig {
  /** Trigger price (required) */
  triggerPrice: number | string;
  /** Optional order price (required for LIMIT orders) */
  orderPrice?: number | string;
  /** Order type */
  orderType?: OrderType;
  /** Quantity override (defaults to parent quantity) */
  quantity?: number | string;
  /** Trigger source (defaults to "oracle") */
  triggerWay?: string;
  /** TP/SL mode: position-wide or normal */
  tpslType?: TpSlMode;
  /** Existing plan ID for edits */
  planId?: string | number;
  /** Optional custom salt */
  salt?: string | number;
}

/**
 * Parameters for placing or editing TP/SL orders
 */
export interface PlaceTpSlOrdersParams {
  /** Trading symbol */
  symbol: string;
  /** Market ID (PerpetualID) */
  market: string;
  /** Closing side (BUY to close short, SELL to close long) */
  side: OrderSide;
  /** Whether the existing position is long */
  isLong: boolean;
  /** Base quantity used when TP/SL configs omit quantity */
  quantity: number | string;
  /** Position leverage */
  leverage: number | string;
  /** Reduce only flag (defaults true) */
  reduceOnly?: boolean;
  /** Post only flag */
  postOnly?: boolean;
  /** Orderbook only flag */
  orderbookOnly?: boolean;
  /** IOC flag */
  ioc?: boolean;
  /** Take profit configuration */
  tp?: TpSlOrderConfig;
  /** Stop loss configuration */
  sl?: TpSlOrderConfig;
}

/**
 * Result of placing TP/SL orders
 */
export interface PlaceTpSlOrdersResult {
  tpResult?: ApiResponse;
  slResult?: ApiResponse;
}

/**
 * Position TP/SL order information
 */
export interface PositionTpSlOrder {
  id?: string | number;
  planBatchId?: string | number;
  planOrderType?: string;
  orderType?: string;
  symbol?: string;
  side?: string;
  status?: string;
  hash?: string;
  quantity: string;
  price?: string;
  triggerPrice?: string;
  tpTriggerPrice?: string;
  tpOrderPrice?: string;
  slTriggerPrice?: string;
  slOrderPrice?: string;
  tpPlanId?: string | number | null;
  slPlanId?: string | number | null;
  tpslType?: TpSlMode;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: any;
}

/**
 * Query parameters for fetching TP/SL orders on a position
 */
export interface PositionTpSlQueryParams {
  positionId: string | number;
  tpslType?: TpSlMode;
}

/**
 * Cancel TP/SL orders request (alias of CancelOrderParams)
 */
export type CancelTpSlOrdersParams = CancelOrderParams;

/**
 * Generic paginated response (matches Java PageResponse)
 */
export interface PageResponse<T> {
  data: T[];
  pageNum?: number;
  pageSize?: number;
  total?: number;
}

/**
 * Parameters for querying history orders
 */
export interface HistoryOrdersParams {
  symbol?: string;
  page?: number;
  pageSize?: number;
  parentAddress?: string;
  beginTime?: number;
  endTime?: number;
}

/**
 * History order data (matches Java HistoryOrdersResponse)
 */
export interface HistoryOrder {
  hash?: string;
  symbol?: string;
  side?: string;
  orderType?: string;
  price?: string;
  quantity?: string;
  filledQty?: string;
  leverage?: string;
  status?: string;
  fee?: string;
  realizedPnl?: string;
  createdAt?: number;
  updatedAt?: number;
  clientId?: string;
  reduceOnly?: boolean;
  [key: string]: any;
}

/**
 * Parameters for querying funding settlements
 */
export interface FundingSettlementsParams {
  symbol?: string;
  page?: number;
  pageSize?: number;
  parentAddress?: string;
  beginTime?: number;
}

/**
 * Funding settlement data (matches Java FundingSettlementsResponse)
 */
export interface FundingSettlement {
  symbol?: string;
  fundingRate?: string;
  fundingFee?: string;
  quantity?: string;
  side?: string;
  price?: string;
  createdAt?: number;
  [key: string]: any;
}

/**
 * Parameters for querying balance changes
 */
export interface BalanceChangesParams {
  page?: number;
  pageSize?: number;
  parentAddress?: string;
  beginTime?: number;
}

/**
 * Balance change data (matches Java BalanceChangesResponse)
 */
export interface BalanceChange {
  type?: string;
  amount?: string;
  balance?: string;
  symbol?: string;
  createdAt?: number;
  [key: string]: any;
}

/**
 * Ticker information for a trading pair
 * Match Java client: TickerResponse
 */
export interface Ticker {
  /** Trading pair symbol */
  symbol: string;
  /** Last traded price */
  lastPrice: string;
  /** Mark price */
  markPrice?: string;
  /** Best ask price */
  bestAskPrice?: string;
  /** Best bid price */
  bestBidPrice?: string;
  /** 24-hour highest price */
  high24h: string;
  /** 24-hour lowest price */
  low24h: string;
  /** 24-hour opening price */
  open24h?: string;
  /** 24-hour trading amount (in base currency) */
  amount24h: string;
  /** 24-hour trading volume (in USDC) */
  volume24h: string;
  /** Best ask amount */
  bestAskAmount?: string;
  /** Best bid amount */
  bestBidAmount?: string;
  /** Timestamp */
  timestamp?: number;
  /** 24-hour price change */
  change24h?: string;
  /** 24-hour price change rate (percentage) */
  rate24h?: string;
  /** Open price */
  openPrice?: string;
  /** Oracle price */
  oraclePrice?: string;
  /** Funding rate */
  fundingRate?: string;
  /** Open interest */
  openInterest?: string;
  /** Mid price (calculated from best bid and ask) */
  midPrice?: string;
}

/**
 * Ticker response
 */
export interface TickerResponse {
  code: number;
  data: Ticker;
  message?: string;
}

