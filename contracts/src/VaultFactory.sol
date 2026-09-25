// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {CapitalVault} from "./CapitalVault.sol";

/// @notice Holds vault creation code outside NodeFactory's EIP-170 runtime limit.
contract VaultFactory {
    error InvalidPool();

    IPoolManager public immutable POOL_MANAGER;
    IERC20 public immutable TOKEN0;
    IERC20 public immutable TOKEN1;

    constructor(IPoolManager poolManager, IERC20[2] memory tokens) {
        if (
            address(poolManager) == address(0) || address(tokens[0]) == address(0)
                || address(tokens[0]) >= address(tokens[1])
        ) revert InvalidPool();
        POOL_MANAGER = poolManager;
        TOKEN0 = tokens[0];
        TOKEN1 = tokens[1];
    }

    function createVault(address controller) external returns (CapitalVault) {
        return new CapitalVault(controller, POOL_MANAGER, TOKEN0, TOKEN1);
    }
}
