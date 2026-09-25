// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IRegistry} from "ens-v2/registry/interfaces/IRegistry.sol";
import {ILabelStore} from "ens-v2/utils/interfaces/ILabelStore.sol";
import {ManagedRegistry} from "./ens/ManagedRegistry.sol";
import {CapitalVault} from "./CapitalVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {FixedPool} from "./uniswap/FixedPool.sol";
import {VaultFactory} from "./VaultFactory.sol";

/// @notice Deploys one registry and one vault per node without embedding their creation code in the controller.
contract NodeFactory {
    error InvalidPool();

    IPoolManager public immutable POOL_MANAGER;
    IERC20 public immutable TOKEN0;
    IERC20 public immutable TOKEN1;
    bytes32 public immutable POOL_ID;
    VaultFactory public immutable VAULT_FACTORY;

    constructor(VaultFactory vaultFactory) {
        if (address(vaultFactory) == address(0)) revert InvalidPool();
        VAULT_FACTORY = vaultFactory;
        POOL_MANAGER = vaultFactory.POOL_MANAGER();
        TOKEN0 = vaultFactory.TOKEN0();
        TOKEN1 = vaultFactory.TOKEN1();
        POOL_ID = FixedPool.id(address(TOKEN0), address(TOKEN1));
    }

    function createRegistry(ILabelStore labelStore, IRegistry parent, string calldata label)
        external
        returns (ManagedRegistry)
    {
        return new ManagedRegistry(labelStore, msg.sender, parent, label);
    }

    function createVault() external returns (CapitalVault) {
        return VAULT_FACTORY.createVault(msg.sender);
    }
}
