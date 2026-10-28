// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {DeliveryEscrow} from "../DeliveryEscrow.sol";

/**
 * @title Deploy
 * @notice Deploys DeliveryEscrow with the USDC address for the target chain.
 *
 * Usage (Arc Testnet):
 *   forge script contracts/script/Deploy.s.sol \
 *     --rpc-url https://rpc.testnet.arc.io \
 *     --broadcast \
 *     --private-key $PRIVATE_KEY
 *
 * Usage (Arc Mainnet):
 *   forge script contracts/script/Deploy.s.sol \
 *     --rpc-url https://rpc.mainnet.arc.io \
 *     --broadcast \
 *     --private-key $PRIVATE_KEY
 *
 * Override USDC address via env:
 *   USDC_ADDRESS=0x... forge script contracts/script/Deploy.s.sol ...
 *
 * The script selects the canonical Arc USDC address (0x3600...0000) by default,
 * which is the same on both Arc Testnet and Arc Mainnet.
 */
contract Deploy is Script {
    /// Arc canonical USDC address — same on both testnet and mainnet.
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (address deployed) {
        // Allow override via env so the script works on any EVM fork.
        address usdc = vm.envOr("USDC_ADDRESS", ARC_USDC);

        console.log("Deploying DeliveryEscrow");
        console.log("  Chain ID  :", block.chainid);
        console.log("  USDC      :", usdc);
        console.log("  Deployer  :", msg.sender);

        vm.startBroadcast();
        DeliveryEscrow escrow = new DeliveryEscrow(usdc);
        vm.stopBroadcast();

        deployed = address(escrow);
        console.log("  Deployed  :", deployed);
    }
}
