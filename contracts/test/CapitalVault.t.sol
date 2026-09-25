// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {CapitalVault} from "../src/CapitalVault.sol";
import {NodeFactory} from "../src/NodeFactory.sol";

contract DemoToken is ERC20 {
    constructor() ERC20("Demo", "DEMO") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract CapitalVaultTest is Test {
    function testFactoryBindsVaultToCallerAndFundsStayInVault() public {
        NodeFactory factory = new NodeFactory();
        CapitalVault vault = factory.createVault();
        DemoToken token = new DemoToken();
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
