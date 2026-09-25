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
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IPositionDescriptor} from "@uniswap/v4-periphery/src/interfaces/IPositionDescriptor.sol";
import {IWETH9} from "@uniswap/v4-periphery/src/interfaces/external/IWETH9.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {CapitalController} from "../src/CapitalController.sol";
import {NodeFactory} from "../src/NodeFactory.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {FinanceRoles} from "../src/ens/FinanceRoles.sol";
import {FixedPool} from "../src/uniswap/FixedPool.sol";

contract ExitLabels is ILabelStore {
    function setLabel(string calldata) external {}

    function getLabel(uint256) external pure returns (string memory) {
        return "";
    }
}

contract ExitToken is ERC20 {
    constructor(string memory symbol) ERC20(symbol, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ExitPermit2 {
    mapping(address => mapping(address => mapping(address => uint160))) private approvals;

    function approve(address token, address spender, uint160 amount, uint48) external {
        approvals[msg.sender][token][spender] = amount;
    }

    function transferFrom(address from, address to, uint160 amount, address token) external {
        require(approvals[from][token][msg.sender] >= amount);
        approvals[from][token][msg.sender] -= amount;
        IERC20(token).transferFrom(from, to, amount);
    }
}

contract CapitalOwnerExitTest is Test {
    address private constant OWNER = address(0xB0B);
    address private constant AGENT = address(0xA01);
    address private constant NAMESPACE_OWNER = address(0xCAFE);
    PermissionedRegistry private ethRegistry;
    CapitalController private controller;
    ExitToken private a;
    ExitToken private b;
    IRegistry private projectRegistry;
    CapitalController.Policy private policy;
    uint256 private rootId;

    function setUp() public {
        ILabelStore labels = new ExitLabels();
        ethRegistry = PermissionedRegistry(
            deployCode(
                "PermissionedRegistry.sol:PermissionedRegistry",
                abi.encode(labels, address(this), RegistryRolesLib.ROLE_REGISTRAR)
            )
        );
        ethRegistry.register(
            "project",
            NAMESPACE_OWNER,
            IRegistry(address(0)),
            address(0),
            RegistryRolesLib.ROLE_SET_SUBREGISTRY,
            uint64(block.timestamp + 100 days)
        );

        a = new ExitToken("A");
        b = new ExitToken("B");
        if (address(a) > address(b)) (a, b) = (b, a);
        IERC20[2] memory tokens = [IERC20(address(a)), IERC20(address(b))];
        IPoolManager poolManager = IPoolManager(deployCode("PoolManager.sol:PoolManager", abi.encode(address(this))));
        poolManager.initialize(FixedPool.key(address(a), address(b)), 1 << 96);
        ExitPermit2 permit2 = new ExitPermit2();
        IPositionManager posm = IPositionManager(
            deployCode(
                "PositionManager.sol:PositionManager",
                abi.encode(
                    IPoolManager(address(poolManager)),
                    IAllowanceTransfer(address(permit2)),
                    100_000,
                    IPositionDescriptor(address(0x111)),
                    IWETH9(address(0x222))
                )
            )
        );
        VaultFactory vaultFactory = VaultFactory(
            deployCode(
                "VaultFactory.sol:VaultFactory",
                abi.encode(poolManager, posm, IAllowanceTransfer(address(permit2)), tokens)
            )
        );
        NodeFactory nodeFactory = NodeFactory(deployCode("NodeFactory.sol:NodeFactory", abi.encode(vaultFactory)));
        controller = CapitalController(
            deployCode(
                "CapitalController.sol:CapitalController",
                abi.encode(
                    IPermissionedRegistry(address(ethRegistry)),
                    labels,
                    nodeFactory,
                    tokens,
                    "project",
                    nodeFactory.POOL_ID()
                )
            )
        );
        projectRegistry = controller.PROJECT_REGISTRY();
        vm.prank(NAMESPACE_OWNER);
        ethRegistry.setSubregistry(uint256(keccak256("project")), projectRegistry);

        policy = CapitalController.Policy({
            capabilities: FinanceRoles.ALL,
            maxAmounts: [uint256(50 ether), uint256(50 ether)],
            expiry: uint64(block.timestamp + 30 days),
            tokenMask: 3,
            poolId: nodeFactory.POOL_ID()
        });
        vm.prank(OWNER);
        rootId = controller.createRoot("bob", policy);
        vm.prank(OWNER);
        controller.setRootOperator(rootId, AGENT, policy);
        a.mint(OWNER, 100 ether);
        b.mint(OWNER, 100 ether);
        vm.startPrank(OWNER);
        a.approve(address(controller), 100 ether);
        b.approve(address(controller), 100 ether);
        controller.fundRoot(rootId, [uint256(100 ether), uint256(100 ether)]);
        vm.stopPrank();
    }

    function testOwnerClosesPositionAfterEnsDetachAndRecoversAssets() public {
        CapitalController.Policy memory childPolicy = policy;
        childPolicy.maxAmounts = [uint256(40 ether), uint256(40 ether)];
        vm.prank(AGENT);
        uint256 childId = controller.spawnChild(
            rootId, "child", address(0xA02), childPolicy, [uint256(40 ether), uint256(40 ether)], bytes32(uint256(1))
        );
        CapitalController.Policy memory siblingPolicy = policy;
        siblingPolicy.maxAmounts = [uint256(1 ether), uint256(1 ether)];
        vm.prank(AGENT);
        uint256 siblingId = controller.spawnChild(
            rootId, "sibling", address(0xA03), siblingPolicy, [uint256(1 ether), uint256(1 ether)], bytes32(uint256(2))
        );
        vm.prank(AGENT);
        uint256 parentTarget = controller.spawnChild(
            rootId,
            "parenttarget",
            address(0xA04),
            childPolicy,
            [uint256(40 ether), uint256(40 ether)],
            bytes32(uint256(3))
        );
        vm.prank(address(0xA04));
        controller.openPosition(parentTarget, 1000 ether, [uint128(40 ether), uint128(40 ether)], block.timestamp);
        vm.prank(AGENT);
        controller.parentClosePosition(rootId, parentTarget, [uint128(0), uint128(0)], block.timestamp);
        assertTrue(controller.getNode(parentTarget).revoked);
        vm.prank(address(0xA04));
        vm.expectRevert(CapitalController.Inactive.selector);
        controller.openPosition(parentTarget, 1000 ether, [uint128(40 ether), uint128(40 ether)], block.timestamp);
        controller.checkAction(siblingId, FinanceRoles.SWAP, address(0xA03), 0, 1);
        vm.prank(AGENT);
        controller.reclaimAssets(rootId, parentTarget);
        vm.prank(address(0xA02));
        uint256 id =
            controller.openPosition(childId, 1000 ether, [uint128(40 ether), uint128(40 ether)], block.timestamp);
        assertEq(controller.getNode(childId).vault.positionTokenId(), id);

        vm.prank(NAMESPACE_OWNER);
        ethRegistry.setSubregistry(uint256(keccak256("project")), IRegistry(address(0)));
        vm.prank(address(0xA02));
        vm.expectRevert(CapitalController.InvalidPath.selector);
        controller.closePosition(childId, [uint128(0), uint128(0)], block.timestamp);
        vm.prank(OWNER);
        vm.expectRevert(CapitalController.InvalidInput.selector);
        controller.ownerEmergencyRecover(childId);
        vm.prank(OWNER);
        controller.ownerEmergencyClosePosition(childId, [uint128(0), uint128(0)], block.timestamp);
        assertTrue(controller.getNode(childId).revoked);
        vm.prank(NAMESPACE_OWNER);
        ethRegistry.setSubregistry(uint256(keccak256("project")), projectRegistry);
        vm.prank(address(0xA02));
        vm.expectRevert(CapitalController.Inactive.selector);
        controller.openPosition(childId, 1000 ether, [uint128(40 ether), uint128(40 ether)], block.timestamp);
        controller.checkAction(siblingId, FinanceRoles.SWAP, address(0xA03), 0, 1);
        vm.prank(OWNER);
        controller.ownerEmergencyRecover(childId);
        assertEq(a.balanceOf(address(controller.getNode(childId).vault)), 0);
        assertEq(b.balanceOf(address(controller.getNode(childId).vault)), 0);
        vm.prank(OWNER);
        controller.ownerEmergencyRecover(rootId);
        assertEq(a.balanceOf(address(controller.getNode(rootId).vault)), 0);
        assertEq(b.balanceOf(address(controller.getNode(rootId).vault)), 0);
        assertGt(a.balanceOf(OWNER), 0);
        assertGt(b.balanceOf(OWNER), 0);
    }
}
