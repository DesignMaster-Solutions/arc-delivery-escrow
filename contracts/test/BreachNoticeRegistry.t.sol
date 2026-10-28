// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DeliveryEscrowBase} from "./DeliveryEscrow.Base.t.sol";
import {BreachNoticeRegistry} from "../cre/BreachNoticeRegistry.sol";
import {ReceiverTemplate} from "../cre/ReceiverTemplate.sol";

contract BreachNoticeRegistryTest is DeliveryEscrowBase {
    address internal forwarder = makeAddr("forwarder");
    BreachNoticeRegistry internal registry;

    function setUp() public override {
        super.setUp();
        registry = new BreachNoticeRegistry(forwarder, address(escrow));
    }

    function _report(uint256 jobId, uint8 kind) internal {
        uint256[] memory ids = new uint256[](1);
        uint8[] memory kinds = new uint8[](1);
        ids[0] = jobId;
        kinds[0] = kind;
        vm.prank(forwarder);
        registry.onReport("", abi.encode(ids, kinds));
    }

    function test_DeadlineMissed_RecordsNoticeForClient() public {
        uint256 id = _createSinglePayeeJob();
        vm.warp(uint256(deliverBy) + 1);

        (uint8 kind, address party) = registry.noticeDue(id);
        assertEq(kind, 1);
        assertEq(party, client);

        _report(id, 1);
        (uint8 k, uint40 at, address p) = registry.notices(id);
        assertEq(k, 1);
        assertEq(at, uint40(block.timestamp));
        assertEq(p, client);
        assertEq(registry.noticeCount(), 1);
    }

    function test_ReviewLapsed_RecordsNoticeForFreelancer() public {
        uint256 id = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(id, "ipfs://delivery");
        vm.warp(block.timestamp + REVIEW_WINDOW);

        _report(id, 2);
        (uint8 k,, address p) = registry.notices(id);
        assertEq(k, 2);
        assertEq(p, freelancer);
    }

    function test_NotInBreach_IsRejected() public {
        uint256 id = _createSinglePayeeJob();
        vm.expectEmit(true, false, false, true);
        emit BreachNoticeRegistry.NoticeRejected(id, 1);
        _report(id, 1);
        (uint8 k,,) = registry.notices(id);
        assertEq(k, 0);
        assertEq(registry.noticeCount(), 0);
    }

    function test_WrongKind_IsRejected() public {
        uint256 id = _createSinglePayeeJob();
        vm.warp(uint256(deliverBy) + 1);
        _report(id, 2);
        (uint8 k,,) = registry.notices(id);
        assertEq(k, 0);
    }

    function test_ReviewWindowStillOpen_IsRejected() public {
        uint256 id = _createSinglePayeeJob();
        vm.prank(freelancer);
        escrow.markDelivered(id, "ipfs://delivery");
        vm.warp(block.timestamp + REVIEW_WINDOW - 1);
        _report(id, 2);
        (uint8 k,,) = registry.notices(id);
        assertEq(k, 0);
    }

    function test_Replay_DoesNotOverwrite() public {
        uint256 id = _createSinglePayeeJob();
        uint256 t = uint256(deliverBy) + 1; // via_ir caches block.timestamp across warps
        vm.warp(t);
        _report(id, 1);
        vm.warp(t + 1 days);
        _report(id, 1);
        (, uint40 at,) = registry.notices(id);
        assertEq(at, uint40(t));
        assertEq(registry.noticeCount(), 1);
    }

    function test_Revert_OnlyForwarder() public {
        uint256[] memory ids = new uint256[](0);
        uint8[] memory kinds = new uint8[](0);
        vm.prank(stranger);
        vm.expectRevert();
        registry.onReport("", abi.encode(ids, kinds));
    }

    function test_UnknownJob_NoNoticeDue() public view {
        (uint8 kind,) = registry.noticeDue(999);
        assertEq(kind, 0);
    }
}
