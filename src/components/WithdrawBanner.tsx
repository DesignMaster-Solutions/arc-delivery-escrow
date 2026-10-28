import { Loader2, ArrowDownToLine } from 'lucide-react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DELIVERY_ESCROW_ABI, getEscrowAddress } from '@/contracts/DeliveryEscrow'
import { usePendingWithdrawal, useWithdraw } from '@/hooks/useEscrow'
import { formatUsdc, parseOnchainError } from '@/utils/format'
import { buildTxExplorerUrl } from '@/onchain-facts'

interface Props {
  chainId: number
}

export default function WithdrawBanner({ chainId: targetChainId }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const queryClient = useQueryClient()

  const escrow = getEscrowAddress(targetChainId)
  const { data: pending, refetch } = usePendingWithdrawal(address, targetChainId)
  const { writeContract, isPending, isConfirming, isSuccess, hash, error, reset } = useWithdraw()

  const wrongChain = chainId !== targetChainId

  if (isSuccess && hash) {
    const url = buildTxExplorerUrl(targetChainId, hash)
    toast.success(
      <span>
        Withdrawn!{' '}
        <a href={url} target="_blank" rel="noreferrer" className="underline">View tx</a>
      </span>
    )
    void queryClient.invalidateQueries()
    void refetch()
    reset()
  }

  if (error) toast.error(parseOnchainError(error))

  if (!pending || pending === 0n) return null

  return (
    <div
      className="flex items-center justify-between rounded-2xl px-4 py-3 mb-4"
      style={{ background: 'rgba(26,128,71,0.08)', border: '1px solid rgba(26,128,71,0.2)' }}
    >
      <div className="flex items-center gap-2">
        <ArrowDownToLine className="size-4" style={{ color: 'var(--success)' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
            {formatUsdc(pending)} USDC ready to withdraw
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Funds queued from completed jobs
          </p>
        </div>
      </div>
      <button
        disabled={isPending || isConfirming}
        onClick={() => {
          if (wrongChain) { switchChain({ chainId: targetChainId }); return }
          writeContract({
            address: escrow,
            abi: DELIVERY_ESCROW_ABI,
            functionName: 'withdraw',
            chainId: targetChainId,
          })
        }}
        className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-all"
        style={{ background: 'var(--success)' }}
      >
        {isPending ? (
          <span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Confirm...</span>
        ) : isConfirming ? (
          <span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Withdrawing...</span>
        ) : (
          'Withdraw'
        )}
      </button>
    </div>
  )
}
