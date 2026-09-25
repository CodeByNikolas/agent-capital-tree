// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPermissionedRegistry} from "ens-v2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "ens-v2/registry/interfaces/IRegistry.sol";
import {ILabelStore} from "ens-v2/utils/interfaces/ILabelStore.sol";
import {FinanceRoles} from "./ens/FinanceRoles.sol";
import {ManagedRegistry} from "./ens/ManagedRegistry.sol";
import {CapitalVault} from "./CapitalVault.sol";
import {NodeFactory} from "./NodeFactory.sol";

/// @notice Immutable controller for ENS-authorized, two-token capital trees.
contract CapitalController is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant MAX_DEPTH = 3;
    uint8 public constant MAX_NODES = 32;

    struct Policy {
        uint256 capabilities;
        uint256[2] maxAmounts;
        uint64 expiry;
        uint8 tokenMask;
        bytes32 poolId;
    }

    struct Node {
        uint256 id;
        uint256 parentId;
        uint256 rootId;
        uint64 generation;
        uint8 depth;
        bool revoked;
        address agent;
        CapitalVault vault;
        ManagedRegistry registry;
        ManagedRegistry childRegistry;
        uint256 resource;
        string label;
        Policy policy;
    }

    struct Operation {
        bytes32 paramsHash;
        uint256 nodeId;
    }

    error InvalidInput();
    error InvalidNode();
    error Unauthorized();
    error Inactive();
    error InvalidPath();
    error PolicyExpansion();
    error OperationConflict();
    error NodeLimit();
    error BadTransfer();

    event NodeCreated(
        uint256 indexed rootId, uint256 indexed nodeId, uint256 indexed parentId, address agent, address vault
    );
    event RootFunded(uint256 indexed rootId, address indexed token, uint256 amount);
    event CapitalAllocated(
        uint256 indexed rootId, uint256 indexed parentId, uint256 indexed childId, address token, uint256 amount
    );
    event CapitalReclaimed(
        uint256 indexed rootId, uint256 indexed parentId, uint256 indexed childId, address token, uint256 amount
    );
    event EmergencyRecovered(
        uint256 indexed rootId, uint256 indexed nodeId, address token, uint256 amount, address recipient
    );
    event PolicyTightened(uint256 indexed rootId, uint256 indexed nodeId);
    event OperatorChanged(uint256 indexed rootId, address indexed operator, uint64 generation);
    event NodeRevoked(uint256 indexed rootId, uint256 indexed nodeId);
    event SwapExecuted(
        uint256 indexed rootId,
        uint256 indexed nodeId,
        address inputToken,
        address outputToken,
        uint256 amountIn,
        uint256 amountOut
    );

    IPermissionedRegistry public immutable ETH_REGISTRY;
    ManagedRegistry public immutable PROJECT_REGISTRY;
    ILabelStore public immutable LABEL_STORE;
    NodeFactory public immutable NODE_FACTORY;
    IERC20 public immutable TOKEN0;
    IERC20 public immutable TOKEN1;
    bytes32 public immutable POOL_ID;
    uint256 public immutable NAMESPACE_RESOURCE;
    string public namespaceLabel;

    uint256 public nextNodeId = 1;
    mapping(uint256 => Node) private _nodes;
    mapping(uint256 => address) public rootOwner;
    mapping(uint256 => address) public rootOperator;
    mapping(uint256 => uint64) public rootGeneration;
    mapping(uint256 => uint8) public rootNodeCount;
    mapping(uint256 => uint256[]) private _rootNodeIds;
    mapping(bytes32 => Operation) private _operations;

    constructor(
        IPermissionedRegistry ethRegistry,
        ILabelStore labelStore,
        NodeFactory nodeFactory,
        IERC20[2] memory tokens,
        string memory projectLabel,
        bytes32 poolId
    ) {
        if (
            address(ethRegistry) == address(0) || address(labelStore) == address(0)
                || address(nodeFactory) == address(0) || address(tokens[0]) == address(0)
                || address(tokens[1]) == address(0) || tokens[0] == tokens[1] || bytes(projectLabel).length == 0
                || nodeFactory.TOKEN0() != tokens[0] || nodeFactory.TOKEN1() != tokens[1]
                || nodeFactory.POOL_ID() != poolId
        ) revert InvalidInput();
        IPermissionedRegistry.State memory state = ethRegistry.getState(uint256(keccak256(bytes(projectLabel))));
        if (state.status != IPermissionedRegistry.Status.REGISTERED) revert InvalidPath();
        ETH_REGISTRY = ethRegistry;
        LABEL_STORE = labelStore;
        NODE_FACTORY = nodeFactory;
        TOKEN0 = tokens[0];
        TOKEN1 = tokens[1];
        POOL_ID = poolId;
        NAMESPACE_RESOURCE = state.resource;
        namespaceLabel = projectLabel;
        PROJECT_REGISTRY = nodeFactory.createRegistry(labelStore, ethRegistry, projectLabel);
    }

    function getNode(uint256 nodeId) external view returns (Node memory) {
        Node memory node = _nodes[nodeId];
        if (node.id == 0) revert InvalidNode();
        return node;
    }

    function getRootNodeIds(uint256 rootId) external view returns (uint256[] memory) {
        _root(rootId);
        return _rootNodeIds[rootId];
    }

    function getOperation(uint256 rootId, uint256 parentId, uint64 generation, bytes32 operationKey)
        external
        view
        returns (Operation memory)
    {
        return _operations[_operationSlot(rootId, parentId, generation, operationKey)];
    }

    function createRoot(string calldata label, Policy calldata policy) external nonReentrant returns (uint256 rootId) {
        _verifyAnchor();
        _validatePolicy(policy, true);
        if (policy.expiry > ETH_REGISTRY.getState(uint256(keccak256(bytes(namespaceLabel)))).expiry) {
            revert InvalidInput();
        }
        rootId = nextNodeId++;
        Node storage node = _nodes[rootId];
        node.id = rootId;
        node.rootId = rootId;
        node.depth = 1;
        node.label = label;
        node.policy = policy;
        node.registry = PROJECT_REGISTRY;
        node.childRegistry = NODE_FACTORY.createRegistry(LABEL_STORE, PROJECT_REGISTRY, label);
        node.vault = NODE_FACTORY.createVault();
        PROJECT_REGISTRY.register(label, msg.sender, node.childRegistry, address(0), 0, policy.expiry);
        node.resource = PROJECT_REGISTRY.getResource(uint256(keccak256(bytes(label))));
        rootOwner[rootId] = msg.sender;
        rootNodeCount[rootId] = 1;
        _rootNodeIds[rootId].push(rootId);
        emit NodeCreated(rootId, rootId, 0, address(0), address(node.vault));
    }

    function setRootOperator(uint256 rootId, address operator, Policy calldata policy) external nonReentrant {
        Node storage node = _root(rootId);
        if (msg.sender != rootOwner[rootId]) revert Unauthorized();
        if (operator == address(0)) revert InvalidInput();
        _verifyPath(rootId);
        _validatePolicy(policy, true);
        address oldOperator = rootOperator[rootId];
        if (oldOperator != address(0)) {
            node.registry.revokeRoles(node.resource, node.policy.capabilities, oldOperator);
        }
        node.registry.grantRoles(node.resource, policy.capabilities, operator);
        node.policy = policy;
        node.agent = operator;
        rootOperator[rootId] = operator;
        node.generation = ++rootGeneration[rootId];
        emit OperatorChanged(rootId, operator, node.generation);
    }

    function spawnChild(
        uint256 parentId,
        string calldata label,
        address agent,
        Policy calldata policy,
        uint256[2] calldata amounts,
        bytes32 operationKey
    ) external nonReentrant returns (uint256 nodeId) {
        Node storage parent = _node(parentId);
        uint256 rootId = parent.rootId;
        if (operationKey == bytes32(0) || agent == address(0) || parent.depth >= MAX_DEPTH) revert InvalidInput();
        bytes32 slot = _operationSlot(rootId, parentId, rootGeneration[rootId], operationKey);
        bytes32 paramsHash = keccak256(abi.encode(label, agent, policy, amounts, msg.sender));
        Operation storage operation = _operations[slot];
        if (operation.nodeId != 0) {
            if (operation.paramsHash != paramsHash) revert OperationConflict();
            return operation.nodeId;
        }
        Policy memory effective = _authorize(parentId, FinanceRoles.DELEGATE, msg.sender);
        _validatePolicy(policy, true);
        _requireSubset(policy, effective);
        if (rootNodeCount[rootId] >= MAX_NODES) revert NodeLimit();
        _checkAmounts(effective, amounts);
        nodeId = _createChild(parentId, label, agent, policy);
        operation.paramsHash = paramsHash;
        operation.nodeId = nodeId;
        emit NodeCreated(rootId, nodeId, parentId, agent, address(_nodes[nodeId].vault));
        _allocate(parent, _nodes[nodeId], amounts);
    }

    function allocateCapital(uint256 parentId, uint256 childId, uint256[2] calldata amounts) external nonReentrant {
        Node storage parent = _node(parentId);
        Node storage child = _node(childId);
        if (child.parentId != parentId || child.revoked || child.generation != rootGeneration[parent.rootId]) {
            revert Inactive();
        }
        Policy memory effective = _authorize(parentId, FinanceRoles.DELEGATE, msg.sender);
        _verifyPath(childId);
        _checkAmounts(effective, amounts);
        _allocate(parent, child, amounts);
    }

    function fundRoot(uint256 rootId, uint256[2] calldata amounts) external nonReentrant {
        Node storage root = _root(rootId);
        if (msg.sender != rootOwner[rootId] || root.revoked) revert Unauthorized();
        if (amounts[0] == 0 && amounts[1] == 0) revert InvalidInput();
        for (uint8 i; i < 2; ++i) {
            if (amounts[i] == 0) continue;
            IERC20 token = _token(i);
            uint256 beforeBalance = token.balanceOf(address(root.vault));
            token.safeTransferFrom(msg.sender, address(root.vault), amounts[i]);
            if (token.balanceOf(address(root.vault)) != beforeBalance + amounts[i]) revert BadTransfer();
            emit RootFunded(rootId, address(token), amounts[i]);
        }
    }

    function tightenPolicy(uint256 nodeId, Policy calldata policy) external nonReentrant {
        Node storage node = _node(nodeId);
        if (node.parentId == 0) {
            if (msg.sender != rootOwner[node.rootId]) revert Unauthorized();
            _verifyPath(nodeId);
        } else {
            _authorize(node.parentId, FinanceRoles.RESTRICT, msg.sender);
        }
        _validatePolicy(policy, false);
        _requireSubset(policy, node.policy);
        uint256 removed = node.policy.capabilities & ~policy.capabilities;
        if (removed != 0 && node.agent != address(0)) {
            node.registry.revokeRoles(node.resource, removed, node.agent);
        }
        node.policy = policy;
        emit PolicyTightened(node.rootId, nodeId);
    }

    function revokeSubtree(uint256 nodeId) external nonReentrant {
        Node storage node = _node(nodeId);
        if (node.parentId == 0) revert InvalidInput();
        _authorize(node.parentId, FinanceRoles.RESTRICT, msg.sender);
        if (node.revoked) return;
        node.revoked = true;
        _revokeLocalRolesIfActive(node);
        emit NodeRevoked(node.rootId, nodeId);
    }

    function reclaimAssets(uint256 parentId, uint256 childId) external nonReentrant {
        Node storage parent = _node(parentId);
        Node storage child = _node(childId);
        if (child.parentId != parentId) revert InvalidInput();
        _authorize(parentId, FinanceRoles.RECLAIM, msg.sender);
        if (!child.revoked) {
            child.revoked = true;
            _revokeLocalRolesIfActive(child);
            emit NodeRevoked(child.rootId, childId);
        }
        _sweep(child, address(parent.vault), false);
    }

    /// @notice ENS-independent recovery to the bound parent vault or immutable root owner.
    function ownerEmergencyRecover(uint256 nodeId) external nonReentrant {
        Node storage node = _node(nodeId);
        if (msg.sender != rootOwner[node.rootId]) revert Unauthorized();
        if (!node.revoked) {
            node.revoked = true;
            emit NodeRevoked(node.rootId, nodeId);
        }
        address recipient = node.parentId == 0 ? msg.sender : address(_nodes[node.parentId].vault);
        _sweep(node, recipient, true);
    }

    function getEffectivePolicy(uint256 nodeId) external view returns (Policy memory effective) {
        _node(nodeId);
        return _effectivePolicy(nodeId);
    }

    /// @notice Reverts unless an actor currently has this typed capability and amount.
    function checkAction(uint256 nodeId, uint256 role, address actor, uint8 tokenIndex, uint256 amount)
        external
        view
        returns (Policy memory effective)
    {
        effective = _authorize(nodeId, role, actor);
        if (tokenIndex < 2) {
            if (effective.tokenMask & (1 << tokenIndex) == 0 || amount > effective.maxAmounts[tokenIndex]) {
                revert Unauthorized();
            }
        } else if (tokenIndex != 2 || amount != 0) {
            revert InvalidInput();
        }
        if (
            (role == FinanceRoles.SWAP || role == FinanceRoles.MANAGE_LP || role == FinanceRoles.COLLECT_FEES)
                && effective.poolId == bytes32(0)
        ) revert Unauthorized();
    }

    function swap(
        uint256 nodeId,
        bool zeroForOne,
        uint128 amountIn,
        uint128 minOut,
        uint160 sqrtPriceLimitX96,
        uint256 deadline
    ) external nonReentrant returns (uint256 actualIn, uint256 actualOut) {
        Policy memory effective = _authorize(nodeId, FinanceRoles.SWAP, msg.sender);
        uint8 tokenIndex = zeroForOne ? 0 : 1;
        if (
            effective.poolId != POOL_ID || effective.tokenMask & (1 << tokenIndex) == 0 || amountIn == 0
                || amountIn > effective.maxAmounts[tokenIndex] || minOut == 0 || block.timestamp > deadline
        ) {
            revert Unauthorized();
        }
        Node storage node = _nodes[nodeId];
        (actualIn, actualOut) = node.vault.swapExactInput(zeroForOne, amountIn, minOut, sqrtPriceLimitX96, deadline);
        emit SwapExecuted(
            node.rootId,
            nodeId,
            address(zeroForOne ? TOKEN0 : TOKEN1),
            address(zeroForOne ? TOKEN1 : TOKEN0),
            actualIn,
            actualOut
        );
    }

    function _allocate(Node storage parent, Node storage child, uint256[2] calldata amounts) private {
        if (amounts[0] == 0 && amounts[1] == 0) revert InvalidInput();
        for (uint8 i; i < 2; ++i) {
            if (amounts[i] == 0) continue;
            IERC20 token = _token(i);
            _transferExact(parent.vault, token, address(child.vault), amounts[i]);
            emit CapitalAllocated(parent.rootId, parent.id, child.id, address(token), amounts[i]);
        }
    }

    function _createChild(uint256 parentId, string calldata label, address agent, Policy calldata policy)
        private
        returns (uint256 nodeId)
    {
        Node storage parent = _nodes[parentId];
        nodeId = nextNodeId++;
        Node storage node = _nodes[nodeId];
        node.id = nodeId;
        node.parentId = parentId;
        node.rootId = parent.rootId;
        node.generation = rootGeneration[parent.rootId];
        node.depth = parent.depth + 1;
        node.agent = agent;
        node.label = label;
        node.policy = policy;
        node.registry = parent.childRegistry;
        node.childRegistry = NODE_FACTORY.createRegistry(LABEL_STORE, parent.childRegistry, label);
        node.vault = NODE_FACTORY.createVault();
        node.registry.register(label, agent, node.childRegistry, address(0), 0, policy.expiry);
        node.resource = node.registry.getResource(uint256(keccak256(bytes(label))));
        node.registry.grantRoles(node.resource, policy.capabilities, agent);
        ++rootNodeCount[parent.rootId];
        _rootNodeIds[parent.rootId].push(nodeId);
    }

    function _sweep(Node storage node, address recipient, bool emergency) private {
        for (uint8 i; i < 2; ++i) {
            IERC20 token = _token(i);
            uint256 amount = token.balanceOf(address(node.vault));
            if (amount == 0) continue;
            _transferExact(node.vault, token, recipient, amount);
            if (emergency) {
                emit EmergencyRecovered(node.rootId, node.id, address(token), amount, recipient);
            } else {
                emit CapitalReclaimed(node.rootId, node.parentId, node.id, address(token), amount);
            }
        }
    }

    function _revokeLocalRolesIfActive(Node storage node) private {
        if (node.agent == address(0) || node.policy.capabilities == 0) return;
        IPermissionedRegistry.State memory state = node.registry.getState(uint256(keccak256(bytes(node.label))));
        if (state.status == IPermissionedRegistry.Status.REGISTERED && state.resource == node.resource) {
            node.registry.revokeRoles(node.resource, node.policy.capabilities, node.agent);
        }
    }

    function _transferExact(CapitalVault from, IERC20 token, address to, uint256 amount) private {
        uint256 fromBefore = token.balanceOf(address(from));
        uint256 toBefore = token.balanceOf(to);
        from.transferToken(token, to, amount);
        if (token.balanceOf(address(from)) != fromBefore - amount || token.balanceOf(to) != toBefore + amount) {
            revert BadTransfer();
        }
    }

    function _authorize(uint256 nodeId, uint256 role, address actor) private view returns (Policy memory effective) {
        Node storage node = _node(nodeId);
        if (role == 0 || role & ~FinanceRoles.ALL != 0 || node.agent != actor || actor == address(0)) {
            revert Unauthorized();
        }
        if (node.generation != rootGeneration[node.rootId] || rootOperator[node.rootId] == address(0)) {
            revert Inactive();
        }
        _verifyPath(nodeId);
        effective = _effectivePolicy(nodeId);
        if (block.timestamp >= effective.expiry || effective.capabilities & role != role) revert Unauthorized();
        if (!node.registry.hasRoles(node.resource, role, actor)) revert Unauthorized();
        uint256 cursor = node.parentId;
        while (cursor != 0) {
            Node storage ancestor = _nodes[cursor];
            if (!ancestor.registry.hasRoles(ancestor.resource, FinanceRoles.DELEGATE, ancestor.agent)) {
                revert Unauthorized();
            }
            cursor = ancestor.parentId;
        }
    }

    function _effectivePolicy(uint256 nodeId) private view returns (Policy memory effective) {
        effective = _nodes[nodeId].policy;
        uint256 cursor = _nodes[nodeId].parentId;
        while (cursor != 0) {
            Policy storage parent = _nodes[cursor].policy;
            effective.capabilities &= parent.capabilities;
            effective.tokenMask &= parent.tokenMask;
            if (parent.maxAmounts[0] < effective.maxAmounts[0]) effective.maxAmounts[0] = parent.maxAmounts[0];
            if (parent.maxAmounts[1] < effective.maxAmounts[1]) effective.maxAmounts[1] = parent.maxAmounts[1];
            if (parent.expiry < effective.expiry) effective.expiry = parent.expiry;
            if (parent.poolId == bytes32(0)) effective.poolId = bytes32(0);
            cursor = _nodes[cursor].parentId;
        }
    }

    function _verifyPath(uint256 nodeId) private view {
        _verifyAnchor();
        uint256 cursor = nodeId;
        while (cursor != 0) {
            Node storage node = _nodes[cursor];
            if (node.revoked) revert Inactive();
            IPermissionedRegistry.State memory state = node.registry.getState(uint256(keccak256(bytes(node.label))));
            if (
                state.status != IPermissionedRegistry.Status.REGISTERED || state.resource != node.resource
                    || address(node.registry.getSubregistry(node.label)) != address(node.childRegistry)
            ) revert InvalidPath();
            (IRegistry parent, string memory label) = node.childRegistry.getParent();
            if (address(parent) != address(node.registry) || keccak256(bytes(label)) != keccak256(bytes(node.label))) {
                revert InvalidPath();
            }
            if (node.parentId == 0) {
                if (address(node.registry) != address(PROJECT_REGISTRY)) revert InvalidPath();
            } else if (address(node.registry) != address(_nodes[node.parentId].childRegistry)) {
                revert InvalidPath();
            }
            cursor = node.parentId;
        }
    }

    function _verifyAnchor() private view {
        IPermissionedRegistry.State memory state = ETH_REGISTRY.getState(uint256(keccak256(bytes(namespaceLabel))));
        if (
            state.status != IPermissionedRegistry.Status.REGISTERED || state.resource != NAMESPACE_RESOURCE
                || address(ETH_REGISTRY.getSubregistry(namespaceLabel)) != address(PROJECT_REGISTRY)
        ) revert InvalidPath();
        (IRegistry parent, string memory label) = PROJECT_REGISTRY.getParent();
        if (address(parent) != address(ETH_REGISTRY) || keccak256(bytes(label)) != keccak256(bytes(namespaceLabel))) {
            revert InvalidPath();
        }
    }

    function _validatePolicy(Policy calldata policy, bool requireFuture) private view {
        if (
            policy.capabilities & ~FinanceRoles.ALL != 0 || policy.tokenMask & ~uint8(3) != 0
                || (requireFuture && policy.expiry <= block.timestamp)
                || (policy.tokenMask & 1 == 0 && policy.maxAmounts[0] != 0)
                || (policy.tokenMask & 2 == 0 && policy.maxAmounts[1] != 0)
                || (policy.poolId != bytes32(0) && policy.poolId != POOL_ID)
        ) revert InvalidInput();
    }

    function _requireSubset(Policy calldata child, Policy memory parent) private pure {
        if (
            child.capabilities & ~parent.capabilities != 0 || child.tokenMask & ~parent.tokenMask != 0
                || child.maxAmounts[0] > parent.maxAmounts[0] || child.maxAmounts[1] > parent.maxAmounts[1]
                || child.expiry > parent.expiry || (child.poolId != bytes32(0) && child.poolId != parent.poolId)
        ) {
            revert PolicyExpansion();
        }
    }

    function _checkAmounts(Policy memory policy, uint256[2] calldata amounts) private pure {
        if (
            (amounts[0] != 0 && (policy.tokenMask & 1 == 0 || amounts[0] > policy.maxAmounts[0]))
                || (amounts[1] != 0 && (policy.tokenMask & 2 == 0 || amounts[1] > policy.maxAmounts[1]))
        ) {
            revert Unauthorized();
        }
    }

    function _root(uint256 rootId) private view returns (Node storage node) {
        node = _node(rootId);
        if (node.parentId != 0) revert InvalidNode();
    }

    function _node(uint256 nodeId) private view returns (Node storage node) {
        node = _nodes[nodeId];
        if (node.id == 0) revert InvalidNode();
    }

    function _token(uint8 index) private view returns (IERC20) {
        return index == 0 ? TOKEN0 : TOKEN1;
    }

    function _operationSlot(uint256 rootId, uint256 parentId, uint64 generation, bytes32 operationKey)
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(rootId, parentId, generation, operationKey));
    }
}
