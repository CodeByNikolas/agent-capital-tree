// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Valueless Sepolia demo asset; each address may claim once.
contract DemoToken is ERC20 {
    error AlreadyClaimed();

    uint256 public constant CLAIM_AMOUNT = 1000 ether;
    mapping(address => bool) public claimed;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint() external {
        if (claimed[msg.sender]) revert AlreadyClaimed();
        claimed[msg.sender] = true;
        _mint(msg.sender, CLAIM_AMOUNT);
    }
}
