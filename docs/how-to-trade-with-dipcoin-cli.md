# How to Trade on DipCoin with dipcoin-cli

This guide teaches the full DipCoin CLI workflow from the terminal: install the tool, configure a wallet, fund your DipCoin DEX account, inspect markets, open a position, manage risk, close the position, and review what happened.


---

## Before You Start

You need:

- A terminal.
- Node.js and npm.
- A Sui wallet, or a willingness to generate a new one.
- A small amount of **SUI** for gas fees.
- Some **USDC** on the **Sui network** for trading collateral.

Keep these rules in mind:

- Never paste your private key or mnemonic into a document, chat, GitHub issue, or public place.
- Commands with placeholders like `<qty>`, `<price>`, `<vaultId>`, or `<orderHash>` must be edited before you run them.
- Command inputs such as `100USDC`, `10x`, `--qty 0.01`, `--tp 105000`, and `--sl 90000` use human-readable units.
- This guide uses the default human-readable CLI output.

---

## Step 1 - Install dipcoin-cli

Install the latest version:

```bash
npm install -g dipcoin-cli@latest
```

After this finishes without an error, the `dipcoin-cli` command should be available globally.

Check your installed version:

```bash
dipcoin-cli --version
```

You should see a version number. The exact number changes over time as the CLI is updated.

You can compare it with the latest npm release:

```bash
npm view dipcoin-cli version
```

If npm shows a newer version than your local CLI, run the install command again.

---

## Step 2 - Set Up Your Wallet

`dipcoin-cli` stores wallet credentials in:

```text
~/.config/dipcoin/env
```

You only need one of the two setup paths below.

### Option A - Import an Existing Sui Wallet

Use this if you already have a Sui private key or mnemonic:

```bash
dipcoin-cli setup import
```

The CLI opens a hidden terminal prompt. Paste your private key or mnemonic there, not in chat and not in a document.

When setup succeeds, you should see:

- Where the config file was saved.
- Whether the credential is a private key or mnemonic.
- The selected network.
- The public Sui address for the wallet.

The CLI should not print your private key or mnemonic.

### Option B - Generate a New Sui Wallet

Use this if you want the CLI to create a fresh Sui wallet:

```bash
dipcoin-cli setup generate
```

When setup succeeds, you should see the config path, network, and new public Sui address. Send SUI and USDC on the Sui network to that address before you try to trade.

---

## Step 3 - Understand Your Two Balances

DipCoin has two balance layers:

- **Sui wallet balance**: coins held directly in your Sui wallet.
- **DipCoin DEX balance**: USDC deposited into DipCoin and available as trading collateral.

### Check Your Sui Wallet

```bash
dipcoin-cli balance
```

Use this command to confirm that your wallet has SUI for gas and USDC to deposit.

The output is a simple table:

- `Coin`: token symbol when metadata is available.
- `Balance`: formatted on-chain wallet balance.

If you do not see enough SUI, on-chain transactions such as deposit, withdraw, margin changes, and vault actions may fail. If you do not see USDC, you need to transfer USDC on Sui to this wallet before funding the DEX.

### Check Your DipCoin DEX Account

```bash
dipcoin-cli account info
```

Use this command to understand whether you can trade right now.

Key rows in the table:

- `Wallet`: the Sui address used by the CLI.
- `Wallet Balance`: USDC available inside your DipCoin DEX account.
- `Account Value`: total DEX account value after collateral and unrealized PnL.
- `Free Collateral`: collateral available for new trades or withdrawals.
- `Total Margin`: margin currently reserved by open positions.
- `Unrealized PnL`: profit or loss from open positions that has not been realized yet.

If your Sui wallet has USDC but `Wallet Balance` is zero, the next step is to deposit USDC into the DEX.

---

## Step 4 - Deposit USDC into the DipCoin DEX

Before trading, move USDC from your Sui wallet into the DipCoin DEX.

Example:

```bash
dipcoin-cli account deposit 100
```

This submits an on-chain Sui transaction. If it succeeds, the CLI prints a success message and a transaction digest after `Tx:`.

Confirm the deposit:

```bash
dipcoin-cli account info
```

You are ready to trade when `Wallet Balance` and `Free Collateral` show available USDC in the DEX account.

Pattern to remember: `account deposit` and `account withdraw` move funds on-chain, so they require SUI gas and return a transaction digest.

---

## Step 5 - Inspect the Market

Before placing a trade, check which markets exist and what the current price looks like.

### List Available Markets

```bash
dipcoin-cli market pairs
```

This shows a table of tradable perpetual markets.

Columns to know:

- `Symbol`: market symbol, such as `BTC-PERP`.
- `PerpID`: shortened on-chain perpetual market ID. The CLI uses the full ID internally.
- `Max Leverage`: maximum leverage allowed for that market.

You can usually type `BTC` instead of `BTC-PERP`; the CLI normalizes common symbols automatically.

### Check the Current Ticker

```bash
dipcoin-cli market ticker BTC
```

Use this before opening a trade. It gives you the current market snapshot.

Rows to know:

- `Last Price`: latest traded price.
- `Mark Price`: mark price when available.
- `24h Change`: price change and percentage move over the last 24 hours.
- `24h High/Low`: recent high and low.
- `24h Volume`: recent trading volume.
- `Open Interest`: total open interest.
- `Funding Rate`: current funding rate.

### Check Liquidity with the Order Book

```bash
dipcoin-cli market orderbook BTC
```

The order book is split into asks and bids:

- `Asks (sell)` are prices where sellers are offering liquidity.
- `Bids (buy)` are prices where buyers are offering liquidity.
- The best ask is the lowest ask.
- The best bid is the highest bid.
- The spread is the difference between the best ask and best bid.

This helps you judge whether a market order is likely to fill near the current price.

---

## Step 6 - Open a Position

The two core trade commands are:

```bash
dipcoin-cli trade buy <symbol> <margin>USDC <leverage>x
dipcoin-cli trade sell <symbol> <margin>USDC <leverage>x
```

Use `buy` to open a long position. Use `sell` to open a short position.

Example long:

```bash
dipcoin-cli trade buy BTC 50USDC 10x
```

Example short:

```bash
dipcoin-cli trade sell BTC 50USDC 10x
```

Run only the side you actually intend to trade.

After submitting an order, the CLI shows how your USDC margin was converted into position quantity, then confirms whether the order was placed. If the order fails, read the error before trying again. Common issues include insufficient DEX balance, too-small order size, invalid symbol, or missing credentials.

### Add Take Profit and Stop Loss

You can attach risk controls when opening a position:

```bash
dipcoin-cli trade buy BTC 50USDC 10x --tp <takeProfitPrice> --sl <stopLossPrice>
```

For a short:

```bash
dipcoin-cli trade sell BTC 50USDC 10x --tp <takeProfitPrice> --sl <stopLossPrice>
```

Options to remember:

- `--tp` sets the take-profit trigger price.
- `--sl` sets the stop-loss trigger price.
- For a long, take profit is usually above entry and stop loss is usually below entry.
- For a short, take profit is usually below entry and stop loss is usually above entry.

### Place a Limit Order

Add `--price` if you do not want a market order:

```bash
dipcoin-cli trade buy BTC 50USDC 10x --price <limitPrice>
```

Pattern to remember: no `--price` means market order; adding `--price` makes it a limit order.

---

## Step 7 - Check Open Positions

List all open positions:

```bash
dipcoin-cli position list
```

Filter to one market:

```bash
dipcoin-cli position list --symbol BTC-PERP
```

Use this command after opening, adjusting, or closing a trade.

Columns to know:

- `Symbol`: market symbol.
- `Side`: position direction.
- `Qty`: formatted position quantity.
- `Entry`: average entry price.
- `Leverage`: selected leverage.
- `Liq Price`: estimated liquidation price.
- `uPnL`: unrealized profit or loss.
- `Margin`: margin assigned to the position.

The `Qty` column is especially important. Use that value when closing a position with `--qty`.

---

## Step 8 - Manage Position Risk

Once a position is open, you can add margin, remove margin, or set TP/SL orders.

### Add Margin

```bash
dipcoin-cli position margin add BTC 20
```

This adds 20 USDC of isolated margin to your BTC position. The goal is to give the position more collateral and move liquidation farther away. This is an on-chain action, so it uses SUI gas and prints a transaction digest when it succeeds.

### Remove Margin

```bash
dipcoin-cli position margin remove BTC 10
```

This removes 10 USDC of isolated margin from your BTC position. Use it carefully: if removing margin would make the position unsafe, the transaction can fail.


---

## Step 9 - Check and Cancel Open Orders

List open orders:

```bash
dipcoin-cli trade orders
```

Filter to one market:

```bash
dipcoin-cli trade orders --symbol BTC-PERP
```

Columns to know:

- `Hash`: order hash. Use this when cancelling an order.
- `Symbol`: market symbol.
- `Side`: buy or sell.
- `Type`: order type.
- `Qty`: order quantity.
- `Price`: order price.
- `Leverage`: selected leverage.
- `Status`: order status.

Cancel an order:

```bash
dipcoin-cli trade cancel BTC <orderHash>
```

After cancellation, run `dipcoin-cli trade orders --symbol BTC-PERP` again. The cancelled order should no longer appear as open.

---

## Step 10 - Close a Position

The CLI knows your current position, so it can figure out the side and the quantity for you.

### Close 100% of one position

```bash
dipcoin-cli position close BTC
```

### Close half of one position

```bash
dipcoin-cli position close BTC --percent 50
```

`--percent` accepts any number in `(0, 100]`. The CLI rounds down to the market's step size, so very small percentages on illiquid pairs may not be allowed — the command will tell you if so.

### Close every open position at once

```bash
dipcoin-cli position close-all
```

You can also partially close every position by combining the two: `dipcoin-cli position close-all --percent 50`.

Behind the scenes the CLI just submits reduce-only market orders against each position, in the right direction. You don't need to look up `Qty` or `Side` yourself.

Confirm the result:

```bash
dipcoin-cli position list
```

If a position is fully closed it will be gone from the list. If you only closed part of it, the `Qty` column will be smaller.

### Manual close 

If you'd rather pass the exact quantity yourself (for example to close 0.007 BTC of a 0.014 long), the old reduce-only pattern still works:

```bash
dipcoin-cli trade sell BTC 0 10x --qty 0.007 --reduce-only
```

For a short, use `trade buy ... --reduce-only` instead. The `0` placeholder is there because `--qty` overrides the USDC-margin field.

---

## Step 11 - Review Trade History

History commands teach you what happened after orders were submitted.

### Order History

```bash
dipcoin-cli history orders --symbol BTC-PERP --page 1 --size 20
```

Columns to know:

- `Symbol`: market symbol.
- `Side`: buy or sell.
- `Type`: order type.
- `Qty`: filled or requested quantity.
- `Price`: order or fill price.
- `Status`: order status.
- `PnL`: realized PnL when available.
- `Time`: order timestamp.

Use this command to confirm fills, cancelled orders, close orders, and realized PnL.

### Funding History

```bash
dipcoin-cli history funding --symbol BTC-PERP --page 1 --size 20
```

Columns to know:

- `Symbol`: market symbol.
- `Side`: long or short.
- `Size`: position size used in the funding settlement.
- `Rate`: funding rate.
- `Settlement`: funding amount paid or received.
- `Price`: oracle or settlement reference price.
- `Time`: settlement timestamp.

Use this to understand funding payments on open perpetual positions.

### Balance-Change History

```bash
dipcoin-cli history balance --page 1 --size 20
```

Columns to know:

- `Type`: balance-change type, such as deposit or withdrawal.
- `Amount`: amount changed.
- `TxDigest`: shortened Sui transaction digest when available.
- `Time`: timestamp.

Use this to audit deposits, withdrawals, and other account balance movements.

---

## Step 12 - Withdraw from the DipCoin DEX

When you want to move USDC back to your Sui wallet, withdraw from the DEX:

```bash
dipcoin-cli account withdraw 50
```

This submits an on-chain transaction, uses SUI gas, and prints a transaction digest if successful.

Confirm both balance layers:

```bash
dipcoin-cli account info
dipcoin-cli balance
```

`account info` shows your remaining DEX collateral. `balance` shows your on-chain wallet balances.

---

## Explore Vaults

Vaults are managed trading pools. You deposit USDC into a vault, and the vault trader manages positions on behalf of the vault.

List public vaults:

```bash
dipcoin-cli vault list-all --filter Leading --page 1 --page-size 10
```

Columns to know:

- `Name`: vault name.
- `Vault ID`: vault object ID.
- `TVL (USDC)`: total value locked.
- `APR (%)`: reported APR.
- `Depositors`: current depositor count.
- `Age (d)`: vault age in days.
- `Deposit`: whether deposits are open.
- `Status`: whether the vault is active or closed.

Inspect one vault:

```bash
dipcoin-cli vault info <vaultId>
```

Important rows include `Vault ID`, `Name`, `Creator`, `Trader`, `Deposit Status`, `Total Shares`, `Max Cap`, `Min Deposit`, `Creator Min Share Ratio`, `Creator Profit Share Ratio`, and `Auto Close on Withdraw`.

Deposit into a vault:

```bash
dipcoin-cli vault deposit <vaultId> 100
```

This is an on-chain transaction. If it succeeds, the CLI prints a transaction digest.

Check your vault position:

```bash
dipcoin-cli vault position <vaultId>
```

Rows to know:

- `Your Shares`: your vault share balance.
- `Total Vault Shares`: total shares in the vault.
- `Share Price`: latest share price.
- `Avg Entry Price`: your average entry share price.
- `Estimated Value (USDC)`: estimated USDC value of your shares.
- `Last Deposit`: last deposit time.

---

## Explore More Commands

You do not need to memorize every command. The CLI has built-in help, and the fastest way to discover more features is to ask the command itself.

Start with the top-level help:

```bash
dipcoin-cli --help
```

This shows the main command areas, such as `account`, `trade`, `position`, `market`, `history`, `vault`, `balance`, and `referral`.

Then inspect a command area:

```bash
dipcoin-cli trade --help
dipcoin-cli position --help
dipcoin-cli vault --help
```

This shows the available subcommands inside that area. For example, `trade --help` shows that trading supports commands like `buy`, `sell`, `cancel`, and `orders`.

You can go one level deeper to inspect a specific command:

```bash
dipcoin-cli trade buy --help
dipcoin-cli trade sell --help
dipcoin-cli position tpsl --help
```

This is where you learn the exact arguments and options a command accepts. For example, trade commands show arguments such as `<symbol>`, `<amount>`, and `<leverage>`, plus options like `--qty`, `--price`, `--reduce-only`, `--tp`, and `--sl`.

Most `dipcoin-cli` commands follow this pattern:

```bash
dipcoin-cli <area> <action> [arguments] [options]
```

Useful areas to explore:

- `balance`: check on-chain wallet coins.
- `account`: check, deposit, or withdraw DEX collateral.
- `market`: inspect pairs, tickers, order books, oracle prices, and candles.
- `trade`: place, list, cancel, and close orders.
- `position`: list positions, adjust margin, and set TP/SL.
- `history`: review orders, funding, and balance changes.
- `vault`: discover vaults and manage vault deposits or withdrawals.
- `referral`: view or manage referral information.

Patterns to remember:

- Add `--symbol BTC-PERP` when a list command is too broad.
- Use `BTC` or `BTC-PERP`; the CLI normalizes common symbols.
- Use `--price` for limit orders.
- Use `--qty` when you want to specify exact quantity instead of USDC margin.
- Use `--reduce-only` when closing a position.
- On-chain actions, such as deposit, withdraw, margin changes, and vault deposits, require SUI gas and return transaction digests.

---

## Six Safety Rules

1. **Never expose your private key or mnemonic.** Only enter it through `dipcoin-cli setup import`, which uses hidden terminal input.
2. **Start small.** Use a small deposit and a small first trade until you understand the full workflow.
3. **Read every command before pressing Enter.** Check the symbol, side, margin, leverage, quantity, take profit, and stop loss.
4. **Respect leverage.** 10x leverage can multiply profits, but it also multiplies losses. A 10% move against a 10x position can wipe out the margin.
5. **Use stop losses.** A trade without a stop loss can lose more than expected during fast markets.
6. **Back up `~/.config/dipcoin/env`.** This file controls access to your wallet. Keep it private and store a secure backup.

---

## Where to Go Next

- Full CLI reference: [SKILL.md](https://raw.githubusercontent.com/dipcoinlab/dipcoin-cli/main/SKILL.md)
- DipCoin website: <https://dipcoin.io>
- Vibe trading guide: [how-to-vibe-trading-on-dipcoin.md](how-to-vibe-trading-on-dipcoin.md)

Once you can install the CLI, fund the DEX, open a small position, close it, and review history, you know the complete basic trading loop.
