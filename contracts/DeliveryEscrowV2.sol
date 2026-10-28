// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DeliveryEscrow
/// @notice USDC escrow for freelance and agency deliverables on Arc.
///         Supports up to 3 payees with basis-point splits.
///         Uses pull-payment to prevent bricking on any single payee.
contract DeliveryEscrowV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────────────────────────────────
    // Status constants
    // ──────────────────────────────────────────────────────────────────────────
    uint8 private constant STATUS_FUNDED    = 0;
    uint8 private constant STATUS_DELIVERED = 1;
    uint8 private constant STATUS_RELEASED  = 2;
    uint8 private constant STATUS_CLAIMED   = 3;
    uint8 private constant STATUS_REFUNDED  = 4;

    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ──────────────────────────────────────────────────────────────────────────
    // Storage
    // ──────────────────────────────────────────────────────────────────────────
    IERC20 public immutable usdc;

    struct Job {
        address client;
        address freelancer;
        uint128 amount;
        uint40  deliverBy;
        uint32  reviewWindow;
        uint8   payeeCount;
        uint8   status;
        uint40  deliveredAt;
        string  description;
        string  deliveryUri;
        // Flat arrays instead of struct array to avoid tuple[3] in ABI
        address[3] payeeAddrs;
        uint16[3]  payeeBps;
    }

    mapping(uint256 => Job)     public jobs;
    mapping(address => uint128) public pendingWithdrawals;
    uint256 public nextJobId;

    // ──────────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────────
    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed freelancer,
        uint128 amount,
        uint40  deliverBy
    );
    event Delivered(uint256 indexed jobId, string deliveryUri, uint40 deliveredAt);
    event Released( uint256 indexed jobId, uint40 releasedAt);
    event Claimed(  uint256 indexed jobId, uint40 claimedAt);
    event Refunded( uint256 indexed jobId, uint40 refundedAt);
    event Withdrawn(address indexed payee, uint128 amount);

    // ──────────────────────────────────────────────────────────────────────────
    // Custom errors
    // ──────────────────────────────────────────────────────────────────────────
    error NotFreelancer();
    error NotClient();
    error WrongStatus();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error ReviewWindowOpen();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidReviewWindow();
    error InvalidPayeeCount();
    error InvalidPayeeBps();
    error ZeroAddress();
    error TransferFailed();
    error NothingToWithdraw();

    // ──────────────────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────────────────
    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Client: create a job
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Create a new escrow job.
    /// @param freelancer   Primary worker address (also payeeAddrs[0] when payeeCount==1).
    /// @param amount       USDC amount to escrow (6-decimal ERC-20).
    /// @param deliverBy    Unix timestamp deadline for delivery.
    /// @param reviewWindow Seconds the client has to call release after delivery.
    /// @param description  Human-readable description of the work.
    /// @param payeeAddrs   Up to 3 payee addresses (unused slots are ignored).
    /// @param payeeBps     Basis points for each payee; used slots must sum to 10 000.
    /// @param payeeCount   Number of active payees (1..3).
    function createJob(
        address   freelancer,
        uint128   amount,
        uint40    deliverBy,
        uint32    reviewWindow,
        string    calldata description,
        address[3] calldata payeeAddrs,
        uint16[3]  calldata payeeBps,
        uint8      payeeCount
    ) external nonReentrant returns (uint256 jobId) {
        if (freelancer == address(0)) revert ZeroAddress();
        if (amount == 0)              revert InvalidAmount();
        if (deliverBy <= uint40(block.timestamp)) revert InvalidDeadline();
        if (reviewWindow == 0)        revert InvalidReviewWindow();
        if (payeeCount == 0 || payeeCount > 3) revert InvalidPayeeCount();

        {
            uint256 bpsSum;
            for (uint256 i = 0; i < payeeCount; ++i) {
                if (payeeAddrs[i] == address(0)) revert ZeroAddress();
                if (payeeBps[i] == 0 || payeeBps[i] > BPS_DENOMINATOR) revert InvalidPayeeBps();
                bpsSum += payeeBps[i];
            }
            if (bpsSum != BPS_DENOMINATOR) revert InvalidPayeeBps();
        }

        if (payeeCount == 1 && payeeAddrs[0] != freelancer) revert InvalidPayeeBps();

        // Balance-delta accounting: robust against fee-on-transfer tokens
        uint256 balanceBefore = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = usdc.balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert InvalidAmount();

        jobId = nextJobId;
        nextJobId = jobId + 1;

        Job storage job = jobs[jobId];
        job.client       = msg.sender;
        job.freelancer   = freelancer;
        job.amount       = uint128(received);
        job.deliverBy    = deliverBy;
        job.reviewWindow = reviewWindow;
        job.payeeCount   = payeeCount;
        job.status       = STATUS_FUNDED;
        job.description  = description;

        for (uint256 i = 0; i < payeeCount; ++i) {
            job.payeeAddrs[i] = payeeAddrs[i];
            job.payeeBps[i]   = payeeBps[i];
        }

        emit JobCreated(jobId, msg.sender, freelancer, amount, deliverBy);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Freelancer: mark delivered
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Record delivery and start the review window.
    function markDelivered(uint256 jobId, string calldata deliveryUri) external {
        Job storage job = jobs[jobId];
        if (msg.sender != job.freelancer)         revert NotFreelancer();
        if (job.status != STATUS_FUNDED)          revert WrongStatus();
        if (block.timestamp > job.deliverBy)      revert DeadlinePassed();

        job.status      = STATUS_DELIVERED;
        job.deliveredAt = uint40(block.timestamp);
        job.deliveryUri = deliveryUri;

        emit Delivered(jobId, deliveryUri, uint40(block.timestamp));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Client: release payment
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Approve delivery and queue payment to payees.
    function release(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (msg.sender != job.client)    revert NotClient();
        if (job.status != STATUS_DELIVERED) revert WrongStatus();

        job.status = STATUS_RELEASED;   // CEI: state before external effects
        _queuePayouts(job);

        emit Released(jobId, uint40(block.timestamp));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Freelancer: claim after silent client
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Claim payment when the client does not release within the review window.
    function claimAfterReview(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (msg.sender != job.freelancer)    revert NotFreelancer();
        if (job.status != STATUS_DELIVERED)  revert WrongStatus();

        uint256 reviewEnds = uint256(job.deliveredAt) + uint256(job.reviewWindow);
        if (block.timestamp < reviewEnds)    revert ReviewWindowOpen();

        job.status = STATUS_CLAIMED;        // CEI
        _queuePayouts(job);

        emit Claimed(jobId, uint40(block.timestamp));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Client: refund after missed deadline
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Reclaim escrowed USDC when freelancer missed the deadline.
    function refund(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (msg.sender != job.client)     revert NotClient();
        if (job.status != STATUS_FUNDED)  revert WrongStatus();
        if (block.timestamp <= job.deliverBy) revert DeadlineNotPassed();

        job.status = STATUS_REFUNDED;     // CEI
        pendingWithdrawals[job.client] += job.amount;

        emit Refunded(jobId, uint40(block.timestamp));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Payee: withdraw queued funds
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Withdraw USDC queued to msg.sender from one or more completed jobs.
    function withdraw() external nonReentrant {
        uint128 amt = pendingWithdrawals[msg.sender];
        if (amt == 0) revert NothingToWithdraw();

        pendingWithdrawals[msg.sender] = 0; // CEI
        usdc.safeTransfer(msg.sender, amt);

        emit Withdrawn(msg.sender, amt);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // View helpers
    // ──────────────────────────────────────────────────────────────────────────

    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    function jobCount() external view returns (uint256) {
        return nextJobId;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────────────────────────────────

    /// @dev Queue payouts to pendingWithdrawals. Dust goes to payees[0].
    function _queuePayouts(Job storage job) internal {
        uint256 total = uint256(job.amount);
        uint256 distributed;

        for (uint256 i = 1; i < job.payeeCount; ++i) {
            uint256 share = (total * uint256(job.payeeBps[i])) / BPS_DENOMINATOR;
            distributed += share;
            pendingWithdrawals[job.payeeAddrs[i]] += uint128(share);
        }

        // Remainder (including dust) to first payee
        uint256 remainder = total - distributed;
        pendingWithdrawals[job.payeeAddrs[0]] += uint128(remainder);
    }
}
