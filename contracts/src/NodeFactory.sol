// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IRegistry} from "ens-v2/registry/interfaces/IRegistry.sol";
import {ILabelStore} from "ens-v2/utils/interfaces/ILabelStore.sol";
import {ManagedRegistry} from "./ens/ManagedRegistry.sol";
import {CapitalVault} from "./CapitalVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {FixedPool} from "./uniswap/FixedPool.sol";

/// @notice Deploys one registry and one vault per node without embedding their creation code in the controller.
contract NodeFactory {
    error InvalidPool();

    IPoolManager public immutable POOL_MANAGER;
    IERC20 public immutable TOKEN0;
    IERC20 public immutable TOKEN1;
    bytes32 public immutable POOL_ID;

    constructor(IPoolManager poolManager, IERC20[2] memory tokens) {
        if (
            address(poolManager) == address(0) || address(tokens[0]) == address(0)
                || address(tokens[0]) >= address(tokens[1])
        ) revert InvalidPool();
        POOL_MANAGER = poolManager;
        TOKEN0 = tokens[0];
        TOKEN1 = tokens[1];
        POOL_ID = FixedPool.id(address(tokens[0]), address(tokens[1]));
    }

    function createRegistry(ILabelStore labelStore, IRegistry parent, string calldata label)
        external
        returns (ManagedRegistry)
    {
        return new ManagedRegistry(labelStore, msg.sender, parent, label);
    }

    function createVault() external returns (CapitalVault) {
        return new CapitalVault(msg.sender, POOL_MANAGER, TOKEN0, TOKEN1);
    }
}
