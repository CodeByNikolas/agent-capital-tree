// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Token custody for one tree node. Only its immutable controller can move funds.
contract CapitalVault {
    using SafeERC20 for IERC20;

    error OnlyController();
    error InvalidController();

    address public immutable CONTROLLER;

    constructor(address controller) {
        if (controller == address(0)) revert InvalidController();
        CONTROLLER = controller;
    }

    function transferToken(IERC20 token, address recipient, uint256 amount) external {
        if (msg.sender != CONTROLLER) revert OnlyController();
        token.safeTransfer(recipient, amount);
    }
}
