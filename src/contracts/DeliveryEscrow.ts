// ABI for DeliveryEscrow — matches contracts/out/DeliveryEscrow.sol/DeliveryEscrow.json

export const DELIVERY_ESCROW_ABI = [
  {
    "type": "constructor",
    "inputs": [{ "name": "usdc_", "type": "address", "internalType": "address" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createJob",
    "inputs": [
      { "name": "freelancer", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint128", "internalType": "uint128" },
      { "name": "deliverBy", "type": "uint40", "internalType": "uint40" },
      { "name": "reviewWindow", "type": "uint32", "internalType": "uint32" },
      { "name": "description", "type": "string", "internalType": "string" },
      { "name": "payeeAddrs", "type": "address[3]", "internalType": "address[3]" },
      { "name": "payeeBps", "type": "uint16[3]", "internalType": "uint16[3]" },
      { "name": "payeeCount", "type": "uint8", "internalType": "uint8" }
    ],
    "outputs": [{ "name": "jobId", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "markDelivered",
    "inputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" },
      { "name": "deliveryUri", "type": "string", "internalType": "string" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "release",
    "inputs": [{ "name": "jobId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimAfterReview",
    "inputs": [{ "name": "jobId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "refund",
    "inputs": [{ "name": "jobId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getJob",
    "inputs": [{ "name": "jobId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct DeliveryEscrow.Job",
        "components": [
          { "name": "client", "type": "address", "internalType": "address" },
          { "name": "freelancer", "type": "address", "internalType": "address" },
          { "name": "amount", "type": "uint128", "internalType": "uint128" },
          { "name": "deliverBy", "type": "uint40", "internalType": "uint40" },
          { "name": "reviewWindow", "type": "uint32", "internalType": "uint32" },
          { "name": "payeeCount", "type": "uint8", "internalType": "uint8" },
          { "name": "status", "type": "uint8", "internalType": "uint8" },
          { "name": "deliveredAt", "type": "uint40", "internalType": "uint40" },
          { "name": "description", "type": "string", "internalType": "string" },
          { "name": "deliveryUri", "type": "string", "internalType": "string" },
          { "name": "payeeAddrs", "type": "address[3]", "internalType": "address[3]" },
          { "name": "payeeBps", "type": "uint16[3]", "internalType": "uint16[3]" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "jobCount",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextJobId",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingWithdrawals",
    "inputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint128", "internalType": "uint128" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "usdc",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "JobCreated",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true },
      { "name": "client", "type": "address", "indexed": true },
      { "name": "freelancer", "type": "address", "indexed": true },
      { "name": "amount", "type": "uint128", "indexed": false },
      { "name": "deliverBy", "type": "uint40", "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "Delivered",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true },
      { "name": "deliveryUri", "type": "string", "indexed": false },
      { "name": "deliveredAt", "type": "uint40", "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "Released",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true },
      { "name": "releasedAt", "type": "uint40", "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "Claimed",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true },
      { "name": "claimedAt", "type": "uint40", "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "Refunded",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true },
      { "name": "refundedAt", "type": "uint40", "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "Withdrawn",
    "inputs": [
      { "name": "payee", "type": "address", "indexed": true },
      { "name": "amount", "type": "uint128", "indexed": false }
    ]
  },
  { "type": "error", "name": "NotFreelancer", "inputs": [] },
  { "type": "error", "name": "NotClient", "inputs": [] },
  { "type": "error", "name": "WrongStatus", "inputs": [] },
  { "type": "error", "name": "DeadlinePassed", "inputs": [] },
  { "type": "error", "name": "DeadlineNotPassed", "inputs": [] },
  { "type": "error", "name": "ReviewWindowOpen", "inputs": [] },
  { "type": "error", "name": "InvalidAmount", "inputs": [] },
  { "type": "error", "name": "InvalidDeadline", "inputs": [] },
  { "type": "error", "name": "InvalidReviewWindow", "inputs": [] },
  { "type": "error", "name": "InvalidPayeeCount", "inputs": [] },
  { "type": "error", "name": "InvalidPayeeBps", "inputs": [] },
  { "type": "error", "name": "ZeroAddress", "inputs": [] },
  { "type": "error", "name": "TransferFailed", "inputs": [] },
  { "type": "error", "name": "NothingToWithdraw", "inputs": [] }
] as const

// Per-chain escrow addresses loaded from env vars.
// Arc Testnet (5042002): VITE_ESCROW_ADDRESS_5042002
// Arc Mainnet  (5042):   VITE_ESCROW_ADDRESS_5042
// Fallback to the legacy VITE_ESCROW_ADDRESS so existing .env keeps working.
const ADDRESSES: Record<number, `0x${string}`> = {
  5042002: ((import.meta.env.VITE_ESCROW_ADDRESS_5042002 ?? import.meta.env.VITE_ESCROW_ADDRESS ?? '') as `0x${string}`),
  5042:    ((import.meta.env.VITE_ESCROW_ADDRESS_5042 ?? '') as `0x${string}`),
}

/** @deprecated use getEscrowAddress(chainId) */
export const ESCROW_ADDRESS = ADDRESSES[5042002]

export function getEscrowAddress(chainId: number): `0x${string}` {
  return ADDRESSES[chainId] ?? ('' as `0x${string}`)
}

export const SUPPORTED_CHAIN_IDS = [5042002, 5042] as const
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number]

export const JOB_STATUS = {
  0: 'Funded',
  1: 'Delivered',
  2: 'Released',
  3: 'Claimed',
  4: 'Refunded',
} as const

export type JobStatus = keyof typeof JOB_STATUS
