# ◆ StellarStake — XLM Staking Pool with Custom Reward Token

A production-ready DeFi staking dApp on Stellar Testnet. Stake XLM, earn STKR tokens every second via an **inter-contract call** from the StakingPool to the RewardToken contract.

---

## Live Demo

> **[🚀 Live App →](https://stellar-stake.vercel.app)**
> *(Update after Vercel deploy)*

## Demo Video

> **[▶ Demo Video →](https://youtu.be/placeholder)**
> *(Update after recording)*

---

## Deployed Contracts

| | StakingPool | RewardToken (STKR) |
|---|---|---|
| **Contract ID** | `CATIVNFVTBKAXOF7TPCIDTBXDXWAYK572LHQNV5PWQ72COMQPLRVNM3B` | `CAPG7LQT5QJM6N6NJFKI7WBOGYABBPNNNVK4GJTWC23JBVBXHJQHJTZY` |
| **Network** | Stellar Testnet | Stellar Testnet |
| **Explorer** | [View](https://stellar.expert/explorer/testnet/contract/CATIVNFVTBKAXOF7TPCIDTBXDXWAYK572LHQNV5PWQ72COMQPLRVNM3B) | [View](https://stellar.expert/explorer/testnet/contract/CAPG7LQT5QJM6N6NJFKI7WBOGYABBPNNNVK4GJTWC23JBVBXHJQHJTZY) |

### Deploy Transactions

| Contract | Upload Tx | Deploy Tx | Init Tx |
|---|---|---|---|
| RewardToken | [a99cc320…](https://stellar.expert/explorer/testnet/tx/a99cc32061efad502078ee47ba198e5fcf74ffac49ecac49b19dbac8d1d3c3af) | [5dec9abd…](https://stellar.expert/explorer/testnet/tx/5dec9abd5d3d3b8ec6d469a421c71d104d8364e66dae1aab711ce94ade0c2804) | [35e15e4d…](https://stellar.expert/explorer/testnet/tx/35e15e4d57f23a2a523e680b028159c5cb72eaa48cfc1613e455b1d2c968f9e9) |
| StakingPool | [398950dd…](https://stellar.expert/explorer/testnet/tx/398950dd91b10854635cc4b22a396426162589d6c3f5303ed11aa49056f5a4d1) | [07eacd53…](https://stellar.expert/explorer/testnet/tx/07eacd53ac662188f5fb880433802107846bda21581d04ba685978ce201c52c8) | [a4ce7cb7…](https://stellar.expert/explorer/testnet/tx/a4ce7cb703bc1e0d3105d72a2e6ca4eeefcaf6fb5d27356b9c459c6ffd4969b5) |

---

## CI/CD

[![Contract Tests](https://github.com/Ayushjo/stellar-stake/actions/workflows/test.yml/badge.svg)](https://github.com/Ayushjo/stellar-stake/actions/workflows/test.yml)

GitHub Actions runs `cargo test --workspace` on every push. 13 tests pass (5 RewardToken + 8 StakingPool).

---

## Why StellarStake?

DeFi staking is the foundational primitive of on-chain yield. StellarStake brings it to Stellar:

- **Stake XLM** → lock tokens in the on-chain pool
- **Earn STKR** → reward tokens accrue every second, proportional to your stake
- **Claim anytime** → one click triggers an inter-contract call that mints STKR directly to your wallet
- **Unstake & auto-claim** → unstaking automatically harvests pending rewards first

---

## Features

### Core dApp
- Multi-wallet via **StellarWalletsKit** (Freighter · xBull · LOBSTR)
- Stake / unstake XLM with preset amounts (10, 50, 100 XLM)
- Real-time pending reward counter (ticks locally every 10s)
- Claim STKR rewards (inter-contract call on-chain)
- Live event feed polling Soroban RPC every 15s
- Pool stats: TVL, daily rate, STKR balance

### Production Ready
- `localStorage` cache with TTL (15s), invalidated on every write
- 5 error types: `WALLET_NOT_FOUND`, `USER_REJECTED`, `INSUFFICIENT_FUNDS`, `CONTRACT_ERROR`, `TX_TIMEOUT`
- Transaction toast: pending spinner → success with Explorer link → error
- CI/CD: GitHub Actions runs contract tests on every push
- Mobile responsive — works on all screen sizes

---

## Inter-Contract Call

The key advanced pattern: **StakingPool calls RewardToken.mint()** cross-contract.

```
User calls claim(staker)
    │
    ▼
StakingPool::claim()
    │  calculates pending STKR rewards
    │
    ▼  inter-contract call
RewardToken::mint(staker, amount)
    │  admin.require_auth() — admin = StakingPool address
    │  mints STKR directly to staker's wallet
    ▼
STKR balance updated on-chain
```

The RewardToken is initialized with the StakingPool as its admin. Only the pool can mint STKR — enforced by the contract, not by us.

---

## Smart Contracts

**Language:** Rust (Soroban SDK v22) | **Files:** `contracts/reward_token/src/lib.rs` · `contracts/staking_pool/src/lib.rs`

### RewardToken (STKR)

| Function | Description |
|---|---|
| `initialize(admin, decimal, name, symbol)` | One-time setup — admin = StakingPool |
| `mint(to, amount)` | Admin-only: mint STKR (called by StakingPool) |
| `transfer(from, to, amount)` | Standard transfer between wallets |
| `balance(id)` | Get STKR balance for address |
| `decimals() / name() / symbol()` | Token metadata |

### StakingPool

| Function | Description |
|---|---|
| `initialize(native_token, reward_token, reward_rate)` | One-time setup |
| `stake(staker, amount)` | Lock XLM, start accruing STKR |
| `unstake(staker, amount)` | Return XLM + auto-claim pending STKR |
| `claim(staker)` | **Inter-contract call** → mint STKR to staker |
| `get_stake(staker)` | View staked XLM amount |
| `pending_rewards(staker)` | View accrued STKR |
| `total_staked()` | Pool TVL |
| `reward_rate()` | Current reward rate |

### Reward Formula

```
pending_STKR = staked_XLM_stroops × rate × elapsed_seconds / 1200
```

With `rate = 10`: ~720 STKR per 1 XLM per day (designed for testnet visibility).

---

## Tests — 13 Passing

```
running 5 tests (reward_token)
test test::test_initialize_metadata          ... ok
test test::test_mint_updates_balance         ... ok
test test::test_transfer_tokens              ... ok
test test::test_transfer_insufficient_balance ... ok
test test::test_cannot_reinitialize          ... ok

running 8 tests (staking_pool)
test test::test_stake_records_amount         ... ok
test test::test_unstake_returns_xlm          ... ok
test test::test_pending_rewards_increase_over_time ... ok
test test::test_claim_mints_reward_token     ... ok
test test::test_unstake_auto_claims_rewards  ... ok
test test::test_multiple_stakers_independent ... ok
test test::test_cannot_unstake_more_than_staked ... ok
test test::test_add_stake_snapshots_rewards  ... ok

test result: ok. 13 passed; 0 failed
```

Run yourself:
```bash
cargo test --workspace
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 6 |
| Wallets | `@creit.tech/stellar-wallets-kit` v2 |
| Stellar SDK | `@stellar/stellar-sdk` v15 |
| Smart Contracts | Rust · Soroban SDK v22 |
| Network | Stellar Testnet · Soroban RPC |
| CI/CD | GitHub Actions |
| Caching | `localStorage` with TTL |

---

## Setup & Run Locally

**Prerequisites:**
- [Freighter](https://freighter.app) (or xBull / LOBSTR) set to **Testnet**
- Testnet XLM from [friendbot.stellar.org](https://friendbot.stellar.org)
- Node.js 18+

```bash
git clone https://github.com/Ayushjo/stellar-stake.git
cd stellar-stake
npm install
npm run dev
```

Open **http://localhost:5173** — contracts are already deployed, `.env` is committed.

---

## Deploy Your Own Contracts

```bash
# 1. Install toolchain
rustup target add wasm32v1-none

# 2. Build both WASMs
stellar contract build

# 3. Fund deployer
stellar keys generate deployer --network testnet
curl "https://friendbot.stellar.org/?addr=$(stellar keys address deployer)"

# 4. Deploy
TOKEN_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/reward_token.wasm \
  --source deployer --network testnet)

POOL_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/staking_pool.wasm \
  --source deployer --network testnet)

NATIVE=$(stellar contract id asset --asset native --network testnet)

# 5. Init pool first (needs token address)
stellar contract invoke --id $POOL_ID --source deployer --network testnet \
  -- initialize --native_token $NATIVE --reward_token $TOKEN_ID --reward_rate 10

# 6. Init token with pool as admin (enables inter-contract minting)
stellar contract invoke --id $TOKEN_ID --source deployer --network testnet \
  -- initialize --admin $POOL_ID --decimal 7 --name "Stellar Stake" --symbol "STKR"

# 7. Set env
echo "VITE_POOL_ID=$POOL_ID"     > .env
echo "VITE_TOKEN_ID=$TOKEN_ID"  >> .env
echo "VITE_NATIVE_TOKEN=$NATIVE" >> .env
```

---

## Project Structure

```
stellar-stake/
├── .github/workflows/test.yml    ← CI/CD: runs cargo test on every push
├── contracts/
│   ├── reward_token/src/lib.rs   ← STKR token + 5 unit tests
│   └── staking_pool/src/lib.rs   ← Staking logic + 8 unit tests
├── src/
│   ├── components/
│   │   ├── StakePanel.jsx        ← Stake/unstake form
│   │   ├── RewardsPanel.jsx      ← STKR balance + claim
│   │   ├── EventFeed.jsx         ← Live Soroban event feed
│   │   └── TxToast.jsx           ← Animated tx status toast
│   ├── lib/
│   │   ├── wallets.js            ← StellarWalletsKit + error classifier
│   │   ├── contract.js           ← simulate → sign → submit → poll
│   │   └── cache.js              ← localStorage cache with TTL
│   ├── App.jsx                   ← Dashboard + stats + auto-refresh
│   └── index.css                 ← Dark design system, mobile responsive
├── .env                          ← Deployed contract IDs (safe to commit)
└── README.md
```

---

## License

MIT
