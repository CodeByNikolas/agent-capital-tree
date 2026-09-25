// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {CapitalVault} from "../src/CapitalVault.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {FixedPool} from "../src/uniswap/FixedPool.sol";

contract SwapToken is ERC20 {
    constructor(string memory symbol) ERC20(symbol, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract CapitalSwapTest is Test {
    SwapToken private token0;
    SwapToken private token1;
    PoolManager private manager;
    CapitalVault private vault;

    function setUp() public {
        token0 = new SwapToken("A");
        token1 = new SwapToken("B");
        if (address(token0) > address(token1)) (token0, token1) = (token1, token0);
        manager = new PoolManager(address(this));
        manager.initialize(FixedPool.key(address(token0), address(token1)), 1 << 96);
        PoolModifyLiquidityTest seeder = new PoolModifyLiquidityTest(IPoolManager(address(manager)));
        token0.mint(address(this), 1_000_000 ether);
        token1.mint(address(this), 1_000_000 ether);
        token0.approve(address(seeder), type(uint256).max);
        token1.approve(address(seeder), type(uint256).max);
        seeder.modifyLiquidity(
            FixedPool.key(address(token0), address(token1)),
            ModifyLiquidityParams({tickLower: -600, tickUpper: 600, liquidityDelta: 1_000_000 ether, salt: 0}),
            ""
        );
        vault = new CapitalVault(
            address(this),
            IPoolManager(address(manager)),
            IPositionManager(address(0x124)),
            IAllowanceTransfer(address(0x125)),
            IERC20(address(token0)),
            IERC20(address(token1))
        );
        token0.mint(address(vault), 100 ether);
    }

    function testExactInputKeepsOutputInVault() public {
        uint256 beforeIn = token0.balanceOf(address(vault));
        uint256 beforeOut = token1.balanceOf(address(vault));
        (uint256 spent, uint256 received) =
            vault.swapExactInput(true, 1 ether, 0.9 ether, TickMath.MIN_SQRT_PRICE + 1, block.timestamp);
        assertEq(beforeIn - token0.balanceOf(address(vault)), spent);
        assertEq(token1.balanceOf(address(vault)) - beforeOut, received);
        assertGt(received, 0.9 ether);
    }

    function testSwapRejectsUnauthorizedAndSlippage() public {
        vm.prank(address(0xB0B));
        vm.expectRevert(CapitalVault.OnlyController.selector);
        vault.swapExactInput(true, 1 ether, 1, 1, block.timestamp);
        vm.expectRevert(CapitalVault.OnlyPoolManager.selector);
        vault.unlockCallback("");
        vm.expectRevert(CapitalVault.InvalidSwap.selector);
        vault.swapExactInput(true, 1 ether, 2 ether, TickMath.MIN_SQRT_PRICE + 1, block.timestamp);
        assertEq(token0.balanceOf(address(vault)), 100 ether);
        assertEq(token1.balanceOf(address(vault)), 0);
    }
}
