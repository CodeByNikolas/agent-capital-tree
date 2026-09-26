// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {CapitalVault} from "./CapitalVault.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

interface IPositionManagerPermit2 {
    function permit2() external view returns (IAllowanceTransfer);
}

/// @notice Atomically deploys and initializes non-upgradeable EIP-1167 vault clones.
contract VaultFactory {
    error InvalidPool();

    IPoolManager public immutable POOL_MANAGER;
    IERC20 public immutable TOKEN0;
    IERC20 public immutable TOKEN1;
    IPositionManager public immutable POSITION_MANAGER;
    IAllowanceTransfer public immutable PERMIT2;
    CapitalVault public immutable IMPLEMENTATION;

    constructor(
        IPoolManager poolManager,
        IPositionManager positionManager,
        IAllowanceTransfer permit2,
        IERC20[2] memory tokens
    ) {
        if (
            address(poolManager).code.length == 0 || address(tokens[0]) == address(0)
                || address(tokens[0]) >= address(tokens[1]) || address(positionManager).code.length == 0
                || address(permit2).code.length == 0 || positionManager.poolManager() != poolManager
                || IPositionManagerPermit2(address(positionManager)).permit2() != permit2
        ) revert InvalidPool();
        POOL_MANAGER = poolManager;
        POSITION_MANAGER = positionManager;
        PERMIT2 = permit2;
        TOKEN0 = tokens[0];
        TOKEN1 = tokens[1];
        IMPLEMENTATION = new CapitalVault(poolManager, positionManager, permit2, tokens[0], tokens[1]);
    }

    function createVault(address controller) external returns (CapitalVault vault) {
        vault = CapitalVault(Clones.clone(address(IMPLEMENTATION)));
        vault.initialize(controller);
    }
}
