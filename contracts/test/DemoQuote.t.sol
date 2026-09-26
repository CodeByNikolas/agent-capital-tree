// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {Test} from "forge-std/Test.sol";
import {DemoQuote} from "../src/DemoQuote.sol";

contract DemoQuoteTest is Test {
    function testSixDecimalQuoteClaimIsBounded() public {
        DemoQuote quote = new DemoQuote();
        assertEq(quote.decimals(), 6);
        quote.mint();
        assertEq(quote.balanceOf(address(this)), 1000 * 1e6);
        vm.expectRevert(DemoQuote.AlreadyClaimed.selector);
        quote.mint();
    }
}
