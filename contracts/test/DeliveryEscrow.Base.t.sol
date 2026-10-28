// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DeliveryEscrow} from "../DeliveryEscrow.sol";
import {MockERC20}      from "../test-helpers/MockERC20.sol";

/// @dev Shared fixtures, actors, and helpers for all DeliveryEscrow test suites.
abstract contract DeliveryEscrowBase is Test {
    // ── Canonical USDC address (hardcoded in constructor arg) ──────────────────
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    // ── Actors ─────────────────────────────────────────────────────────────────
    address internal client     = makeAddr("client");
    address internal freelancer = makeAddr("freelancer");
    address internal payee1     = makeAddr("payee1");
    address internal payee2     = makeAddr("payee2");
    address internal stranger   = makeAddr("stranger");

    // ── Contracts ──────────────────────────────────────────────────────────────
    MockERC20       internal usdc;
    DeliveryEscrow  internal escrow;

    // ── Common job parameters ──────────────────────────────────────────────────
    uint128 internal constant AMOUNT        = 1_000e6;   // 1 000 USDC (6 dec)
    uint32  internal constant REVIEW_WINDOW = 3 days;

    // deliverBy is set relative to block.timestamp in setUp so tests can use
    // vm.warp freely without breaking the "deliverBy > block.timestamp" check.
    uint40 internal deliverBy;

    // ── setUp ──────────────────────────────────────────────────────────────────
    function setUp() public virtual {
        // 1. Deploy a fresh MockERC20 and etch its bytecode at the canonical addr.
        MockERC20 mockImpl = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(mockImpl).code);
        usdc = MockERC20(USDC_ADDR);

        // 2. Deploy the escrow (constructor reads USDC_ADDR, which now has code).
        escrow = new DeliveryEscrow(USDC_ADDR);

        // 3. Set a baseline deliverBy relative to *current* block.timestamp.
        deliverBy = uint40(block.timestamp + 7 days);

        // 4. Fund the client and grant allowance.
        usdc.mint(client, AMOUNT * 10);
        vm.prank(client);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /// @dev Build a single-payee flat arrays where payeeAddrs[0] == freelancer.
    function _singlePayeeArrays()
        internal
        view
        returns (address[3] memory addrs, uint16[3] memory bps)
    {
        addrs[0] = freelancer;
        bps[0]   = 10_000;
    }

    /// @dev Build a 3-payee split: [freelancer 5000bps, payee1 3000bps, payee2 2000bps].
    function _threePayeeArrays()
        internal
        view
        returns (address[3] memory addrs, uint16[3] memory bps)
    {
        addrs[0] = freelancer; bps[0] = 5_000;
        addrs[1] = payee1;     bps[1] = 3_000;
        addrs[2] = payee2;     bps[2] = 2_000;
    }

    /// @dev Create a standard single-payee job and return its jobId.
    function _createSinglePayeeJob() internal returns (uint256 jobId) {
        (address[3] memory addrs, uint16[3] memory bps) = _singlePayeeArrays();
        vm.prank(client);
        jobId = escrow.createJob(
            freelancer,
            AMOUNT,
            deliverBy,
            REVIEW_WINDOW,
            "Test job",
            addrs,
            bps,
            1
        );
    }

    /// @dev Create a 3-payee job and return its jobId.
    function _createThreePayeeJob() internal returns (uint256 jobId) {
        (address[3] memory addrs, uint16[3] memory bps) = _threePayeeArrays();
        vm.prank(client);
        jobId = escrow.createJob(
            freelancer,
            AMOUNT,
            deliverBy,
            REVIEW_WINDOW,
            "Split job",
            addrs,
            bps,
            3
        );
    }
}
