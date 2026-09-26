# Kanoki ENS namespace

The current application uses **`kanoki.eth` on the ENSv2 Sepolia test deployment**. This registration does not establish ownership of `kanoki.eth` on Ethereum mainnet. Current addresses, registration receipts and expiry are in `deployments/usdc-sepolia.json`.

## Who can issue a vault name?

1. The deployment wallet registers `kanoki.eth` in the ENSv2 ETHRegistry.
2. It attaches the controller's ProjectRegistry as the namespace's subregistry.
3. The ProjectRegistry is a ManagedRegistry derived from ENSv2 PermissionedRegistry. Its constructor grants the controller the root registrar role and finance-role administration.
4. A user signs `CapitalController.createRoot(label, policy)` with their own wallet. After checking the ENS anchor and policy, the controller deploys an independent vault and child registry and calls `ProjectRegistry.register` with that user's address as name owner. The same address is recorded as the vault's root owner.
5. Agent delegation is gated by ENS finance roles plus the controller's inherited policy checks. The domain owner's private key is not involved in each root or child creation.

Example: root `my-team.kanoki.eth`, child `researcher.my-team.kanoki.eth`. Owning a root does not give a user permission to register names for someone else's tree.

## Where is the key?

Namespace setup scripts use the encrypted local deployment keystore outside Git, under `~/.agent-capital-tree/keys/`. The keystore and its local password file have owner-only permissions. The website does not require that private key in Vercel environment variables. Users sign their own wallet transactions; companion operators use their own scoped keys.

The namespace wallet still controls the parent ENS registration and its subregistry link, including renewal. Changing the link or allowing expiry can block normal agent actions. Owner recovery is separately implemented and does not depend on the ENS anchor. This is an administrative dependency, not an immutable namespace guarantee.

## Prototype cutover

The app and capital MCP use the new deployment only. Earlier vaults are not imported or renamed, and their funds are not moved. Historical manifests and receipts remain evidence of previous prototypes; their root IDs, names, payments and LP positions must not be attributed to the new controller. Old-controller names and vault addresses are rejected by current lookup.
