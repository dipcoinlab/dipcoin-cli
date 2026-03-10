import { DipCoinPerpSDK } from "../sdk";
import { HttpClient } from "../services/httpClient";
import { API_ENDPOINTS } from "../constants";
import {
  OrderSide,
  OrderType,
  AccountInfoParams,
  PositionsParams,
  OpenOrdersParams,
  HistoryOrdersParams,
  FundingSettlementsParams,
  BalanceChangesParams,
} from "../types";

// Mock dependencies
jest.mock("../services/httpClient");
jest.mock("../utils", () => ({
  signMessage: jest.fn().mockResolvedValue("mock-signature"),
  formatNormalToWei: jest.fn((v: any) => String(v)),
  formatNormalToWeiBN: jest.fn((v: any) => ({ toString: () => String(v) })),
  formatError: jest.fn((e: any) => e?.message || String(e)),
  fromExportedKeypair: jest.fn().mockReturnValue({
    getPublicKey: () => ({
      toSuiAddress: () => "0xmock_address",
    }),
  }),
  readFile: jest.fn().mockReturnValue({
    packages: ["0xmock_package"],
    protocolConfig: "0xmock_protocol",
    objects: {
      ProtocolConfig: { id: "0xmock_protocol_config_id" },
    },
  }),
  SignerTypes: { ED25519: "ED25519" },
}));
jest.mock("@mysten/sui/client", () => ({
  SuiClient: jest.fn().mockImplementation(() => ({})),
  getFullnodeUrl: jest.fn().mockReturnValue("https://mock-rpc.com"),
}));
jest.mock("../onchain", () => ({
  getOrderMessageForUIWallet: jest.fn().mockReturnValue("mock-order-message"),
  executeTxBlock: jest.fn().mockResolvedValue({}),
  getDeploymentPerpetualID: jest.fn().mockReturnValue("0xmock_perp_id"),
  getOnChainOraclePrice: jest.fn().mockResolvedValue(50000),
  depositToBank: jest.fn().mockResolvedValue({}),
  withdrawFromBank: jest.fn().mockResolvedValue({}),
  setSubAccount: jest.fn().mockResolvedValue({}),
  buildAddMarginTx: jest.fn().mockReturnValue({}),
  buildRemoveMarginTx: jest.fn().mockReturnValue({}),
  buildSetOraclePriceTx: jest.fn().mockReturnValue({}),
  buildBatchSetOraclePriceTx: jest.fn().mockReturnValue({}),
}));
jest.mock("@pythnetwork/pyth-sui-js", () => ({
  SuiPriceServiceConnection: jest.fn(),
  SuiPythClient: jest.fn(),
}));

// Helper to create a mock SDK instance with mocked httpClient
function createMockSDK() {
  const mockHttpClient = {
    get: jest.fn(),
    post: jest.fn(),
    postForm: jest.fn(),
    setWalletAddress: jest.fn(),
    setAuthToken: jest.fn(),
  };

  (HttpClient as jest.Mock).mockImplementation(() => mockHttpClient);

  const sdk = new DipCoinPerpSDK("YOUR_PRIVATE_KEY_HERE", {
    apiBaseUrl: "https://mock-api.dipcoin.io",
    network: "testnet",
  });

  return { sdk, mockHttpClient };
}

describe("DipCoinPerpSDK", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create SDK instance", () => {
      const { sdk } = createMockSDK();
      expect(sdk).toBeDefined();
      expect(sdk.address).toBeDefined();
    });

    it("should support subAccountKey option", () => {
      const mockHttpClient = {
        get: jest.fn(),
        post: jest.fn(),
        postForm: jest.fn(),
        setWalletAddress: jest.fn(),
        setAuthToken: jest.fn(),
      };
      (HttpClient as jest.Mock).mockImplementation(() => mockHttpClient);

      const sdk = new DipCoinPerpSDK("YOUR_PRIVATE_KEY_HERE", {
        apiBaseUrl: "https://mock-api.dipcoin.io",
        network: "testnet",
        subAccountKey: "YOUR_SUB_ACCOUNT_KEY_HERE",
      });

      expect(sdk).toBeDefined();
      expect(sdk.subAccountAddress).toBeDefined();
    });
  });

  describe("getAccountInfo", () => {
    it("should call with parentAddress param", async () => {
      const { sdk, mockHttpClient } = createMockSDK();
      mockHttpClient.post.mockResolvedValueOnce({ code: 200, data: { token: "jwt" } });
      mockHttpClient.get.mockResolvedValueOnce({
        code: 200,
        data: {
          walletBalance: "1000",
          totalUnrealizedProfit: "50",
          accountValue: "1050",
          freeCollateral: "500",
          totalMargin: "500",
        },
      });

      const result = await sdk.getAccountInfo({ parentAddress: "0xvault" });
      expect(result.status).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        API_ENDPOINTS.GET_ACCOUNT_INFO,
        { params: { parentAddress: "0xvault" } }
      );
    });

    it("should call without params", async () => {
      const { sdk, mockHttpClient } = createMockSDK();
      mockHttpClient.post.mockResolvedValueOnce({ code: 200, data: { token: "jwt" } });
      mockHttpClient.get.mockResolvedValueOnce({
        code: 200,
        data: {
          walletBalance: "1000",
          totalUnrealizedProfit: "0",
          accountValue: "1000",
          freeCollateral: "1000",
          totalMargin: "0",
        },
      });

      const result = await sdk.getAccountInfo();
      expect(result.status).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        API_ENDPOINTS.GET_ACCOUNT_INFO,
        { params: {} }
      );
    });
  });

  describe("getPositions", () => {
    it("should accept string symbol (backward compatible)", async () => {
      const { sdk, mockHttpClient } = createMockSDK();
      mockHttpClient.post.mockResolvedValueOnce({ code: 200, data: { token: "jwt" } });
      mockHttpClient.get.mockResolvedValueOnce({ code: 200, data: [] });

      const result = await sdk.getPositions("BTC-PERP");
      expect(result.status).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        API_ENDPOINTS.GET_POSITIONS,
        { params: { symbol: "BTC-PERP" } }
      );
    });

    it("should accept PositionsParams with parentAddress", async () => {
      const { sdk, mockHttpClient } = createMockSDK();
      mockHttpClient.post.mockResolvedValueOnce({ code: 200, data: { token: "jwt" } });
      mockHttpClient.get.mockResolvedValueOnce({ code: 200, data: [] });

      const result = await sdk.getPositions({ symbol: "BTC-PERP", parentAddress: "0xvault" });
      expect(result.status).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        API_ENDPOINTS.GET_POSITIONS,
        { params: { symbol: "BTC-PERP", parentAddress: "0xvault" } }
      );
    });
  });

  describe("getOpenOrders", () => {
    it("should accept string symbol (backward compatible)", async () => {
      const { sdk, mockHttpClient } = createMockSDK();
      mockHttpClient.post.mockResolvedValueOnce({ code: 200, data: { token: "jwt" } });
      mockHttpClient.get.mockResolvedValueOnce({ code: 200, data: [] });

      const result = await sdk.getOpenOrders("BTC-PERP");
      expect(result.status).toBe(true);
    });

    it("should accept OpenOrdersParams with parentAddress", async () => {
      const { sdk, mockHttpClient } = createMockSDK();
      mockHttpClient.post.mockResolvedValueOnce({ code: 200, data: { token: "jwt" } });
      mockHttpClient.get.mockResolvedValueOnce({ code: 200, data: [] });

      const result = await sdk.getOpenOrders({
        symbol: "ETH-PERP",
        page: 1,
        pageSize: 20,
        parentAddress: "0xvault",
      });
      expect(result.status).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        API_ENDPOINTS.GET_OPEN_ORDERS,
        { params: { symbol: "ETH-PERP", page: 1, pageSize: 20, parentAddress: "0xvault" } }
      );
    });
  });

  describe("getHistoryOrders", () => {
    it("should fetch history orders", async () => {
      const { sdk, mockHttpClient } = createMockSDK();
      mockHttpClient.post.mockResolvedValueOnce({ code: 200, data: { token: "jwt" } });
      mockHttpClient.get.mockResolvedValueOnce({
        code: 200,
        data: { data: [{ hash: "0x1", symbol: "BTC-PERP" }], total: 1 },
      });

      const result = await sdk.getHistoryOrders({ symbol: "BTC-PERP", page: 1, pageSize: 10 });
      expect(result.status).toBe(true);
      expect(result.data?.data).toHaveLength(1);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        API_ENDPOINTS.HISTORY_ORDERS,
        { params: { symbol: "BTC-PERP", page: 1, pageSize: 10 } }
      );
    });

    it("should support parentAddress", async () => {
      const { sdk, mockHttpClient } = createMockSDK();
      mockHttpClient.post.mockResolvedValueOnce({ code: 200, data: { token: "jwt" } });
      mockHttpClient.get.mockResolvedValueOnce({ code: 200, data: { data: [], total: 0 } });

      await sdk.getHistoryOrders({ parentAddress: "0xvault" });
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        API_ENDPOINTS.HISTORY_ORDERS,
        { params: { parentAddress: "0xvault" } }
      );
    });
  });

  describe("getFundingSettlements", () => {
    it("should fetch funding settlements", async () => {
      const { sdk, mockHttpClient } = createMockSDK();
      mockHttpClient.post.mockResolvedValueOnce({ code: 200, data: { token: "jwt" } });
      mockHttpClient.get.mockResolvedValueOnce({
        code: 200,
        data: { data: [{ symbol: "BTC-PERP", fundingRate: "0.001" }], total: 1 },
      });

      const result = await sdk.getFundingSettlements({ symbol: "BTC-PERP" });
      expect(result.status).toBe(true);
      expect(result.data?.data).toHaveLength(1);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        API_ENDPOINTS.FUNDING_SETTLEMENTS,
        { params: { symbol: "BTC-PERP" } }
      );
    });
  });

  describe("getBalanceChanges", () => {
    it("should fetch balance changes", async () => {
      const { sdk, mockHttpClient } = createMockSDK();
      mockHttpClient.post.mockResolvedValueOnce({ code: 200, data: { token: "jwt" } });
      mockHttpClient.get.mockResolvedValueOnce({
        code: 200,
        data: { data: [{ type: "deposit", amount: "100" }], total: 1 },
      });

      const result = await sdk.getBalanceChanges({ page: 1, pageSize: 20 });
      expect(result.status).toBe(true);
      expect(result.data?.data).toHaveLength(1);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        API_ENDPOINTS.BALANCE_CHANGES,
        { params: { page: 1, pageSize: 20 } }
      );
    });
  });

  describe("getOraclePrice", () => {
    it("should fetch oracle price", async () => {
      const { sdk, mockHttpClient } = createMockSDK();
      mockHttpClient.post.mockResolvedValueOnce({ code: 200, data: { token: "jwt" } });
      mockHttpClient.get.mockResolvedValueOnce({ code: 200, data: "50000000000" });

      const result = await sdk.getOraclePrice("BTC-PERP");
      expect(result.status).toBe(true);
      expect(result.data).toBe("50000000000");
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        API_ENDPOINTS.ORACLE,
        { params: { symbol: "BTC-PERP" } }
      );
    });

    it("should return error for empty symbol", async () => {
      const { sdk } = createMockSDK();
      const result = await sdk.getOraclePrice("");
      expect(result.status).toBe(false);
      expect(result.error).toBe("Symbol is required");
    });
  });

  describe("clearAuth", () => {
    it("should clear both main and sub auth tokens", () => {
      const { sdk, mockHttpClient } = createMockSDK();
      sdk.clearAuth();
      expect(mockHttpClient.setAuthToken).toHaveBeenCalledWith("");
    });
  });

  describe("API_ENDPOINTS", () => {
    it("should have all new endpoints", () => {
      expect(API_ENDPOINTS.HISTORY_ORDERS).toBe("/api/perp-trade-api/history/orders");
      expect(API_ENDPOINTS.FUNDING_SETTLEMENTS).toBe("/api/perp-trade-api/history/funding-settlements");
      expect(API_ENDPOINTS.BALANCE_CHANGES).toBe("/api/perp-trade-api/history/balance-changes");
      expect(API_ENDPOINTS.ORACLE).toBe("/api/perp-market-api/oracle");
    });
  });
});
