# ENSv2 Sepolia feasibility gate

Pinned source: [`ensdomains/contracts-v2` at `48b3e2d`](https://github.com/ensdomains/contracts-v2/tree/48b3e2d39513b9dd32ef1850877a29009bc807b9). The contracts in `lib/ens-contracts-v2` are this commit; OpenZeppelin Contracts is pinned to the exact commit used by that source (`e4f7021`).

## Read-only Sepolia evidence

The pinned source's `contracts/deployments/sepolia/*.json` gives the addresses below. On 25 September 2026, `eth_chainId` at `https://ethereum-sepolia.publicnode.com` returned `11155111`, and `eth_getCode` returned nonempty code at each address. Its bytes match the artifact `deployedBytecode` exactly outside the artifact's declared `immutableReferences` (the immutable constructor values differ as expected).

| Contract | Address | Runtime bytes |
| --- | --- | ---: |
| RootRegistry | `0x11b5bfbe9078d826b1edbdd1cfc12f5828d9f50c` | 14,711 |
| ETHRegistry | `0x67b728a792e789a8978b30cf1b3b641f19354b43` | 14,711 |
| ETHRegistrar | `0xa4449a0dd2b83007553d9b1d28b583a46a805a30` | 7,472 |
| UserRegistryImpl | `0x840fa461059862ea466a711e8c98c8de732061c0` | 17,140 |
| VerifiableFactory | `0x118bc31a50d559f7015a8da26d54b3b030cdb70f` | 1,403 |

These are source and deployed-bytecode compatibility checks, not a transaction or namespace ownership proof.

Additional live `eth_call` checks: `RootRegistry.getSubregistry("eth")` returned the pinned ETHRegistry; `ETHRegistrar.MIN_COMMITMENT_AGE()` returned 60 seconds. `ETHRegistrar.isAvailable("agentcapitaltree")` returned `true` at query time. The tentative `agentcapitaltree.eth` label is not reserved. A one-year price query using the deployed MockUSDC (`0xd3322b29a7bdee707d1684676f149bf41aa3422f`) returned 8,005,501 raw token units base and zero premium; any later registration must re-query price and availability.

## Registration path and ABI

The [ETHRegistrar source](https://github.com/ensdomains/contracts-v2/blob/48b3e2d39513b9dd32ef1850877a29009bc807b9/contracts/src/registrar/ETHRegistrar.sol) requires `commit(bytes32)` followed, after `MIN_COMMITMENT_AGE`, by `register(string label,address owner,bytes32 secret,IRegistry subregistry,address resolver,uint64 duration,IERC20 paymentToken,bytes32 referrer)`. Its commitment binds all registration parameters. It registers the `.eth` name into ETHRegistry and grants the owner the ability to choose a subregistry. Thus the project must first acquire and attach a verified `.eth` namespace. This cannot occur in one transaction with initial `.eth` registration. Project namespace label, ownership, expiry, and attachment remain unverified.

Once attached, the controller can create user roots atomically under a project registry. [PermissionedRegistry.register](https://github.com/ensdomains/contracts-v2/blob/48b3e2d39513b9dd32ef1850877a29009bc807b9/contracts/src/registry/PermissionedRegistry.sol) has ABI `register(string label,address owner,IRegistry subregistry,address resolver,uint256 roleBitmap,uint64 expiry) returns (uint256 tokenId)`; it writes the child registry link and initial owner roles in the same call. To make the child's canonical path explicit, the controller also calls `child.setParent(parentRegistry,label)` in the same transaction. The [official fixture](https://github.com/ensdomains/contracts-v2/blob/48b3e2d39513b9dd32ef1850877a29009bc807b9/contracts/test/integration/fixtures/deployV2Fixture.ts) demonstrates registry nesting. Registration can then be checked with `getState(labelhash)` returning `(status,expiry,latestOwner,tokenId,resource)`, `getSubregistry(label)`, and `getParent()`.

Resource generation changes on unregister/re-register, whereas role changes regenerate the token ID without changing the resource. Controller node records must bind the **resource**, not the token ID. `hasRoles(resource,role,account)` checks both the resource and `ROOT_RESOURCE`; [EAC source](https://github.com/ensdomains/contracts-v2/blob/48b3e2d39513b9dd32ef1850877a29009bc807b9/contracts/src/access-control/EnhancedAccessControl.sol) does not inherit roles from a parent registry. The controller must check each relevant ancestor itself. Ordinary finance roles must never be granted at `ROOT_RESOURCE`.

[PermissionedRegistry's role lookup](https://github.com/ensdomains/contracts-v2/blob/48b3e2d39513b9dd32ef1850877a29009bc807b9/contracts/src/registry/PermissionedRegistry.sol) treats an ERC1155 operator approved by the token owner as having that owner's resource roles. `ManagedRegistry` disables generic approval, subregistry replacement, and resolver replacement. It grants only registration, parent setup, and **finance admin** roles to its immutable controller. It grants no ordinary finance, token transfer, upgrade, or registry-wide name mutation role to users. The controller must enforce authorization before using its admin powers.

`ManagedRegistry` also disables both ERC1155 transfer methods and rejects registration with an initial role bitmap. The controller must assign ordinary finance roles to the agent via `grantRoles(resource,bitmap,agent)` after registration, in the same transaction.

## Controller interface proposed for P3

`createRoot(label,owner,operator,policy,operationKey)` and `spawnChild(parentId,label,agent,policy,operationKey)` should deploy a `ManagedRegistry`, call `setParent`, register the label in the parent registry with that child as `subregistry`, snapshot `getState(...).resource`, assign finance roles via `grantRoles(resource,bitmap,agent)`, persist the node, and fund its Vault in one transaction. `operationKey` is scoped to root, parent, and operator authority generation to make retries idempotent. Each normal action should verify registered status, the stored resource, the `getSubregistry`/`getParent` chain, the actor's local EAC role, and the bounded ancestor policy. This is an interface proposal; no capital controller is implemented in this gate.

The owner emergency exit specified in `PLAN.md` must avoid ENS queries entirely. A revoked, expired, or detached name must fail closed for normal actions but leave fixed recipient recovery possible.

## Remaining gate work

- Choose/acquire a project `.eth` label and prove its ETHRegistry ownership, expiry, and subregistry link with read-only calls, then an authorized registration transaction.
- Test namespace attachment and root registration on Sepolia with receipts after deployment and funding. Local Foundry tests establish ABI behavior only.
- Review the controller's exact public methods so its registry root authority cannot become a finance backdoor.

## Local reproduction

Run `pnpm install --ignore-scripts --frozen-lockfile` in `contracts/`, then `forge test` there using Foundry v1.8.3. The repo pins `solc@0.8.26` from npm and uses a small `--standard-json` wrapper in `scripts/` because Foundry could not fetch a native Linux ARM64 solc on HomeBox. No dependency install scripts are needed. On 25 September 2026, 4 Foundry tests passed (nested registration and resource roles, approval/retargeting/transfer rejection, initial admin-role rejection, and expiry/re-registration invalidation).
