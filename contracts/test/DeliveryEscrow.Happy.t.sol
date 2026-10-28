// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DeliveryEscrowBase} from "./DeliveryEscrow.Base.t.sol";
import {DeliveryEscrow}     from "../DeliveryEscrow.sol";

/// @dev Happy-path tests: deployment, createJob, markDelivered, release,
///      claimAfterReview, refund, split payout, withdraw, and single-payee bps check.
contract DeliveryEscrowHappyTest is DeliveryEscrowBase {

    // ── Deployment ─────────────────────────────────────────────────────────────

    function test_Deploy_UsesCorrectUsdcAddress() public view {
        assertEq(address(escrow.usdc()), address(0x3600000000000000000000000000000000000000));
    }

    function test_Deploy_NextJobIdStartsAtZero() public view {
        assertEq(escrow.nextJobId(), 0);
    }

    // ── TC-1: createJob → markDelivered → release (single payee) ───────────────

    function test_HappyPath_CreateMarkRelease() public {
        uint256 freelancerBalBefore = usdc.balanceOf(freelancer);

        // createJob
        uint256 jobId = _createSinglePayeeJob();
        assertEq(escrow.nextJobId(), 1);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);

        // markDelivered
        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://delivery");

        DeliveryEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(job.status, 1 /* STATUS_DELIVERED */);
        assertEq(job.deliveryUri, "ipfs://delivery");
        assertGt(job.deliveredAt, 0);

        // release — queues into pendingWithdrawals, does NOT transfer yet
        vm.prank(client);
        escrow.release(jobId);

        job = escrow.getJob(jobId);
        assertEq(job.status, 2 /* STATUS_RELEASED */);

        // Pull-payment: balances unchanged until withdraw()
        assertEq(usdc.balanceOf(freelancer), freelancerBalBefore);
        assertGt(escrow.pendingWithdrawals(freelancer), 0, "pending should be > 0");

        // freelancer withdraws
        vm.prank(freelancer);
        escrow.withdraw();

        assertEq(usdc.balanceOf(freelancer), freelancerBalBefore + AMOUNT);
        assertEq(escrow.pendingWithdrawals(freelancer), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // Events for TC-1

    function test_CreateJob_EmitsJobCreated() public {
        (address[3] memory addrs, uint16[3] memory bps) = _singlePayeeArrays();
        vm.prank(client);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit DeliveryEscrow.JobCreated(0, client, freelancer, AMOUNT, deliverBy);
        escrow.createJob(freelancer, AMOUNT, deliverBy, REVIEW_WINDOW, "desc", addrs, bps, 1);
    }

    function test_MarkDelivered_EmitsDelivered() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(freelancer);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit DeliveryEscrow.Delivered(jobId, "ipfs://d", uint40(block.timestamp));
        escrow.markDelivered(jobId, "ipfs://d");
    }

    function test_Release_EmitsReleased() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://d");
        vm.prank(client);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit DeliveryEscrow.Released(jobId, uint40(block.timestamp));
        escrow.release(jobId);
    }

    // ── TC-2: createJob → markDelivered → wait → claimAfterReview ──────────────

    function test_SilentClient_ClaimAfterReview() public {
        uint256 freelancerBalBefore = usdc.balanceOf(freelancer);
        uint256 jobId = _createSinglePayeeJob();

        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://delivery2");

        DeliveryEscrow.Job memory job = escrow.getJob(jobId);
        // Warp past the review window
        vm.warp(uint256(job.deliveredAt) + uint256(job.reviewWindow) + 1);

        vm.prank(freelancer);
        escrow.claimAfterReview(jobId);

        job = escrow.getJob(jobId);
        assertEq(job.status, 3 /* STATUS_CLAIMED */);

        // pendingWithdrawals should now hold the amount
        assertGt(escrow.pendingWithdrawals(freelancer), 0, "pending should be > 0");
        assertEq(usdc.balanceOf(freelancer), freelancerBalBefore, "balance should not change yet");

        // freelancer pulls payment
        vm.prank(freelancer);
        escrow.withdraw();

        assertEq(usdc.balanceOf(freelancer), freelancerBalBefore + AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_ClaimAfterReview_EmitsClaimed() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://d");
        DeliveryEscrow.Job memory job = escrow.getJob(jobId);
        vm.warp(uint256(job.deliveredAt) + uint256(job.reviewWindow) + 1);
        vm.prank(freelancer);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit DeliveryEscrow.Claimed(jobId, uint40(block.timestamp));
        escrow.claimAfterReview(jobId);
    }

    // ── TC-3: createJob → time passes past deliverBy → refund ──────────────────

    function test_RefundAfterMissedDeadline() public {
        uint256 jobId = _createSinglePayeeJob();

        uint256 clientBalBefore = usdc.balanceOf(client);
        // Warp past deliverBy
        vm.warp(uint256(deliverBy) + 1);

        vm.prank(client);
        escrow.refund(jobId);

        DeliveryEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(job.status, 4 /* STATUS_REFUNDED */);

        // Pull-payment: balance unchanged until withdraw()
        assertEq(usdc.balanceOf(client), clientBalBefore, "balance should not change yet");
        assertGt(escrow.pendingWithdrawals(client), 0, "pending should be > 0");

        // client pulls refund
        vm.prank(client);
        escrow.withdraw();

        assertEq(usdc.balanceOf(client), clientBalBefore + AMOUNT);
        assertEq(escrow.pendingWithdrawals(client), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_Refund_EmitsRefunded() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.warp(uint256(deliverBy) + 1);
        vm.prank(client);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit DeliveryEscrow.Refunded(jobId, uint40(block.timestamp));
        escrow.refund(jobId);
    }

    // ── TC-4: 3-payee split payout ─────────────────────────────────────────────

    function test_SplitPayout_ThreePayees() public {
        uint256 jobId = _createThreePayeeJob();

        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://split");

        uint256 freelancerBefore = usdc.balanceOf(freelancer);
        uint256 payee1Before     = usdc.balanceOf(payee1);
        uint256 payee2Before     = usdc.balanceOf(payee2);

        vm.prank(client);
        escrow.release(jobId);

        // payeeAddrs[1]=payee1  3000 bps → 300 USDC
        // payeeAddrs[2]=payee2  2000 bps → 200 USDC
        // payeeAddrs[0]=freelancer 5000 bps → remainder = 1000 - 300 - 200 = 500 USDC
        uint256 share1 = (uint256(AMOUNT) * 3_000) / 10_000; // 300e6
        uint256 share2 = (uint256(AMOUNT) * 2_000) / 10_000; // 200e6
        uint256 share0 = uint256(AMOUNT) - share1 - share2;   // 500e6

        // Verify pending amounts are queued correctly
        assertEq(escrow.pendingWithdrawals(payee1),     share1, "payee1 pending wrong");
        assertEq(escrow.pendingWithdrawals(payee2),     share2, "payee2 pending wrong");
        assertEq(escrow.pendingWithdrawals(freelancer), share0, "freelancer pending wrong");

        // Each payee withdraws
        vm.prank(payee1);
        escrow.withdraw();
        vm.prank(payee2);
        escrow.withdraw();
        vm.prank(freelancer);
        escrow.withdraw();

        assertEq(usdc.balanceOf(payee1)     - payee1Before,     share1, "payee1 share wrong");
        assertEq(usdc.balanceOf(payee2)     - payee2Before,     share2, "payee2 share wrong");
        assertEq(usdc.balanceOf(freelancer) - freelancerBefore, share0, "freelancer share wrong");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow not empty");
    }

    // ── TC-5: withdraw() emits Withdrawn ──────────────────────────────────────

    function test_Withdraw_EmitsWithdrawn() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://d");
        vm.prank(client);
        escrow.release(jobId);

        uint128 pending = escrow.pendingWithdrawals(freelancer);
        vm.prank(freelancer);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit DeliveryEscrow.Withdrawn(freelancer, pending);
        escrow.withdraw();
    }

    // ── TC-6: withdraw() clears pendingWithdrawals to zero ────────────────────

    function test_Withdraw_ClearsPending() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://d");
        vm.prank(client);
        escrow.release(jobId);

        assertGt(escrow.pendingWithdrawals(freelancer), 0);

        vm.prank(freelancer);
        escrow.withdraw();

        assertEq(escrow.pendingWithdrawals(freelancer), 0, "pending not cleared");
    }

    // ── TC-9: createJob payeeCount=1 uses freelancer as sole payee; bps=10000 ──

    function test_SinglePayee_FreelancerIsSolePayee() public {
        uint256 jobId = _createSinglePayeeJob();
        DeliveryEscrow.Job memory job = escrow.getJob(jobId);

        assertEq(job.payeeCount, 1);
        assertEq(job.payeeAddrs[0], freelancer);
        assertEq(job.payeeBps[0],   10_000);
    }

    // ── jobCount helper ────────────────────────────────────────────────────────

    function test_JobCount_IncrementsOnCreate() public {
        assertEq(escrow.jobCount(), 0);
        _createSinglePayeeJob();
        assertEq(escrow.jobCount(), 1);
        _createSinglePayeeJob();
        assertEq(escrow.jobCount(), 2);
    }

    // ── Balance-delta accounting: job.amount == received tokens ───────────────

    function test_CreateJob_StoresReceivedAmount() public {
        uint256 jobId = _createSinglePayeeJob();
        DeliveryEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(job.amount, AMOUNT, "job.amount should equal received tokens");
    }
}
