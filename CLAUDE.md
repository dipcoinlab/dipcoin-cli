# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DipCoin Perpetual Trading CLI (`dipcoin-cli`) — a TypeScript CLI and SDK for perpetual futures trading on the Sui blockchain. It interacts with DipCoin's on-chain smart contracts (Move) and off-chain REST API for order placement, position management, and account operations.

The codebase has three layers:
1. **CLI** (`cli/`) — Commander.js commands for user interaction
2. **SDK** (`src/`) — TypeScript SDK wrapping REST API and on-chain operations
3. **DEX Contracts** (`dipcoin-perpetual/`) — Move smart contracts deployed on Sui

## Commands

```bash
# Run CLI in development (uses tsx)
npm run cli -- <command> [options]

# Build (rollup bundles cli/index.ts -> dist/cli.cjs as a single CJS executable)
npm run build

# Lint
npm run lint
```

There are no tests configured — jest and test files have been removed.

## Architecture

### Three-layer design: CLI (`cli/`) + SDK (`src/`) + DEX Contracts (`dipcoin-perpetual/`)

```
┌─────────────────────────────────────────────────────────┐
│                 CLI Layer (Commander.js)                 │
│  trade | position | vault | account | market | ...      │
└─────────────────────┬───────────────────────────────────┘
                      │ (uses singleton via sdk-factory.ts)
┌─────────────────────▼───────────────────────────────────┐
│                SDK Layer (DipCoinPerpSDK)                │
│  Authentication, Order management, Position tracking,   │
│  Market data, Vault operations                          │
└─────────────────────┬───────────────────────────────────┘
                      │
           ┌──────────┴──────────┐
           │                     │
   ┌───────▼────────┐   ┌───────▼──────────────┐
   │  HttpClient    │   │  Transaction Builder │
   │  (curl-based)  │   │  (Sui Transactions)  │
   └───────┬────────┘   └───────┬──────────────┘
           │                     │
   ┌───────▼────────┐   ┌───────▼──────────────────────┐
   │  REST API      │   │  Sui Blockchain              │
   │  (off-chain)   │   │  DEX Contracts (Move)        │
   └────────────────┘   │  dipcoin-perpetual/contracts │
                        └──────────────────────────────┘
```

### CLI Layer (`cli/`)

Commander.js commands that consume the SDK. Each file in `cli/commands/` registers a command group:

| Command File | Purpose |
|-------------|---------|
| `trade.ts` | Buy/sell orders (MARKET/LIMIT), leverage |
| `position.ts` | Open positions, P&L tracking |
| `market.ts` | Ticker, order book, trading pairs |
| `orders.ts` | Open orders, order history |
| `account.ts` | Account info, margin, settings |
| `balance.ts` | Balance queries |
| `history.ts` | Trading/funding/settlement history |
| `vault.ts` | On-chain vaults: create, deposit, withdraw |
| `point.ts` | Referral/points system |

### SDK Layer (`src/`)

**`DipCoinPerpSDK`** (`src/sdk/sdk.ts`) is the core class. It handles:
- JWT authentication via signed onboarding message (cached in `~/.config/dipcoin/jwt/`)
- REST API calls through `HttpClient` (uses system `curl` via child_process to bypass Cloudflare TLS fingerprinting — do NOT replace with axios/fetch)
- On-chain transaction building and execution via `@mysten/sui` and `@pythnetwork/pyth-sui-js`
- Order signing with the order-signer module

Key SDK modules:

| Module | Purpose |
|--------|---------|
| `src/onchain/transaction-builder.ts` | Builds Sui `Transaction` objects for deposit, withdraw, margin adjustment |
| `src/onchain/exchange.ts` | Executes built transactions against the Sui RPC |
| `src/onchain/order-signer.ts` | Constructs order message bytes for off-chain signature verification |
| `src/services/httpClient.ts` | HTTP client that spawns `curl` subprocesses. Adds `X-Wallet-Address` and `Authorization: Bearer` headers |
| `src/config/deployed/` | JSON deployment configs per network with package IDs, object IDs, per-market Perpetual/PriceInfoObject IDs |
| `src/utils/jwt-cache.ts` | Persists JWT tokens to `~/.config/dipcoin/jwt/<address>.json` |
| `src/types/index.ts` | TypeScript interfaces (OrderSide, OrderType, PlaceOrderParams, etc.) |
| `src/constants/index.ts` | API endpoints, decimals, Pyth config |

### DEX Smart Contracts (`dipcoin-perpetual/`)

Move smart contracts deployed on Sui blockchain. This is the on-chain DEX engine.

#### Contract Modules (`dipcoin-perpetual/contracts/sources/`)

| Module | Purpose |
|--------|---------|
| `perpetual.move` | Core perpetual market management (create markets, positions, funding rates, insurance fund) |
| `exchange.move` | Order execution, liquidation, ADL (Auto-Deleveraging), settlement |
| `vault.move` | Market-making vault system (creator deposits, user deposits, profit sharing) |
| `bank.move` | USDC balance tracking, deposits/withdrawals |
| `order.move` | Order structure and status tracking |
| `position.move` | Position data and calculations |
| `funding_rate.move` | Funding rate mechanism (keeps perp price anchored to spot) |
| `insurance_fund.move` | Two-tier insurance (active pool + security pool) |
| `protocol.move` | Protocol configuration and access control |
| `roles.move` | Role-based access control (ExchangeAdminCap, ExchangeManagerCap, FundingRateCap, etc.) |
| `settlement.move` | Funding settlement calculations |
| `sub_accounts.move` | Sub-account management for trading delegation |
| `trades/isolated_trading.move` | Isolated margin trading logic |
| `trades/isolated_liquidation.move` | Liquidation mechanics |
| `trades/isolated_adl.move` | Auto-deleveraging for systemic risk |
| `library.move` | Math utilities, helpers |
| `math/signed_int128.move` | Signed integer math |

#### Deployment & Scripts (`dipcoin-perpetual/scripts/`)

| Script | Purpose |
|--------|---------|
| `deploy/package.ts` | Deploy Move package to Sui |
| `deploy/full.ts` | Full deployment (package + markets + oracle) |
| `deploy/market.ts` | Add new trading market |
| `deploy/pythOracle.ts` | Setup Pyth price oracle |
| `build.ts` | Build Move contracts |
| `upgrade.ts` | Upgrade package |
| `migrate.ts` | Run migrations |
| `fundingOperator.ts` | Funding rate operator |
| `settlementOperator.ts` | Settlement operator |

#### Key On-Chain Features

- Perpetual markets with configurable margin requirements (IMR, MMR)
- Funding rates to keep perp prices anchored to spot
- Insurance fund with daily operational reserve
- Vault system for market maker capital pooling
- Pyth Network price oracle integration (60-sec staleness check)
- Sub-accounts for delegated trading
- Liquidation and ADL mechanisms

### SDK Factory (`cli/utils/sdk-factory.ts`)

The CLI resolves a Sui keypair from environment configuration:
- `DIPCOIN_PRIVATE_KEY` — Sui private key (`suiprivkey1...`), supports ED25519/Secp256k1/Secp256r1 (takes precedence)
- `DIPCOIN_MNEMONIC` — 12-word mnemonic, derives keypair at `m/44'/784'/0'/0'/0'`

The SDK instance is cached as a singleton. All commands use `getSDK()` with no arguments.

### Wei Convention

Prices, quantities, and most numeric values from the API and deployment config use 18-decimal "wei" format (value × 10^18). The SDK converts between human-readable and wei using `formatNormalToWei()` / `formatNormalToWeiBN()`. USDC uses 6 decimals on-chain. Vault values use 9 decimals on-chain.

### API Endpoints

- **Mainnet**: `https://gray-api.dipcoin.io`
- **Testnet**: `https://demoapi.dipcoin.io/exchange`

Key API paths:
- `/api/authorize` — JWT authentication
- `/api/perp-trade-api/trade/placeorder` — Place orders
- `/api/perp-trade-api/curr-info/positions` — Get positions
- `/api/perp-market-api/list` — Trading pairs
- `/api/perp-vault-api/public/vaults` — Vault operations
- `/api/dipcoin-point/` — Referral/points system

### Environment Variables

Env loaded from `~/.config/dipcoin/env` or `.env` in cwd:
- `DIPCOIN_PRIVATE_KEY` — Sui private key (recommended)
- `DIPCOIN_MNEMONIC` — 12-word Sui mnemonic (alternative)
- `DIPCOIN_NETWORK` — `mainnet` or `testnet` (default: mainnet)

## Code Style

- Prettier: double quotes, semicolons, trailing commas (es5), 100 char width, 2-space indent
- ESLint with `@typescript-eslint` + prettier plugin
- Symbol normalization: bare symbols like "BTC" auto-append "-PERP" suffix via `normalizeSymbol()`
- All CLI output supports `--json` flag for machine-readable JSON output
