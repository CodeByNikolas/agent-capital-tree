// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IRegistry} from "ens-v2/registry/interfaces/IRegistry.sol";
import {ILabelStore} from "ens-v2/utils/interfaces/ILabelStore.sol";
import {ManagedRegistry} from "./ens/ManagedRegistry.sol";
import {CapitalVault} from "./CapitalVault.sol";

/// @notice Deploys one registry and one vault per node without embedding their creation code in the controller.
contract NodeFactory {
    function createRegistry(ILabelStore labelStore, IRegistry parent, string calldata label)
        external
        returns (ManagedRegistry)
    {
        return new ManagedRegistry(labelStore, msg.sender, parent, label);
    }

    function createVault() external returns (CapitalVault) {
        return new CapitalVault(msg.sender);
    }
}
