import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { ARC_TESTNET_CHAIN_ID } from '@/hooks/useEscrow'

export const formatAddress = (addr: string) =>
  `${addr.slice(0, 6)}...${addr.slice(-4)}`

export const formatUsdc = (raw: bigint): string => {
  const dec = usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)
  const amt = Amount.fromRaw(raw, dec)
  return Number(amt.toFixed(2)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export const formatCountdown = (unixTs: number): string => {
  const now = Math.floor(Date.now() / 1000)
  const diff = unixTs - now
  if (diff <= 0) return 'Expired'
  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export const formatReviewCountdown = (deliveredAt: number, reviewWindow: number): string => {
  return formatCountdown(deliveredAt + reviewWindow)
}

export const STATUS_LABELS: Record<number, string> = {
  0: 'Funded',
  1: 'Delivered',
  2: 'Released',
  3: 'Claimed',
  4: 'Refunded',
}

export const STATUS_COLORS: Record<number, string> = {
  0: 'text-blue-600 bg-blue-50',
  1: 'text-amber-600 bg-amber-50',
  2: 'bg-green-50',
  3: 'bg-green-50',
  4: 'text-gray-500 bg-gray-100',
}

export const parseOnchainError = (error: unknown): string => {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || msg.includes('user denied')) return 'Transaction cancelled.'
  if (msg.includes('insufficient') || msg.includes('exceeds balance')) return 'Insufficient USDC balance.'
  if (msg.includes('notfreelancer')) return 'Only the freelancer can do this.'
  if (msg.includes('notclient')) return 'Only the client can do this.'
  if (msg.includes('wrongstatus')) return 'Job is not in the right state for this action.'
  if (msg.includes('deadlinepassed')) return 'The delivery deadline has passed.'
  if (msg.includes('deadlinenotpassed')) return 'The deadline has not passed yet.'
  if (msg.includes('reviewwindowopen')) return 'The review window is still open.'
  if (msg.includes('invalidamount')) return 'Invalid amount.'
  if (msg.includes('invaliddeadline')) return 'Deadline must be in the future.'
  if (msg.includes('invalidreviewwindow')) return 'Review window must be > 0.'
  if (msg.includes('invalidpayeecount')) return 'Payee count must be 1–3.'
  if (msg.includes('invalidpayeebps')) return 'Basis points must sum to 10,000.'
  if (msg.includes('zeroaddress')) return 'Address cannot be zero.'
  if (msg.includes('nothingtwithdraw') || msg.includes('nothingtowithdraw')) return 'Nothing to withdraw.'
  if (msg.includes('reverted')) return 'Transaction reverted. Check your inputs.'
  if (msg.includes('network') || msg.includes('timeout')) return 'Network error. Please retry.'
  return 'Something went wrong. Please try again.'
}
