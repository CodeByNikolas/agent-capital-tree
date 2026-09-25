// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {CapitalVault} from "../src/CapitalVault.sol";
import {NodeFactory} from "../src/NodeFactory.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DemoToken is ERC20 {
    constructor() ERC20("Demo", "DEMO") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract CapitalVaultTest is Test {
    function testFactoryBindsVaultToCallerAndFundsStayInVault() public {
        DemoToken token = new DemoToken();
        DemoToken other = new DemoToken();
        IERC20[2] memory tokens = address(token) < address(other)
            ? [IERC20(address(token)), IERC20(address(other))]
            : [IERC20(address(other)), IERC20(address(token))];
        NodeFactory factory = new NodeFactory(new VaultFactory(IPoolManager(address(0x123)), tokens));
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
}
