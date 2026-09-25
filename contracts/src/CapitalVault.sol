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

/// @notice Token custody for one tree node. Only its immutable controller can move funds.
contract CapitalVault is IUnlockCallback {
    using SafeERC20 for IERC20;

    error OnlyController();
    error InvalidController();
    error InvalidSwap();
    error OnlyPoolManager();

    address public immutable CONTROLLER;
    IPoolManager public immutable POOL_MANAGER;
    IERC20 public immutable TOKEN0;
    IERC20 public immutable TOKEN1;
    bool private _swapActive;

    constructor(address controller, IPoolManager poolManager, IERC20 token0, IERC20 token1) {
        if (controller == address(0) || address(poolManager) == address(0) || address(token0) >= address(token1)) {
            revert InvalidController();
        }
        CONTROLLER = controller;
        POOL_MANAGER = poolManager;
        TOKEN0 = token0;
        TOKEN1 = token1;
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
}
