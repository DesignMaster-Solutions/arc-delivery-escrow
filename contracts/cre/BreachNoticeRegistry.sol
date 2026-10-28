// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";
import {DeliveryEscrow} from "../DeliveryEscrow.sol";

/// @title BreachNoticeRegistry
/// @notice On-chain registry of contractual notices for DeliveryEscrow jobs, fed by a
///         Chainlink CRE workflow. The workflow only nominates jobs; this contract
///         re-checks every condition against the escrow state at execution time, so a
///         notice can never be recorded for a job that is not actually in breach.
/// @dev Notice kinds:
///      1 = DELIVERY_DEADLINE_MISSED: job still FUNDED after deliverBy. Entitled party: client (refund).
///      2 = REVIEW_WINDOW_LAPSED: job DELIVERED and the client stayed silent for the whole review
///          window. Entitled party: freelancer (claimAfterReview).
contract BreachNoticeRegistry is ReceiverTemplate {
    uint8 public constant DEADLINE_MISSED = 1;
    uint8 public constant REVIEW_LAPSED = 2;

    uint8 private constant STATUS_FUNDED = 0;
    uint8 private constant STATUS_DELIVERED = 1;

    struct Notice {
        uint8 kind;
        uint40 recordedAt;
        address entitledParty;
    }

    DeliveryEscrow public immutable escrow;
    mapping(uint256 => Notice) public notices;
    uint256 public noticeCount;

    event NoticeRecorded(uint256 indexed jobId, uint8 kind, address indexed entitledParty, uint40 recordedAt);
    event NoticeRejected(uint256 indexed jobId, uint8 kind);

    error LengthMismatch();

    constructor(address forwarder, address escrow_) ReceiverTemplate(forwarder) {
        escrow = DeliveryEscrow(escrow_);
    }

    /// @notice Pure view used by the workflow and the UI: which notice (if any) applies right now.
    function noticeDue(uint256 jobId) public view returns (uint8 kind, address party) {
        DeliveryEscrow.Job memory job = escrow.getJob(jobId);
        if (job.client == address(0)) return (0, address(0));
        if (job.status == STATUS_FUNDED && block.timestamp > job.deliverBy) {
            return (DEADLINE_MISSED, job.client);
        }
        if (job.status == STATUS_DELIVERED && block.timestamp >= uint256(job.deliveredAt) + job.reviewWindow) {
            return (REVIEW_LAPSED, job.freelancer);
        }
        return (0, address(0));
    }

    /// @dev Report payload: abi.encode(uint256[] jobIds, uint8[] kinds).
    function _processReport(bytes calldata report) internal override {
        (uint256[] memory jobIds, uint8[] memory kinds) = abi.decode(report, (uint256[], uint8[]));
        if (jobIds.length != kinds.length) revert LengthMismatch();

        for (uint256 i; i < jobIds.length; ++i) {
            uint256 jobId = jobIds[i];
            // Idempotent: a replayed or repeated report never overwrites the first notice.
            if (notices[jobId].kind != 0) continue;

            (uint8 kind, address party) = noticeDue(jobId);
            if (kind == 0 || kind != kinds[i]) {
                emit NoticeRejected(jobId, kinds[i]);
                continue;
            }
            notices[jobId] = Notice(kind, uint40(block.timestamp), party);
            ++noticeCount;
            emit NoticeRecorded(jobId, kind, party, uint40(block.timestamp));
        }
    }
}
