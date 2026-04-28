#!/bin/bash
# Deploy both Soroban contracts to Stellar Testnet
# Usage: bash scripts/deploy.sh

set -e

echo "Building contract WASMs..."
stellar contract build

echo "Funding deployer from Friendbot..."
DEPLOYER_ADDR=$(stellar keys address deployer 2>/dev/null || (
  stellar keys generate deployer --network testnet
  stellar keys address deployer
))
curl -s "https://friendbot.stellar.org/?addr=${DEPLOYER_ADDR}" > /dev/null

echo "Deploying RewardToken..."
TOKEN_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/reward_token.wasm \
  --source deployer --network testnet)
echo "RewardToken: $TOKEN_ID"

echo "Deploying StakingPool..."
POOL_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/staking_pool.wasm \
  --source deployer --network testnet)
echo "StakingPool: $POOL_ID"

NATIVE=$(stellar contract id asset --asset native --network testnet)

echo "Initializing StakingPool..."
stellar contract invoke --id "$POOL_ID" --source deployer --network testnet \
  -- initialize \
  --native_token "$NATIVE" \
  --reward_token "$TOKEN_ID" \
  --reward_rate 10

echo "Initializing RewardToken (admin = StakingPool)..."
stellar contract invoke --id "$TOKEN_ID" --source deployer --network testnet \
  -- initialize \
  --admin "$POOL_ID" \
  --decimal 7 \
  --name "Stellar Stake" \
  --symbol "STKR"

echo "Writing .env..."
cat > .env <<EOF
VITE_POOL_ID=${POOL_ID}
VITE_TOKEN_ID=${TOKEN_ID}
VITE_NATIVE_TOKEN=${NATIVE}
EOF

echo ""
echo "Done! Contracts deployed and .env written."
echo "  StakingPool : $POOL_ID"
echo "  RewardToken : $TOKEN_ID"
echo "  Native Token: $NATIVE"
