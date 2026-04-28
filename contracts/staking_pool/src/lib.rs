#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

// Inter-contract interface for the reward token (STKR)
// StakingPool calls reward_token.mint() to distribute rewards
mod reward_token {
    use soroban_sdk::{contractclient, Address, Env};

    #[contractclient(name = "Client")]
    pub trait Interface {
        fn mint(env: Env, to: Address, amount: i128);
        fn balance(env: Env, id: Address) -> i128;
    }
}

/// Reward denominator: controls how fast STKR accrues.
/// pending = staked_stroops * rate * elapsed_seconds / REWARD_DENOM
/// With rate=10, DENOM=1200: ~0.83 STKR per 10 XLM per 10 seconds (great for testnet demo)
const REWARD_DENOM: i128 = 1_200;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    NativeToken,
    RewardToken,
    RewardRate,
    TotalStaked,
    Stake(Address),
}

#[derive(Clone)]
#[contracttype]
pub struct StakeInfo {
    pub amount: i128,
    pub stake_time: u64,
    pub unclaimed: i128,
}

#[contract]
pub struct StakingPool;

#[contractimpl]
impl StakingPool {
    pub fn initialize(env: Env, native_token: Address, reward_token: Address, reward_rate: i128) {
        if env.storage().instance().has(&DataKey::NativeToken) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::NativeToken, &native_token);
        env.storage().instance().set(&DataKey::RewardToken, &reward_token);
        env.storage().instance().set(&DataKey::RewardRate, &reward_rate);
        env.storage().instance().set(&DataKey::TotalStaked, &0i128);
        env.storage().instance().extend_ttl(100_000, 100_000);
    }

    pub fn stake(env: Env, staker: Address, amount: i128) {
        staker.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let native: Address = env.storage().instance().get(&DataKey::NativeToken).unwrap();
        // Transfer XLM from staker into this contract
        token::Client::new(&env, &native).transfer(&staker, &env.current_contract_address(), &amount);

        let now = env.ledger().timestamp();
        let rate: i128 = env.storage().instance().get(&DataKey::RewardRate).unwrap();

        let info = if let Some(existing) = env
            .storage()
            .persistent()
            .get::<DataKey, StakeInfo>(&DataKey::Stake(staker.clone()))
        {
            // Accrue pending rewards before adding new stake
            let new_rewards = calc_rewards(existing.amount, rate, now - existing.stake_time);
            StakeInfo {
                amount: existing.amount + amount,
                stake_time: now,
                unclaimed: existing.unclaimed + new_rewards,
            }
        } else {
            StakeInfo { amount, stake_time: now, unclaimed: 0 }
        };

        env.storage().persistent().set(&DataKey::Stake(staker.clone()), &info);
        env.storage().persistent().extend_ttl(&DataKey::Stake(staker.clone()), 100_000, 100_000);

        let total: i128 = env.storage().instance().get(&DataKey::TotalStaked).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalStaked, &(total + amount));

        env.events().publish(("stake",), (staker, amount));
    }

    pub fn unstake(env: Env, staker: Address, amount: i128) {
        staker.require_auth();
        let info: StakeInfo = env
            .storage()
            .persistent()
            .get(&DataKey::Stake(staker.clone()))
            .unwrap_or_else(|| panic!("no active stake"));

        if amount > info.amount {
            panic!("insufficient stake");
        }

        let now = env.ledger().timestamp();
        let rate: i128 = env.storage().instance().get(&DataKey::RewardRate).unwrap();
        let new_rewards = calc_rewards(info.amount, rate, now - info.stake_time);
        let total_unclaimed = info.unclaimed + new_rewards;

        // Auto-claim any pending rewards on unstake
        if total_unclaimed > 0 {
            let rt: Address = env.storage().instance().get(&DataKey::RewardToken).unwrap();
            reward_token::Client::new(&env, &rt).mint(&staker, &total_unclaimed);
            env.events().publish(("claim",), (staker.clone(), total_unclaimed));
        }

        let native: Address = env.storage().instance().get(&DataKey::NativeToken).unwrap();
        token::Client::new(&env, &native).transfer(&env.current_contract_address(), &staker, &amount);

        let remaining = info.amount - amount;
        if remaining == 0 {
            env.storage().persistent().remove(&DataKey::Stake(staker.clone()));
        } else {
            env.storage().persistent().set(
                &DataKey::Stake(staker.clone()),
                &StakeInfo { amount: remaining, stake_time: now, unclaimed: 0 },
            );
            env.storage().persistent().extend_ttl(&DataKey::Stake(staker.clone()), 100_000, 100_000);
        }

        let total: i128 = env.storage().instance().get(&DataKey::TotalStaked).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalStaked, &(total - amount));

        env.events().publish(("unstake",), (staker, amount));
    }

    pub fn claim(env: Env, staker: Address) {
        staker.require_auth();
        let info: StakeInfo = env
            .storage()
            .persistent()
            .get(&DataKey::Stake(staker.clone()))
            .unwrap_or_else(|| panic!("no active stake"));

        let now = env.ledger().timestamp();
        let rate: i128 = env.storage().instance().get(&DataKey::RewardRate).unwrap();
        let new_rewards = calc_rewards(info.amount, rate, now - info.stake_time);
        let total = info.unclaimed + new_rewards;

        if total == 0 {
            panic!("no rewards to claim");
        }

        let rt: Address = env.storage().instance().get(&DataKey::RewardToken).unwrap();
        // Inter-contract call: StakingPool → RewardToken.mint()
        reward_token::Client::new(&env, &rt).mint(&staker, &total);

        env.storage().persistent().set(
            &DataKey::Stake(staker.clone()),
            &StakeInfo { amount: info.amount, stake_time: now, unclaimed: 0 },
        );
        env.storage().persistent().extend_ttl(&DataKey::Stake(staker.clone()), 100_000, 100_000);

        env.events().publish(("claim",), (staker, total));
    }

    pub fn get_stake(env: Env, staker: Address) -> i128 {
        env.storage()
            .persistent()
            .get::<DataKey, StakeInfo>(&DataKey::Stake(staker))
            .map(|i| i.amount)
            .unwrap_or(0)
    }

    pub fn pending_rewards(env: Env, staker: Address) -> i128 {
        let info = match env
            .storage()
            .persistent()
            .get::<DataKey, StakeInfo>(&DataKey::Stake(staker))
        {
            Some(i) => i,
            None => return 0,
        };
        let now = env.ledger().timestamp();
        let rate: i128 = env.storage().instance().get(&DataKey::RewardRate).unwrap();
        info.unclaimed + calc_rewards(info.amount, rate, now - info.stake_time)
    }

    pub fn total_staked(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalStaked).unwrap_or(0)
    }

    pub fn reward_rate(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::RewardRate).unwrap_or(0)
    }
}

fn calc_rewards(amount: i128, rate: i128, elapsed: u64) -> i128 {
    amount * rate * (elapsed as i128) / REWARD_DENOM
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger, LedgerInfo},
        token::{Client as TokenClient, StellarAssetClient},
        Env,
    };

    const STROOP: i128 = 10_000_000;

    struct TestSetup {
        env: Env,
        native_id: Address,
        reward_id: Address,
        pool_id: Address,
    }

    fn setup() -> TestSetup {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set(LedgerInfo {
            timestamp: 1_000_000,
            protocol_version: 22,
            sequence_number: 100,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 10,
            min_persistent_entry_ttl: 10,
            max_entry_ttl: 3_000_000,
        });

        let admin = Address::generate(&env);
        // Native XLM token (for staking)
        let native_id = env.register_stellar_asset_contract_v2(admin.clone()).address();

        let pool_id = env.register(StakingPool, ());

        // Use a second stellar asset contract as the reward token mock.
        // Pool is admin so it can call mint() on it (inter-contract call).
        let reward_id = env.register_stellar_asset_contract_v2(pool_id.clone()).address();

        StakingPoolClient::new(&env, &pool_id)
            .initialize(&native_id, &reward_id, &10i128);

        TestSetup { env, native_id, reward_id, pool_id }
    }

    fn mint_xlm(env: &Env, native_id: &Address, to: &Address, amount: i128) {
        StellarAssetClient::new(env, native_id).mint(to, &amount);
    }

    fn advance_time(env: &Env, seconds: u64) {
        let current = env.ledger().timestamp();
        env.ledger().set(LedgerInfo {
            timestamp: current + seconds,
            protocol_version: 22,
            sequence_number: 100,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 10,
            min_persistent_entry_ttl: 10,
            max_entry_ttl: 3_000_000,
        });
    }

    #[test]
    fn test_stake_records_amount() {
        let TestSetup { env, native_id, pool_id, .. } = setup();
        let pool = StakingPoolClient::new(&env, &pool_id);
        let user = Address::generate(&env);
        mint_xlm(&env, &native_id, &user, 50 * STROOP);

        pool.stake(&user, &(10 * STROOP));
        assert_eq!(pool.get_stake(&user), 10 * STROOP);
        assert_eq!(pool.total_staked(), 10 * STROOP);
    }

    #[test]
    fn test_unstake_returns_xlm() {
        let TestSetup { env, native_id, pool_id, .. } = setup();
        let pool = StakingPoolClient::new(&env, &pool_id);
        let user = Address::generate(&env);
        mint_xlm(&env, &native_id, &user, 50 * STROOP);

        pool.stake(&user, &(20 * STROOP));
        advance_time(&env, 1);
        pool.unstake(&user, &(20 * STROOP));

        assert_eq!(pool.get_stake(&user), 0);
        assert_eq!(pool.total_staked(), 0);
    }

    #[test]
    fn test_pending_rewards_increase_over_time() {
        let TestSetup { env, native_id, pool_id, .. } = setup();
        let pool = StakingPoolClient::new(&env, &pool_id);
        let user = Address::generate(&env);
        mint_xlm(&env, &native_id, &user, 50 * STROOP);

        pool.stake(&user, &(10 * STROOP));
        assert_eq!(pool.pending_rewards(&user), 0);

        advance_time(&env, 120);
        // 10 * STROOP * 10 * 120 / 1200 = 10 * STROOP
        assert_eq!(pool.pending_rewards(&user), 10 * STROOP);
    }

    #[test]
    fn test_claim_mints_reward_token() {
        let TestSetup { env, native_id, reward_id, pool_id } = setup();
        let pool = StakingPoolClient::new(&env, &pool_id);
        let rt = TokenClient::new(&env, &reward_id);
        let user = Address::generate(&env);
        mint_xlm(&env, &native_id, &user, 50 * STROOP);

        pool.stake(&user, &(10 * STROOP));
        advance_time(&env, 120);
        pool.claim(&user);

        assert_eq!(rt.balance(&user), 10 * STROOP);
        assert_eq!(pool.pending_rewards(&user), 0);
    }

    #[test]
    fn test_unstake_auto_claims_rewards() {
        let TestSetup { env, native_id, reward_id, pool_id } = setup();
        let pool = StakingPoolClient::new(&env, &pool_id);
        let rt = TokenClient::new(&env, &reward_id);
        let user = Address::generate(&env);
        mint_xlm(&env, &native_id, &user, 50 * STROOP);

        pool.stake(&user, &(10 * STROOP));
        advance_time(&env, 120);
        pool.unstake(&user, &(10 * STROOP));

        assert!(rt.balance(&user) > 0);
    }

    #[test]
    fn test_multiple_stakers_independent() {
        let TestSetup { env, native_id, pool_id, .. } = setup();
        let pool = StakingPoolClient::new(&env, &pool_id);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        mint_xlm(&env, &native_id, &alice, 50 * STROOP);
        mint_xlm(&env, &native_id, &bob, 50 * STROOP);

        pool.stake(&alice, &(10 * STROOP));
        pool.stake(&bob, &(20 * STROOP));
        assert_eq!(pool.total_staked(), 30 * STROOP);

        advance_time(&env, 120);
        // Bob staked 2x alice, so should earn 2x
        assert_eq!(pool.pending_rewards(&bob), pool.pending_rewards(&alice) * 2);
    }

    #[test]
    #[should_panic(expected = "insufficient stake")]
    fn test_cannot_unstake_more_than_staked() {
        let TestSetup { env, native_id, pool_id, .. } = setup();
        let pool = StakingPoolClient::new(&env, &pool_id);
        let user = Address::generate(&env);
        mint_xlm(&env, &native_id, &user, 50 * STROOP);
        pool.stake(&user, &(10 * STROOP));
        pool.unstake(&user, &(20 * STROOP));
    }

    #[test]
    fn test_add_stake_snapshots_rewards() {
        let TestSetup { env, native_id, pool_id, .. } = setup();
        let pool = StakingPoolClient::new(&env, &pool_id);
        let user = Address::generate(&env);
        mint_xlm(&env, &native_id, &user, 100 * STROOP);

        pool.stake(&user, &(10 * STROOP));
        advance_time(&env, 120);
        pool.stake(&user, &(10 * STROOP));

        assert_eq!(pool.get_stake(&user), 20 * STROOP);
        // Snapshot should preserve the 120s of rewards
        assert!(pool.pending_rewards(&user) >= 10 * STROOP);
    }
}
