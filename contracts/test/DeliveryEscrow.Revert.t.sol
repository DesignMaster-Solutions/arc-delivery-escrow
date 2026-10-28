// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DeliveryEscrowBase} from "./DeliveryEscrow.Base.t.sol";
import {DeliveryEscrow}     from "../DeliveryEscrow.sol";

/// @dev Revert-path tests: access control, double-release, timing guards,
///      createJob validation (TC 5–10), and withdraw() revert paths.
contract DeliveryEscrowRevertTest is DeliveryEscrowBase {

    // ── TC-5: unauthorized callers revert ──────────────────────────────────────

    // Non-freelancer calling markDelivered
    function test_Revert_NonFreelancer_MarkDelivered() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(stranger);
        vm.expectRevert(DeliveryEscrow.NotFreelancer.selector);
        escrow.markDelivered(jobId, "ipfs://x");
    }

    // Non-client calling release
    function test_Revert_NonClient_Release() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://x");
        vm.prank(stranger);
        vm.expectRevert(DeliveryEscrow.NotClient.selector);
        escrow.release(jobId);
    }

    // Non-freelancer calling claimAfterReview
    function test_Revert_NonFreelancer_ClaimAfterReview() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://x");
        DeliveryEscrow.Job memory job = escrow.getJob(jobId);
        vm.warp(uint256(job.deliveredAt) + uint256(job.reviewWindow) + 1);
        vm.prank(stranger);
        vm.expectRevert(DeliveryEscrow.NotFreelancer.selector);
        escrow.claimAfterReview(jobId);
    }

    // Non-client calling refund
    function test_Revert_NonClient_Refund() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.warp(uint256(deliverBy) + 1);
        vm.prank(stranger);
        vm.expectRevert(DeliveryEscrow.NotClient.selector);
        escrow.refund(jobId);
    }

    // ── TC-6: double release reverts ───────────────────────────────────────────

    function test_Revert_DoubleRelease() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://x");
        vm.prank(client);
        escrow.release(jobId);
        // Status is now RELEASED (2), not DELIVERED (1)
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.WrongStatus.selector);
        escrow.release(jobId);
    }

    // ── TC-7: claimAfterReview reverts if reviewWindow has not passed ───────────

    function test_Revert_ClaimBeforeReviewWindowExpires() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://x");
        // Do NOT warp past the review window
        vm.prank(freelancer);
        vm.expectRevert(DeliveryEscrow.ReviewWindowOpen.selector);
        escrow.claimAfterReview(jobId);
    }

    // Boundary: exactly at reviewEnds succeeds (guard is strict <, so == is allowed).
    function test_ClaimExactlyAtReviewEnd_Succeeds() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://x");
        DeliveryEscrow.Job memory job = escrow.getJob(jobId);
        // Warp to exactly reviewEnds — block.timestamp < reviewEnds is false → no revert
        vm.warp(uint256(job.deliveredAt) + uint256(job.reviewWindow));
        vm.prank(freelancer);
        escrow.claimAfterReview(jobId);
        assertEq(escrow.getJob(jobId).status, 3 /* STATUS_CLAIMED */);
        // freelancer must still withdraw to get funds
        assertGt(escrow.pendingWithdrawals(freelancer), 0);
        vm.prank(freelancer);
        escrow.withdraw();
        assertEq(escrow.pendingWithdrawals(freelancer), 0);
    }

    // ── TC-8: refund reverts if deadline has not passed ────────────────────────

    function test_Revert_RefundBeforeDeadline() public {
        uint256 jobId = _createSinglePayeeJob();
        // Still before deliverBy
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.DeadlineNotPassed.selector);
        escrow.refund(jobId);
    }

    // Boundary: exactly at deliverBy still reverts (requires strictly >)
    function test_Revert_RefundExactlyAtDeadline() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.warp(uint256(deliverBy));
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.DeadlineNotPassed.selector);
        escrow.refund(jobId);
    }

    // ── TC-10: createJob fails if bps don't sum to 10000 ──────────────────────

    function test_Revert_CreateJob_BpsSumNot10000() public {
        address[3] memory addrs;
        uint16[3]  memory bps;
        addrs[0] = freelancer; bps[0] = 9_000; // 9000 ≠ 10000
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.InvalidPayeeBps.selector);
        escrow.createJob(freelancer, AMOUNT, deliverBy, REVIEW_WINDOW, "bad", addrs, bps, 1);
    }

    function test_Revert_CreateJob_BpsSumOver10000() public {
        address[3] memory addrs;
        uint16[3]  memory bps;
        addrs[0] = freelancer; bps[0] = 6_000;
        addrs[1] = payee1;     bps[1] = 5_000; // 11000 > 10000
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.InvalidPayeeBps.selector);
        escrow.createJob(freelancer, AMOUNT, deliverBy, REVIEW_WINDOW, "bad", addrs, bps, 2);
    }

    // ── Additional createJob validation ────────────────────────────────────────

    function test_Revert_CreateJob_ZeroFreelancer() public {
        (address[3] memory addrs, uint16[3] memory bps) = _singlePayeeArrays();
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.ZeroAddress.selector);
        escrow.createJob(address(0), AMOUNT, deliverBy, REVIEW_WINDOW, "z", addrs, bps, 1);
    }

    function test_Revert_CreateJob_ZeroAmount() public {
        (address[3] memory addrs, uint16[3] memory bps) = _singlePayeeArrays();
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.InvalidAmount.selector);
        escrow.createJob(freelancer, 0, deliverBy, REVIEW_WINDOW, "z", addrs, bps, 1);
    }

    function test_Revert_CreateJob_DeadlineInPast() public {
        (address[3] memory addrs, uint16[3] memory bps) = _singlePayeeArrays();
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.InvalidDeadline.selector);
        escrow.createJob(freelancer, AMOUNT, uint40(block.timestamp), REVIEW_WINDOW, "z", addrs, bps, 1);
    }

    function test_Revert_CreateJob_ZeroReviewWindow() public {
        (address[3] memory addrs, uint16[3] memory bps) = _singlePayeeArrays();
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.InvalidReviewWindow.selector);
        escrow.createJob(freelancer, AMOUNT, deliverBy, 0, "z", addrs, bps, 1);
    }

    function test_Revert_CreateJob_PayeeCountZero() public {
        (address[3] memory addrs, uint16[3] memory bps) = _singlePayeeArrays();
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.InvalidPayeeCount.selector);
        escrow.createJob(freelancer, AMOUNT, deliverBy, REVIEW_WINDOW, "z", addrs, bps, 0);
    }

    function test_Revert_CreateJob_PayeeCountOver3() public {
        (address[3] memory addrs, uint16[3] memory bps) = _singlePayeeArrays();
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.InvalidPayeeCount.selector);
        // payeeCount=4 exceeds max of 3
        escrow.createJob(freelancer, AMOUNT, deliverBy, REVIEW_WINDOW, "z", addrs, bps, 4);
    }

    function test_Revert_CreateJob_SinglePayeeNotFreelancer() public {
        address[3] memory addrs;
        uint16[3]  memory bps;
        // payeeCount=1 but addr != freelancer
        addrs[0] = payee1; bps[0] = 10_000;
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.InvalidPayeeBps.selector);
        escrow.createJob(freelancer, AMOUNT, deliverBy, REVIEW_WINDOW, "z", addrs, bps, 1);
    }

    // ── markDelivered: past deadline reverts ───────────────────────────────────

    function test_Revert_MarkDelivered_AfterDeadline() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.warp(uint256(deliverBy) + 1);
        vm.prank(freelancer);
        vm.expectRevert(DeliveryEscrow.DeadlinePassed.selector);
        escrow.markDelivered(jobId, "ipfs://late");
    }

    // ── markDelivered: wrong status reverts ────────────────────────────────────

    function test_Revert_MarkDelivered_AlreadyDelivered() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://x");
        vm.prank(freelancer);
        vm.expectRevert(DeliveryEscrow.WrongStatus.selector);
        escrow.markDelivered(jobId, "ipfs://y");
    }

    // ── release: wrong status (FUNDED, not DELIVERED) reverts ─────────────────

    function test_Revert_Release_WrongStatus_Funded() public {
        uint256 jobId = _createSinglePayeeJob();
        // Job is FUNDED, not DELIVERED
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.WrongStatus.selector);
        escrow.release(jobId);
    }

    // ── refund: wrong status (DELIVERED, not FUNDED) reverts ──────────────────

    function test_Revert_Refund_WrongStatus_AfterDelivery() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://x");
        vm.warp(uint256(deliverBy) + 1);
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.WrongStatus.selector);
        escrow.refund(jobId);
    }

    // ── withdraw(): NothingToWithdraw reverts ─────────────────────────────────

    function test_Revert_Withdraw_NothingToWithdraw() public {
        // stranger has no pending withdrawals
        vm.prank(stranger);
        vm.expectRevert(DeliveryEscrow.NothingToWithdraw.selector);
        escrow.withdraw();
    }

    // ── withdraw(): double withdraw reverts ───────────────────────────────────

    function test_Revert_Withdraw_DoubleWithdraw() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://x");
        vm.prank(client);
        escrow.release(jobId);

        // First withdraw succeeds
        vm.prank(freelancer);
        escrow.withdraw();

        // Second withdraw reverts — nothing left
        vm.prank(freelancer);
        vm.expectRevert(DeliveryEscrow.NothingToWithdraw.selector);
        escrow.withdraw();
    }

    // ── withdraw(): caller with zero pending reverts even after others have funds

    function test_Revert_Withdraw_WrongCallerNoPending() public {
        uint256 jobId = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(jobId, "ipfs://x");
        vm.prank(client);
        escrow.release(jobId);

        // client called release; freelancer has pending, but client does not
        assertEq(escrow.pendingWithdrawals(client), 0);
        vm.prank(client);
        vm.expectRevert(DeliveryEscrow.NothingToWithdraw.selector);
        escrow.withdraw();
    }
}
