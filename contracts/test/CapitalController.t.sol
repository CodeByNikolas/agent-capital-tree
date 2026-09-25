// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPermissionedRegistry} from "ens-v2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "ens-v2/registry/interfaces/IRegistry.sol";
import {PermissionedRegistry} from "ens-v2/registry/PermissionedRegistry.sol";
import {RegistryRolesLib} from "ens-v2/registry/libraries/RegistryRolesLib.sol";
import {ILabelStore} from "ens-v2/utils/interfaces/ILabelStore.sol";
import {CapitalController} from "../src/CapitalController.sol";
import {CapitalVault} from "../src/CapitalVault.sol";
import {NodeFactory} from "../src/NodeFactory.sol";
import {FinanceRoles} from "../src/ens/FinanceRoles.sol";

contract TestLabelStore is ILabelStore {
    function setLabel(string calldata) external {}

    function getLabel(uint256) external pure returns (string memory) {
        return "";
    }
}

contract TestToken is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract CapitalControllerTest is Test {
    CapitalController internal controller;
    PermissionedRegistry internal ethRegistry;
    TestToken internal token0;
    TestToken internal token1;
    address internal owner = address(0xB0B);
    address internal namespaceOwner = address(0xCAFE);
    address internal rootAgent = address(0xA01);
    address internal childAgent = address(0xA02);
    address internal grandchildAgent = address(0xA03);
    uint256 internal rootId;

    function setUp() public {
        ILabelStore labels = new TestLabelStore();
        ethRegistry = PermissionedRegistry(
            deployCode(
                "PermissionedRegistry.sol:PermissionedRegistry",
                abi.encode(labels, address(this), RegistryRolesLib.ROLE_REGISTRAR)
            )
        );
        ethRegistry.register(
            "project",
            namespaceOwner,
            IRegistry(address(0)),
            address(0),
            RegistryRolesLib.ROLE_SET_SUBREGISTRY,
            uint64(block.timestamp + 100 days)
        );
        token0 = new TestToken("Demo A", "A");
        token1 = new TestToken("Demo B", "B");
        IERC20[2] memory tokens = [IERC20(address(token0)), IERC20(address(token1))];
        NodeFactory factory = NodeFactory(deployCode("NodeFactory.sol:NodeFactory"));
        controller = CapitalController(
            deployCode(
                "CapitalController.sol:CapitalController",
                abi.encode(ethRegistry, labels, factory, tokens, "project", bytes32(uint256(7)))
            )
        );
        IRegistry projectRegistry = controller.PROJECT_REGISTRY();
        vm.prank(namespaceOwner);
        ethRegistry.setSubregistry(uint256(keccak256("project")), projectRegistry);

        vm.prank(owner);
        rootId = controller.createRoot("bob", _policy(FinanceRoles.ALL, 3, 100));
        vm.prank(owner);
        controller.setRootOperator(rootId, rootAgent, _policy(FinanceRoles.ALL, 3, 100));
        token0.mint(owner, 1000);
        token1.mint(owner, 1000);
        vm.startPrank(owner);
        token0.approve(address(controller), 1000);
        token1.approve(address(controller), 1000);
        controller.fundRoot(rootId, [uint256(500), uint256(500)]);
        vm.stopPrank();
    }

    function testAtomicSpawnCustodyAndIdempotency() public {
        CapitalController.Policy memory childPolicy = _policy(FinanceRoles.DELEGATE | FinanceRoles.RECLAIM, 1, 50);
        uint256[2] memory amounts = [uint256(40), uint256(0)];
        vm.prank(rootAgent);
        uint256 childId = controller.spawnChild(rootId, "child", childAgent, childPolicy, amounts, bytes32(uint256(1)));
        CapitalController.Node memory root = controller.getNode(rootId);
        CapitalController.Node memory child = controller.getNode(childId);
        assertEq(token0.balanceOf(address(root.vault)), 460);
        assertEq(token0.balanceOf(address(child.vault)), 40);
        assertEq(token1.balanceOf(address(root.vault)), 500);
        assertEq(address(root.childRegistry.getSubregistry("child")), address(child.childRegistry));
        assertEq(child.generation, controller.rootGeneration(rootId));

        vm.prank(rootAgent);
        assertEq(controller.spawnChild(rootId, "child", childAgent, childPolicy, amounts, bytes32(uint256(1))), childId);
        assertEq(controller.rootNodeCount(rootId), 2);
        uint256[] memory ids = controller.getRootNodeIds(rootId);
        assertEq(ids.length, 2);
        assertEq(ids[0], rootId);
        assertEq(ids[1], childId);
        assertEq(token0.balanceOf(address(child.vault)), 40);

        vm.prank(rootAgent);
        vm.expectRevert(CapitalController.OperationConflict.selector);
        controller.spawnChild(rootId, "child", childAgent, childPolicy, [uint256(41), uint256(0)], bytes32(uint256(1)));
        vm.prank(childAgent);
        vm.expectRevert(CapitalVault.OnlyController.selector);
        child.vault.transferToken(token0, childAgent, 1);
    }

    function testInheritedLimitsAndRevocationStopDescendants() public {
        uint256 childId = _spawn(rootId, "child", childAgent, _policy(FinanceRoles.ALL, 1, 60), 40);
        uint256 grandchildId = _spawn(childId, "grandchild", grandchildAgent, _policy(FinanceRoles.DELEGATE, 1, 30), 20);
        vm.prank(childAgent);
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.allocateCapital(childId, grandchildId, [uint256(61), uint256(0)]);

        vm.prank(owner);
        controller.tightenPolicy(rootId, _policy(FinanceRoles.ALL, 1, 15));
        vm.prank(childAgent);
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.allocateCapital(childId, grandchildId, [uint256(16), uint256(0)]);

        vm.prank(rootAgent);
        controller.revokeSubtree(childId);
        vm.prank(childAgent);
        vm.expectRevert(CapitalController.Inactive.selector);
        controller.allocateCapital(childId, grandchildId, [uint256(1), uint256(0)]);
    }

    function testNormalReclaimIsBoundToParent() public {
        uint256 childId = _spawn(rootId, "child", childAgent, _policy(FinanceRoles.ALL, 1, 50), 40);
        CapitalController.Node memory root = controller.getNode(rootId);
        CapitalController.Node memory child = controller.getNode(childId);
        vm.prank(childAgent);
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.reclaimAssets(rootId, childId);
        vm.prank(rootAgent);
        controller.reclaimAssets(rootId, childId);
        assertEq(token0.balanceOf(address(root.vault)), 500);
        assertEq(token0.balanceOf(address(child.vault)), 0);
        assertTrue(controller.getNode(childId).revoked);
    }

    function testParentCanReclaimAfterChildNameExpires() public {
        CapitalController.Policy memory childPolicy = _policy(FinanceRoles.ALL, 1, 50);
        childPolicy.expiry = uint64(block.timestamp + 1 days);
        uint256 childId = _spawn(rootId, "short", childAgent, childPolicy, 40);
        vm.warp(block.timestamp + 1 days);
        vm.prank(rootAgent);
        controller.reclaimAssets(rootId, childId);
        CapitalController.Node memory root = controller.getNode(rootId);
        assertEq(token0.balanceOf(address(root.vault)), 500);
    }

    function testOperatorRotationInvalidatesOldChildrenButNewSpawnWorks() public {
        uint256 childId = _spawn(rootId, "old", childAgent, _policy(FinanceRoles.ALL, 1, 50), 40);
        address newOperator = address(0xA04);
        vm.prank(owner);
        controller.setRootOperator(rootId, newOperator, _policy(FinanceRoles.ALL, 3, 100));
        vm.prank(childAgent);
        vm.expectRevert(CapitalController.Inactive.selector);
        controller.allocateCapital(childId, childId, [uint256(1), uint256(0)]);
        uint256 newChild = _spawnAs(newOperator, rootId, "new", address(0xA05), _policy(FinanceRoles.ALL, 1, 50), 20);
        assertTrue(newChild > childId);
        vm.prank(rootAgent);
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.spawnChild(
            rootId,
            "bad",
            address(0xA06),
            _policy(FinanceRoles.ALL, 1, 50),
            [uint256(1), uint256(0)],
            bytes32(uint256(99))
        );
    }

    function testDetachedNamespaceBlocksNormalActionButOwnerRecovers() public {
        uint256 childId = _spawn(rootId, "child", childAgent, _policy(FinanceRoles.ALL, 1, 50), 40);
        vm.prank(namespaceOwner);
        ethRegistry.setSubregistry(uint256(keccak256("project")), IRegistry(address(0)));
        vm.prank(rootAgent);
        vm.expectRevert(CapitalController.InvalidPath.selector);
        controller.allocateCapital(rootId, childId, [uint256(1), uint256(0)]);
        vm.prank(owner);
        controller.ownerEmergencyRecover(childId);
        vm.prank(owner);
        controller.ownerEmergencyRecover(rootId);
        assertEq(token0.balanceOf(owner), 1000);
        assertEq(token1.balanceOf(owner), 1000);
    }

    function testDepthAndDirectCallerEnforced() public {
        uint256 childId = _spawn(rootId, "child", childAgent, _policy(FinanceRoles.ALL, 1, 50), 40);
        uint256 grandchildId = _spawn(childId, "grandchild", grandchildAgent, _policy(FinanceRoles.ALL, 1, 30), 20);
        vm.prank(grandchildAgent);
        vm.expectRevert(CapitalController.InvalidInput.selector);
        controller.spawnChild(
            grandchildId,
            "fourth",
            address(0xA04),
            _policy(FinanceRoles.ALL, 1, 20),
            [uint256(1), uint256(0)],
            bytes32(uint256(4))
        );
        vm.prank(address(0xBAD));
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.allocateCapital(rootId, childId, [uint256(1), uint256(0)]);
    }

    function _spawn(
        uint256 parentId,
        string memory label,
        address agent,
        CapitalController.Policy memory policy,
        uint256 amount
    ) internal returns (uint256) {
        return _spawnAs(parentId == rootId ? rootAgent : childAgent, parentId, label, agent, policy, amount);
    }

    function _spawnAs(
        address actor,
        uint256 parentId,
        string memory label,
        address agent,
        CapitalController.Policy memory policy,
        uint256 amount
    ) internal returns (uint256) {
        vm.prank(actor);
        return controller.spawnChild(parentId, label, agent, policy, [amount, uint256(0)], keccak256(bytes(label)));
    }

    function _policy(uint256 capabilities, uint8 tokenMask, uint256 maxAmount)
        internal
        view
        returns (CapitalController.Policy memory p)
    {
        p.capabilities = capabilities;
        p.maxAmounts = [maxAmount, tokenMask & 2 == 0 ? 0 : maxAmount];
        p.expiry = uint64(block.timestamp + 30 days);
        p.tokenMask = tokenMask;
        p.poolId = bytes32(uint256(7));
    }
}
