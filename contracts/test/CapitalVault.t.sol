// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {CapitalVault} from "../src/CapitalVault.sol";
import {NodeFactory} from "../src/NodeFactory.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {PositionManagerConfig, DummyPoolManager, DummyPermit2} from "./utils/PositionManagerConfig.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

contract DemoToken is ERC20 {
    constructor() ERC20("Demo", "DEMO") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract CapitalVaultTest is Test {
    function testCloneInitializationCannotBeTakenOverAndStorageIsIsolated() public {
        DemoToken token = new DemoToken();
        DemoToken other = new DemoToken();
        IERC20[2] memory tokens = address(token) < address(other)
            ? [IERC20(address(token)), IERC20(address(other))]
            : [IERC20(address(other)), IERC20(address(token))];
        IPoolManager manager = IPoolManager(address(new DummyPoolManager()));
        IAllowanceTransfer permit2 = IAllowanceTransfer(address(new DummyPermit2()));
        IPositionManager posm = IPositionManager(address(new PositionManagerConfig(manager, permit2)));
        VaultFactory factory = new VaultFactory(manager, posm, permit2, tokens);
        CapitalVault implementation = factory.IMPLEMENTATION();
        CapitalVault first = factory.createVault(address(this));
        CapitalVault second = factory.createVault(address(0xB0B));
        assertEq(address(first).code.length, 45);
        assertEq(address(second).code, address(first).code);
        assertEq(first.CONTROLLER(), address(this));
        assertEq(second.CONTROLLER(), address(0xB0B));
        assertEq(address(first.POOL_MANAGER()), address(manager));
        assertEq(address(first.POSITION_MANAGER()), address(posm));
        assertEq(address(first.PERMIT2()), address(permit2));
        assertEq(address(first.TOKEN0()), address(tokens[0]));
        assertEq(address(first.TOKEN1()), address(tokens[1]));

        vm.expectRevert(CapitalVault.OnlyFactory.selector);
        first.initialize(address(0xBAD));
        vm.prank(address(factory));
        vm.expectRevert(CapitalVault.AlreadyInitialized.selector);
        first.initialize(address(0xBAD));
        vm.prank(address(factory));
        vm.expectRevert(CapitalVault.AlreadyInitialized.selector);
        implementation.initialize(address(0xBAD));
        vm.expectRevert(CapitalVault.InvalidController.selector);
        factory.createVault(address(0));

        // Even an independently deployed, uninitialized clone rejects a foreign initializer.
        CapitalVault uninitialized = CapitalVault(Clones.clone(address(implementation)));
        vm.expectRevert(CapitalVault.OnlyFactory.selector);
        uninitialized.initialize(address(this));

        token.mint(address(first), 100);
        token.mint(address(second), 60);
        first.transferToken(token, address(0xCAFE), 20);
        assertEq(token.balanceOf(address(first)), 80);
        assertEq(token.balanceOf(address(second)), 60);
        assertEq(token.balanceOf(address(implementation)), 0);
        vm.expectRevert(CapitalVault.OnlyController.selector);
        second.transferToken(token, address(this), 60);
        assertEq(implementation.CONTROLLER(), address(implementation));
    }

    function testFactoryBindsVaultToCallerAndFundsStayInVault() public {
        DemoToken token = new DemoToken();
        DemoToken other = new DemoToken();
        IERC20[2] memory tokens = address(token) < address(other)
            ? [IERC20(address(token)), IERC20(address(other))]
            : [IERC20(address(other)), IERC20(address(token))];
        IPoolManager manager = IPoolManager(address(new DummyPoolManager()));
        IAllowanceTransfer permit2 = IAllowanceTransfer(address(new DummyPermit2()));
        IPositionManager posm = IPositionManager(address(new PositionManagerConfig(manager, permit2)));
        NodeFactory factory = new NodeFactory(new VaultFactory(manager, posm, permit2, tokens));
        CapitalVault vault = factory.createVault();
        token.mint(address(vault), 100);

        assertEq(vault.CONTROLLER(), address(this));
        vm.prank(address(0xBAD));
        vm.expectRevert(CapitalVault.OnlyController.selector);
        vault.transferToken(token, address(0xBAD), 100);
        assertEq(token.balanceOf(address(vault)), 100);

        vault.transferToken(token, address(0xB0B), 40);
        assertEq(token.balanceOf(address(vault)), 60);
        assertEq(token.balanceOf(address(0xB0B)), 40);
    }

    function testFactoryRejectsMismatchedPositionManager() public {
        DemoToken token = new DemoToken();
        DemoToken other = new DemoToken();
        IERC20[2] memory tokens = address(token) < address(other)
            ? [IERC20(address(token)), IERC20(address(other))]
            : [IERC20(address(other)), IERC20(address(token))];
        IPoolManager manager = IPoolManager(address(new DummyPoolManager()));
        IAllowanceTransfer permit2 = IAllowanceTransfer(address(new DummyPermit2()));
        IPositionManager wrong = IPositionManager(
            address(new PositionManagerConfig(IPoolManager(address(new DummyPoolManager())), permit2))
        );
        vm.expectRevert(VaultFactory.InvalidPool.selector);
        new VaultFactory(manager, wrong, permit2, tokens);
    }
}
