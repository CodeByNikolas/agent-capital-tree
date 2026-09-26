// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IPermissionedRegistry} from "ens-v2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "ens-v2/registry/interfaces/IRegistry.sol";
import {PermissionedRegistry} from "ens-v2/registry/PermissionedRegistry.sol";
import {RegistryRolesLib} from "ens-v2/registry/libraries/RegistryRolesLib.sol";
import {ILabelStore} from "ens-v2/utils/interfaces/ILabelStore.sol";
import {CapitalController} from "../src/CapitalController.sol";
import {CapitalVault} from "../src/CapitalVault.sol";
import {NodeFactory} from "../src/NodeFactory.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {FinanceRoles} from "../src/ens/FinanceRoles.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {PositionManagerConfig, DummyPoolManager, DummyPermit2} from "./utils/PositionManagerConfig.sol";

contract TestLabelStore is ILabelStore {
    function setLabel(string calldata) external {}

    function getLabel(uint256) external pure returns (string memory) {
        return "";
    }
}

contract TestToken is ERC20 {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    bytes32 public immutable DOMAIN_SEPARATOR;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name_)), keccak256(bytes("2")), block.chainid, address(this))
        );
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function authorizationDigest(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        require(block.timestamp > validAfter, "not yet valid");
        require(block.timestamp < validBefore, "expired");
        require(!authorizationState[from][nonce], "authorization used");
        bytes32 digest = authorizationDigest(from, to, value, validAfter, validBefore, nonce);
        (bool success, bytes memory result) =
            from.staticcall(abi.encodeCall(IERC1271.isValidSignature, (digest, signature)));
        require(
            success && result.length >= 32
                && abi.decode(result, (bytes32)) == bytes32(IERC1271.isValidSignature.selector),
            "invalid signature"
        );
        authorizationState[from][nonce] = true;
        _transfer(from, to, value);
    }
}

contract CapitalControllerTest is Test {
    struct TestAuthorization {
        address token;
        address recipient;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        bytes agentSignature;
    }

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
    bytes32 internal poolId;

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
        if (address(token0) > address(token1)) (token0, token1) = (token1, token0);
        IERC20[2] memory tokens = [IERC20(address(token0)), IERC20(address(token1))];
        IPoolManager manager = IPoolManager(address(new DummyPoolManager()));
        IAllowanceTransfer permit2 = IAllowanceTransfer(address(new DummyPermit2()));
        IPositionManager posm = IPositionManager(address(new PositionManagerConfig(manager, permit2)));
        VaultFactory vaultFactory = new VaultFactory(manager, posm, permit2, tokens);
        NodeFactory factory = NodeFactory(deployCode("NodeFactory.sol:NodeFactory", abi.encode(vaultFactory)));
        poolId = factory.POOL_ID();
        controller = CapitalController(
            deployCode(
                "CapitalController.sol:CapitalController",
                abi.encode(ethRegistry, labels, factory, tokens, "project", poolId)
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

    function testSwapEnforcesCallerAndInheritedAmountLimit() public {
        uint256 childId = _spawn(rootId, "trader", childAgent, _policy(FinanceRoles.SWAP, 3, 40), 40);
        vm.prank(address(0xBAD));
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.swap(childId, true, 1, 1, 1, block.timestamp);
        vm.prank(childAgent);
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.swap(childId, true, 41, 1, 1, block.timestamp);
        vm.prank(owner);
        controller.tightenPolicy(rootId, _policy(FinanceRoles.ALL, 3, 20));
        vm.prank(childAgent);
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.swap(childId, true, 21, 1, 1, block.timestamp);
    }

    function testSwapRequiresBothPoolTokensInPolicy() public {
        uint256 onlyToken0 = _spawn(rootId, "only0", childAgent, _policy(FinanceRoles.SWAP, 1, 40), 40);
        uint256 onlyToken1 = _spawn(rootId, "only1", grandchildAgent, _policy(FinanceRoles.SWAP, 2, 40), 1);
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.checkAction(onlyToken0, FinanceRoles.SWAP, childAgent, 0, 1);
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.checkAction(onlyToken1, FinanceRoles.SWAP, grandchildAgent, 1, 1);
        vm.prank(childAgent);
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.swap(onlyToken0, true, 1, 1, 1, block.timestamp);
        vm.prank(grandchildAgent);
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.swap(onlyToken1, false, 1, 1, 1, block.timestamp);
    }

    function testCollectFeesStopsWhenPoolPolicyIsRemoved() public {
        CapitalController.Policy memory tightened = _policy(FinanceRoles.ALL, 3, 100);
        tightened.poolId = bytes32(0);
        vm.prank(owner);
        controller.tightenPolicy(rootId, tightened);
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.checkAction(rootId, FinanceRoles.COLLECT_FEES, rootAgent, 2, 0);
        vm.prank(rootAgent);
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.collectFees(rootId, [uint128(0), uint128(0)], block.timestamp);
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
        vm.expectRevert(CapitalController.Inactive.selector);
        controller.checkAction(childId, FinanceRoles.DELEGATE, childAgent, 2, 0);
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

    function testEIP3009VaultPaymentAndReplayProtection() public {
        _setPayOperator(0xA11CE);
        CapitalController.Node memory root = controller.getNode(rootId);
        (bytes32 digest, bytes memory signature) = _signedNodePayment(root, 1, 0xA11CE);
        TestAuthorization memory payment = _decodePayment(signature);

        // x402 facilitator signature verification is a direct ERC-1271 eth_call, before settlement.
        vm.prank(address(0xFACADE));
        assertTrue(root.vault.isValidSignature(digest, signature) == IERC1271.isValidSignature.selector);

        token0.transferWithAuthorization(
            address(root.vault),
            payment.recipient,
            payment.value,
            payment.validAfter,
            payment.validBefore,
            payment.nonce,
            signature
        );
        assertEq(token0.balanceOf(address(root.vault)), 490);
        assertEq(token0.balanceOf(payment.recipient), payment.value);
        assertTrue(token0.authorizationState(address(root.vault), payment.nonce));

        vm.expectRevert("authorization used");
        token0.transferWithAuthorization(
            address(root.vault),
            payment.recipient,
            payment.value,
            payment.validAfter,
            payment.validBefore,
            payment.nonce,
            signature
        );
    }

    function testEIP3009RejectsMalformedAndMismatchedDigest() public {
        _setPayOperator(0xA11CE);
        CapitalController.Node memory root = controller.getNode(rootId);
        (bytes32 digest, bytes memory signature) = _signedNodePayment(root, 2, 0xA11CE);

        assertTrue(_verifyPayment(token0, root.vault, digest, bytes("malformed")) != IERC1271.isValidSignature.selector);
        assertTrue(
            _verifyPayment(token0, root.vault, bytes32(uint256(digest) ^ 1), signature)
                != IERC1271.isValidSignature.selector
        );
    }

    function testEIP3009RejectsWrongTokenAndFields() public {
        _setPayOperator(0xA11CE);
        CapitalController.Node memory root = controller.getNode(rootId);
        (bytes32 digest, bytes memory signature) = _signedNodePayment(root, 3, 0xA11CE);
        TestAuthorization memory payment = _decodePayment(signature);

        payment.token = address(token1);
        assertTrue(
            _verifyPayment(token0, root.vault, digest, _encodePayment(payment)) != IERC1271.isValidSignature.selector
        );
        payment = _decodePayment(signature);
        payment.value += 1;
        assertTrue(
            _verifyPayment(token0, root.vault, digest, _encodePayment(payment)) != IERC1271.isValidSignature.selector
        );
        payment = _decodePayment(signature);
        payment.recipient = address(0xBAD);
        assertTrue(
            _verifyPayment(token0, root.vault, digest, _encodePayment(payment)) != IERC1271.isValidSignature.selector
        );
        payment.recipient = address(root.vault);
        assertTrue(
            _verifyPayment(token0, root.vault, digest, _encodePayment(payment)) != IERC1271.isValidSignature.selector
        );
    }

    function testEIP3009RejectsWrongSignerAndWrongAuthorizationType() public {
        _setPayOperator(0xA11CE);
        CapitalController.Node memory root = controller.getNode(rootId);
        (bytes32 digest, bytes memory signature) = _signedNodePayment(root, 4, 0xA11CE);
        bytes memory wrongSigner = _resignPayment(signature, digest, 0xBAD);
        assertTrue(_verifyPayment(token0, root.vault, digest, wrongSigner) != IERC1271.isValidSignature.selector);

        bytes32 wrongTypeDigest = keccak256(abi.encode("not TransferWithAuthorization", digest));
        bytes memory wrongType = _resignPayment(signature, wrongTypeDigest, 0xA11CE);
        assertTrue(_verifyPayment(token0, root.vault, digest, wrongType) != IERC1271.isValidSignature.selector);
    }

    function testEIP3009RejectsPaymentAboveLimit() public {
        _setPayOperator(0xA11CE);
        CapitalController.Node memory root = controller.getNode(rootId);
        (bytes32 digest, bytes memory signature) =
            _signedNodePaymentWithExpiry(root, 101, block.timestamp + 1 days, 3, 0xA11CE);
        assertTrue(_verifyPayment(token0, root.vault, digest, signature) != IERC1271.isValidSignature.selector);
    }

    function testEIP3009RejectsAuthorizationPastMandateExpiry() public {
        _setPayOperator(0xA11CE);
        CapitalController.Node memory root = controller.getNode(rootId);
        uint64 expiry = controller.getEffectivePolicy(rootId).expiry;
        (bytes32 digest, bytes memory signature) =
            _signedNodePaymentWithExpiry(root, 10, uint256(expiry) + 1, 4, 0xA11CE);
        assertTrue(_verifyPayment(token0, root.vault, digest, signature) != IERC1271.isValidSignature.selector);
    }

    function testEIP3009RejectsExpiredMandate() public {
        _setPayOperator(0xA11CE);
        CapitalController.Node memory root = controller.getNode(rootId);
        uint64 expiry = controller.getEffectivePolicy(rootId).expiry;
        vm.warp(uint256(expiry) + 1);
        (bytes32 digest, bytes memory signature) =
            _signedNodePaymentWithExpiry(root, 10, uint256(expiry) + 10, 5, 0xA11CE);
        assertTrue(_verifyPayment(token0, root.vault, digest, signature) != IERC1271.isValidSignature.selector);
    }

    function testEIP3009RevocationBlocksExistingChildAuthorization() public {
        uint256 childKey = 0xB01;
        _setPayOperator(0xA11CE);
        uint256 childId = _spawn(rootId, "revoked", vm.addr(childKey), _policy(FinanceRoles.PAY, 1, 50), 40);
        CapitalController.Node memory child = controller.getNode(childId);
        (bytes32 digest, bytes memory signature) = _signedNodePayment(child, 6, childKey);
        assertTrue(_verifyPayment(token0, child.vault, digest, signature) == IERC1271.isValidSignature.selector);

        vm.prank(rootAgent);
        controller.revokeSubtree(childId);
        assertTrue(_verifyPayment(token0, child.vault, digest, signature) != IERC1271.isValidSignature.selector);
    }

    function testEIP3009AncestorPolicyRemovalBlocksExistingChildAuthorization() public {
        uint256 childKey = 0xB02;
        _setPayOperator(0xA11CE);
        uint256 childId = _spawn(rootId, "restricted", vm.addr(childKey), _policy(FinanceRoles.PAY, 1, 50), 40);
        CapitalController.Node memory child = controller.getNode(childId);
        (bytes32 digest, bytes memory signature) = _signedNodePayment(child, 7, childKey);
        assertTrue(_verifyPayment(token0, child.vault, digest, signature) == IERC1271.isValidSignature.selector);

        vm.prank(owner);
        controller.tightenPolicy(rootId, _policy(FinanceRoles.ALL, 3, 100));
        assertTrue(_verifyPayment(token0, child.vault, digest, signature) != IERC1271.isValidSignature.selector);
    }

    function testEIP3009RebindingInvalidatesOldAuthorization() public {
        _setPayOperator(0xA11CE);
        CapitalController.Node memory root = controller.getNode(rootId);
        (bytes32 oldDigest, bytes memory oldSignature) = _signedNodePayment(root, 8, 0xA11CE);
        assertTrue(_verifyPayment(token0, root.vault, oldDigest, oldSignature) == IERC1271.isValidSignature.selector);

        vm.prank(owner);
        controller.setRootOperator(rootId, rootAgent, _policy(FinanceRoles.ALL | FinanceRoles.PAY, 3, 100));
        assertTrue(_verifyPayment(token0, root.vault, oldDigest, oldSignature) != IERC1271.isValidSignature.selector);
    }

    function testEIP3009NewGenerationAcceptsFreshAuthorization() public {
        _setPayOperator(0xA11CE);
        CapitalController.Node memory root = controller.getNode(rootId);
        vm.prank(owner);
        controller.setRootOperator(rootId, rootAgent, _policy(FinanceRoles.ALL | FinanceRoles.PAY, 3, 100));

        root = controller.getNode(rootId);
        (bytes32 newDigest, bytes memory newSignature) = _signedNodePayment(root, 9, 0xA11CE);
        assertTrue(_verifyPayment(token0, root.vault, newDigest, newSignature) == IERC1271.isValidSignature.selector);
    }

    function testTighteningRemovesEacRoleWithoutChangingSibling() public {
        uint256 childId = _spawn(rootId, "child", childAgent, _policy(FinanceRoles.ALL, 1, 50), 40);
        uint256 siblingId = _spawn(rootId, "sibling", address(0xA07), _policy(FinanceRoles.ALL, 3, 50), 40);
        CapitalController.Node memory child = controller.getNode(childId);
        CapitalController.Node memory sibling = controller.getNode(siblingId);
        assertTrue(child.registry.hasRoles(child.resource, FinanceRoles.SWAP, childAgent));
        CapitalController.Policy memory tighter = _policy(FinanceRoles.ALL & ~FinanceRoles.SWAP, 1, 50);
        vm.prank(rootAgent);
        controller.tightenPolicy(childId, tighter);
        assertFalse(child.registry.hasRoles(child.resource, FinanceRoles.SWAP, childAgent));
        assertTrue(sibling.registry.hasRoles(sibling.resource, FinanceRoles.SWAP, address(0xA07)));
        vm.expectRevert(CapitalController.Unauthorized.selector);
        controller.checkAction(childId, FinanceRoles.SWAP, childAgent, 0, 1);
        controller.checkAction(siblingId, FinanceRoles.SWAP, address(0xA07), 0, 1);
    }

    function testResourceReregistrationBlocksOldMandateAndOwnerStillRecovers() public {
        CapitalController.Policy memory shortPolicy = _policy(FinanceRoles.ALL, 1, 50);
        shortPolicy.expiry = uint64(block.timestamp + 1 days);
        uint256 childId = _spawn(rootId, "short", childAgent, shortPolicy, 40);
        CapitalController.Node memory child = controller.getNode(childId);
        vm.warp(block.timestamp + 1 days);
        vm.prank(address(controller));
        child.registry
            .register("short", address(0xA99), child.childRegistry, address(0), 0, uint64(block.timestamp + 1 days));
        assertNotEq(child.registry.getResource(uint256(keccak256("short"))), child.resource);
        vm.expectRevert(CapitalController.InvalidPath.selector);
        controller.checkAction(childId, FinanceRoles.DELEGATE, childAgent, 2, 0);
        vm.prank(owner);
        controller.ownerEmergencyRecover(childId);
        assertEq(token0.balanceOf(address(controller.getNode(rootId).vault)), 500);
    }

    function testFuzzAllocationAndReclaimConserveCapital(uint96 raw) public {
        uint256 amount = bound(uint256(raw), 1, 100);
        uint256 childId = _spawn(rootId, "fuzz", childAgent, _policy(FinanceRoles.ALL, 1, 100), amount);
        CapitalController.Node memory root = controller.getNode(rootId);
        CapitalController.Node memory child = controller.getNode(childId);
        assertEq(token0.balanceOf(address(root.vault)) + token0.balanceOf(address(child.vault)), 500);
        uint256 extra = 100 - amount;
        if (extra != 0) {
            vm.prank(rootAgent);
            controller.allocateCapital(rootId, childId, [extra, uint256(0)]);
        }
        assertEq(token0.balanceOf(address(root.vault)) + token0.balanceOf(address(child.vault)), 500);
        vm.prank(rootAgent);
        controller.reclaimAssets(rootId, childId);
        assertEq(token0.balanceOf(address(root.vault)), 500);
        assertEq(token0.balanceOf(address(child.vault)), 0);
    }

    function _setPayOperator(uint256 privateKey) internal returns (address agent) {
        agent = vm.addr(privateKey);
        rootAgent = agent;
        vm.prank(owner);
        controller.setRootOperator(rootId, agent, _policy(FinanceRoles.ALL | FinanceRoles.PAY, 3, 100));
    }

    function _paymentNonce(uint64 generation, uint192 salt) internal pure returns (bytes32) {
        return bytes32((uint256(generation) << 192) | uint256(salt));
    }

    function _signedPayment(
        TestToken token,
        CapitalVault vault,
        address signedToken,
        address recipient,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint256 agentKey
    ) internal returns (bytes32 digest, bytes memory signature) {
        digest = token.authorizationDigest(address(vault), recipient, value, validAfter, validBefore, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKey, digest);
        signature = abi.encode(signedToken, recipient, value, validAfter, validBefore, nonce, abi.encodePacked(r, s, v));
    }

    function _signedNodePayment(CapitalController.Node memory node, uint192 salt, uint256 agentKey)
        internal
        returns (bytes32 digest, bytes memory signature)
    {
        return _signedPayment(
            token0,
            node.vault,
            address(token0),
            address(0xFEE),
            10,
            block.timestamp - 1,
            block.timestamp + 1 days,
            _paymentNonce(node.generation, salt),
            agentKey
        );
    }

    function _signedNodePaymentWithExpiry(
        CapitalController.Node memory node,
        uint256 value,
        uint256 validBefore,
        uint192 salt,
        uint256 agentKey
    ) internal returns (bytes32 digest, bytes memory signature) {
        return _signedPayment(
            token0,
            node.vault,
            address(token0),
            address(0xFEE),
            value,
            block.timestamp - 1,
            validBefore,
            _paymentNonce(node.generation, salt),
            agentKey
        );
    }

    function _decodePayment(bytes memory signature) internal pure returns (TestAuthorization memory payment) {
        (
            payment.token,
            payment.recipient,
            payment.value,
            payment.validAfter,
            payment.validBefore,
            payment.nonce,
            payment.agentSignature
        ) = abi.decode(signature, (address, address, uint256, uint256, uint256, bytes32, bytes));
    }

    function _encodePayment(TestAuthorization memory payment) internal pure returns (bytes memory) {
        return abi.encode(
            payment.token,
            payment.recipient,
            payment.value,
            payment.validAfter,
            payment.validBefore,
            payment.nonce,
            payment.agentSignature
        );
    }

    function _resignPayment(bytes memory signature, bytes32 digest, uint256 agentKey) internal returns (bytes memory) {
        TestAuthorization memory payment = _decodePayment(signature);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKey, digest);
        payment.agentSignature = abi.encodePacked(r, s, v);
        return _encodePayment(payment);
    }

    function _verifyPayment(TestToken token, CapitalVault vault, bytes32 digest, bytes memory signature)
        internal
        returns (bytes4)
    {
        vm.prank(address(0xFACADE));
        return vault.isValidSignature(digest, signature);
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
        p.maxAmounts = [tokenMask & 1 == 0 ? 0 : maxAmount, tokenMask & 2 == 0 ? 0 : maxAmount];
        p.expiry = uint64(block.timestamp + 30 days);
        p.tokenMask = tokenMask;
        p.poolId = poolId;
    }
}
