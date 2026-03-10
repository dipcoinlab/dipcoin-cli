// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { SuiClient, SuiTransactionBlockResponse, getFullnodeUrl } from "@mysten/sui/client";
import { Keypair } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import BigNumber from "bignumber.js";
import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";
import { API_ENDPOINTS, DECIMALS, ONBOARDING_MESSAGE, PYTH_CONFIG } from "../constants";
import { HttpClient } from "../services/httpClient";
import {
  getOrderMessageForUIWallet,
  executeTxBlock,
  getDeploymentPerpetualID,
  getOraclePrice as getOnChainOraclePrice,
  depositToBank as onChainDepositToBank,
  withdrawFromBank as onChainWithdrawFromBank,
  setSubAccount as onChainSetSubAccount,
  buildAddMarginTx,
  buildRemoveMarginTx,
  buildSetOraclePriceTx,
  buildBatchSetOraclePriceTx,
} from "../onchain";
import {
  AccountInfo,
  AccountInfoParams,
  AccountInfoResponse,
  AdjustLeverageParams,
  BalanceChange,
  BalanceChangesParams,
  CancelOrderParams,
  CancelTpSlOrdersParams,
  DipCoinPerpSDKOptions,
  FundingSettlement,
  FundingSettlementsParams,
  HistoryOrder,
  HistoryOrdersParams,
  MarginAdjustmentParams,
  OpenOrder,
  OpenOrdersParams,
  OpenOrdersResponse,
  OrderBook,
  OrderBookEntry,
  OrderResponse,
  OrderSide,
  OrderType,
  PageResponse,
  PlaceOrderParams,
  PlaceTpSlOrdersParams,
  PlaceTpSlOrdersResult,
  Position,
  PositionTpSlOrder,
  PositionsParams,
  PositionsResponse,
  SDKResponse,
  Ticker,
  TpSlMode,
  TpSlOrderConfig,
  TradingPair,
  TradingPairsResponse,
  UserConfig
} from "../types";
import {
  formatError,
  formatNormalToWei,
  formatNormalToWeiBN,
  fromExportedKeypair,
  readFile,
  signMessage,
} from "../utils";
import { loadCachedJwt, saveCachedJwt, clearCachedJwt } from "../utils/jwt-cache";

/**
 * DipCoin Perpetual Trading SDK
 */
export class DipCoinPerpSDK {
  private httpClient: HttpClient;
  private keypair: Keypair;
  private subKeypair?: Keypair;
  private walletAddress: string;
  private subAddress?: string;
  private options: DipCoinPerpSDKOptions;
  private jwtToken?: string;
  private subJwtToken?: string;
  private isAuthenticating: boolean = false;
  private isSubAuthenticating: boolean = false;
  private deploymentConfig: any;
  private suiClient: SuiClient;
  private priceServiceConnection?: SuiPriceServiceConnection;
  private pythClient?: SuiPythClient;
  private tradingPairsCache?: TradingPair[];
  private tradingPairsCacheTimestamp?: number;

  /**
   * Initialize SDK
   * @param privateKey Private key string or keypair
   * @param options SDK configuration options
   */
  constructor(privateKey: string | Keypair, options: DipCoinPerpSDKOptions) {
    this.options = options;
    this.httpClient = new HttpClient(options.apiBaseUrl);

    // Initialize main keypair
    if (typeof privateKey === "string") {
      this.keypair = fromExportedKeypair(privateKey);
    } else {
      this.keypair = privateKey;
    }

    // Initialize sub-account keypair if provided
    if (options.subAccountKey) {
      if (typeof options.subAccountKey === "string") {
        this.subKeypair = fromExportedKeypair(options.subAccountKey);
      } else {
        this.subKeypair = options.subAccountKey;
      }
      this.subAddress = this.subKeypair.getPublicKey().toSuiAddress();
    }

    // Get wallet address
    this.walletAddress = this.keypair.getPublicKey().toSuiAddress();
    this.httpClient.setWalletAddress(this.walletAddress);
    this.deploymentConfig = readFile(`config/deployed/${options.network}/main_contract.json`);
    const rpcUrl = options.customRpc || getFullnodeUrl(options.network);
    this.suiClient = new SuiClient({ url: rpcUrl });
  }

  /**
   * Get wallet address
   */
  get address(): string {
    return this.walletAddress;
  }

  /**
   * Get sub-account wallet address (if configured)
   */
  get subAccountAddress(): string | undefined {
    return this.subAddress;
  }

  /**
   * Get SDK options
   */
  get optionsField(): DipCoinPerpSDKOptions {
    return this.options;
  }

  /**
   * Authenticate and get JWT token (onboarding)
   * This method signs the onboarding message and exchanges it for a JWT token
   * @returns JWT token
   */
  async authenticate(): Promise<SDKResponse<string>> {
    try {
      // If already authenticated in this process, return it
      if (this.jwtToken) {
        return { status: true, data: this.jwtToken };
      }

      // Try loading from local cache
      const cached = loadCachedJwt(this.walletAddress);
      if (cached) {
        this.jwtToken = cached;
        this.httpClient.setAuthToken(cached);
        return { status: true, data: cached };
      }

      // Prevent concurrent authentication requests
      if (this.isAuthenticating) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (this.jwtToken) {
          return { status: true, data: this.jwtToken };
        }
      }

      this.isAuthenticating = true;

      const messageBytes = new TextEncoder().encode(ONBOARDING_MESSAGE);
      const signature = await signMessage(this.keypair, messageBytes);

      const response = await this.httpClient.post<{ token: string }>(API_ENDPOINTS.AUTHORIZE, {
        userAddress: this.walletAddress,
        isTermAccepted: true,
        signature: signature,
      });

      if (response.code === 200 && response.data?.token) {
        this.jwtToken = response.data.token;
        this.httpClient.setAuthToken(this.jwtToken);
        saveCachedJwt(this.walletAddress, this.jwtToken);
        this.isAuthenticating = false;
        return { status: true, data: this.jwtToken };
      } else {
        this.isAuthenticating = false;
        return { status: false, error: response.message || "Failed to authenticate" };
      }
    } catch (error) {
      this.isAuthenticating = false;
      return { status: false, error: formatError(error) };
    }
  }

  /**
   * Authenticate sub-account and get JWT token
   * Used for trading operations when sub-account is configured
   */
  async authenticateSub(): Promise<SDKResponse<string>> {
    if (!this.subKeypair) {
      return { status: false, error: "Sub-account keypair not configured" };
    }

    const subAddress = this.subKeypair.getPublicKey().toSuiAddress();

    try {
      if (this.subJwtToken) {
        return { status: true, data: this.subJwtToken };
      }

      // Try loading from local cache
      const cached = loadCachedJwt(subAddress);
      if (cached) {
        this.subJwtToken = cached;
        return { status: true, data: cached };
      }

      if (this.isSubAuthenticating) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (this.subJwtToken) {
          return { status: true, data: this.subJwtToken };
        }
      }

      this.isSubAuthenticating = true;

      const messageBytes = new TextEncoder().encode(ONBOARDING_MESSAGE);
      const signature = await signMessage(this.subKeypair, messageBytes);

      const response = await this.httpClient.post<{ token: string }>(API_ENDPOINTS.AUTHORIZE, {
        userAddress: subAddress,
        isTermAccepted: true,
        signature: signature,
      });

      if (response.code === 200 && response.data?.token) {
        this.subJwtToken = response.data.token;
        saveCachedJwt(subAddress, this.subJwtToken);
        this.isSubAuthenticating = false;
        return { status: true, data: this.subJwtToken };
      } else {
        this.isSubAuthenticating = false;
        return { status: false, error: response.message || "Failed to authenticate sub-account" };
      }
    } catch (error) {
      this.isSubAuthenticating = false;
      return { status: false, error: formatError(error) };
    }
  }

  /**
   * Authenticate for trading operations
   * Uses sub-account if configured, otherwise falls back to main account
   */
  private async authenticateForTrading(): Promise<SDKResponse<string>> {
    if (this.subKeypair) {
      const subAuth = await this.authenticateSub();
      if (subAuth.status && subAuth.data) {
        this.httpClient.setAuthToken(subAuth.data);
        if (this.subAddress) {
          this.httpClient.setWalletAddress(this.subAddress);
        }
        return subAuth;
      }
      return subAuth;
    }
    return this.authenticate();
  }

  /**
   * Restore main account auth context after trading operations
   */
  private restoreMainAuth(): void {
    this.httpClient.setWalletAddress(this.walletAddress);
    if (this.jwtToken) {
      this.httpClient.setAuthToken(this.jwtToken);
    }
  }

  /**
   * Get JWT token, authenticate if needed
   * @param forceRefresh Force refresh the token even if one exists
   * @returns JWT token
   */
  async getJWTToken(forceRefresh: boolean = false): Promise<SDKResponse<string>> {
    if (forceRefresh) {
      this.jwtToken = undefined;
      this.httpClient.setAuthToken("");
    }
    return this.authenticate();
  }

  /**
   * Clear JWT token (logout)
   */
  clearAuth(): void {
    if (this.jwtToken) clearCachedJwt(this.walletAddress);
    if (this.subJwtToken && this.subAddress) clearCachedJwt(this.subAddress);
    this.jwtToken = undefined;
    this.subJwtToken = undefined;
    this.httpClient.setAuthToken("");
  }

  /**
   * Place an order
   * @param params Order parameters
   * @returns Order response
   */
  async placeOrder(params: PlaceOrderParams): Promise<SDKResponse<OrderResponse>> {
    try {
      // Use sub-account auth for trading if configured
      const authResult = await this.authenticateForTrading();
      if (!authResult.status) {
        this.restoreMainAuth();
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      // Validate required parameters
      if (
        !params.symbol ||
        !params.side ||
        !params.orderType ||
        !params.quantity ||
        !params.leverage
      ) {
        throw new Error("Missing required order parameters");
      }

      if (params.orderType === OrderType.LIMIT && !params.price) {
        throw new Error("Price is required for LIMIT orders");
      }

      const {
        symbol,
        side,
        orderType,
        quantity,
        price,
        leverage,
        market,
        reduceOnly = false,
        clientId = "",
        creator,
        tpTriggerPrice,
        tpOrderType = OrderType.MARKET,
        tpOrderPrice = "",
        slTriggerPrice,
        slOrderType = OrderType.MARKET,
        slOrderPrice = "",
      } = params;

      // Resolve creator: explicit creator (vault address), or main wallet address
      const orderCreator = creator || this.walletAddress;
      // Use sub-account keypair for signing if available, otherwise main keypair
      const signingKeypair = this.subKeypair || this.keypair;

      // Validate market parameter - it must be a PerpetualID, not a symbol
      if (!market) {
        throw new Error(
          "Market (PerpetualID) is required. Please provide the market parameter with the PerpetualID for the trading pair."
        );
      }

      // Convert to BigNumber for calculations
      // For MARKET orders, price can be empty string, which will be converted to 0
      const priceBN = price && price !== "" ? formatNormalToWeiBN(price) : new BigNumber(0);
      const quantityBN = formatNormalToWeiBN(quantity);
      const leverageBN = formatNormalToWeiBN(leverage);
      const expirationBN = new BigNumber(0);
      const saltBN = new BigNumber(+new Date());

      // Build main order object
      // Note: market must be the PerpetualID (e.g., "0xc1b1cf3d774bcfcbd6d71158a4259f2d99fccbf64ffc34f32700f8a771587d99")
      const order = {
        market: market,
        creator: orderCreator,
        isLong: side === OrderSide.BUY,
        reduceOnly,
        postOnly: false,
        orderbookOnly: true,
        ioc: false,
        quantity: quantityBN,
        price: orderType === OrderType.LIMIT ? priceBN : new BigNumber(0),
        leverage: leverageBN,
        expiration: expirationBN,
        salt: saltBN,
      };

      // Build TP order if trigger price is provided
      let tpOrder = null;
      let tpSalt = null;
      if (tpTriggerPrice) {
        tpSalt = new BigNumber(Date.now() + 1);
        tpOrder = {
          market: order.market,
          creator: orderCreator,
          isLong: !order.isLong,
          reduceOnly: true,
          postOnly: false,
          orderbookOnly: true,
          ioc: false,
          quantity: quantityBN,
          price:
            tpOrderType === OrderType.LIMIT
              ? formatNormalToWeiBN(tpOrderPrice || tpTriggerPrice)
              : formatNormalToWeiBN(""),
          leverage: leverageBN,
          expiration: expirationBN,
          salt: tpSalt,
        };
      }

      // Build SL order if trigger price is provided
      let slOrder = null;
      let slSalt = null;
      if (slTriggerPrice) {
        slSalt = new BigNumber(Date.now() + 2);
        slOrder = {
          market: order.market,
          creator: orderCreator,
          isLong: !order.isLong,
          reduceOnly: true,
          postOnly: false,
          orderbookOnly: true,
          ioc: false,
          quantity: quantityBN,
          price:
            slOrderType === OrderType.LIMIT
              ? formatNormalToWeiBN(slOrderPrice || slTriggerPrice)
              : formatNormalToWeiBN(""),
          leverage: leverageBN,
          expiration: expirationBN,
          salt: slSalt,
        };
      }

      // Generate order message for signing
      const orderMsg = getOrderMessageForUIWallet(order);
      const orderHashBytes = new TextEncoder().encode(orderMsg);

      // Sign main order
      const orderSignature = await signMessage(signingKeypair, orderHashBytes);

      // Sign TP order if exists
      let tpOrderSignature: string | undefined;
      if (tpOrder) {
        const tpOrderMsg = getOrderMessageForUIWallet(tpOrder);
        const tpOrderHashBytes = new TextEncoder().encode(tpOrderMsg);
        tpOrderSignature = await signMessage(signingKeypair, tpOrderHashBytes);
      }

      // Sign SL order if exists
      let slOrderSignature: string | undefined;
      if (slOrder) {
        const slOrderMsg = getOrderMessageForUIWallet(slOrder);
        const slOrderHashBytes = new TextEncoder().encode(slOrderMsg);
        slOrderSignature = await signMessage(signingKeypair, slOrderHashBytes);
      }

      // Build request parameters
      // Match ts-frontend: always use formatNormalToWei(price) regardless of order type
      // For MARKET orders, price will be empty string which converts to "0"
      const requestParams: Record<string, any> = {
        symbol,
        side,
        orderType,
        quantity: formatNormalToWei(quantity),
        price: formatNormalToWei(price || ""),
        leverage: formatNormalToWei(leverage),
        salt: saltBN.toString(),
        creator: orderCreator,
        clientId,
        reduceOnly,
        orderSignature,
      };

      // Add TP parameters if exists
      if (tpTriggerPrice && tpOrderSignature) {
        requestParams.tpOrderSignature = tpOrderSignature;
        requestParams.tpTriggerPrice = formatNormalToWei(tpTriggerPrice);
        requestParams.tpOrderType = tpOrderType;
        requestParams.tpOrderPrice =
          tpOrderType === OrderType.LIMIT
            ? formatNormalToWei(tpOrderPrice || tpTriggerPrice)
            : formatNormalToWei("");
        requestParams.tpSalt = tpSalt?.toString();
        requestParams.triggerWay = "oracle";
      }

      // Add SL parameters if exists
      if (slTriggerPrice && slOrderSignature) {
        requestParams.slOrderSignature = slOrderSignature;
        requestParams.slTriggerPrice = formatNormalToWei(slTriggerPrice);
        requestParams.slOrderType = slOrderType;
        requestParams.slOrderPrice =
          slOrderType === OrderType.LIMIT
            ? formatNormalToWei(slOrderPrice || slTriggerPrice)
            : formatNormalToWei("");
        requestParams.slSalt = slSalt?.toString();
      }

      // Send request
      // Match ts-frontend and Java: use JSON POST request, not form-urlencoded
      // ts-frontend's postForm actually sends JSON with Content-Type: application/json
      const response = await this.httpClient.post<OrderResponse>(
        API_ENDPOINTS.PLACE_ORDER,
        requestParams
      );

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticateForTrading();
        if (retryAuth.status) {
          // Retry the request
          const retryResponse = await this.httpClient.post<OrderResponse>(
            API_ENDPOINTS.PLACE_ORDER,
            requestParams
          );
          this.restoreMainAuth();
          if (retryResponse.code === 200) {
            return {
              status: true,
              data: retryResponse,
            };
          }
        }
        this.restoreMainAuth();
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      this.restoreMainAuth();
      if (response.code === 200) {
        return {
          status: true,
          data: response,
        };
      } else {
        return {
          status: false,
          error: response.message || "Order failed",
          data: response,
        };
      }
    } catch (error) {
      this.restoreMainAuth();
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Cancel an order
   * @param params Cancel order parameters
   * @returns Cancel order response
   */
  async cancelOrder(params: CancelOrderParams): Promise<SDKResponse<OrderResponse>> {
    try {
      // Use sub-account auth for trading if configured
      const authResult = await this.authenticateForTrading();
      if (!authResult.status) {
        this.restoreMainAuth();
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const { symbol, orderHashes, parentAddress = this.walletAddress } = params;

      if (!orderHashes || orderHashes.length === 0) {
        throw new Error("Order hashes are required");
      }

      // Use sub-account keypair for signing if available
      const signingKeypair = this.subKeypair || this.keypair;

      // Build cancel order message
      const cancelOrderObj = { orderHashes };
      const orderHashBytes = new TextEncoder().encode(JSON.stringify(cancelOrderObj));

      // Sign the message
      const signature = await signMessage(signingKeypair, orderHashBytes);

      // Build request parameters
      // Match ts-frontend and Java: orderHashes should be an array, not a JSON string
      // JSON POST request will automatically serialize the array
      const requestParams = {
        symbol,
        orderHashes, // Direct array, not JSON.stringify
        signature,
        parentAddress,
      };

      // Send request
      // Match ts-frontend and Java: use JSON POST request, not form-urlencoded
      // ts-frontend's postForm actually sends JSON with Content-Type: application/json
      const response = await this.httpClient.post<OrderResponse>(
        API_ENDPOINTS.CANCEL_ORDER,
        requestParams
      );

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticateForTrading();
        if (retryAuth.status) {
          // Retry the request
          const retryResponse = await this.httpClient.post<OrderResponse>(
            API_ENDPOINTS.CANCEL_ORDER,
            requestParams
          );
          this.restoreMainAuth();
          if (retryResponse.code === 200) {
            return {
              status: true,
              data: retryResponse,
            };
          }
        }
        this.restoreMainAuth();
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      this.restoreMainAuth();
      if (response.code === 200) {
        return {
          status: true,
          data: response,
        };
      } else {
        return {
          status: false,
          error: response.message || "Cancellation Failed",
          data: response,
        };
      }
    } catch (error) {
      this.restoreMainAuth();
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Adjust preferred leverage for a symbol (matches ts-frontend behavior)
   * @param params Adjust leverage parameters
   */
  async adjustLeverage(params: AdjustLeverageParams): Promise<SDKResponse<OrderResponse>> {
    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const { symbol, leverage, marginType = "ISOLATED" } = params;

      if (!symbol) {
        throw new Error("Symbol is required for adjusting leverage");
      }

      if (!this.isPositiveNumber(leverage)) {
        throw new Error("Leverage must be greater than zero");
      }

      const payload = {
        symbol,
        marginType,
        leverage: formatNormalToWei(leverage),
      };

      let response = await this.httpClient.post<OrderResponse>(
        API_ENDPOINTS.ADJUST_LEVERAGE,
        payload
      );

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.post<OrderResponse>(
            API_ENDPOINTS.ADJUST_LEVERAGE,
            payload
          );
        } else {
          return {
            status: false,
            error: "Authentication expired and refresh failed",
          };
        }
      }

      if (response.code === 200) {
        return {
          status: true,
          data: response,
        };
      }

      return {
        status: false,
        data: response,
        error: response.message || "Failed to adjust leverage",
      };
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Fetch current user config (preferred leverage & margin type) for a symbol
   * Mirrors ts-frontend behavior: GET /user-config/config + formatWeiToNormal
   * @param symbol Trading symbol, e.g. "BTC-PERP"
   */
  async getUserConfig(symbol: string): Promise<SDKResponse<UserConfig>> {
    if (!symbol) {
      return {
        status: false,
        error: "Symbol is required",
      };
    }

    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const params = { symbol };
      let response = await this.httpClient.get<UserConfig>(API_ENDPOINTS.GET_USER_CONFIG, {
        params,
      });

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.get<UserConfig>(API_ENDPOINTS.GET_USER_CONFIG, {
            params,
          });
        } else {
          return {
            status: false,
            error: "Authentication expired and refresh failed",
          };
        }
      }

      if (response.code === 200 && response.data) {
        const rawConfig: Record<string, any> = Array.isArray(response.data)
          ? response.data[0]
          : response.data;

        if (!rawConfig) {
          return {
            status: false,
            error: "User config not found",
          };
        }

        const leverageWei = rawConfig.leverage ?? rawConfig.leverageWei ?? "0";
        const normalizedConfig: UserConfig = {
          ...rawConfig,
          symbol: rawConfig.symbol || symbol,
          marginType: rawConfig.marginType || rawConfig.marginTypeEnum,
          leverageWei,
          leverage: this.formatWeiToNormal(leverageWei),
        };

        return {
          status: true,
          data: normalizedConfig,
        };
      }

      return {
        status: false,
        error: response.message || "Failed to fetch user config",
      };
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Place or edit TP/SL orders for a position
   */
  async placePositionTpSlOrders(
    params: PlaceTpSlOrdersParams
  ): Promise<SDKResponse<PlaceTpSlOrdersResult>> {
    try {
      const authResult = await this.authenticateForTrading();
      if (!authResult.status) {
        this.restoreMainAuth();
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      // Use sub-account keypair for signing if available
      const signingKeypair = this.subKeypair || this.keypair;

      const {
        symbol,
        market,
        side,
        isLong,
        leverage,
        quantity,
        reduceOnly = true,
        postOnly = false,
        orderbookOnly = true,
        ioc = false,
        tp,
        sl,
      } = params;

      if (!this.isPositiveNumber(quantity)) {
        return {
          status: false,
          error: "Quantity must be greater than zero",
        };
      }

      const hasTpOrder = this.hasTpSlOrderConfig(tp, quantity);
      const hasSlOrder = this.hasTpSlOrderConfig(sl, quantity);

      if (!hasTpOrder && !hasSlOrder) {
        return {
          status: false,
          error: "At least one TP or SL configuration is required",
        };
      }

      const leverageBN = formatNormalToWeiBN(leverage);
      const leverageWei = formatNormalToWei(leverage);
      const expirationBN = new BigNumber(0);
      const saltBN = new BigNumber(+new Date());
      const slSaltBN = saltBN.plus(1);
      const planPayloadBase = {
        symbol,
        side,
        leverage: leverageWei,
        creator: this.walletAddress,
      };

      const sendPlanCloseRequest = async (payload: Record<string, any>) => {
        let response = await this.httpClient.post<OrderResponse>(
          API_ENDPOINTS.PLAN_CLOSE_ORDER,
          payload
        );

        if (response.code === 1000) {
          this.clearAuth();
          const retryAuth = await this.authenticate();
          if (retryAuth.status) {
            response = await this.httpClient.post<OrderResponse>(
              API_ENDPOINTS.PLAN_CLOSE_ORDER,
              payload
            );
          }
        }

        return response;
      };

      const results: PlaceTpSlOrdersResult = {};
      let tpPayload: Record<string, any> | undefined;
      let slPayload: Record<string, any> | undefined;

      if (hasTpOrder && tp) {
        if (!this.isPositiveNumber(tp.triggerPrice)) {
          return {
            status: false,
            error: "TP trigger price must be greater than zero",
          };
        }

        const tpSaltValue = tp.salt ? new BigNumber(tp.salt) : saltBN;
        const tpOrderQuantityBN = formatNormalToWeiBN(tp.quantity ?? quantity);
        const tpOrderPriceBN =
          (tp.orderType || OrderType.MARKET) === OrderType.LIMIT
            ? formatNormalToWeiBN(tp.orderPrice ?? tp.triggerPrice ?? "0")
            : new BigNumber(0);

        const tpOrder = {
          market,
          creator: this.walletAddress,
          isLong: !isLong,
          reduceOnly,
          postOnly,
          orderbookOnly,
          ioc,
          quantity: tpOrderQuantityBN,
          price: tpOrderPriceBN,
          leverage: leverageBN,
          expiration: expirationBN,
          salt: tpSaltValue,
        };

        const tpOrderMsg = getOrderMessageForUIWallet(tpOrder);
        const tpOrderSignature = await signMessage(
          signingKeypair,
          new TextEncoder().encode(tpOrderMsg)
        );

        tpPayload = {
          ...planPayloadBase,
          tpOrderType: tp.orderType || OrderType.MARKET,
          tpTpslType: tp.tpslType || ("position" as TpSlMode),
          tpTriggerPrice: formatNormalToWei(tp.triggerPrice),
          tpOrderPrice:
            (tp.orderType || OrderType.MARKET) === OrderType.LIMIT
              ? formatNormalToWei(tp.orderPrice ?? tp.triggerPrice ?? "0")
              : "0",
          tpQuantity: formatNormalToWei(tp.quantity ?? quantity),
          tpTriggerWay: tp.triggerWay || "oracle",
          tpSalt: tpSaltValue.toString(),
          tpOrderSignature,
        };

        if (tp.planId !== undefined) {
          tpPayload.tpPlanId = tp.planId;
        }
      }

      if (hasSlOrder && sl) {
        if (!this.isPositiveNumber(sl.triggerPrice)) {
          return {
            status: false,
            error: "SL trigger price must be greater than zero",
          };
        }

        const slSaltValue = sl.salt ? new BigNumber(sl.salt) : slSaltBN;
        const slOrderQuantityBN = formatNormalToWeiBN(sl.quantity ?? quantity);
        const slOrderPriceBN =
          (sl.orderType || OrderType.MARKET) === OrderType.LIMIT
            ? formatNormalToWeiBN(sl.orderPrice ?? sl.triggerPrice ?? "0")
            : new BigNumber(0);

        const slOrder = {
          market,
          creator: this.walletAddress,
          isLong: !isLong,
          reduceOnly,
          postOnly,
          orderbookOnly,
          ioc,
          quantity: slOrderQuantityBN,
          price: slOrderPriceBN,
          leverage: leverageBN,
          expiration: expirationBN,
          salt: slSaltValue,
        };

        const slOrderMsg = getOrderMessageForUIWallet(slOrder);
        const slOrderSignature = await signMessage(
          signingKeypair,
          new TextEncoder().encode(slOrderMsg)
        );

        slPayload = {
          ...planPayloadBase,
          slOrderType: sl.orderType || OrderType.MARKET,
          slTpslType: sl.tpslType || ("position" as TpSlMode),
          slTriggerPrice: formatNormalToWei(sl.triggerPrice),
          slOrderPrice:
            (sl.orderType || OrderType.MARKET) === OrderType.LIMIT
              ? formatNormalToWei(sl.orderPrice ?? sl.triggerPrice ?? "0")
              : "0",
          slQuantity: formatNormalToWei(sl.quantity ?? quantity),
          slTriggerWay: sl.triggerWay || "oracle",
          slSalt: slSaltValue.toString(),
          slOrderSignature,
        };

        if (sl.planId !== undefined) {
          slPayload.slPlanId = sl.planId;
        }
      }

      if (hasTpOrder && hasSlOrder && tpPayload && slPayload) {
        const payload = {
          ...tpPayload,
          ...slPayload,
        };
        const response = await sendPlanCloseRequest(payload);
        results.tpResult = response;
        results.slResult = response;
      } else if (hasTpOrder && tpPayload) {
        results.tpResult = await sendPlanCloseRequest(tpPayload);
      } else if (hasSlOrder && slPayload) {
        results.slResult = await sendPlanCloseRequest(slPayload);
      }

      const success = [results.tpResult, results.slResult].some(
        (res) => res && res.code === 200
      );

      if (success) {
        this.restoreMainAuth();
        return {
          status: true,
          data: results,
        };
      }

      this.restoreMainAuth();
      return {
        status: false,
        data: results,
        error:
          results.tpResult?.message ||
          results.slResult?.message ||
          "Failed to place TP/SL order",
      };
    } catch (error) {
      this.restoreMainAuth();
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get TP/SL orders for a position
   */
  async getPositionTpSl(
    positionId: string | number,
    tpslType: TpSlMode = "normal"
  ): Promise<SDKResponse<PositionTpSlOrder[]>> {
    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const params = {
        positionId,
        tpslType,
      };

      let response = await this.httpClient.get<PositionTpSlOrder[]>(
        API_ENDPOINTS.GET_POSITION_TPSL,
        { params }
      );

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.get<PositionTpSlOrder[]>(
            API_ENDPOINTS.GET_POSITION_TPSL,
            { params }
          );
        } else {
          return {
            status: false,
            error: "Authentication expired and refresh failed",
          };
        }
      }

      if (response.code === 200) {
        const rawData = Array.isArray(response.data)
          ? response.data
          : (response.data as any)?.data || [];
        const orders = rawData.map((item: any) =>
          this.transformPositionTpSlOrder(item)
        );
        return {
          status: true,
          data: orders,
        };
      }

      return {
        status: false,
        error: response.message || "Failed to fetch TP/SL orders",
      };
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Cancel TP/SL orders (alias of cancelOrder)
   */
  async cancelTpSlOrders(
    params: CancelTpSlOrdersParams
  ): Promise<SDKResponse<OrderResponse>> {
    return this.cancelOrder(params);
  }

  /**
   * Get account information
   * @returns Account info response
   */
  async getAccountInfo(params?: AccountInfoParams): Promise<SDKResponse<AccountInfo>> {
    try {
      // Ensure authenticated before making request
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const queryParams: Record<string, any> = {};
      if (params?.parentAddress) {
        queryParams.parentAddress = params.parentAddress;
      }

      const response = await this.httpClient.get<AccountInfoResponse>(
        API_ENDPOINTS.GET_ACCOUNT_INFO,
        { params: queryParams }
      );

      // Handle JWT expiration (code 1000)
      if (response.code === 1000) {
        // Clear token and retry authentication
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          // Retry the request
          const retryResponse = await this.httpClient.get<AccountInfoResponse>(
            API_ENDPOINTS.GET_ACCOUNT_INFO,
            { params: queryParams }
          );
          if (retryResponse.code === 200 && retryResponse.data) {
            return {
              status: true,
              data: {
                walletBalance: retryResponse.data.walletBalance || "0",
                totalUnrealizedProfit: retryResponse.data.totalUnrealizedProfit || "0",
                accountValue: retryResponse.data.accountValue || "0",
                freeCollateral: retryResponse.data.freeCollateral || "0",
                totalMargin: retryResponse.data.totalMargin || "0",
              },
            };
          }
        }
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      if (response.code === 200 && response.data) {
        return {
          status: true,
          data: {
            walletBalance: response.data.walletBalance || "0",
            totalUnrealizedProfit: response.data.totalUnrealizedProfit || "0",
            accountValue: response.data.accountValue || "0",
            freeCollateral: response.data.freeCollateral || "0",
            totalMargin: response.data.totalMargin || "0",
          },
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get account info",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get positions
   * @param symbol Optional symbol filter
   * @returns Positions response
   */
  async getPositions(paramsOrSymbol?: string | PositionsParams): Promise<SDKResponse<Position[]>> {
    try {
      // Ensure authenticated before making request
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const params: Record<string, any> = {};
      if (typeof paramsOrSymbol === "string") {
        params.symbol = paramsOrSymbol;
      } else if (paramsOrSymbol) {
        if (paramsOrSymbol.symbol) params.symbol = paramsOrSymbol.symbol;
        if (paramsOrSymbol.parentAddress) params.parentAddress = paramsOrSymbol.parentAddress;
      }

      const response = await this.httpClient.get<PositionsResponse>(API_ENDPOINTS.GET_POSITIONS, {
        params,
      });

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          const retryResponse = await this.httpClient.get<PositionsResponse>(
            API_ENDPOINTS.GET_POSITIONS,
            { params }
          );
          if (retryResponse.code === 200) {
            const positions = Array.isArray(retryResponse.data)
              ? retryResponse.data
              : retryResponse.data?.data || [];
            return {
              status: true,
              data: positions,
            };
          }
        }
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      if (response.code === 200) {
        const positions = Array.isArray(response.data) ? response.data : response.data?.data || [];
        return {
          status: true,
          data: positions,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get positions",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get trading pairs list
   * This can be used to find the PerpetualID (perpId) for a given symbol
   * @returns Trading pairs response
   */
  async getTradingPairs(): Promise<SDKResponse<TradingPair[]>> {
    try {
      const response = await this.httpClient.get<TradingPairsResponse>(
        API_ENDPOINTS.GET_TRADING_PAIRS
      );

      if (response.code === 200) {
        const pairs = Array.isArray(response.data) ? response.data : response.data?.data || [];
        return {
          status: true,
          data: pairs,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get trading pairs",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get PerpetualID for a given symbol
   * @param symbol Trading symbol (e.g., "BTC-PERP")
   * @returns PerpetualID or null if not found
   */
  async getPerpetualID(symbol: string): Promise<string | null> {
    try {
      const pairsResult = await this.getTradingPairs();
      if (pairsResult.status && pairsResult.data) {
        const pair = pairsResult.data.find((p) => p.symbol === symbol);
        return pair?.perpId || null;
      }
      return null;
    } catch (error) {
      console.error("Error getting PerpetualID:", error);
      return null;
    }
  }

  /**
   * Get open orders
   * @param symbol Optional symbol filter
   * @returns Open orders response
   */
  async getOpenOrders(paramsOrSymbol?: string | OpenOrdersParams): Promise<SDKResponse<OpenOrder[]>> {
    try {
      // Ensure authenticated before making request
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const params: Record<string, any> = {};
      if (typeof paramsOrSymbol === "string") {
        params.symbol = paramsOrSymbol;
      } else if (paramsOrSymbol) {
        if (paramsOrSymbol.symbol) params.symbol = paramsOrSymbol.symbol;
        if (paramsOrSymbol.page) params.page = paramsOrSymbol.page;
        if (paramsOrSymbol.pageSize) params.pageSize = paramsOrSymbol.pageSize;
        if (paramsOrSymbol.parentAddress) params.parentAddress = paramsOrSymbol.parentAddress;
      }

      const response = await this.httpClient.get<OpenOrdersResponse>(
        API_ENDPOINTS.GET_OPEN_ORDERS,
        { params }
      );

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          const retryResponse = await this.httpClient.get<OpenOrdersResponse>(
            API_ENDPOINTS.GET_OPEN_ORDERS,
            { params }
          );
          if (retryResponse.code === 200) {
            const orders = Array.isArray(retryResponse.data)
              ? retryResponse.data
              : retryResponse.data?.data || [];
            return {
              status: true,
              data: orders,
            };
          }
        }
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      if (response.code === 200) {
        const orders = Array.isArray(response.data) ? response.data : response.data?.data || [];
        return {
          status: true,
          data: orders,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get open orders",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get order book for a trading pair
   * @param symbol Trading symbol (e.g., "BTC-PERP")
   * @returns Order book response with bids and asks
   * @example
   * ```typescript
   * const orderBook = await sdk.getOrderBook("BTC-PERP");
   * if (orderBook.status && orderBook.data) {
   *   console.log("Bids:", orderBook.data.bids);
   *   console.log("Asks:", orderBook.data.asks);
   * }
   * ```
   */
  async getOrderBook(symbol: string): Promise<SDKResponse<OrderBook>> {
    try {
      if (!symbol) {
        return {
          status: false,
          error: "Symbol is required",
        };
      }

      const params: Record<string, any> = {
        symbol,
      };

      const response = await this.httpClient.get<any>(
        API_ENDPOINTS.GET_ORDER_BOOK,
        { params }
      );

      if (response.code === 200 && response.data) {
        // Extract order book data from response
        // Match Java client: OrderBookResponse has bids and asks as List<List<String>>
        // Format: [[price, quantity, orderNum], ...]
        let rawData = response.data;
        
        // Handle nested response structure
        if ((rawData as any).data) {
          rawData = (rawData as any).data;
        }

        // Validate structure
        if (!rawData || !Array.isArray(rawData.bids) || !Array.isArray(rawData.asks)) {
          return {
            status: false,
            error: "Invalid order book data structure",
          };
        }

        // Process bids and asks from array format to OrderBookEntry format
        // Match ts-frontend: processOrderBookEntries converts [price, quantity, orderNum] to {price, quantity}
        const bids = this.processOrderBookEntries(rawData.bids, "bids");
        const asks = this.processOrderBookEntries(rawData.asks, "asks");

        const orderBook: OrderBook = {
          symbol,
          bids,
          asks,
          timestamp: Date.now(),
        };

        return {
          status: true,
          data: orderBook,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get order book",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Process order book entries from API format to OrderBookEntry format
   * Match ts-frontend: processOrderBookEntries method
   * @param entries Raw entries from API (array of [price, quantity, orderNum] or objects)
   * @param side "bids" or "asks"
   * @returns Processed OrderBookEntry array
   */
  private processOrderBookEntries(
    entries: any[],
    side: "bids" | "asks"
  ): OrderBookEntry[] {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .filter((entry) => {
        // Check if it's array format [price, quantity, orderNum]
        if (Array.isArray(entry) && entry.length >= 2) {
          const [price, quantity] = entry;
          return (
            price &&
            quantity &&
            !isNaN(parseFloat(String(price))) &&
            !isNaN(parseFloat(String(quantity))) &&
            parseFloat(String(quantity)) > 0
          );
        }
        // Check if it's object format {price, quantity}
        if (entry && entry.price && entry.quantity) {
          return (
            !isNaN(parseFloat(String(entry.price))) &&
            !isNaN(parseFloat(String(entry.quantity))) &&
            parseFloat(String(entry.quantity)) > 0
          );
        }
        return false;
      })
      .map((entry) => {
        let price: string, quantity: string;

        // Handle array format [price, quantity, orderNum]
        if (Array.isArray(entry) && entry.length >= 2) {
          [price, quantity] = entry;
        } else {
          // Handle object format {price, quantity}
          price = entry.price;
          quantity = entry.quantity;
        }

        // Keep wei format - no conversion
        return {
          price: String(price),
          quantity: String(quantity),
        };
      })
      .sort((a, b) => {
        const priceA = parseFloat(a.price);
        const priceB = parseFloat(b.price);

        // Bids: sort descending (highest price first)
        // Asks: sort ascending (lowest price first)
        // Match ts-frontend: bids descending, asks ascending
        if (side === "bids") {
          return priceB - priceA; // Descending for bids
        } else {
          return priceA - priceB; // Ascending for asks
        }
      });
  }

  /**
   * Format wei value to normal units (18 decimals)
   * Match ts-frontend: formatWeiToNormal function
   * @param value Value in wei (string or number)
   * @param decimals Number of decimals (default 18)
   * @returns Formatted string in normal units
   */
  private formatWeiToNormal(value: number | string, decimals = 18): string {
    try {
      const bn = new BigNumber(value);
      if (bn.isNaN() || bn.isZero()) {
        return "0";
      }
      return bn.dividedBy(new BigNumber(10).pow(decimals)).toString();
    } catch (error) {
      console.error("Error converting wei to normal:", error);
      return "0";
    }
  }

  /**
   * Get ticker information for a trading pair
   * @param symbol Trading symbol (e.g., "BTC-PERP")
   * @returns Ticker information response
   * @example
   * ```typescript
   * const ticker = await sdk.getTicker("BTC-PERP");
   * if (ticker.status && ticker.data) {
   *   console.log("Last Price:", ticker.data.lastPrice);
   *   console.log("24h Volume:", ticker.data.volume24h);
   *   console.log("24h Change:", ticker.data.rate24h);
   * }
   * ```
   */
  async getTicker(symbol: string): Promise<SDKResponse<Ticker>> {
    try {
      if (!symbol) {
        return {
          status: false,
          error: "Symbol is required",
        };
      }

      const params: Record<string, any> = {
        symbol,
      };

      const response = await this.httpClient.get<any>(
        API_ENDPOINTS.GET_TICKER,
        { params }
      );

      if (response.code === 200 && response.data) {
        // Extract ticker data from response
        // Match Java client: TickerResponse structure
        let rawData = response.data;

        // Handle nested response structure
        if ((rawData as any).data) {
          rawData = (rawData as any).data;
        }

        // Validate structure
        if (!rawData || !rawData.symbol) {
          return {
            status: false,
            error: "Invalid ticker data structure",
          };
        }

        // Process ticker data: convert wei to normal units
        // Match ts-frontend: transformerTicker function
        const ticker = this.processTickerData(rawData);

        return {
          status: true,
          data: ticker,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get ticker",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Transform raw TP/SL order data into SDK-friendly format
   */
  private transformPositionTpSlOrder(raw: any): PositionTpSlOrder {
    const toNormal = (value?: string | number | null) =>
      value !== undefined && value !== null && value !== ""
        ? this.formatWeiToNormal(value)
        : undefined;

    const planOrderType = raw.planOrderType;

    return {
      ...raw,
      id: raw.id ?? raw.planId ?? raw.planBatchId,
      planBatchId: raw.planBatchId ?? raw.id,
      planOrderType,
      orderType: raw.orderType,
      symbol: raw.symbol,
      side: raw.side,
      status: raw.status,
      hash: raw.hash,
      quantity: toNormal(raw.quantity) ?? "0",
      price: toNormal(raw.price),
      triggerPrice: toNormal(raw.triggerPrice),
      tpTriggerPrice: toNormal(raw.tpTriggerPrice),
      tpOrderPrice: toNormal(raw.tpOrderPrice),
      slTriggerPrice: toNormal(raw.slTriggerPrice),
      slOrderPrice: toNormal(raw.slOrderPrice),
      tpPlanId:
        planOrderType === "takeProfit"
          ? raw.tpPlanId ?? raw.id ?? null
          : raw.tpPlanId ?? null,
      slPlanId:
        planOrderType === "stopLoss"
          ? raw.slPlanId ?? raw.id ?? null
          : raw.slPlanId ?? null,
      tpslType: raw.tpslType,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  /**
   * Check whether TP/SL config should be submitted
   */
  private hasTpSlOrderConfig(
    config: TpSlOrderConfig | undefined,
    fallbackQuantity: number | string
  ): boolean {
    if (!config) {
      return false;
    }

    if (!this.isPositiveNumber(config.triggerPrice)) {
      return false;
    }

    const quantityValue = config.quantity ?? fallbackQuantity;
    return this.isPositiveNumber(quantityValue);
  }

  /**
   * Determine if a numeric input is greater than zero
   */
  private isPositiveNumber(value?: number | string): boolean {
    if (value === undefined || value === null || value === "") {
      return false;
    }

    try {
      return new BigNumber(value).gt(0);
    } catch {
      return false;
    }
  }

  /**
   * Process ticker data from API format to Ticker format
   * Keep all values in wei format - no conversion
   * @param rawData Raw ticker data from API
   * @returns Processed Ticker object
   */
  private processTickerData(rawData: any): Ticker {
    // Calculate mid price from best bid and ask
    // Calculate using wei values, keep in wei format
    let midPrice: string | undefined;
    if (rawData.bestAskPrice && rawData.bestBidPrice) {
      // Both exist: calculate average in wei
      const askPriceBN = new BigNumber(rawData.bestAskPrice);
      const bidPriceBN = new BigNumber(rawData.bestBidPrice);
      const midPriceBN = askPriceBN.plus(bidPriceBN).dividedBy(2);
      midPrice = midPriceBN.toString();
    } else if (rawData.bestAskPrice) {
      midPrice = String(rawData.bestAskPrice);
    } else if (rawData.bestBidPrice) {
      midPrice = String(rawData.bestBidPrice);
    } else {
      midPrice = "0";
    }

    // Build ticker object - keep all values in wei format
    const ticker: Ticker = {
      symbol: rawData.symbol,
      lastPrice: String(rawData.lastPrice || "0"),
      high24h: String(rawData.high24h || "0"),
      low24h: String(rawData.low24h || "0"),
      amount24h: String(rawData.amount24h || "0"),
      volume24h: String(rawData.volume24h || "0"),
      midPrice,
      timestamp: rawData.timestamp || Date.now(),
    };

    // Optional fields - keep in wei format
    if (rawData.markPrice) {
      ticker.markPrice = String(rawData.markPrice);
    }
    if (rawData.bestAskPrice) {
      ticker.bestAskPrice = String(rawData.bestAskPrice);
    }
    if (rawData.bestBidPrice) {
      ticker.bestBidPrice = String(rawData.bestBidPrice);
    }
    if (rawData.bestAskAmount) {
      ticker.bestAskAmount = String(rawData.bestAskAmount);
    }
    if (rawData.bestBidAmount) {
      ticker.bestBidAmount = String(rawData.bestBidAmount);
    }
    if (rawData.open24h) {
      ticker.open24h = String(rawData.open24h);
    }
    if (rawData.change24h) {
      ticker.change24h = String(rawData.change24h);
    }
    if (rawData.rate24h) {
      ticker.rate24h = String(rawData.rate24h);
    }
    if (rawData.openPrice) {
      ticker.openPrice = String(rawData.openPrice);
    }
    if (rawData.oraclePrice) {
      ticker.oraclePrice = String(rawData.oraclePrice);
    }
    if (rawData.fundingRate) {
      ticker.fundingRate = String(rawData.fundingRate);
    }
    if (rawData.openInterest) {
      ticker.openInterest = String(rawData.openInterest);
    }

    return ticker;
  }

  /**
   * Get history orders (matches Java historyOrders)
   * @param params History orders query parameters
   */
  async getHistoryOrders(params?: HistoryOrdersParams): Promise<SDKResponse<PageResponse<HistoryOrder>>> {
    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return { status: false, error: authResult.error || "Authentication failed" };
      }

      const queryParams: Record<string, any> = {};
      if (params?.symbol) queryParams.symbol = params.symbol;
      if (params?.page) queryParams.page = params.page;
      if (params?.pageSize) queryParams.pageSize = params.pageSize;
      if (params?.parentAddress) queryParams.parentAddress = params.parentAddress;
      if (params?.beginTime) queryParams.beginTime = params.beginTime;
      if (params?.endTime) queryParams.endTime = params.endTime;

      let response = await this.httpClient.get<PageResponse<HistoryOrder>>(
        API_ENDPOINTS.HISTORY_ORDERS,
        { params: queryParams }
      );

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.get<PageResponse<HistoryOrder>>(
            API_ENDPOINTS.HISTORY_ORDERS,
            { params: queryParams }
          );
        } else {
          return { status: false, error: "Authentication expired and refresh failed" };
        }
      }

      if (response.code === 200 && response.data) {
        return { status: true, data: response.data };
      }
      return { status: false, error: response.message || "Failed to get history orders" };
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
  }

  /**
   * Get funding settlements history (matches Java fundingSettlements)
   * @param params Funding settlements query parameters
   */
  async getFundingSettlements(params?: FundingSettlementsParams): Promise<SDKResponse<PageResponse<FundingSettlement>>> {
    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return { status: false, error: authResult.error || "Authentication failed" };
      }

      const queryParams: Record<string, any> = {};
      if (params?.symbol) queryParams.symbol = params.symbol;
      if (params?.page) queryParams.page = params.page;
      if (params?.pageSize) queryParams.pageSize = params.pageSize;
      if (params?.parentAddress) queryParams.parentAddress = params.parentAddress;
      if (params?.beginTime) queryParams.beginTime = params.beginTime;

      let response = await this.httpClient.get<PageResponse<FundingSettlement>>(
        API_ENDPOINTS.FUNDING_SETTLEMENTS,
        { params: queryParams }
      );

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.get<PageResponse<FundingSettlement>>(
            API_ENDPOINTS.FUNDING_SETTLEMENTS,
            { params: queryParams }
          );
        } else {
          return { status: false, error: "Authentication expired and refresh failed" };
        }
      }

      if (response.code === 200 && response.data) {
        return { status: true, data: response.data };
      }
      return { status: false, error: response.message || "Failed to get funding settlements" };
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
  }

  /**
   * Get balance changes history (matches Java balanceChanges)
   * @param params Balance changes query parameters
   */
  async getBalanceChanges(params?: BalanceChangesParams): Promise<SDKResponse<PageResponse<BalanceChange>>> {
    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return { status: false, error: authResult.error || "Authentication failed" };
      }

      const queryParams: Record<string, any> = {};
      if (params?.page) queryParams.page = params.page;
      if (params?.pageSize) queryParams.pageSize = params.pageSize;
      if (params?.parentAddress) queryParams.parentAddress = params.parentAddress;
      if (params?.beginTime) queryParams.beginTime = params.beginTime;

      let response = await this.httpClient.get<PageResponse<BalanceChange>>(
        API_ENDPOINTS.BALANCE_CHANGES,
        { params: queryParams }
      );

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.get<PageResponse<BalanceChange>>(
            API_ENDPOINTS.BALANCE_CHANGES,
            { params: queryParams }
          );
        } else {
          return { status: false, error: "Authentication expired and refresh failed" };
        }
      }

      if (response.code === 200 && response.data) {
        return { status: true, data: response.data };
      }
      return { status: false, error: response.message || "Failed to get balance changes" };
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
  }

  /**
   * Get oracle price for a trading pair (matches Java oracle)
   * @param symbol Trading symbol (e.g., "BTC-PERP")
   * @returns Oracle price as string (in wei/base unit)
   */
  async getOraclePrice(symbol: string): Promise<SDKResponse<string>> {
    try {
      if (!symbol) {
        return { status: false, error: "Symbol is required" };
      }

      const response = await this.httpClient.get<any>(
        API_ENDPOINTS.ORACLE,
        { params: { symbol } }
      );

      if (response.code === 200 && response.data !== undefined) {
        return { status: true, data: String(response.data) };
      }
      return { status: false, error: response.message || "Failed to get oracle price" };
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
  }

  /**
   * Add isolated margin to an existing position (on-chain)
   * @param params Margin adjustment parameters
   */
  async addMargin(params: MarginAdjustmentParams): Promise<SuiTransactionBlockResponse> {
    const transaction = await this.buildMarginTransaction(params, "add");
    if (transaction) {
      return executeTxBlock(this.suiClient, transaction, this.keypair);
    }
    const fallbackPayload = this.buildMarginCallArgs(params, "add");
    const tx = buildAddMarginTx(this.deploymentConfig, fallbackPayload, undefined, fallbackPayload.gasBudget, this.keypair.getPublicKey().toSuiAddress());
    return executeTxBlock(this.suiClient, tx, this.keypair);
  }

  /**
   * Remove isolated margin from an existing position (on-chain)
   * @param params Margin adjustment parameters
   */
  async removeMargin(params: MarginAdjustmentParams): Promise<SuiTransactionBlockResponse> {
    const transaction = await this.buildMarginTransaction(params, "remove");
    if (transaction) {
      return executeTxBlock(this.suiClient, transaction, this.keypair);
    }
    const fallbackPayload = this.buildMarginCallArgs(params, "remove");
    const tx = buildRemoveMarginTx(this.deploymentConfig, fallbackPayload, undefined, fallbackPayload.gasBudget, this.keypair.getPublicKey().toSuiAddress());
    return executeTxBlock(this.suiClient, tx, this.keypair);
  }

  /**
   * Build ExchangeOnChain call args for margin adjustments
   */
  private buildMarginCallArgs(
    params: MarginAdjustmentParams,
    action: "add" | "remove"
  ): {
    amount: number;
    account: string;
    perpID?: string;
    market?: string;
    subAccountsMapID?: string;
    gasBudget?: number;
    txHash?: string;
  } {
    const {
      amount,
      accountAddress,
      symbol,
      market,
      perpId,
      subAccountsMapId,
      gasBudget,
      txHash,
    } = params;

    if (!this.isPositiveNumber(amount)) {
      throw new Error(`Amount must be greater than zero to ${action} margin`);
    }

    const amountNumber = new BigNumber(amount).toNumber();
    if (!Number.isFinite(amountNumber)) {
      throw new Error("Amount is too large to represent as a number");
    }

    const marketSymbolInput = market || symbol;
    const marketSymbol = marketSymbolInput ? marketSymbolInput.toUpperCase() : undefined;
    const resolvedPerpId =
      perpId || (marketSymbol ? this.resolvePerpIdFromDeployment(marketSymbol) : undefined);

    if (!marketSymbol && !resolvedPerpId) {
      throw new Error("Either market/symbol or perpId must be provided for margin adjustments");
    }

    return {
      amount: amountNumber,
      account: accountAddress || this.walletAddress,
      market: marketSymbol,
      perpID: resolvedPerpId,
      subAccountsMapID: subAccountsMapId,
      gasBudget,
      txHash,
    };
  }

  private getDeploymentProtocolConfigId(): string {
    const protocolId = this.deploymentConfig?.objects?.ProtocolConfig?.id;
    if (!protocolId) {
      throw new Error("Deployment config missing ProtocolConfig id");
    }
    return protocolId;
  }

  private async buildMarginTransaction(
    params: MarginAdjustmentParams,
    action: "add" | "remove"
  ): Promise<Transaction | undefined> {
    const payload = this.buildMarginCallArgs(params, action);
    const updatePriceTx = payload.market
      ? await this.buildUpdatePriceTransaction(payload.market)
      : undefined;
    const baseTx = updatePriceTx || new Transaction();
    if (action === "add") {
      return buildAddMarginTx(this.deploymentConfig, payload, baseTx, params.gasBudget);
    }
    return buildRemoveMarginTx(this.deploymentConfig, payload, baseTx, params.gasBudget);
  }

  private async buildUpdatePriceTransaction(symbol: string): Promise<Transaction | undefined> {
    if (!symbol) {
      return undefined;
    }
    try {
      if (this.options.network === "mainnet") {
        return await this.buildMainnetPriceUpdateTransaction(symbol);
      }
      return await this.buildTestnetPriceUpdateTransaction(symbol);
    } catch (error) {
      console.warn(`Failed to build price update transaction for ${symbol}:`, error);
      return undefined;
    }
  }

  private async buildMainnetPriceUpdateTransaction(symbol: string): Promise<Transaction | undefined> {
    const priceInfoObjectId = this.getPriceInfoObjectId(symbol);
    const priceFeedId = await this.resolvePriceFeedId(symbol);
    if (!priceInfoObjectId || !priceFeedId) {
      return undefined;
    }

    this.ensurePythClients();
    if (!this.priceServiceConnection || !this.pythClient) {
      return undefined;
    }

    const tx = new Transaction();
    const priceIds = [priceFeedId];
    const priceUpdateData = await this.priceServiceConnection.getPriceFeedsUpdateData(priceIds);

    const [priceInfoObject, clockObject] = await this.suiClient.multiGetObjects({
      ids: [priceInfoObjectId, "0x6"],
      options: { showContent: true, showBcs: true, showType: true },
    });

    const oracleTime = this.extractOracleArrivalTime(priceInfoObject);
    const clockTime = this.extractClockTimeSeconds(clockObject);

    if (clockTime - oracleTime > 5) {
      await this.pythClient.updatePriceFeeds(tx, priceUpdateData, priceIds);
    }

    return tx;
  }

  private async buildTestnetPriceUpdateTransaction(
    symbol: string
  ): Promise<Transaction | undefined> {
    try {
      const oraclePrice = await getOnChainOraclePrice(this.suiClient, this.deploymentConfig, symbol);
      if (oraclePrice === undefined || oraclePrice === null) {
        return undefined;
      }
      return buildSetOraclePriceTx(this.deploymentConfig, {
        price: Number(oraclePrice),
        market: symbol,
      });
    } catch (error) {
      console.warn(`Failed to fetch oracle price for ${symbol}:`, error);
      return undefined;
    }
  }

  private getPriceInfoObjectId(symbol: string): string | undefined {
    const canonical = symbol?.toUpperCase();
    const market = this.getDeploymentMarket(canonical);
    return market?.Objects?.PriceInfoObject?.id;
  }

  private getDeploymentMarket(symbol?: string): any {
    if (!symbol) {
      return undefined;
    }
    const markets = this.deploymentConfig?.markets;
    const canonical = symbol.toUpperCase();
    return markets?.[canonical] || markets?.[symbol];
  }

  private async resolvePriceFeedId(symbol: string): Promise<string | undefined> {
    const canonical = symbol?.toUpperCase();
    const deploymentMarket = this.getDeploymentMarket(canonical);
    const configFeed =
      deploymentMarket?.Config?.priceInfoFeedId || deploymentMarket?.Config?.priceIdentifierId;
    if (configFeed) {
      return configFeed;
    }

    const pairs = await this.getCachedTradingPairs();
    const match = pairs.find(
      (pair) => pair.symbol?.toUpperCase() === canonical || pair.symbol === symbol
    );
    if (match) {
      return (match as any).priceIdentifierId || (match as any).priceInfoFeedId;
    }
    return undefined;
  }

  private async getCachedTradingPairs(): Promise<TradingPair[]> {
    const cacheAge = this.tradingPairsCacheTimestamp
      ? Date.now() - this.tradingPairsCacheTimestamp
      : Infinity;
    if (this.tradingPairsCache && cacheAge < 60_000) {
      return this.tradingPairsCache;
    }

    const result = await this.getTradingPairs();
    if (result.status && result.data) {
      this.tradingPairsCache = result.data;
      this.tradingPairsCacheTimestamp = Date.now();
      return result.data;
    }

    return this.tradingPairsCache || [];
  }

  private ensurePythClients(): void {
    const config = PYTH_CONFIG[this.options.network];
    if (!config) {
      return;
    }

    if (!this.priceServiceConnection) {
      this.priceServiceConnection = new SuiPriceServiceConnection(config.priceServiceUrl);
    }

    if (!this.pythClient) {
      this.pythClient = new SuiPythClient(
        this.suiClient as any,
        config.pythStateId,
        config.wormholeStateId
      );
    }
  }

  private extractOracleArrivalTime(objectResponse: any): number {
    const priceInfo =
      objectResponse?.data?.content &&
      "fields" in objectResponse.data.content &&
      (objectResponse.data.content as any).fields?.price_info?.fields?.arrival_time;
    if (typeof priceInfo === "number") {
      return priceInfo;
    }
    if (typeof priceInfo === "string") {
      const parsed = Number(priceInfo);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private extractClockTimeSeconds(objectResponse: any): number {
    const timestamp =
      objectResponse?.data?.content &&
      "fields" in objectResponse.data.content &&
      (objectResponse.data.content as any).fields?.timestamp_ms;
    if (typeof timestamp === "number") {
      return timestamp / 1000;
    }
    if (typeof timestamp === "string") {
      const parsed = Number(timestamp);
      return Number.isFinite(parsed) ? parsed / 1000 : 0;
    }
    return 0;
  }

  /**
   * Resolve perpId from deployment data
   */
  private resolvePerpIdFromDeployment(market: string): string | undefined {
    try {
      const perpId = getDeploymentPerpetualID(this.deploymentConfig, market);
      return perpId || undefined;
    } catch (error) {
      console.warn(`Failed to resolve PerpetualID for market ${market}:`, error);
      return undefined;
    }
  }

  /**
   * Set sub-account on-chain (authorize a sub-account address)
   * @param subAddress Sub-account address to authorize
   * @returns On-chain transaction result
   */
  async setSubAccount(subAddress: string) {
    return await onChainSetSubAccount(
      this.suiClient,
      this.deploymentConfig,
      {
        account: subAddress,
        status: true,
      },
      this.keypair
    );
  }

  /**
   * Deposit to bank (fund account)
   * Deposit USDC from wallet to exchange bank account for trading collateral
   * @param amount Deposit amount in USDC (standard units, e.g., 10 means 10 USDC)
   * @returns On-chain transaction result
   * @example
   * ```typescript
   * const result = await sdk.depositToBank(100); // Deposit 100 USDC
   * ```
   */
  async depositToBank(amount: number) {
    return await onChainDepositToBank(
      this.suiClient,
      this.deploymentConfig,
      {
        amount: formatNormalToWei(amount, DECIMALS.USDC),
        accountAddress: this.address,
      },
      this.keypair
    );
  }

  /**
   * Withdraw from bank (withdraw funds)
   * Withdraw USDC from exchange bank account back to wallet
   * @param amount Withdraw amount in USDC (standard units, e.g., 50 means 50 USDC)
   * @returns On-chain transaction result
   * @example
   * ```typescript
   * const result = await sdk.withdrawFromBank(50); // Withdraw 50 USDC
   * ```
   */
  async withdrawFromBank(amount: number) {
    return await onChainWithdrawFromBank(
      this.suiClient,
      this.deploymentConfig,
      {
        amount: formatNormalToWei(amount, DECIMALS.USDC),
        accountAddress: this.address,
      },
      this.keypair
    );
  }

  /**
   * Get all coin balances on-chain for the current wallet address
   * @returns Array of coin balances with coinType and totalBalance
   */
  async getAllBalances(owner?: string): Promise<SDKResponse<{ coinType: string; totalBalance: string }[]>> {
    try {
      const balances = await this.suiClient.getAllBalances({ owner: owner || this.walletAddress });
      return { status: true, data: balances };
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
  }

  /**
   * Get coin metadata (symbol, decimals, name) for a given coin type
   * @param coinType Full coin type string (e.g., "0x2::sui::SUI")
   */
  async getCoinMetadata(coinType: string): Promise<SDKResponse<{ decimals: number; symbol: string; name: string }>> {
    try {
      const metadata = await this.suiClient.getCoinMetadata({ coinType });
      if (!metadata) {
        return { status: false, error: "Coin metadata not found" };
      }
      return { status: true, data: { decimals: metadata.decimals, symbol: metadata.symbol, name: metadata.name } };
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
  }

  // =====================================================
  // Vault (on-chain contract) Operations
  // =====================================================
  //
  // Vault functions live in a SEPARATE package from the exchange.
  // The library's ExchangeOnChain uses getPackageID() (exchange pkg)
  // for vault moveCall targets, causing TypeMismatch errors.
  // We build vault transactions manually with the correct vault package.
  // =====================================================

  private getVaultPackageId(): string {
    const pkg = this.deploymentConfig?.vaultPackage;
    if (!pkg) throw new Error("Deployment config missing vaultPackage");
    return pkg;
  }

  private getVaultConfigId(): string {
    const id = this.deploymentConfig?.objects?.VaultConfig?.id;
    if (!id) throw new Error("Deployment config missing VaultConfig id");
    return id;
  }

  private getBankId(): string {
    const id = this.deploymentConfig?.objects?.Bank?.id;
    if (!id) throw new Error("Deployment config missing Bank id");
    return id;
  }

  private getTxIndexerId(): string {
    const id = this.deploymentConfig?.objects?.TxIndexer?.id;
    if (!id) throw new Error("Deployment config missing TxIndexer id");
    return id;
  }

  private getSubAccountsId(): string {
    const id = this.deploymentConfig?.objects?.SubAccounts?.id;
    if (!id) throw new Error("Deployment config missing SubAccounts id");
    return id;
  }

  private getCurrencyType(): string {
    const dt = this.deploymentConfig?.objects?.Currency?.dataType;
    if (!dt) throw new Error("Deployment config missing Currency dataType");
    return dt;
  }

  private getMarketSymbols(): string[] {
    return Object.keys(this.deploymentConfig?.markets || {});
  }

  private getVaultPerpetualId(symbol: string): string {
    const id = this.deploymentConfig?.markets?.[symbol]?.Objects?.Perpetual?.id;
    if (!id) throw new Error(`Deployment config missing Perpetual id for ${symbol}`);
    return id;
  }

  private getVaultPriceInfoObjectId(symbol: string): string {
    const id = this.deploymentConfig?.markets?.[symbol]?.Objects?.PriceInfoObject?.id;
    if (!id) throw new Error(`Deployment config missing PriceInfoObject id for ${symbol}`);
    return id;
  }

  private async buildVaultNavTransaction(
    vaultID: string,
    markets?: string[],
    tx?: Transaction
  ): Promise<{ nav: any; tx: Transaction }> {
    const t = tx || new Transaction();
    const vaultPkg = this.getVaultPackageId();
    const currencyType = this.getCurrencyType();

    const symbols = markets && markets.length > 0 ? markets : this.getMarketSymbols();

    // On testnet, prepend price oracle updates so PriceInfoObjects are fresh
    if (this.options.network === "testnet") {
      const prices: { price: number; confidence?: string; market?: string }[] = [];
      for (const sym of symbols) {
        try {
          const oraclePrice = await getOnChainOraclePrice(this.suiClient, this.deploymentConfig, sym);
          if (oraclePrice !== undefined && oraclePrice !== null) {
            prices.push({ price: Number(oraclePrice), market: sym });
          }
        } catch {
          // skip symbols where oracle price is unavailable
        }
      }
      if (prices.length > 0) {
        buildBatchSetOraclePriceTx(this.deploymentConfig, { prices }, t);
      }
    }

    const [nav] = t.moveCall({
      target: `${vaultPkg}::vault::new_vault_nav`,
      arguments: [
        t.object(this.getDeploymentProtocolConfigId()),
        t.object(this.getVaultConfigId()),
        t.object(vaultID),
        t.object(this.getBankId()),
      ],
      typeArguments: [currencyType],
    });

    for (const sym of symbols) {
      const perpId = this.getVaultPerpetualId(sym);
      const priceInfoId = this.getVaultPriceInfoObjectId(sym);
      t.moveCall({
        target: `${vaultPkg}::vault::compute_perpetual_position_value`,
        arguments: [nav, t.object("0x6"), t.object(perpId), t.object(priceInfoId)],
        typeArguments: [],
      });
    }

    return { nav, tx: t };
  }

  private async signAndExecuteVaultTx(tx: Transaction): Promise<SuiTransactionBlockResponse> {
    tx.setSender(this.keypair.getPublicKey().toSuiAddress());
    return await this.suiClient.signAndExecuteTransaction({
      signer: this.keypair,
      transaction: tx,
      options: { showEffects: true, showObjectChanges: true },
    });
  }

  /**
   * Create a new on-chain vault
   */
  async createVault(args: {
    name: string;
    trader: string;
    maxCap: number;
    minDepositAmount: number;
    creatorMinimumShareRatio: string;
    creatorProfitShareRatio: string;
    initialAmount: number;
  }) {
    const tx = new Transaction();
    const vaultPkg = this.getVaultPackageId();
    tx.moveCall({
      target: `${vaultPkg}::vault::create_vault`,
      arguments: [
        tx.object(this.getDeploymentProtocolConfigId()),
        tx.object("0x6"),
        tx.object(this.getVaultConfigId()),
        tx.object(this.getSubAccountsId()),
        tx.object(this.getBankId()),
        tx.object(this.getTxIndexerId()),
        tx.pure.string(args.name),
        tx.pure.address(args.trader),
        tx.pure.u128(formatNormalToWei(args.maxCap)),
        tx.pure.u128(formatNormalToWei(args.minDepositAmount)),
        tx.pure.u128(args.creatorMinimumShareRatio),
        tx.pure.u128(args.creatorProfitShareRatio),
        tx.pure.u128(formatNormalToWei(args.initialAmount)),
      ],
      typeArguments: [this.getCurrencyType()],
    });
    return this.signAndExecuteVaultTx(tx);
  }

  /**
   * Deposit USDC into a vault
   */
  async depositToVault(args: { vaultID: string; amount: number; markets?: string[] }) {
    const { nav, tx } = await this.buildVaultNavTransaction(args.vaultID, args.markets);
    const vaultPkg = this.getVaultPackageId();
    tx.moveCall({
      target: `${vaultPkg}::vault::deposit`,
      arguments: [
        tx.object(this.getDeploymentProtocolConfigId()),
        tx.object(this.getVaultConfigId()),
        tx.object("0x6"),
        tx.object(this.getBankId()),
        tx.object(this.getTxIndexerId()),
        tx.object(args.vaultID),
        nav,
        tx.pure.u128(formatNormalToWei(args.amount)),
      ],
      typeArguments: [this.getCurrencyType()],
    });
    return this.signAndExecuteVaultTx(tx);
  }

  /**
   * Request withdrawal from a vault (by share amount)
   */
  async requestWithdrawFromVault(args: { vaultID: string; shares: number }) {
    const tx = new Transaction();
    const vaultPkg = this.getVaultPackageId();
    tx.moveCall({
      target: `${vaultPkg}::vault::request_withdraw`,
      arguments: [
        tx.object(this.getDeploymentProtocolConfigId()),
        tx.object(this.getVaultConfigId()),
        tx.object("0x6"),
        tx.object(args.vaultID),
        tx.pure.u128(formatNormalToWei(args.shares)),
      ],
      typeArguments: [this.getCurrencyType()],
    });
    return this.signAndExecuteVaultTx(tx);
  }

  /**
   * Fill pending withdrawal requests (creator/operator only)
   */
  async fillWithdrawalRequests(args: {
    vaultID: string;
    withdrawalRequestIDs: string[];
    markets?: string[];
  }) {
    const { nav, tx } = await this.buildVaultNavTransaction(args.vaultID, args.markets);
    const vaultPkg = this.getVaultPackageId();
    const requestVec = tx.makeMoveVec({
      elements: args.withdrawalRequestIDs.map((id) => tx.object(id)),
    });
    tx.moveCall({
      target: `${vaultPkg}::vault::fill_withdrawal_requests`,
      arguments: [
        tx.object(this.getDeploymentProtocolConfigId()),
        tx.object(this.getVaultConfigId()),
        tx.object("0x6"),
        tx.object(this.getBankId()),
        tx.object(this.getTxIndexerId()),
        tx.object(args.vaultID),
        nav,
        requestVec,
      ],
      typeArguments: [this.getCurrencyType()],
    });
    return this.signAndExecuteVaultTx(tx);
  }

  /**
   * Close a vault (creator only)
   */
  async closeVault(args: { vaultID: string; markets?: string[] }) {
    const { nav, tx } = await this.buildVaultNavTransaction(args.vaultID, args.markets);
    const vaultPkg = this.getVaultPackageId();
    tx.moveCall({
      target: `${vaultPkg}::vault::close_vault_v2`,
      arguments: [
        tx.object(this.getDeploymentProtocolConfigId()),
        tx.object(this.getVaultConfigId()),
        tx.object(this.getSubAccountsId()),
        tx.object(args.vaultID),
        tx.object(this.getBankId()),
        tx.object("0x6"),
        nav,
      ],
      typeArguments: [this.getCurrencyType()],
    });
    return this.signAndExecuteVaultTx(tx);
  }

  /**
   * Remove a closed vault (after all funds claimed)
   */
  async removeVault(args: { vaultID: string }) {
    const tx = new Transaction();
    const vaultPkg = this.getVaultPackageId();
    tx.moveCall({
      target: `${vaultPkg}::vault::remove_vault`,
      arguments: [
        tx.object(this.getDeploymentProtocolConfigId()),
        tx.object(this.getVaultConfigId()),
        tx.object(this.getBankId()),
        tx.object(args.vaultID),
      ],
      typeArguments: [this.getCurrencyType()],
    });
    return this.signAndExecuteVaultTx(tx);
  }

  /**
   * Claim funds from a closed vault
   */
  async claimClosedVaultFunds(args: { vaultID: string }) {
    const tx = new Transaction();
    const vaultPkg = this.getVaultPackageId();
    tx.moveCall({
      target: `${vaultPkg}::vault::claim_closed_vault_funds`,
      arguments: [
        tx.object(this.getDeploymentProtocolConfigId()),
        tx.object(this.getVaultConfigId()),
        tx.object(this.getBankId()),
        tx.object(this.getTxIndexerId()),
        tx.object(args.vaultID),
      ],
      typeArguments: [this.getCurrencyType()],
    });
    return this.signAndExecuteVaultTx(tx);
  }

  /**
   * Set the trader address for a vault (creator only)
   */
  async setVaultTrader(args: { vaultID: string; newTrader: string }) {
    const tx = new Transaction();
    const vaultPkg = this.getVaultPackageId();
    tx.moveCall({
      target: `${vaultPkg}::vault::set_trader`,
      arguments: [
        tx.object(this.getDeploymentProtocolConfigId()),
        tx.object(this.getVaultConfigId()),
        tx.object(args.vaultID),
        tx.object(this.getSubAccountsId()),
        tx.pure.address(args.newTrader),
      ],
      typeArguments: [this.getCurrencyType()],
    });
    return this.signAndExecuteVaultTx(tx);
  }

  /**
   * Add or remove a sub-trader for a vault
   */
  async setVaultSubTrader(args: { vaultID: string; subTrader: string; status: boolean }) {
    const tx = new Transaction();
    const vaultPkg = this.getVaultPackageId();
    tx.moveCall({
      target: `${vaultPkg}::vault::set_sub_trader`,
      arguments: [
        tx.object(this.getDeploymentProtocolConfigId()),
        tx.object(this.getVaultConfigId()),
        tx.object(args.vaultID),
        tx.object(this.getSubAccountsId()),
        tx.pure.address(args.subTrader),
        tx.pure.bool(args.status),
      ],
      typeArguments: [this.getCurrencyType()],
    });
    return this.signAndExecuteVaultTx(tx);
  }

  /**
   * Enable or disable deposits to a vault (creator only)
   */
  async setVaultDepositStatus(args: { vaultID: string; status: boolean }) {
    const tx = new Transaction();
    const vaultPkg = this.getVaultPackageId();
    tx.moveCall({
      target: `${vaultPkg}::vault::set_deposit_status`,
      arguments: [
        tx.object(this.getDeploymentProtocolConfigId()),
        tx.object(this.getVaultConfigId()),
        tx.object(args.vaultID),
        tx.pure.bool(args.status),
      ],
      typeArguments: [this.getCurrencyType()],
    });
    return this.signAndExecuteVaultTx(tx);
  }

  /**
   * Set maximum USDC cap for a vault (creator only)
   */
  async setVaultMaxCap(args: { vaultID: string; maxCap: number }) {
    const tx = new Transaction();
    const vaultPkg = this.getVaultPackageId();
    tx.moveCall({
      target: `${vaultPkg}::vault::set_max_cap`,
      arguments: [
        tx.object(this.getDeploymentProtocolConfigId()),
        tx.object(this.getVaultConfigId()),
        tx.object(args.vaultID),
        tx.pure.u128(formatNormalToWei(args.maxCap)),
      ],
      typeArguments: [this.getCurrencyType()],
    });
    return this.signAndExecuteVaultTx(tx);
  }

  /**
   * Set minimum deposit amount for a vault (creator only)
   */
  async setVaultMinDepositAmount(args: { vaultID: string; minDepositAmount: number }) {
    const tx = new Transaction();
    const vaultPkg = this.getVaultPackageId();
    tx.moveCall({
      target: `${vaultPkg}::vault::set_min_deposit_amount`,
      arguments: [
        tx.object(this.getDeploymentProtocolConfigId()),
        tx.object(this.getVaultConfigId()),
        tx.object(args.vaultID),
        tx.pure.u128(formatNormalToWei(args.minDepositAmount)),
      ],
      typeArguments: [this.getCurrencyType()],
    });
    return this.signAndExecuteVaultTx(tx);
  }

  /**
   * Enable or disable auto-close on withdrawal (creator only)
   */
  async setVaultAutoCloseOnWithdraw(args: { vaultID: string; autoCloseOnWithdraw: boolean }) {
    const tx = new Transaction();
    const vaultPkg = this.getVaultPackageId();
    tx.moveCall({
      target: `${vaultPkg}::vault::set_auto_close_on_withdraw`,
      arguments: [
        tx.object(this.getDeploymentProtocolConfigId()),
        tx.object(this.getVaultConfigId()),
        tx.object(args.vaultID),
        tx.pure.bool(args.autoCloseOnWithdraw),
      ],
      typeArguments: [this.getCurrencyType()],
    });
    return this.signAndExecuteVaultTx(tx);
  }

  /**
   * Read vault object data from chain
   */
  async getVaultInfo(vaultID: string): Promise<SDKResponse<any>> {
    try {
      const obj = await this.suiClient.getObject({
        id: vaultID,
        options: { showContent: true, showType: true },
      });
      if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
        return { status: false, error: "Vault object not found or not a Move object" };
      }
      return { status: true, data: (obj.data.content as any).fields };
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
  }

  /**
   * List vaults created by a specific address via server API.
   */
  async listVaults(
    creatorAddress?: string,
  ): Promise<SDKResponse<any[]>> {
    try {
      const address = creatorAddress || this.walletAddress;
      const response = await this.httpClient.get<any[]>(API_ENDPOINTS.VAULTS_BY_CREATOR, {
        params: { address },
      });
      if (response.code === 200) {
        return { status: true, data: response.data || [] };
      }
      return { status: false, error: response.message || "Failed to list vaults" };
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
  }
}
