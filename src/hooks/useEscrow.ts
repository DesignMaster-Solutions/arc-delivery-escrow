import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { DELIVERY_ESCROW_ABI, getEscrowAddress, SUPPORTED_CHAIN_IDS } from '@/contracts/DeliveryEscrow'
import { getUsdc } from '@/onchain-facts'
import { parseAmount } from '@/onchain-money'

export const ARC_TESTNET_CHAIN_ID = 5042002
export const ARC_MAINNET_CHAIN_ID = 5042

/** True for any chain this app supports. */
export function isSupportedChain(chainId: number | undefined): chainId is (typeof SUPPORTED_CHAIN_IDS)[number] {
  return chainId === ARC_TESTNET_CHAIN_ID || chainId === ARC_MAINNET_CHAIN_ID
}

/** Resolve USDC address for the given chain (falls back to testnet). */
export function getUsdcAddress(chainId: number): `0x${string}` {
  const fact = getUsdc(chainId) ?? getUsdc(ARC_TESTNET_CHAIN_ID)
  return (fact?.address ?? '') as `0x${string}`
}

export interface JobData {
  client: string
  freelancer: string
  amount: bigint
  deliverBy: number
  reviewWindow: number
  payeeCount: number
  status: number
  deliveredAt: number
  description: string
  deliveryUri: string
  payeeAddrs: readonly string[]
  payeeBps: readonly number[]
}

export function useJobCount(chainId: number) {
  const escrow = getEscrowAddress(chainId)
  return useReadContract({
    address: escrow,
    abi: DELIVERY_ESCROW_ABI,
    functionName: 'nextJobId',
    chainId,
    query: { enabled: !!escrow },
  })
}

export function useJobs(count: number, chainId: number) {
  const escrow = getEscrowAddress(chainId)
  const ids = Array.from({ length: count }, (_, i) => BigInt(i))
  return useReadContracts({
    contracts: ids.map((id) => ({
      address: escrow,
      abi: DELIVERY_ESCROW_ABI,
      functionName: 'getJob' as const,
      args: [id] as const,
      chainId,
    })),
    query: { enabled: !!escrow && count > 0 },
  })
}

export function usePendingWithdrawal(address: `0x${string}` | undefined, chainId: number) {
  const escrow = getEscrowAddress(chainId)
  return useReadContract({
    address: escrow,
    abi: DELIVERY_ESCROW_ABI,
    functionName: 'pendingWithdrawals',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId,
    query: { enabled: !!address && !!escrow },
  })
}

export function useUsdcAllowance(chainId: number) {
  const { address } = useAccount()
  const usdc = getUsdcAddress(chainId)
  const escrow = getEscrowAddress(chainId)
  return useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address ?? '0x0000000000000000000000000000000000000000', escrow],
    chainId,
    query: { enabled: !!address && !!escrow },
  })
}

export function useUsdcBalance(chainId: number) {
  const { address } = useAccount()
  const usdc = getUsdcAddress(chainId)
  return useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId,
    query: { enabled: !!address },
  })
}

export function useApproveUsdc(chainId: number) {
  const escrow = getEscrowAddress(chainId)
  const usdc = getUsdcAddress(chainId)
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const approve = (amountUsd: string) => {
    const parsed = parseAmount(chainId, amountUsd)
    writeContract({
      address: usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [escrow, parsed.raw],
      chainId,
    })
  }

  return { approve, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useCreateJob() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  return { writeContract, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useMarkDelivered() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  return { writeContract, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useRelease() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  return { writeContract, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useClaimAfterReview() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  return { writeContract, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useRefund() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  return { writeContract, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useWithdraw() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  return { writeContract, hash, isPending, isConfirming, isSuccess, error, reset }
}
