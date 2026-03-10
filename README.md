# DipCoin Perpetual Trading SDK & CLI

TypeScript SDK and CLI for perpetual futures trading on the Sui blockchain.

## Installation

**CLI (global):**

```bash
npm install -g dipcoin-cli
```

**SDK (as dependency):**

```bash
npm install dipcoin-cli
```

## CLI Quick Start

### Configuration

Create a `.env` file in your working directory (or at `~/.config/dipcoin/env` for global config):

```bash
MNEMONIC=word1 word2 word3 ... word12
NETWORK=testnet    # or mainnet
```

Index 0 of the HD derivation path is the main account. Use `--vault-index` for sub-accounts.

### Basic Workflow

```bash
# Check available pairs
dipcoin-cli market pairs

# Get current price
dipcoin-cli market ticker BTC

# Check account balance
dipcoin-cli account info

# Open a long position: buy BTC with 100 USDC at 10x leverage
dipcoin-cli trade buy BTC 100USDC 10x --tp 105000 --sl 90000

# Monitor position
dipcoin-cli position list

# Close position (reduce-only sell)
dipcoin-cli trade sell BTC 0 10x --qty 0.01 --reduce-only

# Review history
dipcoin-cli history orders --symbol BTC-PERP
```

## CLI Commands

### Global Options

| Option | Description |
|--------|-------------|
| `--json` | Output in JSON format (machine-readable) |
| `--vault-index <n>` | Use HD-derived sub-account at index N (placed before subcommand) |
| `-V, --version` | Show version |

### market

```bash
dipcoin-cli market pairs                    # List all trading pairs
dipcoin-cli market ticker <symbol>          # Ticker (price, volume, funding)
dipcoin-cli market orderbook <symbol>       # Order book
dipcoin-cli market oracle <symbol>          # Oracle price
```

Symbols auto-normalize: `BTC` becomes `BTC-PERP`.

### account

```bash
dipcoin-cli account info                    # Balance, margin, PnL
dipcoin-cli account info --vault <address>  # Info for specific vault address
dipcoin-cli account deposit <amount>        # Deposit USDC to exchange
dipcoin-cli account withdraw <amount>       # Withdraw USDC from exchange
```

### balance

```bash
dipcoin-cli balance                         # On-chain coin balances
```

### trade

```bash
# Buy/Sell with USDC margin amount (auto-converts to quantity)
dipcoin-cli trade buy <symbol> <amount> <leverage>
dipcoin-cli trade sell <symbol> <amount> <leverage>

# Limit order (auto-detected from --price)
dipcoin-cli trade buy BTC 100USDC 10x --price 95000

# With TP/SL
dipcoin-cli trade buy BTC 100USDC 10x --tp 105000 --sl 90000

# Explicit quantity instead of USDC margin
dipcoin-cli trade buy BTC 100USDC 10x --qty 0.01

# Reduce-only (for closing)
dipcoin-cli trade sell BTC 0 10x --qty 0.01 --reduce-only

# Cancel orders
dipcoin-cli trade cancel <symbol> <hash1> [hash2...]
```

**Trade Options:**

| Option | Description |
|--------|-------------|
| `--qty <quantity>` | Specify order quantity directly (amount arg ignored) |
| `--price <p>` | Limit order price (auto-enables limit order type) |
| `--reduce-only` | Reduce-only order |
| `--tp <price>` | Take profit trigger price |
| `--sl <price>` | Stop loss trigger price |
| `--vault <address>` | Vault/creator address (fallback) |

### position

```bash
dipcoin-cli position list                   # List open positions
dipcoin-cli position list --symbol BTC-PERP # Filter by symbol

# Set TP/SL on existing position
dipcoin-cli position tpsl <symbol> --side <buy|sell> --quantity <q> --leverage <n> \
  --tp-trigger <price> --sl-trigger <price>

# TP/SL with limit type
dipcoin-cli position tpsl <symbol> --side sell --quantity 0.01 --leverage 10 \
  --tp-trigger 105000 --tp-type limit --tp-price 105000

# Margin operations (on-chain)
dipcoin-cli position margin add <symbol> <amount>
dipcoin-cli position margin remove <symbol> <amount>
```

The `--side` is the **closing side**: use `sell` for long positions, `buy` for short.

### orders

```bash
dipcoin-cli orders                          # List all open orders
dipcoin-cli orders --symbol BTC-PERP        # Filter by symbol
dipcoin-cli orders --vault <address>        # Filter by vault
```

### vault

On-chain vault operations (DipCoin vault contracts):

```bash
dipcoin-cli vault create --name <name> --trader <address> --max-cap <usdc> \
  --min-deposit <usdc> --creator-share <pct> --profit-share <pct> --initial <usdc>

dipcoin-cli vault list                      # List vaults created by wallet
dipcoin-cli vault info <vaultId>            # Vault details
dipcoin-cli vault deposit <vaultId> <amount>
dipcoin-cli vault withdraw <vaultId> <shares>
dipcoin-cli vault fill <vaultId> <requestIDs...> [--markets <ids>]
dipcoin-cli vault close <vaultId> [--markets <ids>]
dipcoin-cli vault remove <vaultId>
dipcoin-cli vault claim <vaultId>
dipcoin-cli vault set-trader <vaultId> <address>
dipcoin-cli vault set-sub-trader <vaultId> <address> [--disable]
dipcoin-cli vault set-deposit-status <vaultId> [--disable]
dipcoin-cli vault set-max-cap <vaultId> <amount>
dipcoin-cli vault set-min-deposit <vaultId> <amount>
dipcoin-cli vault set-auto-close <vaultId> [--disable]
```

### sub-account

HD-derived sub-account management:

```bash
dipcoin-cli sub-account list [--count <n>]  # List derived addresses (default 5)
dipcoin-cli sub-account setup <index>       # Derive and register sub-account on-chain
dipcoin-cli sub-account set <subAddress>    # Authorize a sub-account address
```

### history

```bash
dipcoin-cli history orders [--symbol <s>] [--page <n>] [--size <n>]
dipcoin-cli history funding [--symbol <s>] [--page <n>] [--size <n>]
dipcoin-cli history balance [--page <n>] [--size <n>]
```

All history commands support `--vault <address>` and `--begin-time <ms>`.

## Multi-Vault Workflow

The CLI uses HD key derivation from your mnemonic. Index 0 is the main account, index 1+ are sub-accounts.

```bash
# List derived addresses
dipcoin-cli sub-account list

# Register sub-account 1 on-chain
dipcoin-cli sub-account setup 1

# Deposit to sub-account 1
dipcoin-cli --vault-index 1 account deposit 100

# Trade on sub-account 1
dipcoin-cli --vault-index 1 trade buy BTC 50USDC 10x

# Check sub-account 1 positions
dipcoin-cli --vault-index 1 position list
```

`--vault-index` is always a **global option** placed before the subcommand.

## SDK Usage

### Initialize

```typescript
import { initDipCoinPerpSDK } from "dipcoin-cli";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const keypair = Ed25519Keypair.deriveKeypair("your mnemonic phrase ...");
const sdk = initDipCoinPerpSDK(keypair, { network: "mainnet" });

// With sub-account for vault trading
const subKeypair = Ed25519Keypair.deriveKeypair("your mnemonic", "m/44'/784'/1'/0'/0'");
const vaultSdk = initDipCoinPerpSDK(keypair, { network: "mainnet", subAccountKey: subKeypair });
```

### Authentication

```typescript
const authResult = await sdk.authenticate();
if (authResult.status) {
  console.log("Authenticated:", authResult.data);
}

// All API methods auto-authenticate when needed
```

### Account Info

```typescript
const info = await sdk.getAccountInfo();
if (info.status && info.data) {
  console.log("Balance:", info.data.walletBalance);
  console.log("Free Collateral:", info.data.freeCollateral);
}
```

### Deposit & Withdraw

```typescript
// On-chain transactions (USDC to/from exchange)
await sdk.depositToBank(100);    // 100 USDC
await sdk.withdrawFromBank(50);  // 50 USDC
```

### Place Order

```typescript
import { OrderSide, OrderType } from "dipcoin-cli";

// Market order
const result = await sdk.placeOrder({
  symbol: "BTC-PERP",
  side: OrderSide.BUY,
  orderType: OrderType.MARKET,
  quantity: "0.1",
  leverage: "10",
});

// Limit order
const limit = await sdk.placeOrder({
  symbol: "BTC-PERP",
  side: OrderSide.BUY,
  orderType: OrderType.LIMIT,
  quantity: "0.1",
  price: "95000",
  leverage: "10",
});

// With TP/SL
const withTpSl = await sdk.placeOrder({
  symbol: "BTC-PERP",
  side: OrderSide.BUY,
  orderType: OrderType.MARKET,
  quantity: "0.1",
  leverage: "10",
  tpTriggerPrice: "105000",
  slTriggerPrice: "90000",
});
```

### Position TP/SL

```typescript
await sdk.placePositionTpSlOrders({
  symbol: "BTC-PERP",
  market: "<perpetual-id>",
  side: OrderSide.SELL,
  isLong: true,
  leverage: "10",
  quantity: "0.1",
  tp: { triggerPrice: "105000", orderType: OrderType.MARKET, tpslType: "position" },
  sl: { triggerPrice: "90000", orderType: OrderType.MARKET, tpslType: "position" },
});
```

### Market Data

```typescript
const ticker = await sdk.getTicker("BTC-PERP");
const orderBook = await sdk.getOrderBook("BTC-PERP");
const oraclePrice = await sdk.getOraclePrice("BTC-PERP");
const pairs = await sdk.getTradingPairs();
```

### Cancel Order

```typescript
await sdk.cancelOrder({
  symbol: "BTC-PERP",
  orderHashes: ["0x1234..."],
});
```

### Positions & Open Orders

```typescript
const positions = await sdk.getPositions();
const orders = await sdk.getOpenOrders();
```

### Leverage & Margin

```typescript
await sdk.adjustLeverage({ symbol: "BTC-PERP", leverage: "10", marginType: "ISOLATED" });
await sdk.addMargin({ symbol: "BTC-PERP", amount: 5 });
await sdk.removeMargin({ symbol: "BTC-PERP", amount: 2 });
```

## Types

```typescript
enum OrderSide { BUY = "BUY", SELL = "SELL" }
enum OrderType { MARKET = "MARKET", LIMIT = "LIMIT" }

interface AccountInfo {
  walletBalance: string;
  totalUnrealizedProfit: string;
  accountValue: string;
  freeCollateral: string;
  totalMargin: string;
}

interface Position {
  symbol: string; side: string; quantity: string;
  avgEntryPrice: string; leverage: string; margin: string;
  unrealizedProfit: string; liquidationPrice: string;
}

interface OpenOrder {
  hash: string; symbol: string; side: string;
  orderType: string; price: string; quantity: string;
  filledQty: string; leverage: string; status: string;
}

interface SDKResponse<T> {
  status: boolean;
  data?: T;
  error?: string;
}
```

## Error Handling

All SDK methods return `SDKResponse<T>`. Check `status` before accessing `data`:

```typescript
const result = await sdk.placeOrder(/* ... */);
if (result.status) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

## Development

```bash
npm run cli              # Run CLI in dev mode (tsx)
npm run build            # Build for distribution
npm run example          # Run example script
```

## License

Apache License 2.0
