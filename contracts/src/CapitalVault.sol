// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {FixedPool} from "./uniswap/FixedPool.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @notice Token custody for one tree node. Only its immutable controller can move funds.
contract CapitalVault is IUnlockCallback, IERC721Receiver {
    using SafeERC20 for IERC20;

    error OnlyController();
    error InvalidController();
    error InvalidSwap();
    error OnlyPoolManager();
    error InvalidPosition();

    address public immutable CONTROLLER;
    IPoolManager public immutable POOL_MANAGER;
    IERC20 public immutable TOKEN0;
    IERC20 public immutable TOKEN1;
    IPositionManager public immutable POSITION_MANAGER;
    IAllowanceTransfer public immutable PERMIT2;
    uint256 public positionTokenId;
    bool private _minting;
    bool private _swapActive;

    constructor(
        address controller,
        IPoolManager poolManager,
        IPositionManager positionManager,
        IAllowanceTransfer permit2,
        IERC20 token0,
        IERC20 token1
    ) {
        if (
            controller == address(0) || address(poolManager) == address(0) || address(positionManager) == address(0)
                || address(permit2) == address(0) || address(token0) >= address(token1)
        ) {
            revert InvalidController();
        }
        CONTROLLER = controller;
        POOL_MANAGER = poolManager;
        TOKEN0 = token0;
        TOKEN1 = token1;
        POSITION_MANAGER = positionManager;
        PERMIT2 = permit2;
    }

    function transferToken(IERC20 token, address recipient, uint256 amount) external {
        if (msg.sender != CONTROLLER) revert OnlyController();
        token.safeTransfer(recipient, amount);
    }

    /// @notice Exact-input swap in the one fixed no-hook pool; output remains in this vault.
    function swapExactInput(
        bool zeroForOne,
        uint128 amountIn,
        uint128 minOut,
        uint160 sqrtPriceLimitX96,
        uint256 deadline
    ) external returns (uint256 actualIn, uint256 actualOut) {
        if (msg.sender != CONTROLLER) revert OnlyController();
        if (
            _swapActive || amountIn == 0 || amountIn > uint128(type(int128).max) || minOut == 0
                || block.timestamp > deadline
        ) revert InvalidSwap();
        IERC20 input = zeroForOne ? TOKEN0 : TOKEN1;
        if (input.balanceOf(address(this)) < amountIn) revert InvalidSwap();
        _swapActive = true;
        (actualIn, actualOut) = abi.decode(
            POOL_MANAGER.unlock(abi.encode(zeroForOne, amountIn, minOut, sqrtPriceLimitX96)), (uint256, uint256)
        );
        _swapActive = false;
    }

    /// @dev Only PoolManager may call this, and only during a controller-initiated swap.
    function unlockCallback(bytes calldata data) external override returns (bytes memory result) {
        if (msg.sender != address(POOL_MANAGER)) revert OnlyPoolManager();
        if (!_swapActive) revert InvalidSwap();
        (bool zeroForOne, uint128 amountIn, uint128 minOut, uint160 limit) =
            abi.decode(data, (bool, uint128, uint128, uint160));
        PoolKey memory key = FixedPool.key(address(TOKEN0), address(TOKEN1));
        BalanceDelta delta = POOL_MANAGER.swap(
            key,
            SwapParams({zeroForOne: zeroForOne, amountSpecified: -int256(uint256(amountIn)), sqrtPriceLimitX96: limit}),
            ""
        );
        int128 inputDelta = zeroForOne ? delta.amount0() : delta.amount1();
        int128 outputDelta = zeroForOne ? delta.amount1() : delta.amount0();
        if (inputDelta >= 0 || outputDelta <= 0) revert InvalidSwap();
        uint256 actualIn = uint256(uint128(-inputDelta));
        uint256 actualOut = uint256(uint128(outputDelta));
        if (actualIn > amountIn || actualOut < minOut) revert InvalidSwap();
        IERC20 input = zeroForOne ? TOKEN0 : TOKEN1;
        Currency inputCurrency = Currency.wrap(address(input));
        Currency outputCurrency = Currency.wrap(address(zeroForOne ? TOKEN1 : TOKEN0));
        POOL_MANAGER.sync(inputCurrency);
        input.safeTransfer(address(POOL_MANAGER), actualIn);
        POOL_MANAGER.settle();
        POOL_MANAGER.take(outputCurrency, address(this), actualOut);
        return abi.encode(actualIn, actualOut);
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata)
        external
        view
        override
        returns (bytes4)
    {
        if (msg.sender != address(POSITION_MANAGER) || !_minting || tokenId != positionTokenId) {
            revert InvalidPosition();
        }
        return IERC721Receiver.onERC721Received.selector;
    }

    function openPosition(uint128 liquidity, uint128[2] calldata maxAmounts, uint256 deadline)
        external
        returns (uint256 tokenId, uint256[2] memory spent)
    {
        if (msg.sender != CONTROLLER) revert OnlyController();
        if (positionTokenId != 0 || liquidity == 0 || block.timestamp > deadline) revert InvalidPosition();
        tokenId = POSITION_MANAGER.nextTokenId();
        positionTokenId = tokenId;
        _minting = true;
        _approve(maxAmounts);
        spent = _modify(
            Actions.MINT_POSITION,
            abi.encode(
                FixedPool.key(address(TOKEN0), address(TOKEN1)),
                FixedPool.TICK_LOWER,
                FixedPool.TICK_UPPER,
                liquidity,
                maxAmounts[0],
                maxAmounts[1],
                address(this),
                bytes("")
            ),
            deadline,
            true
        );
        _clearApprovals();
        _minting = false;
        if (IERC721(address(POSITION_MANAGER)).ownerOf(tokenId) != address(this)) revert InvalidPosition();
    }

    function increasePosition(uint128 liquidity, uint128[2] calldata maxAmounts, uint256 deadline)
        external
        returns (uint256[2] memory spent)
    {
        if (msg.sender != CONTROLLER) revert OnlyController();
        if (positionTokenId == 0 || liquidity == 0 || block.timestamp > deadline) revert InvalidPosition();
        _approve(maxAmounts);
        spent = _modify(
            Actions.INCREASE_LIQUIDITY,
            abi.encode(positionTokenId, liquidity, maxAmounts[0], maxAmounts[1], bytes("")),
            deadline,
            true
        );
        _clearApprovals();
    }

    function collectFees(uint128[2] calldata minAmounts, uint256 deadline)
        external
        returns (uint256[2] memory received)
    {
        if (msg.sender != CONTROLLER) revert OnlyController();
        if (positionTokenId == 0 || block.timestamp > deadline) revert InvalidPosition();
        received = _modify(
            Actions.INCREASE_LIQUIDITY,
            abi.encode(positionTokenId, uint256(0), uint128(0), uint128(0), bytes("")),
            deadline,
            false
        );
        if (received[0] < minAmounts[0] || received[1] < minAmounts[1]) revert InvalidPosition();
    }

    function closePosition(uint128[2] calldata minAmounts, uint256 deadline)
        external
        returns (uint256 tokenId, uint256[2] memory received)
    {
        if (msg.sender != CONTROLLER) revert OnlyController();
        tokenId = positionTokenId;
        if (tokenId == 0 || block.timestamp > deadline) revert InvalidPosition();
        received = _modify(
            Actions.BURN_POSITION, abi.encode(tokenId, minAmounts[0], minAmounts[1], bytes("")), deadline, false
        );
        positionTokenId = 0;
    }

    function positionLiquidity() external view returns (uint128) {
        return positionTokenId == 0 ? 0 : POSITION_MANAGER.getPositionLiquidity(positionTokenId);
    }

    function _modify(uint256 action, bytes memory param, uint256 deadline, bool funding)
        private
        returns (uint256[2] memory amounts)
    {
        uint256[2] memory beforeBalances = [TOKEN0.balanceOf(address(this)), TOKEN1.balanceOf(address(this))];
        bytes[] memory params = new bytes[](3);
        params[0] = param;
        PoolKey memory key = FixedPool.key(address(TOKEN0), address(TOKEN1));
        if (funding) {
            params[1] = abi.encode(key.currency0);
            params[2] = abi.encode(key.currency1);
            POSITION_MANAGER.modifyLiquidities(
                abi.encode(
                    abi.encodePacked(
                        bytes1(uint8(action)),
                        bytes1(uint8(Actions.CLOSE_CURRENCY)),
                        bytes1(uint8(Actions.CLOSE_CURRENCY))
                    ),
                    params
                ),
                deadline
            );
            uint256 after0 = TOKEN0.balanceOf(address(this));
            uint256 after1 = TOKEN1.balanceOf(address(this));
            amounts[0] = beforeBalances[0] > after0 ? beforeBalances[0] - after0 : 0;
            amounts[1] = beforeBalances[1] > after1 ? beforeBalances[1] - after1 : 0;
        } else {
            params = new bytes[](2);
            params[0] = param;
            params[1] = abi.encode(key.currency0, key.currency1, address(this));
            POSITION_MANAGER.modifyLiquidities(
                abi.encode(abi.encodePacked(bytes1(uint8(action)), bytes1(uint8(Actions.TAKE_PAIR))), params), deadline
            );
            amounts[0] = TOKEN0.balanceOf(address(this)) - beforeBalances[0];
            amounts[1] = TOKEN1.balanceOf(address(this)) - beforeBalances[1];
        }
    }

    function _approve(uint128[2] calldata maxAmounts) private {
        IERC20[2] memory tokens = [TOKEN0, TOKEN1];
        for (uint256 i; i < 2; ++i) {
            if (maxAmounts[i] > tokens[i].balanceOf(address(this))) revert InvalidPosition();
            tokens[i].forceApprove(address(PERMIT2), maxAmounts[i]);
            PERMIT2.approve(
                address(tokens[i]), address(POSITION_MANAGER), uint160(maxAmounts[i]), uint48(block.timestamp)
            );
        }
    }

    function _clearApprovals() private {
        IERC20[2] memory tokens = [TOKEN0, TOKEN1];
        for (uint256 i; i < 2; ++i) {
            PERMIT2.approve(address(tokens[i]), address(POSITION_MANAGER), 0, 0);
            tokens[i].forceApprove(address(PERMIT2), 0);
        }
    }
}
