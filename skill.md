# DipCoin Perpetual Trading CLI

## Skill Overview

This skill provides access to the DipCoin perpetual contract trading platform on the Sui blockchain. You can execute trades (market/limit orders), manage positions, deposit/withdraw funds, and query market data through a CLI tool.

## Installation

```bash
npm install -g dipcoin-cli
```

Verify installation:

```bash
dipcoin-cli --help
```

You should see the help output listing available commands. If you see errors, ensure Node.js >= 18 is installed.

## Configuration

The CLI reads configuration from a `.env` file in the current working directory, or from `~/.config/dipcoin/env`.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MNEMONIC` | **Yes** | 12-word mnemonic phrase for HD key derivation. Index 0 = main account, index 1+ = sub-accounts |
| `NETWORK` | **Yes** | `mainnet` or `testnet` (default: `testnet`) |
| `DEFAULT_VAULT_INDEX` | No | Default vault index for HD-derived sub-accounts |

### Setup Steps

**IMPORTANT: Never ask the user for their mnemonic. Never accept, log, or handle secrets in the conversation. The user must configure the `.env` file themselves.**

1. Tell the user to create a `.env` file in their working directory and fill in:
   - `MNEMONIC` - their 12-word mnemonic phrase
   - `NETWORK` - set to `mainnet` or `testnet`
   - (Optional) `DEFAULT_VAULT_INDEX` for multi-vault workflows

2. After the user confirms they have configured the `.env` file, verify it works:

```bash
dipcoin-cli account info --json
```

If successful, you will see the account's wallet balance, account value, and margin info in JSON. If it fails with an auth error, ask the user to double-check their `.env` configuration.

## Usage

**IMPORTANT:** Always append `--json` to get machine-readable JSON output for parsing.

Base command pattern:

```bash
dipcoin-cli [--vault-index <n>] <command> [subcommand] [args] [options] --json
```

`--vault-index` is a **global option** and must be placed **before** the subcommand.

---

### Market Data (no authentication required)

```bash
# List all available trading pairs
dipcoin-cli market pairs --json

# Get ticker info (lastPrice, markPrice, 24h change, volume, funding rate)
dipcoin-cli market ticker <symbol> --json

# Get order book
dipcoin-cli market orderbook <symbol> --json

# Get oracle price
dipcoin-cli market oracle <symbol> --json
```

Symbols auto-normalize: `BTC` becomes `BTC-PERP`.

### Account

```bash
# View account info (wallet balance, account value, free collateral, margin, unrealized PnL)
dipcoin-cli account info --json

# View account info for a vault (by address or vault-index)
dipcoin-cli account info --vault <address> --json
dipcoin-cli --vault-index 1 account info --json

# View on-chain wallet coin balances (main or sub-account)
dipcoin-cli balance --json
dipcoin-cli --vault-index 1 balance --json

# Deposit USDC to exchange (main account or sub-account)
dipcoin-cli account deposit <amount> --json
dipcoin-cli --vault-index 1 account deposit <amount> --json

# Withdraw USDC from exchange (main account or sub-account)
dipcoin-cli account withdraw <amount> --json
dipcoin-cli --vault-index 1 account withdraw <amount> --json
```

### Trading

```bash
# Place a BUY market order with USDC margin (default mode)
dipcoin-cli trade buy BTC 100USDC 10x --json
dipcoin-cli trade buy BTC-PERP 100 10 --json    # same ("USDC" and "x" suffixes are optional)

# Place a SELL market order
dipcoin-cli trade sell ETH 50USDC 5x --json

# Place a LIMIT order (--price auto-enables limit type, no --type flag needed)
dipcoin-cli trade buy BTC 100USDC 10x --price 95000 --json

# Place order with take profit and/or stop loss
dipcoin-cli trade buy BTC 100USDC 10x --tp 105000 --sl 90000 --json

# Specify order quantity instead of USDC margin
dipcoin-cli trade buy BTC 100USDC 10x --qty 0.01 --json

# Reduce-only order (for closing positions)
dipcoin-cli trade sell BTC 0 10x --qty 0.01 --reduce-only --json

# Cancel orders by hash
dipcoin-cli trade cancel <symbol> <hash1> [hash2...] --json
```

#### Trade Arguments

| Argument | Description | Example |
|----------|-------------|---------|
| `<symbol>` | Trading pair (`BTC` or `BTC-PERP`) | `BTC` |
| `<amount>` | USDC margin amount | `100USDC` or `100` |
| `<leverage>` | Leverage multiplier | `10x` or `10` |

#### Trade Options

| Option | Description | Default |
|--------|-------------|---------|
| `--qty <quantity>` | Specify order quantity instead of USDC margin | - |
| `--price <p>` | Limit order price (auto-enables limit order type) | - |
| `--reduce-only` | Reduce-only order flag | false |
| `--tp <price>` | Take profit trigger price | - |
| `--sl <price>` | Stop loss trigger price | - |
| `--vault <address>` | Vault/creator address | - |

**Note:** By default, `<amount>` is USDC margin. Use `--qty` to specify quantity directly (amount argument is ignored when `--qty` is set). Order type is auto-detected: market by default, limit when `--price` is provided.

### Positions

```bash
# List all open positions
dipcoin-cli position list --json

# List positions for a specific symbol
dipcoin-cli position list --symbol <symbol> --json

# List positions for a vault
dipcoin-cli position list --vault <address> --json

# Set TP/SL on an existing position
dipcoin-cli position tpsl <symbol> --side <buy|sell> --quantity <q> --leverage <n> --tp-trigger <price> --json
dipcoin-cli position tpsl <symbol> --side <buy|sell> --quantity <q> --leverage <n> --sl-trigger <price> --json
dipcoin-cli position tpsl <symbol> --side <buy|sell> --quantity <q> --leverage <n> --tp-trigger <tp_price> --sl-trigger <sl_price> --json

# TP/SL with limit order type
dipcoin-cli position tpsl <symbol> --side <buy|sell> --quantity <q> --leverage <n> --tp-trigger <price> --tp-type limit --tp-price <limit_price> --json

# Add margin to a position (on-chain tx)
dipcoin-cli position margin add <symbol> <amount_usdc> --json

# Remove margin from a position (on-chain tx)
dipcoin-cli position margin remove <symbol> <amount_usdc> --json
```

**TP/SL side note:** The `--side` is the closing side. For a LONG position, the closing side is `sell`. For a SHORT position, the closing side is `buy`.

### Open Orders

```bash
# List all open orders
dipcoin-cli orders --json

# Filter by symbol
dipcoin-cli orders --symbol <symbol> --json

# Filter by vault
dipcoin-cli orders --vault <address> --json
```

### Sub-Account (HD Derivation)

HD-derived sub-account management. These are local key derivation + on-chain registration commands.

```bash
# List HD-derived sub-account addresses (requires MNEMONIC)
dipcoin-cli sub-account list --json
dipcoin-cli sub-account list --count 10 --json

# Derive sub-account at index and register on-chain
dipcoin-cli sub-account setup <index> --json

# Set sub-account manually (on-chain tx)
dipcoin-cli sub-account set <subAddress> --json
```

### Vault (On-Chain Vault Contracts)

On-chain vault operations for DipCoin vault contracts. These are separate from HD sub-accounts.

```bash
# Create a new vault
dipcoin-cli vault create --name <name> --trader <address> --max-cap <usdc> \
  --min-deposit <usdc> --creator-share <pct> --profit-share <pct> --initial <usdc> --json

# List vaults created by current wallet
dipcoin-cli vault list --json

# Show vault details (positional argument, not --address)
dipcoin-cli vault info <vaultId> --json

# Deposit/withdraw from vault
dipcoin-cli vault deposit <vaultId> <amount> --json
dipcoin-cli vault withdraw <vaultId> <shares> --json

# Fill pending withdrawal requests
dipcoin-cli vault fill <vaultId> <requestIDs...> [--markets <ids>] --json

# Close/remove/claim vault
dipcoin-cli vault close <vaultId> [--markets <ids>] --json
dipcoin-cli vault remove <vaultId> --json
dipcoin-cli vault claim <vaultId> --json

# Vault management
dipcoin-cli vault set-trader <vaultId> <address> --json
dipcoin-cli vault set-sub-trader <vaultId> <address> [--disable] --json
dipcoin-cli vault set-deposit-status <vaultId> [--disable] --json
dipcoin-cli vault set-max-cap <vaultId> <amount> --json
dipcoin-cli vault set-min-deposit <vaultId> <amount> --json
dipcoin-cli vault set-auto-close <vaultId> [--disable] --json
```

### History

```bash
# Query historical orders
dipcoin-cli history orders --json
dipcoin-cli history orders --symbol <symbol> --page <n> --size <n> --json

# Query funding settlements
dipcoin-cli history funding --json
dipcoin-cli history funding --symbol <symbol> --json

# Query balance changes
dipcoin-cli history balance --json
dipcoin-cli history balance --page <n> --size <n> --json

# All history commands support --vault <address> for vault queries
```

## Multi-Vault Workflow (HD Derivation)

With `MNEMONIC` set, use `--vault-index` to operate on different sub-accounts:

1. **List derived addresses:** `dipcoin-cli sub-account list`
2. **Register sub-account on-chain:** `dipcoin-cli sub-account setup 1`
3. **Deposit to sub-account 1:** `dipcoin-cli --vault-index 1 account deposit 100`
4. **Trade on sub-account 1:** `dipcoin-cli --vault-index 1 trade buy BTC 50USDC 10x`
5. **Check sub-account 1 info:** `dipcoin-cli --vault-index 1 account info`
6. **Check sub-account 1 balance:** `dipcoin-cli --vault-index 1 balance`
7. **Check sub-account 1 positions:** `dipcoin-cli --vault-index 1 position list`

`--vault-index` is a **global option** placed **before** the subcommand. Index 0 = main account, 1+ = sub-accounts.

## Typical Trading Workflow

1. **Check available pairs:** `dipcoin-cli market pairs --json`
2. **Get current price:** `dipcoin-cli market ticker BTC --json`
3. **Check account balance:** `dipcoin-cli account info --json`
4. **Open a position:** `dipcoin-cli trade buy BTC 100USDC 10x --tp 105000 --sl 90000 --json`
5. **Monitor position:** `dipcoin-cli position list --json`
6. **Monitor orders:** `dipcoin-cli orders --json`
7. **Close position:** `dipcoin-cli trade sell BTC 0 10x --qty <quantity> --reduce-only --json`
8. **Review history:** `dipcoin-cli history orders --symbol BTC-PERP --json`

## Important Notes

- All price/quantity values returned by the API are in **wei (18 decimals)**. Divide by `1e18` to get human-readable values. When using `--json`, the output is raw wei.
- USDC margin mode auto-converts the margin amount to quantity based on current market price and leverage.
- On-chain operations (deposit, withdraw, margin add/remove, sub-account set/setup, vault operations) require Sui chain interaction and may take a few seconds.
- Authentication is handled automatically using `MNEMONIC` in `.env`.
- Order hashes returned from trade commands can be used with `trade cancel`.
- `--vault-index <n>` (global option, before subcommand) selects HD-derived sub-account. `--vault <address>` (per-command option) is a fallback for explicit address.
- Available trading pair symbols include: `BTC-PERP`, `ETH-PERP`, `SUI-PERP`, etc. Use `market pairs` to get the full list.
- **SECURITY:** Never log or expose the user's `MNEMONIC`. Treat it as a secret at all times.
