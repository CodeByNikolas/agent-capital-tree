// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PermissionedRegistry} from "ens-v2/registry/PermissionedRegistry.sol";
import {ERC1155Singleton} from "ens-v2/erc1155/ERC1155Singleton.sol";
import {IRegistry} from "ens-v2/registry/interfaces/IRegistry.sol";
import {RegistryRolesLib} from "ens-v2/registry/libraries/RegistryRolesLib.sol";
import {ILabelStore} from "ens-v2/utils/interfaces/ILabelStore.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {FinanceRoles} from "./FinanceRoles.sol";

/// @notice ENSv2 registry for controller-managed finance names.
/// @dev The controller must gate its root admin powers by the user's tree authority.
contract ManagedRegistry is PermissionedRegistry {
    error ManagedNameLocked();

    uint256 public constant DELEGATE = FinanceRoles.DELEGATE;
    uint256 public constant SWAP = FinanceRoles.SWAP;
    uint256 public constant MANAGE_LP = FinanceRoles.MANAGE_LP;
    uint256 public constant COLLECT_FEES = FinanceRoles.COLLECT_FEES;
    uint256 public constant EXIT_LP = FinanceRoles.EXIT_LP;
    uint256 public constant RESTRICT = FinanceRoles.RESTRICT;
    uint256 public constant RECLAIM = FinanceRoles.RECLAIM;
    uint256 public constant PAY = FinanceRoles.PAY;

    uint256 private constant FINANCE_ADMIN = FinanceRoles.KNOWN << 128;

    constructor(ILabelStore labelStore, address controller, IRegistry parent, string memory label)
        PermissionedRegistry(labelStore, controller, RegistryRolesLib.ROLE_REGISTRAR | FINANCE_ADMIN)
    {
        _parentRegistry = parent;
        _childLabel = label;
        emit ParentUpdated(parent, label, msg.sender);
    }

    /// @dev Initial roles are assigned separately to the agent on this name's EAC resource.
    function register(
        string memory label,
        address owner,
        IRegistry registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) public override returns (uint256) {
        if (roleBitmap != 0) revert ManagedNameLocked();
        return super.register(label, owner, registry, resolver, 0, expiry);
    }

    /// @dev Child links are assigned only during register; an existing link cannot be replaced.
    function setSubregistry(uint256, IRegistry) public pure override {
        revert ManagedNameLocked();
    }

    /// @dev Resolver changes cannot alter the canonical finance name after registration.
    function setResolver(uint256, address) public pure override {
        revert ManagedNameLocked();
    }

    /// @dev Generic ERC1155 approval would make the operator inherit the owner's EAC roles.
    function setApprovalForAll(address, bool) public pure override(ERC1155Singleton, IERC1155) {
        revert ManagedNameLocked();
    }

    function safeTransferFrom(address, address, uint256, uint256, bytes memory)
        public
        pure
        override(ERC1155Singleton, IERC1155)
    {
        revert ManagedNameLocked();
    }

    function safeBatchTransferFrom(address, address, uint256[] memory, uint256[] memory, bytes memory)
        public
        pure
        override(ERC1155Singleton, IERC1155)
    {
        revert ManagedNameLocked();
    }
}
