// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {DemoToken} from "../src/DemoToken.sol";

contract DemoTokenTest is Test {
    function testOneClaimPerAddress() public {
        DemoToken token = new DemoToken("Valueless Demo A", "DEMOA");
        token.mint();
        assertEq(token.balanceOf(address(this)), 1000 ether);
        vm.expectRevert(DemoToken.AlreadyClaimed.selector);
        token.mint();
        vm.prank(address(0xB0B));
        token.mint();
        assertEq(token.totalSupply(), 2000 ether);
    }
}
