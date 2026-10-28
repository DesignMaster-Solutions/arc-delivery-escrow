# Delivery Escrow — Agent Notes

## Contract Deployments

### Arc Testnet (chain ID 5042002)

| Version | Address | Deploy tx | Explorer |
|---|---|---|---|
| V1 (broken — stack-too-deep at runtime, do not use) | `0xfe9fab978a2ebc376c717364d73541d1b05f4673` | `0x37041966408ac715e97587a87d1936937d7a9d71bef3449412c06cfcf345df44` | [link](https://explorer.testnet.arc.io/address/0xfe9fab978a2ebc376c717364d73541d1b05f4673) |
| V2 (current, via_ir compiled, production) | `0xd6D42F482585e8c5882a90860FB4cd1b875d29B2` | `0x4bdd00de317aadda781f5534a917907060bd8ff28d4a16511d41a6b14928b900` | [link](https://explorer.testnet.arc.io/address/0xd6D42F482585e8c5882a90860FB4cd1b875d29B2) |

### Arc Mainnet (chain ID 5042)
Not yet deployed. Use `contracts/script/Deploy.s.sol` with `--rpc-url https://rpc.mainnet.arc.io`.

## Canonical USDC Address
`0x3600000000000000000000000000000000000000` — same on Arc Testnet and Arc Mainnet.

## Key Design Decisions

1. **Via IR compilation required**: `createJob` has 8 parameters + deep struct nesting. Added `via_ir = true` in `foundry.toml`. Without it the function stack-overflows at runtime (not just compile time).
2. **Pull payments**: `release`/`claimAfterReview`/`refund` queue into `pendingWithdrawals[payee]`; payees call `withdraw()`. Prevents one bad payee address bricking a job.
3. **Balance-delta accounting**: `createJob` measures `balanceAfter - balanceBefore` after `safeTransferFrom`, stores received amount. Handles fee-on-transfer tokens correctly.
4. **Flat arrays in ABI**: Used `address[3]` and `uint16[3]` instead of `Payee[3]` struct to avoid `tuple[3]` in ABI (some deploy tools reject it).
5. **Arc USDC precompile caveat**: `0x3600...0000` on Arc delegates to `0x1800...0000` for native token accounting. Anvil forks cannot simulate this precompile — running a full job requires a real connected wallet, not a script.

## Frontend Config

- `VITE_ESCROW_ADDRESS_5042002` = `0xd6D42F482585e8c5882a90860FB4cd1b875d29B2` (Arc Testnet V2)
- `VITE_ESCROW_ADDRESS_5042` = set this after mainnet deployment

## Running a Full Live Job

Connect your wallet in the preview, fund it with the "Get test USDC" button in the Arc Studio sidebar, then:
1. Create a job (fills in a freelancer address — can be any wallet you control)
2. Connect the freelancer wallet, call Mark Delivered
3. Connect the client wallet, call Release
4. Connect the freelancer wallet, call Withdraw

Every transaction links to `explorer.testnet.arc.io`.

## Audit Summary (balanced severity)

Round 1 findings (both fixed before final deploy):
- **High** (Solidity): fee-on-transfer-token-deposit-accounting → fixed with balance-delta
- **Critical** (Functional): push-payout-recipient-can-brick-settlement → fixed with pull payments

Round 2: no material findings from either auditor.

## Tests

45 tests across Happy, Revert, and Fuzz suites. All pass.
Test files: `contracts/test/DeliveryEscrow.{Happy,Revert,Fuzz}.t.sol`
