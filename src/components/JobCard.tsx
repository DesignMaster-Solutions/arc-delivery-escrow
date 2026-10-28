import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, ChevronDown, ChevronUp, Loader2, Clock } from 'lucide-react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DELIVERY_ESCROW_ABI, getEscrowAddress } from '@/contracts/DeliveryEscrow'
import {
  useMarkDelivered,
  useRelease,
  useClaimAfterReview,
  useRefund,
  useWithdraw,
  usePendingWithdrawal,
} from '@/hooks/useEscrow'
import { formatAddress, formatUsdc, formatCountdown, formatReviewCountdown, STATUS_LABELS, STATUS_COLORS, parseOnchainError } from '@/utils/format'
import { buildTxExplorerUrl } from '@/onchain-facts'

interface Job {
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

interface Props {
  jobId: bigint
  job: Job
  chainId: number
}

export default function JobCard({ jobId, job, chainId: targetChainId }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const queryClient = useQueryClient()

  const [expanded, setExpanded] = useState(false)
  const [deliveryUri, setDeliveryUri] = useState('')

  const wrongChain = chainId !== targetChainId
  const ESCROW_ADDRESS = getEscrowAddress(targetChainId)
  const isClient = address?.toLowerCase() === job.client.toLowerCase()
  const isFreelancer = address?.toLowerCase() === job.freelancer.toLowerCase()
  // Use lazy state init so Date.now() is only called once at mount, avoiding render impurity lint
  const [now] = useState<number>(() => Math.floor(Date.now() / 1000))

  const { data: pending, refetch: refetchPending } = usePendingWithdrawal(address, targetChainId)
  const markDelivered = useMarkDelivered()
  const release = useRelease()
  const claim = useClaimAfterReview()
  const refund = useRefund()
  const withdraw = useWithdraw()

  const ensureChain = () => {
    if (wrongChain) { switchChain({ chainId: targetChainId }); return false }
    return true
  }

  const onSuccess = (label: string, hash: `0x${string}`) => {
    const url = buildTxExplorerUrl(targetChainId, hash)
    toast.success(
      <span>
        {label}{' '}
        <a href={url} target="_blank" rel="noreferrer" className="underline">
          View tx
        </a>
      </span>
    )
    void queryClient.invalidateQueries()
    void refetchPending()
  }

  if (markDelivered.isSuccess && markDelivered.hash) { onSuccess('Delivery marked!', markDelivered.hash); markDelivered.reset() }
  if (release.isSuccess && release.hash) { onSuccess('Payment released!', release.hash); release.reset() }
  if (claim.isSuccess && claim.hash) { onSuccess('Payment claimed!', claim.hash); claim.reset() }
  if (refund.isSuccess && refund.hash) { onSuccess('Refunded!', refund.hash); refund.reset() }
  if (withdraw.isSuccess && withdraw.hash) { onSuccess('Withdrawn!', withdraw.hash); withdraw.reset() }

  if (markDelivered.error) toast.error(parseOnchainError(markDelivered.error))
  if (release.error) toast.error(parseOnchainError(release.error))
  if (claim.error) toast.error(parseOnchainError(claim.error))
  if (refund.error) toast.error(parseOnchainError(refund.error))
  if (withdraw.error) toast.error(parseOnchainError(withdraw.error))

  const statusLabel = STATUS_LABELS[job.status] ?? 'Unknown'
  const statusClass = STATUS_COLORS[job.status] ?? ''

  const canMarkDelivered = isFreelancer && job.status === 0 && now <= job.deliverBy
  const canRelease = isClient && job.status === 1
  const canClaim = isFreelancer && job.status === 1 && now >= job.deliveredAt + job.reviewWindow
  const canRefund = isClient && job.status === 0 && now > job.deliverBy
  const reviewOpen = job.status === 1 && now < job.deliveredAt + job.reviewWindow
  const hasPending = pending !== undefined && pending > 0n

  const anyBusy =
    markDelivered.isPending || markDelivered.isConfirming ||
    release.isPending || release.isConfirming ||
    claim.isPending || claim.isConfirming ||
    refund.isPending || refund.isConfirming ||
    withdraw.isPending || withdraw.isConfirming

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        background: 'var(--surface-strong)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <button
        className="w-full px-4 py-3 flex items-start gap-3 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-bold mono" style={{ color: 'var(--subtle)' }}>
              #{jobId.toString()}
            </span>
            <span
              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${statusClass}`}
              style={job.status === 2 || job.status === 3 ? { color: 'var(--success)' } : {}}
            >
              {statusLabel}
            </span>
          </div>
          <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
            {job.description || 'No description'}
          </p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="display text-base font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {formatUsdc(job.amount)} USDC
            </span>
            {job.status === 0 && now <= job.deliverBy && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
                <Clock className="size-3" />
                {formatCountdown(job.deliverBy)} to deliver
              </span>
            )}
            {reviewOpen && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
                <Clock className="size-3" />
                Review closes {formatReviewCountdown(job.deliveredAt, job.reviewWindow)}
              </span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="size-4 mt-1 shrink-0" style={{ color: 'var(--subtle)' }} /> : <ChevronDown className="size-4 mt-1 shrink-0" style={{ color: 'var(--subtle)' }} />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: 'var(--border)' }}>
              {/* Addresses */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div>
                  <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--subtle)' }}>CLIENT</p>
                  <p className="mono text-xs" style={{ color: 'var(--ink-2)' }}>
                    {formatAddress(job.client)}
                    {isClient && <span className="ml-1 text-blue-500">(you)</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--subtle)' }}>FREELANCER</p>
                  <p className="mono text-xs" style={{ color: 'var(--ink-2)' }}>
                    {formatAddress(job.freelancer)}
                    {isFreelancer && <span className="ml-1 text-blue-500">(you)</span>}
                  </p>
                </div>
              </div>

              {/* Payees */}
              {job.payeeCount > 1 && (
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--subtle)' }}>SPLIT</p>
                  <div className="space-y-1">
                    {Array.from({ length: job.payeeCount }, (_, i) => i).map((i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="mono" style={{ color: 'var(--ink-2)' }}>{formatAddress(job.payeeAddrs[i] ?? '')}</span>
                        <span className="tabular-nums font-semibold" style={{ color: 'var(--muted)' }}>
                          {((job.payeeBps[i] ?? 0) / 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Delivery URI */}
              {job.deliveryUri && (
                <div>
                  <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--subtle)' }}>DELIVERY</p>
                  <a
                    href={job.deliveryUri.startsWith('http') ? job.deliveryUri : `https://${job.deliveryUri}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs underline"
                    style={{ color: 'var(--accent-hover)' }}
                  >
                    {job.deliveryUri.length > 40 ? job.deliveryUri.slice(0, 40) + '...' : job.deliveryUri}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-2 pt-1">
                {/* Mark Delivered */}
                {canMarkDelivered && (
                  <div className="space-y-1.5">
                    <input
                      value={deliveryUri}
                      onChange={(e) => setDeliveryUri(e.target.value)}
                      placeholder="Delivery URL or IPFS hash"
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                      style={{
                        background: 'var(--surface-muted)',
                        borderColor: 'var(--border)',
                        color: 'var(--ink)',
                      }}
                    />
                    <ActionButton
                      label="Mark as Delivered"
                      disabled={!deliveryUri || anyBusy}
                      busy={markDelivered.isPending || markDelivered.isConfirming}
                      busyLabel={markDelivered.isPending ? 'Confirm in wallet...' : 'Confirming...'}
                      wrongChain={wrongChain}
                      onAction={() => {
                        if (!ensureChain()) return
                        markDelivered.writeContract({
                          address: ESCROW_ADDRESS,
                          abi: DELIVERY_ESCROW_ABI,
                          functionName: 'markDelivered',
                          args: [jobId, deliveryUri],
                          chainId: targetChainId,
                        })
                      }}
                    />
                  </div>
                )}

                {/* Release */}
                {canRelease && (
                  <ActionButton
                    label="Release Payment"
                    disabled={anyBusy}
                    busy={release.isPending || release.isConfirming}
                    busyLabel={release.isPending ? 'Confirm in wallet...' : 'Confirming...'}
                    wrongChain={wrongChain}
                    onAction={() => {
                      if (!ensureChain()) return
                      release.writeContract({
                        address: ESCROW_ADDRESS,
                        abi: DELIVERY_ESCROW_ABI,
                        functionName: 'release',
                        args: [jobId],
                        chainId: targetChainId,
                      })
                    }}
                    color="success"
                  />
                )}

                {/* Claim after review */}
                {canClaim && (
                  <ActionButton
                    label="Claim Payment"
                    disabled={anyBusy}
                    busy={claim.isPending || claim.isConfirming}
                    busyLabel={claim.isPending ? 'Confirm in wallet...' : 'Confirming...'}
                    wrongChain={wrongChain}
                    onAction={() => {
                      if (!ensureChain()) return
                      claim.writeContract({
                        address: ESCROW_ADDRESS,
                        abi: DELIVERY_ESCROW_ABI,
                        functionName: 'claimAfterReview',
                        args: [jobId],
                        chainId: targetChainId,
                      })
                    }}
                    color="success"
                  />
                )}

                {/* Refund */}
                {canRefund && (
                  <ActionButton
                    label="Refund"
                    disabled={anyBusy}
                    busy={refund.isPending || refund.isConfirming}
                    busyLabel={refund.isPending ? 'Confirm in wallet...' : 'Confirming...'}
                    wrongChain={wrongChain}
                    onAction={() => {
                      if (!ensureChain()) return
                      refund.writeContract({
                        address: ESCROW_ADDRESS,
                        abi: DELIVERY_ESCROW_ABI,
                        functionName: 'refund',
                        args: [jobId],
                        chainId: targetChainId,
                      })
                    }}
                    color="danger"
                  />
                )}

                {/* Withdraw pending */}
                {hasPending && (isFreelancer || isClient) && (job.status === 2 || job.status === 3 || job.status === 4) && (
                  <ActionButton
                    label={`Withdraw ${formatUsdc(pending)} USDC`}
                    disabled={anyBusy}
                    busy={withdraw.isPending || withdraw.isConfirming}
                    busyLabel={withdraw.isPending ? 'Confirm in wallet...' : 'Withdrawing...'}
                    wrongChain={wrongChain}
                    onAction={() => {
                      if (!ensureChain()) return
                      withdraw.writeContract({
                        address: ESCROW_ADDRESS,
                        abi: DELIVERY_ESCROW_ABI,
                        functionName: 'withdraw',
                        chainId: targetChainId,
                      })
                    }}
                    color="success"
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ActionButton({
  label,
  disabled,
  busy,
  busyLabel,
  wrongChain,
  onAction,
  color = 'accent',
}: {
  label: string
  disabled: boolean
  busy: boolean
  busyLabel: string
  wrongChain: boolean
  onAction: () => void
  color?: 'accent' | 'success' | 'danger'
}) {
  const bg = color === 'success'
    ? 'var(--success)'
    : color === 'danger'
    ? 'var(--danger)'
    : 'var(--accent)'

  return (
    <button
      disabled={disabled && !wrongChain}
      onClick={onAction}
      className="w-full rounded-2xl py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={{ background: wrongChain ? 'var(--accent)' : bg }}
    >
      {wrongChain ? (
        'Switch to Arc Testnet'
      ) : busy ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" /> {busyLabel}
        </span>
      ) : (
        label
      )}
    </button>
  )
}
