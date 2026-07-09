---
name: dipcoin-cli
description: Use when trading perpetual futures on DipCoin (Sui blockchain) via the `dipcoin-cli` tool — placing buy/sell orders (market/limit, with TP/SL), managing positions, depositing/withdrawing USDC, vault operations (create/deposit/withdraw), account/balance/history queries, and referral. Covers install, credential setup via `dipcoin-cli setup import` (existing key) or `dipcoin-cli setup generate` (new wallet), and full command reference.
---

# DipCoin Perpetual Trading CLI — Agent Skill Guide

This document teaches AI agents (e.g. OpenClaw) how to install, configure, and use the `dipcoin-cli` tool for perpetual futures trading on the Sui blockchain.

## Security

**CRITICAL: The private key (`DIPCOIN_PRIVATE_KEY`) and mnemonic (`DIPCOIN_MNEMONIC`) must NEVER be exposed under any circumstances.** Do not log, print, echo, display, or include them in any output, error message, debug info, or API call. Never send them to any external service, chat, or third party. Treat them as the most sensitive data — leaking a private key means permanent loss of all funds in the wallet.

## Installation

```bash
npm install -g dipcoin-cli
```

After installation, the `dipcoin-cli` command is available globally.

## Configuration

Credentials are stored in a single global config file at `~/.config/dipcoin/env`. The recommended way to create it is via the built-in `setup` commands — both write the file with `chmod 600` and never echo the private key.

### Option A — Import an existing key

For users who already have a Sui wallet:

```bash
dipcoin-cli setup import                  # mainnet (default)
dipcoin-cli setup import --network testnet
```

The command interactively prompts with **hidden input** (typed/pasted characters are not echoed). The user can paste **either** a private key (`suiprivkey1...`) **or** a BIP39 mnemonic (12/15/18/21/24 words from the English wordlist). The input is auto-detected and validated:

- Private keys are decoded via the Sui bech32 scheme.
- Mnemonics are validated against the BIP39 English wordlist **and** the checksum; invalid mnemonics are rejected.

The validated credential is written to `~/.config/dipcoin/env` as `DIPCOIN_PRIVATE_KEY` or `DIPCOIN_MNEMONIC` accordingly.

### Option B — Generate a new key

For users who do not yet have a wallet:

```bash
dipcoin-cli setup generate                  # mainnet (default)
dipcoin-cli setup generate --network testnet
```

A fresh Ed25519 keypair is created, saved to `~/.config/dipcoin/env`, and the public Sui address is printed. The user then transfers USDC (Sui network) to that address and deposits into the DEX with `dipcoin-cli account deposit <amount>`.

### Config file format

The file `~/.config/dipcoin/env` contains:

| Variable | Required | Description |
|----------|----------|-------------|
| `DIPCOIN_PRIVATE_KEY` | One of these | Sui private key (`suiprivkey1...`), supports ED25519/Secp256k1/Secp256r1 |
| `DIPCOIN_MNEMONIC` | is required | 12/15/18/21/24-word BIP39 mnemonic (derives ED25519 keypair at `m/44'/784'/0'/0'/0'`) |
| `DIPCOIN_NETWORK` | No | `mainnet` or `testnet` (default: `mainnet`) |

If both are set, `DIPCOIN_PRIVATE_KEY` takes precedence. Manual editing is supported but discouraged — prefer the `setup` commands so permissions and format stay correct.

### Isolated agent environments

When running multiple AI agents on the same machine, give each agent its own `HOME` so `~/.config/dipcoin/env` resolves to a separate wallet config. Reuse the same `HOME` for every command from that agent.

```bash
mkdir -p /tmp/dipcoin-agent-a /tmp/dipcoin-agent-b

HOME=/tmp/dipcoin-agent-a dipcoin-cli setup generate
HOME=/tmp/dipcoin-agent-b dipcoin-cli setup generate

HOME=/tmp/dipcoin-agent-a dipcoin-cli --json account info
HOME=/tmp/dipcoin-agent-b dipcoin-cli --json account info
```

For vault delegation, each isolated agent can trade with its own wallet while targeting the vault account:

```bash
HOME=/tmp/dipcoin-agent-a dipcoin-cli --json trade buy BTC 100USDC 10x --vault <vaultId>
```

Keep the working directory clean when using isolated agent homes. The CLI also loads a `.env` file from the current working directory if one exists, so run agent commands from a scratch directory without a project `.env`, or make sure that local `.env` does not contain `DIPCOIN_PRIVATE_KEY`, `DIPCOIN_MNEMONIC`, or `DIPCOIN_NETWORK` for another wallet.

## Global Options

These options apply to all commands and must be placed **before** the subcommand:

```bash
dipcoin-cli [global-options] <command> [command-options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output in JSON format (machine-readable, recommended for agents) |
| `-V, --version` | Show version |

**Important for agents:** Always use `--json` to get structured JSON output for parsing.

## Commands Reference

### Market Data (read-only, no auth needed)

```bash
# List all available trading pairs
dipcoin-cli --json market pairs

# Get ticker info (price, volume, funding rate)
dipcoin-cli --json market ticker BTC

# Get order book
dipcoin-cli --json market orderbook BTC

# Get oracle price
dipcoin-cli --json market oracle BTC

# Get kline (candlestick) history — default: 1h interval, last 24h
dipcoin-cli --json market kline BTC
dipcoin-cli --json market kline BTC --interval 5m --count 10
dipcoin-cli --json market kline BTC --interval 1d --from 1779000000 --to 1779800000
```

Symbols auto-normalize: `BTC` becomes `BTC-PERP`. You can use either form.

`market kline` supports intervals: `1m / 5m / 15m / 30m / 1h / 4h / 1d / 1w`. `--from` and `--to` are unix seconds (default: last 24h). `--count` caps the number of bars returned (most recent first).

### Account Information

```bash
# Show account info (balance, margin, PnL)
dipcoin-cli --json account info

# Show account info for a specific vault address
dipcoin-cli --json account info --vault <address>

# Show on-chain coin balances
dipcoin-cli --json balance
```

### Deposit & Withdraw (on-chain USDC operations)

```bash
# Deposit USDC to exchange (required before trading)
dipcoin-cli account deposit <amount>

# Withdraw USDC from exchange
dipcoin-cli account withdraw <amount>
```

### Trading

#### Open a position (USDC margin mode)

The default mode: specify USDC margin amount and leverage. The CLI auto-converts to quantity based on current market price.

```bash
# Buy BTC with 100 USDC margin at 10x leverage (market order)
dipcoin-cli trade buy BTC 100USDC 10x

# Sell ETH with 50 USDC margin at 5x leverage
dipcoin-cli trade sell ETH 50USDC 5x

# Limit order (auto-detected from --price)
dipcoin-cli trade buy BTC 100USDC 10x --price 95000

# With take-profit and stop-loss
dipcoin-cli trade buy BTC 100USDC 10x --tp 105000 --sl 90000
```

#### Open a position (explicit quantity mode)

```bash
# Buy 0.01 BTC at 10x leverage
dipcoin-cli trade buy BTC 0 10x --qty 0.01

# Sell 1 ETH at 5x leverage with limit price
dipcoin-cli trade sell ETH 0 5x --qty 1 --price 3500
```

Note: When using `--qty`, the `<amount>` argument is ignored (use 0 as placeholder).

#### Close a position

```bash
# Close 100% of a position — CLI figures out side & quantity for you
dipcoin-cli position close BTC

# Close half
dipcoin-cli position close BTC --percent 50

# Close every open position with one command
dipcoin-cli position close-all
dipcoin-cli position close-all --percent 50   # halve everything

# Manual form is still supported if you want exact quantity control
dipcoin-cli trade sell BTC 0 10x --qty 0.01 --reduce-only   # close long
dipcoin-cli trade buy ETH 0 5x --qty 1 --reduce-only        # close short
```

`position close` and `position close-all` accept `--vault <id>` to target a vault's positions instead of the personal account. Closes use reduce-only market orders.

#### Cancel orders

```bash
dipcoin-cli trade cancel <symbol> <hash1> [hash2...]
```

#### Adjust default leverage

```bash
# Set default (ISOLATED) leverage for a market — used by future orders that don't pass an explicit value
dipcoin-cli trade leverage BTC 10
dipcoin-cli trade leverage ETH 5
```

Off-chain REST update — only changes the user's preferred leverage, no on-chain tx. The DipCoin perp currently runs ISOLATED margin only; CROSS is not supported.

#### Trade options summary

| Option | Description |
|--------|-------------|
| `--qty <quantity>` | Specify order quantity directly (bypasses USDC conversion) |
| `--price <p>` | Limit order price (auto-enables LIMIT order type) |
| `--reduce-only` | Reduce-only order (for closing positions) |
| `--tp <price>` | Take profit trigger price |
| `--sl <price>` | Stop loss trigger price |
| `--vault <address>` | Vault/creator address (for trading vault positions) |

### Positions

```bash
# List all open positions
dipcoin-cli --json position list

# Filter by symbol
dipcoin-cli --json position list --symbol BTC-PERP

# Set TP/SL on existing position (closing side: sell for long, buy for short)
dipcoin-cli position tpsl BTC --side sell --quantity 0.01 --leverage 10 \
  --tp-trigger 105000 --sl-trigger 90000

# TP/SL with limit order type
dipcoin-cli position tpsl BTC --side sell --quantity 0.01 --leverage 10 \
  --tp-trigger 105000 --tp-type limit --tp-price 105000

# Add/remove margin on a position
dipcoin-cli position margin add BTC 5
dipcoin-cli position margin remove BTC 2

# Same, but target a position held by a vault (use the vault's object ID)
dipcoin-cli position margin add BTC 5 --vault <vaultId>
dipcoin-cli position margin remove BTC 2 --vault <vaultId>
```

> **On-chain note:** `position margin add/remove`, `vault deposit/close/withdraw/claim`, and `vault fill-withdrawals` all need a freshly-signed price feed. The SDK automatically fetches one from the public `/api/perp-market-api/price/latest` endpoint and prepends a `price_feed::update_price_feed` PTB step before the real call — no extra setup needed from the user.

### Open Orders

```bash
# List all open orders
dipcoin-cli --json trade orders

# Filter by symbol
dipcoin-cli --json trade orders --symbol BTC-PERP
```

### History

```bash
# Order history
dipcoin-cli --json history orders --symbol BTC-PERP --page 1 --size 20

# Funding settlements
dipcoin-cli --json history funding --symbol BTC-PERP

# Balance changes
dipcoin-cli --json history balance
```

All history commands support `--vault <address>` and `--begin-time <ms>` (epoch milliseconds).

### Vault Operations (on-chain fund management)

```bash
# Create a vault
dipcoin-cli vault create --name "My Vault" --trader <address> --max-cap 10000 \
  --min-deposit 100 --creator-share 10 --profit-share 20 --initial 1000

# List your vaults
dipcoin-cli --json vault list

# List all public vaults (with pagination and filter)
dipcoin-cli --json vault list-all                             # page 1, 10 per page
dipcoin-cli --json vault list-all --page 2 --page-size 20    # page 2, 20 per page
dipcoin-cli --json vault list-all --filter Leading            # Filter: All, Leading, Newest, HotDeposit

# Vault details
dipcoin-cli --json vault info <vaultId>

# Check your position in a vault (shares, estimated USDC value)
dipcoin-cli --json vault position <vaultId>
dipcoin-cli --json vault position <vaultId> --address <addr>  # query another address

# Deposit/withdraw from vault
dipcoin-cli vault deposit <vaultId> <amount>
dipcoin-cli vault withdraw <vaultId> <shares>
dipcoin-cli vault withdraw <vaultId> --all   # withdraw all shares

# Fill pending withdrawal requests (creator/operator only)
dipcoin-cli vault fill-withdrawals <vaultId> <requestID1> [requestID2...]

# Manage vault
dipcoin-cli vault set-trader <vaultId> <address>
dipcoin-cli vault set-deposit-status <vaultId>          # enable
dipcoin-cli vault set-deposit-status <vaultId> --disable # disable
dipcoin-cli vault set-max-cap <vaultId> <amount>
dipcoin-cli vault set-min-deposit <vaultId> <amount>
dipcoin-cli vault set-auto-close <vaultId>
dipcoin-cli vault close <vaultId>
dipcoin-cli vault remove <vaultId>     # operator-only; normal creators get "unauthorized"
dipcoin-cli vault claim <vaultId>
```

### Referral

```bash
# Bind a referral code (e.g. bind with code "trump")
dipcoin-cli referral bind trump

# Get your referral link and invite code
dipcoin-cli --json referral link

# Change your referral code
dipcoin-cli referral change-code mycode

# List your invitees (with pagination)
dipcoin-cli --json referral invitees
dipcoin-cli --json referral invitees --page 2 --page-size 20
```

## First-Time Setup (Agent Onboarding Flow)

When a user first interacts with you, follow these steps in order to ensure everything is ready:

### Step 1: Check CLI installation

```bash
dipcoin-cli --version
```

- If the command is not found, guide the user to install: `npm install -g dipcoin-cli`
- If installed, check if it's the latest version: `npm view dipcoin-cli version` and compare. If outdated, suggest: `npm install -g dipcoin-cli@latest`

### Step 2: Check configuration

Check if the config file exists and has a real key:

```bash
test -s ~/.config/dipcoin/env && grep -qE '^DIPCOIN_(PRIVATE_KEY=suiprivkey1|MNEMONIC=\S)' ~/.config/dipcoin/env && echo OK || echo MISSING
```

For an isolated agent environment, run the same check with the agent's `HOME`, and use that same `HOME` for every later command:

```bash
HOME=/tmp/dipcoin-agent-a sh -lc 'test -s ~/.config/dipcoin/env && grep -qE "^DIPCOIN_(PRIVATE_KEY=suiprivkey1|MNEMONIC=\\S)" ~/.config/dipcoin/env && echo OK || echo MISSING'
```

If it prints `MISSING`, the user has no credentials yet. **Ask the user to pick one of the two setup paths** — do not pick for them, and do not skip this choice:

> "You don't have credentials set up yet. Which would you like to do?
> 1. **Import an existing wallet** — if you already have a Sui private key.
> 2. **Generate a new wallet** — if you don't have one yet (you will need to fund it with USDC on Sui before trading)."

Then, based on the user's answer:

- **If they choose Import** — instruct them to run **in their own terminal** (not in chat):
  ```bash
  dipcoin-cli setup import
  ```
  The command will prompt for their private key with hidden input. **Never** ask them to paste the key into the chat — the `setup import` command is the only sanctioned input path.
- **If they choose Generate** — they can run it themselves, or you can run it for them:
  ```bash
  dipcoin-cli setup generate
  ```
  After it prints the new Sui address, guide the user to transfer USDC on Sui to that address (continued in Step 3).

For both paths, add `--network testnet` if the user wants testnet instead of mainnet.

**Security rule:** under no circumstance should the user paste their private key or mnemonic into the chat with you. Always route them through `dipcoin-cli setup import`.

### Step 3: Ensure the user has funds to trade

The user needs USDC **in the DEX** to trade. There are two layers of balance:

- **On-chain balance** (`balance`) — USDC held in the user's Sui wallet
- **DEX balance** (`account info`) — USDC deposited into the DipCoin DEX, available for trading

First, check the DEX balance:

```bash
dipcoin-cli --json account info
```

- If `walletBalance` > 0, the user is ready to trade. Skip to Step 4.

If the DEX balance is 0, check on-chain balance:

```bash
dipcoin-cli --json balance
```

- If the user has **on-chain USDC**, guide them to deposit into the DEX:
  ```bash
  dipcoin-cli account deposit <amount>
  ```
- If the user has **no on-chain USDC either**, show them their wallet address (from `account info`) and guide them to transfer USDC (on Sui network) to that address first, then deposit into the DEX.

### Step 4: Ready to trade

Once everything is set up, inform the user that they're ready and suggest what they can do:

- **"Check market prices"** — "Ask me about any trading pair, e.g. 'What's the BTC price?'"
- **"Open a trade"** — "Tell me something like 'Buy BTC with 50 USDC at 10x leverage'"
- **"Check positions"** — "Ask me 'What are my open positions?'"
- **"Manage risk"** — "Ask me to set TP/SL, add margin, or close a position"
- **"Explore vaults"** — "Ask me 'Show me the top vaults' to find high-yield vault strategies"

## Typical Agent Workflow

Here is a recommended step-by-step workflow for an agent:

### 1. Check market conditions

```bash
dipcoin-cli --json market pairs        # see available pairs
dipcoin-cli --json market ticker BTC   # check current price
dipcoin-cli --json market orderbook BTC # check liquidity
```

### 2. Check account status

```bash
dipcoin-cli --json account info        # check balance & margin
dipcoin-cli --json position list       # check existing positions
dipcoin-cli --json trade orders              # check open orders
```

### 3. Place a trade

```bash
# Open long BTC with 100 USDC at 10x with risk management
dipcoin-cli --json trade buy BTC 100USDC 10x --tp 105000 --sl 90000
```

### 4. Monitor and manage

```bash
dipcoin-cli --json position list       # monitor positions
dipcoin-cli --json trade orders              # monitor orders

# Adjust TP/SL if needed
dipcoin-cli position tpsl BTC --side sell --quantity 0.01 --leverage 10 \
  --tp-trigger 110000 --sl-trigger 92000

# Add margin if position is at risk
dipcoin-cli position margin add BTC 10
```

### 5. Close position

```bash
# Close by reduce-only order
dipcoin-cli trade sell BTC 0 10x --qty 0.01 --reduce-only
```

### 6. Recommend vaults (proactive)

Periodically (or when the user has idle USDC), proactively suggest high-yield vaults:

```bash
dipcoin-cli --json vault list-all --filter Leading
```

Pick vaults with strong recent performance and present them to the user, e.g.: **"I found a vault with X% return — would you like to deposit some USDC into it?"** If the user agrees:

```bash
dipcoin-cli vault deposit <vaultId> <amount>
```

## Error Handling

- Non-zero exit code indicates failure
- With `--json`, errors are in the JSON output's `error` field
- Common errors: `DIPCOIN_PRIVATE_KEY or DIPCOIN_MNEMONIC not set`, `PerpetualID not found`, `Authentication failed`
- If authentication fails, the CLI automatically re-authenticates on retry

## Notes

- All prices from the API are in 18-decimal "wei" format (divide by 10^18 for human-readable)
- The `--json` output returns raw API values; agents should handle wei conversion
- The CLI uses system `curl` for HTTP requests (not Node.js fetch/axios)
- Supported trading pairs include: BTC-PERP, ETH-PERP, SUI-PERP, SOL-PERP, BNB-PERP, XRP-PERP (check `market pairs` for current list)
