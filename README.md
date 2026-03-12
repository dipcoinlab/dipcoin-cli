# DipCoin Perpetual Trading SDK & CLI

TypeScript SDK and CLI for perpetual futures trading on the Sui blockchain.

## AI Agent Integration

Send the following skill link to your AI Agent, and it will guide you through the rest — including installation, configuration, and trading:

```
https://raw.githubusercontent.com/dipcoinlab/dipcoin-cli/main/SKILL.md
```

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

Create a config file at `~/.config/dipcoin/env` (recommended) or `.env` in your working directory:

```bash
mkdir -p ~/.config/dipcoin
cat > ~/.config/dipcoin/env << 'EOF'
DIPCOIN_PRIVATE_KEY=suiprivkey1...
DIPCOIN_NETWORK=mainnet
EOF
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DIPCOIN_PRIVATE_KEY` | One of these | Sui private key (`suiprivkey1...`), supports ED25519/Secp256k1/Secp256r1 |
| `DIPCOIN_MNEMONIC` | is required | 12-word Sui mnemonic phrase (derives keypair at `m/44'/784'/0'/0'/0'`) |
| `DIPCOIN_NETWORK` | No | `mainnet` or `testnet` (default: `mainnet`) |

If both `DIPCOIN_PRIVATE_KEY` and `DIPCOIN_MNEMONIC` are set, the private key takes precedence.

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
dipcoin-cli trade buy BTC 0 10x --qty 0.01

# Reduce-only (for closing)
dipcoin-cli trade sell BTC 0 10x --qty 0.01 --reduce-only

# List open orders
dipcoin-cli trade orders
dipcoin-cli trade orders --symbol BTC-PERP

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
| `--vault <address>` | Vault/creator address (for trading vault positions) |

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

### trade orders

```bash
dipcoin-cli trade orders                          # List all open orders
dipcoin-cli trade orders --symbol BTC-PERP        # Filter by symbol
dipcoin-cli trade orders --vault <address>        # Filter by vault
```

### vault

On-chain vault operations (DipCoin vault contracts):

```bash
dipcoin-cli vault create --name <name> --trader <address> --max-cap <usdc> \
  --min-deposit <usdc> --creator-share <pct> --profit-share <pct> --initial <usdc>

dipcoin-cli vault list                      # List vaults created by wallet
dipcoin-cli vault list-all                  # List all public vaults (page 1, 10 per page)
dipcoin-cli vault list-all --page 2 --page-size 20
dipcoin-cli vault list-all --filter Leading # Filter: All, Leading, Newest, HotDeposit
dipcoin-cli vault info <vaultId>            # Vault details
dipcoin-cli vault position <vaultId>       # Your shares & estimated value
dipcoin-cli vault position <vaultId> --address <addr>  # Query another address
dipcoin-cli vault deposit <vaultId> <amount>
dipcoin-cli vault withdraw <vaultId> <shares>
dipcoin-cli vault withdraw <vaultId> --all # Withdraw all shares
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

### referral

Referral operations:

```bash
dipcoin-cli referral bind <code>               # Bind a referral code
dipcoin-cli referral link                      # Get your referral link and invite code
dipcoin-cli referral change-code <code>        # Change your referral code
dipcoin-cli referral invitees                  # List your invitees
dipcoin-cli referral invitees --page 2 --page-size 20
```

### history

```bash
dipcoin-cli history orders [--symbol <s>] [--page <n>] [--size <n>]
dipcoin-cli history funding [--symbol <s>] [--page <n>] [--size <n>]
dipcoin-cli history balance [--page <n>] [--size <n>]
```

All history commands support `--vault <address>` and `--begin-time <ms>`.

## Development

```bash
npm run cli              # Run CLI in dev mode (tsx)
npm run build            # Build for distribution
npm run lint             # Run ESLint
```

## License

Apache License 2.0
