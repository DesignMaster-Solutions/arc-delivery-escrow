// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DeliveryEscrowBase} from "./DeliveryEscrow.Base.t.sol";
import {DeliveryEscrow}     from "../DeliveryEscrow.sol";

/// @dev Fuzz tests for arithmetic properties of DeliveryEscrow.
contract DeliveryEscrowFuzzTest is DeliveryEscrowBase {

    /// @dev The full amount deposited is always queued into pendingWithdrawals
    ///      and withdrawable by the freelancer (single payee, pull-payment model).
    function testFuzz_Release_FreelancerReceivesFullAmount(uint128 amount) public {
        amount = uint128(bound(uint256(amount), 1, type(uint64).max)); // 1 .. ~18.4e18

        usdc.mint(client, amount);
        vm.prank(client);
        usdc.approve(address(escrow), type(uint256).max);

        address[3] memory addrs;
        uint16[3]  memory bps;
        addrs[0] = freelancer; bps[0] = 10_000;

        vm.prank(client);
        uint256 jobId = escrow.createJob(
            freelancer, amount, deliverBy, REVIEW_WINDOW, "fuzz", addrs, bps, 1
        );

        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://fuzz");

        // release queues into pendingWithdrawals
        vm.prank(client);
        escrow.release(jobId);

        // Verify pending amount equals what was deposited
        assertEq(escrow.pendingWithdrawals(freelancer), amount, "pending != deposited amount");

        // freelancer pulls their payment
        uint256 balBefore = usdc.balanceOf(freelancer);
        vm.prank(freelancer);
        escrow.withdraw();

        assertEq(usdc.balanceOf(freelancer) - balBefore, amount, "received != deposited amount");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow not drained");
        assertEq(escrow.pendingWithdrawals(freelancer), 0, "pending not cleared");
    }

    /// @dev claimAfterReview is only accessible after the review window ends,
    ///      for any valid review window duration.
    function testFuzz_ClaimAfterReview_OnlyAfterWindow(uint32 window) public {
        window = uint32(bound(uint256(window), 1, 365 days));

        address[3] memory addrs;
        uint16[3]  memory bps;
        addrs[0] = freelancer; bps[0] = 10_000;

        vm.prank(client);
        uint256 jobId = escrow.createJob(
            freelancer, AMOUNT, deliverBy, window, "fuzz-window", addrs, bps, 1
        );

        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://w");

        DeliveryEscrow.Job memory job = escrow.getJob(jobId);
        uint256 reviewEnds = uint256(job.deliveredAt) + uint256(job.reviewWindow);

        // Should revert before window closes
        vm.warp(reviewEnds - 1);
        vm.prank(freelancer);
        vm.expectRevert(DeliveryEscrow.ReviewWindowOpen.selector);
        escrow.claimAfterReview(jobId);

        // Should succeed after window closes
        vm.warp(reviewEnds + 1);
        vm.prank(freelancer);
        escrow.claimAfterReview(jobId);
        assertEq(escrow.getJob(jobId).status, 3 /* STATUS_CLAIMED */);

        // freelancer must withdraw to receive funds
        assertGt(escrow.pendingWithdrawals(freelancer), 0, "pending should be > 0 after claim");
        vm.prank(freelancer);
        escrow.withdraw();
        assertEq(escrow.pendingWithdrawals(freelancer), 0, "pending not cleared after withdraw");
    }

    /// @dev The sum of all payee receipts (after each withdraws) always equals
    ///      the escrowed amount. Tests two-payee splits with any valid bps allocation.
    function testFuzz_SplitPayout_SumsToTotal(uint16 bps0) public {
        // bps0 for payeeAddrs[0]=freelancer, remainder goes to payeeAddrs[1]=payee1
        bps0 = uint16(bound(uint256(bps0), 1, 9_999));
        uint16 bps1 = 10_000 - bps0;

        address[3] memory addrs;
        uint16[3]  memory bps;
        addrs[0] = freelancer; bps[0] = bps0;
        addrs[1] = payee1;     bps[1] = bps1;

        vm.prank(client);
        uint256 jobId = escrow.createJob(
            freelancer, AMOUNT, deliverBy, REVIEW_WINDOW, "fuzz-split", addrs, bps, 2
        );

        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://split");

        uint256 f0Before = usdc.balanceOf(freelancer);
        uint256 p1Before = usdc.balanceOf(payee1);

        // release queues pending withdrawals
        vm.prank(client);
        escrow.release(jobId);

        // Verify pending amounts sum to total before any withdrawals
        uint256 totalPending =
            uint256(escrow.pendingWithdrawals(freelancer)) +
            uint256(escrow.pendingWithdrawals(payee1));
        assertEq(totalPending, AMOUNT, "pending sum != escrowed amount");

        // Each payee withdraws
        vm.prank(freelancer);
        escrow.withdraw();
        vm.prank(payee1);
        escrow.withdraw();

        uint256 totalReceived =
            (usdc.balanceOf(freelancer) - f0Before) +
            (usdc.balanceOf(payee1) - p1Before);

        assertEq(totalReceived, AMOUNT, "payout sum != escrowed amount");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow not drained");
    }

    /// @dev balance-delta accounting: job.amount always reflects exactly
    ///      the tokens received, regardless of the requested amount parameter.
    function testFuzz_CreateJob_AmountMatchesReceived(uint128 amount) public {
        amount = uint128(bound(uint256(amount), 1, type(uint64).max));

        usdc.mint(client, amount);
        vm.prank(client);
        usdc.approve(address(escrow), type(uint256).max);

        address[3] memory addrs;
        uint16[3]  memory bps;
        addrs[0] = freelancer; bps[0] = 10_000;

        uint256 balBefore = usdc.balanceOf(address(escrow));

        vm.prank(client);
        uint256 jobId = escrow.createJob(
            freelancer, amount, deliverBy, REVIEW_WINDOW, "fuzz-delta", addrs, bps, 1
        );

        uint256 received = usdc.balanceOf(address(escrow)) - balBefore;
        DeliveryEscrow.Job memory job = escrow.getJob(jobId);

        assertEq(job.amount, received, "job.amount != actual received tokens");
    }
}
