#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Decimals,
    Name,
    Symbol,
    Balance(Address),
}

#[contract]
pub struct RewardToken;

#[contractimpl]
impl RewardToken {
    pub fn initialize(env: Env, admin: Address, decimal: u32, name: String, symbol: String) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Decimals, &decimal);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().extend_ttl(100_000, 100_000);
    }

    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(to.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &(balance + amount));
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Balance(to.clone()), 100_000, 100_000);
        env.events().publish(("mint",), (to, amount));
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let from_bal: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(from.clone()))
            .unwrap_or(0);
        if from_bal < amount {
            panic!("insufficient balance");
        }
        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(from_bal - amount));
        let to_bal: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(to.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &(to_bal + amount));
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Balance(from.clone()), 100_000, 100_000);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Balance(to.clone()), 100_000, 100_000);
        env.events().publish(("transfer",), (from, to, amount));
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Decimals).unwrap_or(7)
    }

    pub fn name(env: Env) -> String {
        env.storage().instance().get(&DataKey::Name).unwrap()
    }

    pub fn symbol(env: Env) -> String {
        env.storage().instance().get(&DataKey::Symbol).unwrap()
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let id = env.register(RewardToken, ());
        let client = RewardTokenClient::new(&env, &id);
        client.initialize(
            &admin,
            &7u32,
            &String::from_str(&env, "Stellar Stake"),
            &String::from_str(&env, "STKR"),
        );
        (env, id, admin)
    }

    #[test]
    fn test_initialize_metadata() {
        let (env, id, _) = setup();
        let client = RewardTokenClient::new(&env, &id);
        assert_eq!(client.decimals(), 7);
        assert_eq!(client.name(), String::from_str(&env, "Stellar Stake"));
        assert_eq!(client.symbol(), String::from_str(&env, "STKR"));
    }

    #[test]
    fn test_mint_updates_balance() {
        let (env, id, _) = setup();
        let client = RewardTokenClient::new(&env, &id);
        let user = Address::generate(&env);
        assert_eq!(client.balance(&user), 0);
        client.mint(&user, &5_000_000i128);
        assert_eq!(client.balance(&user), 5_000_000);
    }

    #[test]
    fn test_transfer_tokens() {
        let (env, id, _) = setup();
        let client = RewardTokenClient::new(&env, &id);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        client.mint(&alice, &10_000_000i128);
        client.transfer(&alice, &bob, &4_000_000i128);
        assert_eq!(client.balance(&alice), 6_000_000);
        assert_eq!(client.balance(&bob), 4_000_000);
    }

    #[test]
    #[should_panic(expected = "insufficient balance")]
    fn test_transfer_insufficient_balance() {
        let (env, id, _) = setup();
        let client = RewardTokenClient::new(&env, &id);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        client.mint(&alice, &1_000_000i128);
        client.transfer(&alice, &bob, &2_000_000i128);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_cannot_reinitialize() {
        let (env, id, admin) = setup();
        let client = RewardTokenClient::new(&env, &id);
        client.initialize(
            &admin,
            &7u32,
            &String::from_str(&env, "Dup"),
            &String::from_str(&env, "DUP"),
        );
    }
}
