// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IPositionDescriptor} from "@uniswap/v4-periphery/src/interfaces/IPositionDescriptor.sol";
import {IWETH9} from "@uniswap/v4-periphery/src/interfaces/external/IWETH9.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {CapitalVault} from "../src/CapitalVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {FixedPool} from "../src/uniswap/FixedPool.sol";

contract LpToken is ERC20 {
    constructor(string memory symbol) ERC20(symbol, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract TestPermit2 {
    mapping(address => mapping(address => mapping(address => uint160))) private approvals;

    function approve(address token, address spender, uint160 amount, uint48) external {
        approvals[msg.sender][token][spender] = amount;
    }

    function allowance(address owner, address token, address spender) external view returns (uint160, uint48, uint48) {
        return (approvals[owner][token][spender], 0, 0);
    }

    function transferFrom(address from, address to, uint160 amount, address token) external {
        require(approvals[from][token][msg.sender] >= amount);
        approvals[from][token][msg.sender] -= amount;
        IERC20(token).transferFrom(from, to, amount);
    }
}

contract CapitalLiquidityTest is Test {
    LpToken private token0;
    LpToken private token1;
    PoolManager private manager;
    IPositionManager private posm;
    TestPermit2 private permit2;
    CapitalVault private vault;
    VaultFactory private factory;

    function setUp() public {
        token0 = new LpToken("A");
        token1 = new LpToken("B");
        if (address(token0) > address(token1)) (token0, token1) = (token1, token0);
        manager = new PoolManager(address(this));
        manager.initialize(FixedPool.key(address(token0), address(token1)), 1 << 96);
        permit2 = new TestPermit2();
        posm = IPositionManager(
            deployCode(
                "PositionManager.sol:PositionManager",
                abi.encode(
                    IPoolManager(address(manager)),
                    IAllowanceTransfer(address(permit2)),
                    100_000,
                    IPositionDescriptor(address(0x111)),
                    IWETH9(address(0x222))
                )
            )
        );
        factory = new VaultFactory(
            IPoolManager(address(manager)),
            IPositionManager(address(posm)),
            IAllowanceTransfer(address(permit2)),
            [IERC20(address(token0)), IERC20(address(token1))]
        );
        vault = factory.createVault(address(this));
        token0.mint(address(vault), 100 ether);
        token1.mint(address(vault), 100 ether);
    }

    function testMintIncreaseCollectAndBurnWithVaultCustody() public {
        (uint256 id, uint256[2] memory spent) =
            vault.openPosition(1000 ether, [uint128(50 ether), uint128(50 ether)], block.timestamp);
        assertEq(IERC721(address(posm)).ownerOf(id), address(vault));
        assertGt(spent[0], 0);
        assertGt(spent[1], 0);
        assertEq(token0.allowance(address(vault), address(permit2)), 0);
        assertEq(token1.allowance(address(vault), address(permit2)), 0);
        (uint160 allowance0,,) = permit2.allowance(address(vault), address(token0), address(posm));
        (uint160 allowance1,,) = permit2.allowance(address(vault), address(token1), address(posm));
        assertEq(allowance0, 0);
        assertEq(allowance1, 0);
        vault.increasePosition(100 ether, [uint128(10 ether), uint128(10 ether)], block.timestamp);
        assertEq(vault.positionLiquidity(), 1100 ether);

        CapitalVault trader = factory.createVault(address(this));
        token0.mint(address(trader), 1 ether);
        trader.swapExactInput(true, 1 ether, 0.9 ether, TickMath.MIN_SQRT_PRICE + 1, block.timestamp);
        uint256[2] memory fees = vault.collectFees([uint128(1), uint128(0)], block.timestamp);
        assertGt(fees[0], 0);
        assertEq(vault.positionLiquidity(), 1100 ether);
        (uint256 burned, uint256[2] memory received) = vault.closePosition([uint128(0), uint128(0)], block.timestamp);
        assertEq(burned, id);
        assertEq(vault.positionTokenId(), 0);
        assertGt(received[0] + received[1], 0);
    }

    function testOnlyControllerCanManageAndExitRespectsMinima() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(CapitalVault.OnlyController.selector);
        vault.openPosition(1000 ether, [uint128(50 ether), uint128(50 ether)], block.timestamp);
        vm.expectRevert(CapitalVault.InvalidPosition.selector);
        vault.onERC721Received(address(this), address(this), 1, "");
        (uint256 id,) = vault.openPosition(1000 ether, [uint128(50 ether), uint128(50 ether)], block.timestamp);
        vm.expectRevert(CapitalVault.InvalidPosition.selector);
        vault.collectFees([uint128(1), uint128(0)], block.timestamp);
        vm.expectRevert();
        vault.closePosition([type(uint128).max, type(uint128).max], block.timestamp);
        assertEq(posm.getPositionLiquidity(id), 1000 ether);
        assertEq(IERC721(address(posm)).ownerOf(id), address(vault));
        vm.expectRevert(CapitalVault.InvalidPosition.selector);
        vault.closePosition([uint128(0), uint128(0)], block.timestamp - 1);
    }
}
