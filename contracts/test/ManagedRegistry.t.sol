// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ManagedRegistry} from "../src/ens/ManagedRegistry.sol";
import {IRegistry} from "ens-v2/registry/interfaces/IRegistry.sol";
import {IPermissionedRegistry} from "ens-v2/registry/interfaces/IPermissionedRegistry.sol";
import {ILabelStore} from "ens-v2/utils/interfaces/ILabelStore.sol";

contract LabelStoreStub is ILabelStore {
    function setLabel(string calldata) external {}

    function getLabel(uint256) external pure returns (string memory) {
        return "";
    }
}

contract ManagedRegistryTest is Test {
    ManagedRegistry internal registry;
    ManagedRegistry internal child;
    address internal agent = address(0xA6E);
    address internal operator = address(0x0B);

    function setUp() public {
        ILabelStore labels = new LabelStoreStub();
        registry = new ManagedRegistry(labels, address(this), IRegistry(address(0xE7)), "project");
        child = new ManagedRegistry(labels, address(this), registry, "alice");
    }

    function testNestedNameAndResourceRoles() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        uint256 tokenId = registry.register("alice", agent, child, address(0), 0, expiry);
        IPermissionedRegistry.State memory state = registry.getState(uint256(keccak256("alice")));

        assertEq(uint256(state.status), uint256(IPermissionedRegistry.Status.REGISTERED));
        assertEq(state.tokenId, tokenId);
        assertEq(state.expiry, expiry);
        assertEq(address(registry.getSubregistry("alice")), address(child));
        (IRegistry parent, string memory label) = child.getParent();
        assertEq(address(parent), address(registry));
        assertEq(label, "alice");

        registry.grantRoles(state.resource, registry.SWAP(), agent);
        assertTrue(registry.hasRoles(state.resource, registry.SWAP(), agent));
        assertFalse(registry.hasRootRoles(registry.SWAP(), agent));
        assertFalse(registry.hasRootRoles(registry.SWAP(), address(this)));
    }

    function testApprovalAndRetargetingFail() public {
        uint256 tokenId = registry.register("alice", agent, child, address(0), 0, uint64(block.timestamp + 1 days));
        vm.startPrank(agent);
        vm.expectRevert(ManagedRegistry.ManagedNameLocked.selector);
        registry.setApprovalForAll(operator, true);
        vm.expectRevert(ManagedRegistry.ManagedNameLocked.selector);
        registry.safeTransferFrom(agent, operator, tokenId, 1, "");
        vm.stopPrank();

        vm.expectRevert(ManagedRegistry.ManagedNameLocked.selector);
        registry.setSubregistry(tokenId, IRegistry(address(0)));
        vm.expectRevert(ManagedRegistry.ManagedNameLocked.selector);
        registry.setResolver(tokenId, operator);
        vm.expectRevert();
        child.setParent(IRegistry(operator), "evil");
    }

    function testRegistrationCannotPregrantAdministrativeRoles() public {
        uint256 role = registry.SWAP() << 128;
        vm.expectRevert(ManagedRegistry.ManagedNameLocked.selector);
        registry.register("alice", agent, child, address(0), role, uint64(block.timestamp + 1 days));
    }

    function testExpiryAndReregistrationInvalidateOldResource() public {
        registry.register("alice", agent, child, address(0), 0, uint64(block.timestamp + 1 days));
        uint256 labelId = uint256(keccak256("alice"));
        uint256 oldResource = registry.getResource(labelId);
        registry.grantRoles(oldResource, registry.SWAP(), agent);

        vm.warp(block.timestamp + 1 days);
        assertEq(address(registry.getSubregistry("alice")), address(0));
        assertEq(uint256(registry.getStatus(labelId)), uint256(IPermissionedRegistry.Status.AVAILABLE));

        registry.register("alice", agent, child, address(0), 0, uint64(block.timestamp + 1 days));
        uint256 newResource = registry.getResource(labelId);
        assertNotEq(newResource, oldResource);
        assertFalse(registry.hasRoles(newResource, registry.SWAP(), agent));
    }
}
