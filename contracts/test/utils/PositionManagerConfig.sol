// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

contract PositionManagerConfig {
    IPoolManager public immutable poolManager;
    IAllowanceTransfer public immutable permit2;

    constructor(IPoolManager manager, IAllowanceTransfer allowance) {
        poolManager = manager;
        permit2 = allowance;
    }
}

contract DummyPoolManager {}

contract DummyPermit2 {}
