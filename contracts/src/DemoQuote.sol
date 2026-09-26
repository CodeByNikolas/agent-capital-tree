// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Valueless six-decimal quote token for the Sepolia USDC demonstration pool.
contract DemoQuote is ERC20 {
    error AlreadyClaimed();
    mapping(address => bool) public claimed;

    constructor() ERC20("Valueless Demo Quote", "DEMO-USD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint() external {
        if (claimed[msg.sender]) revert AlreadyClaimed();
        claimed[msg.sender] = true;
        _mint(msg.sender, 1_000_000_000);
    }
}
