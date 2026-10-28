# Delivery Escrow

A USDC escrow for freelance and agency jobs, deployed on Arc. Clients lock USDC into the contract when creating a job; the freelancer submits a delivery link; the client releases payment or the freelancer auto-claims after a silent-client window. Supports up to three payees with configurable basis-point splits (e.g. freelancer + agency).

Built with [Arc Studio](https://studio.arc.io) by [Design Master Solutions](https://www.designmastersolutions.com): contract, Foundry tests (45, including fuzz), security and functional audits and the React app were written in Arc Studio ([project](https://studio.arc.io/app/38668baa-8486-48a6-af50-e5441c9e42c4)).

**Live app (Arc Testnet):** https://arc-delivery-escrow.pages.dev

**Demo video (Escrow Guardian, 2:28):** https://youtu.be/_niDozyKopU ([docs/demo.mp4](docs/demo.mp4))

---

## Contract Deployments

| Network | Address | Explorer |
|---|---|---|
| Arc Testnet (5042002) | `0xd6D42F482585e8c5882a90860FB4cd1b875d29B2` | [explorer.testnet.arc.io](https://explorer.testnet.arc.io/address/0xd6D42F482585e8c5882a90860FB4cd1b875d29B2) |
| Arc Mainnet (5042) | deploy yourself — see below | — |

**Deploy transaction (Arc Testnet):** [`0x4bdd00de317aadda781f5534a917907060bd8ff28d4a16511d41a6b14928b900`](https://explorer.testnet.arc.io/tx/0x4bdd00de317aadda781f5534a917907060bd8ff28d4a16511d41a6b14928b900)

---

## Tech Stack

- **Smart contract**: Solidity 0.8.28, OpenZeppelin 5.x (ReentrancyGuard, SafeERC20), compiled with `via_ir = true`
- **Testing**: Foundry (forge) — 45 tests (happy path, silent-client claim, refund, split payouts, unauthorized callers, fuzz)
- **Frontend**: React + TypeScript + Vite, wagmi v2 + ConnectKit, Tailwind CSS
- **Chains**: Arc Testnet (default) and Arc Mainnet — select via wallet network
- **Automation**: Chainlink CRE (TypeScript SDK) workflow + `BreachNoticeRegistry` consumer, 8 more Foundry tests and 4 bun tests (see Escrow Guardian below)

---

## What It Does

- **Create a job**: client approves USDC then deposits it into the escrow along with a deadline, review window, description, and up to 3 payees with basis-point splits summing to 10,000
- **Mark delivered**: freelancer submits a delivery URL before the deadline, starting the review clock
- **Release**: client approves the delivery and queues payment to all payees
- **Claim after review**: if the client stays silent past `deliveredAt + reviewWindow`, the freelancer can claim automatically
- **Refund**: if the freelancer misses the deadline, the client reclaims the USDC
- **Withdraw**: each payee independently pulls their queued USDC (pull-payment model — no single bad address can brick a job)

---

## Escrow Guardian: legal automation with Chainlink CRE

A freelance contract has two promises that are easy to break and expensive to prove: the freelancer delivers by the deadline, and the client reviews the delivery within the agreed window. **Escrow Guardian** is a [Chainlink Runtime Environment](https://docs.chain.link/cre) workflow that watches every escrow and, when one of those promises is broken, writes a timestamped **breach notice** on-chain naming the party that is now entitled to act. The notice is the evidence a lawyer or an arbitrator would otherwise have to reconstruct from screenshots and e-mail.

| Notice | Condition (checked on-chain) | Entitled party and remedy |
|---|---|---|
| `DELIVERY_DEADLINE_MISSED` (1) | job still `FUNDED` after `deliverBy` | client: `refund()` |
| `REVIEW_WINDOW_LAPSED` (2) | job `DELIVERED` and `deliveredAt + reviewWindow` has passed with no release | freelancer: `claimAfterReview()` |

How it works:

1. **Cron trigger** (every 10 minutes) starts the workflow on the CRE DON.
2. **EVM read**: for each job it reads `notices(jobId)` and `noticeDue(jobId)` from the registry at the latest block.
3. Jobs with a due notice that was never recorded become a report `abi.encode(uint256[] jobIds, uint8[] kinds)`, signed by the DON (`runtime.report`).
4. **EVM write**: the report goes through the Chainlink forwarder to [`BreachNoticeRegistry`](contracts/cre/BreachNoticeRegistry.sol) (a `ReceiverTemplate` consumer).
5. The registry **re-checks every condition against the escrow state** before recording, so the workflow can only nominate jobs: a notice can never be written for a job that is not in breach, the wrong kind is rejected (`NoticeRejected`), and replays never overwrite the first notice (its timestamp is the legal record).

Code: [`cre-guardian/escrow-guardian/main.ts`](cre-guardian/escrow-guardian/main.ts) (workflow), [`contracts/cre/BreachNoticeRegistry.sol`](contracts/cre/BreachNoticeRegistry.sol) (consumer), [`contracts/test/BreachNoticeRegistry.t.sol`](contracts/test/BreachNoticeRegistry.t.sol) (8 Foundry tests), [`scripts/seed-breach-jobs.sh`](scripts/seed-breach-jobs.sh) (creates one breached, one silent-client and one healthy job).

### Live run on Arc Testnet (CRE simulation with `--broadcast`)

| | |
|---|---|
| BreachNoticeRegistry | [`0x65746f288670b6CA853e3D212C6d0252356ae0CC`](https://testnet.arcscan.app/address/0x65746f288670b6CA853e3D212C6d0252356ae0CC) (forwarder `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1`, escrow `0xd6D4...29B2`) |
| Jobs seeded | #2 deadline will be missed, #3 delivered and client silent, #4 healthy ([txs](scripts/seed-breach-jobs.sh)) |
| Notice transaction | [`0x4dc9cb1d...6649d51a`](https://testnet.arcscan.app/tx/0x4dc9cb1d7b967ceb91fa62ccf4cc23011b29d545f4f509006d0c6c5c6649d51a) |

```
[USER LOG] Escrow 0xd6D42F482585e8c5882a90860FB4cd1b875d29B2: 5 jobs, checking 5
[USER LOG] Job #2: DELIVERY_DEADLINE_MISSED (client may refund) -> entitled party 0x68808d92833aA293775f5Dde2dcFF458F76cE0ed
[USER LOG] Job #3: REVIEW_WINDOW_LAPSED (freelancer may claim payment) -> entitled party 0x2Ef7C511455cb64Fb4F2058E4301B1B50EC9D7dE
[USER LOG] Recorded 2 notice(s) on-chain: 0x4dc9cb1d7b967ceb91fa62ccf4cc23011b29d545f4f509006d0c6c5c6649d51a
```

Second run, same state: `No new breach: every escrow is within its terms.` (idempotent). On-chain afterwards: `notices(2) = (1, 1793155896, client)`, `notices(3) = (2, 1793155896, freelancer)`, `notices(4) = (0, 0, 0x0)`, `noticeCount = 2`.

---

## Development

### Prerequisites

- [Bun](https://bun.sh) (package manager)
- [Foundry](https://getfoundry.sh) (forge, cast, anvil)

### Install

```bash
bun install
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `VITE_ESCROW_ADDRESS_5042002` | Contract address on Arc Testnet |
| `VITE_ESCROW_ADDRESS_5042` | Contract address on Arc Mainnet (set after deploying) |
| `RPC_PROXY_BASE_URL` | Optional — Arc Studio RPC proxy base URL (set automatically in Arc Studio) |
| `RPC_PROXY_TOKEN` | Optional — Arc Studio RPC proxy token (set automatically in Arc Studio) |
| `RPC_PROXY_CHAINS` | Optional — Chains available via proxy (set automatically in Arc Studio) |

### Run (development)

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Lint + Typecheck

```bash
bun run check
```

### Run Tests

```bash
forge test
```

### Deploy to a Network

Deploy the same audited contract to any chain:

```bash
# Arc Testnet
forge script contracts/script/Deploy.s.sol \
  --rpc-url https://rpc.testnet.arc.io \
  --broadcast \
  --private-key $PRIVATE_KEY

# Arc Mainnet
forge script contracts/script/Deploy.s.sol \
  --rpc-url https://rpc.mainnet.arc.io \
  --broadcast \
  --private-key $PRIVATE_KEY
```

Override the USDC address for a different chain:

```bash
USDC_ADDRESS=0x... forge script contracts/script/Deploy.s.sol --rpc-url ... --broadcast --private-key $PRIVATE_KEY
```

After deployment, set `VITE_ESCROW_ADDRESS_<CHAIN_ID>` to the deployed address and rebuild.

---

## Running a Full Job (live testnet)

1. Open the app in your browser
2. Connect your wallet and switch to Arc Testnet
3. Click **Get test USDC** in the Arc Studio sidebar to fund your wallet
4. Click **New Job** and fill in a freelancer address (can be a second wallet you control), amount (e.g. 1 USDC), deadline, and review window
5. Approve the USDC spend and confirm the createJob transaction
6. Switch to the freelancer wallet, find the job, click **Mark Delivered**
7. Switch back to the client wallet, click **Release**
8. Switch to the freelancer wallet, click **Withdraw** to collect the USDC

Every transaction links to the Arc Testnet explorer.

### From the terminal

`scripts/live-job.sh` runs the same job end to end against a real network (keys come from the environment, nothing is hardcoded):

```bash
RPC_URL=https://rpc.testnet.arc.io ESCROW=0xd6D42F482585e8c5882a90860FB4cd1b875d29B2 \
EXPLORER=https://testnet.arcscan.app CLIENT_KEY=0x... FREELANCER_KEY=0x... ./scripts/live-job.sh
```

Recorded run on Arc Testnet (job #1, 1 USDC, client -> escrow -> freelancer):

| Step | Transaction |
|---|---|
| approve | [0xf85d92bc...](https://testnet.arcscan.app/tx/0xf85d92bc406ba22e29b023b5c4811bb419d1373e0ea377b9d422eacce0c9b894) |
| createJob | [0x9fb5683e...](https://testnet.arcscan.app/tx/0x9fb5683e21591e23a5cb37133d134dc32acd1c86a09f6ccfe9e0fb6a993a9f45) |
| markDelivered | [0x0e48ec6e...](https://testnet.arcscan.app/tx/0x0e48ec6e335f628335888bf054f018a9775d759072f89568d4315ec30ebda992) |
| release | [0xe5ccac01...](https://testnet.arcscan.app/tx/0xe5ccac01258169895313eaeacc076c5da381fea46ace5a6d43503627cf269053) |
| withdraw | [0xa4473b9b...](https://testnet.arcscan.app/tx/0xa4473b9bcd9b0c98d21e3c927046af70216794152259d33c2872d37da8cb39da) |

---

## Security

- Pull-payment model: `release`, `claimAfterReview`, and `refund` queue funds into `pendingWithdrawals`; payees call `withdraw()` independently
- Balance-delta accounting in `createJob` to handle fee-on-transfer tokens
- ReentrancyGuard on all state-mutating functions
- Checks-effects-interactions throughout
- Two-round security review (balanced severity) before deployment — both rounds came back clean on the final version

---

## Contract Interface (summary)

```solidity
function createJob(
    address freelancer,
    uint128 amount,
    uint40  deliverBy,
    uint32  reviewWindow,
    string  calldata description,
    address[3] calldata payeeAddrs,
    uint16[3]  calldata payeeBps,
    uint8  payeeCount
) external returns (uint256 jobId);

function markDelivered(uint256 jobId, string calldata deliveryUri) external;
function release(uint256 jobId) external;
function claimAfterReview(uint256 jobId) external;
function refund(uint256 jobId) external;
function withdraw() external;
function getJob(uint256 jobId) external view returns (Job memory);
function pendingWithdrawals(address) external view returns (uint128);
```
