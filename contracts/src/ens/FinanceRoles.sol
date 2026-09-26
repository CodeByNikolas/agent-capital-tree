// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice ENSv2 EAC role bits reserved for finance actions in managed registries.
library FinanceRoles {
    uint256 internal constant DELEGATE = 1 << 40;
    uint256 internal constant SWAP = 1 << 44;
    uint256 internal constant MANAGE_LP = 1 << 48;
    uint256 internal constant COLLECT_FEES = 1 << 52;
    uint256 internal constant EXIT_LP = 1 << 56;
    uint256 internal constant RESTRICT = 1 << 60;
    uint256 internal constant RECLAIM = 1 << 64;
    uint256 internal constant PAY = 1 << 68;
    uint256 internal constant ALL = DELEGATE | SWAP | MANAGE_LP | COLLECT_FEES | EXIT_LP | RESTRICT | RECLAIM;
    uint256 internal constant KNOWN = ALL | PAY;
}
