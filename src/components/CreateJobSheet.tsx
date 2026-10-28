import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Plus, Trash2, Loader2 } from 'lucide-react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { parseAmount } from '@/onchain-money'
import { DELIVERY_ESCROW_ABI, getEscrowAddress } from '@/contracts/DeliveryEscrow'
import {
  useApproveUsdc,
  useCreateJob,
  useUsdcAllowance,
  useUsdcBalance,
} from '@/hooks/useEscrow'
import { formatUsdc, parseOnchainError } from '@/utils/format'
import { buildTxExplorerUrl } from '@/onchain-facts'

interface PayeeInput {
  addr: string
  bps: string
}

const defaultPayees: PayeeInput[] = [{ addr: '', bps: '10000' }]

interface Props {
  chainId: number
  open: boolean
  onClose: () => void
}

export default function CreateJobSheet({ chainId: targetChainId, open, onClose }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const queryClient = useQueryClient()

  const [freelancer, setFreelancer] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [deliverByDate, setDeliverByDate] = useState('')
  const [reviewDays, setReviewDays] = useState('3')
  const [payees, setPayees] = useState<PayeeInput[]>(defaultPayees)
  const [_step, setStep] = useState<'form' | 'approve' | 'create'>('form')

  const ESCROW_ADDRESS = getEscrowAddress(targetChainId)

  const { data: allowance, refetch: refetchAllowance } = useUsdcAllowance(targetChainId)
  const { data: balance } = useUsdcBalance(targetChainId)
  const { approve, isPending: isApprovePending, isConfirming: isApproveConfirming, isSuccess: isApproveSuccess, error: approveError } = useApproveUsdc(targetChainId)
  const { writeContract: createJob, isPending: isCreatePending, isConfirming: isCreateConfirming, isSuccess: isCreateSuccess, error: createError, hash: createHash, reset } = useCreateJob()

  const wrongChain = chainId !== targetChainId
  const parsedAmount = amount ? parseAmount(targetChainId, amount) : null
  const needsApprove = parsedAmount && (allowance ?? 0n) < parsedAmount.raw

  const totalBps = payees.reduce((sum, p) => sum + (parseInt(p.bps) || 0), 0)
  const bpsValid = totalBps === 10000
  const formValid =
    freelancer.startsWith('0x') &&
    freelancer.length === 42 &&
    amount !== '' &&
    Number(amount) > 0 &&
    deliverByDate !== '' &&
    new Date(deliverByDate).getTime() > Date.now() &&
    parseInt(reviewDays) > 0 &&
    bpsValid &&
    payees.every((p) => p.addr.startsWith('0x') && p.addr.length === 42)

  const addPayee = () => {
    if (payees.length >= 3) return
    const remaining = 10000 - payees.reduce((s, p) => s + (parseInt(p.bps) || 0), 0)
    setPayees([...payees, { addr: '', bps: String(Math.max(0, remaining)) }])
  }

  const removePayee = (idx: number) => {
    const next = payees.filter((_, i) => i !== idx)
    setPayees(next)
  }

  const updatePayee = (idx: number, field: keyof PayeeInput, value: string) => {
    setPayees(payees.map((p, i) => (i === idx ? { ...p, [field]: value } : p)))
  }

  const handleApprove = () => {
    if (wrongChain) { switchChain({ chainId: targetChainId }); return }
    approve(amount)
    setStep('approve')
  }

  const handleCreate = () => {
    if (wrongChain) { switchChain({ chainId: targetChainId }); return }
    if (!parsedAmount) return

    void refetchAllowance()

    const deliverByTs = Math.floor(new Date(deliverByDate).getTime() / 1000)
    const reviewWindowSecs = parseInt(reviewDays) * 86400

    // Build flat address[3] and uint16[3] arrays — pad to 3 entries
    const zero = '0x0000000000000000000000000000000000000000' as `0x${string}`
    const payeeAddrs: [`0x${string}`, `0x${string}`, `0x${string}`] = [
      (payees[0]?.addr ?? zero) as `0x${string}`,
      (payees[1]?.addr ?? zero) as `0x${string}`,
      (payees[2]?.addr ?? zero) as `0x${string}`,
    ]
    const payeeBps: [number, number, number] = [
      parseInt(payees[0]?.bps ?? '0'),
      parseInt(payees[1]?.bps ?? '0'),
      parseInt(payees[2]?.bps ?? '0'),
    ]

    try {
      createJob({
        address: ESCROW_ADDRESS,
        abi: DELIVERY_ESCROW_ABI,
        functionName: 'createJob',
        args: [
          freelancer as `0x${string}`,
          parsedAmount.raw,
          deliverByTs,
          reviewWindowSecs,
          description,
          payeeAddrs,
          payeeBps,
          payees.length,
        ],
        chainId: targetChainId,
      })
      setStep('create')
    } catch (e) {
      toast.error(parseOnchainError(e))
    }
  }

  // Show success + close
  if (isCreateSuccess && createHash) {
    const txUrl = buildTxExplorerUrl(targetChainId, createHash)
    toast.success(
      <span>
        Job created!{' '}
        <a href={txUrl} target="_blank" rel="noreferrer" className="underline">
          View tx
        </a>
      </span>
    )
    void queryClient.invalidateQueries()
    handleClose()
  }

  if (createError) toast.error(parseOnchainError(createError))
  if (approveError) toast.error(parseOnchainError(approveError))

  function handleClose() {
    setStep('form')
    setFreelancer('')
    setAmount('')
    setDescription('')
    setDeliverByDate('')
    setReviewDays('3')
    setPayees(defaultPayees)
    reset()
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-lg overflow-hidden rounded-t-3xl"
            style={{
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(40px) saturate(200%)',
              WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Spectral strip */}
            <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #6366f1 0%, #3b82f6 33%, #06b6d4 66%, #10b981 100%)' }} />
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-6 pt-2 max-h-[85dvh] overflow-y-auto">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>Create Job</h2>
                <button
                  onClick={handleClose}
                  className="flex size-8 items-center justify-center rounded-full transition-colors"
                  style={{ background: 'var(--surface-muted)' }}
                >
                  <X className="size-4" style={{ color: 'var(--muted)' }} />
                </button>
              </div>

              <div className="space-y-3">
                {/* Freelancer */}
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    FREELANCER ADDRESS
                  </label>
                  <input
                    value={freelancer}
                    onChange={(e) => setFreelancer(e.target.value)}
                    placeholder="0x..."
                    className="mono w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2"
                    style={{
                      background: 'var(--surface-muted)',
                      borderColor: 'var(--border)',
                      color: 'var(--ink)',
                    }}
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    AMOUNT (USDC)
                  </label>
                  <div className="relative">
                    <input
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, '')
                        if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                      }}
                      placeholder="100.00"
                      className="display w-full rounded-xl border px-3 py-2.5 text-lg font-bold tabular-nums outline-none"
                      style={{
                        background: 'var(--surface-muted)',
                        borderColor: 'var(--border)',
                        color: 'var(--ink)',
                      }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: 'var(--subtle)' }}>
                      {balance !== undefined ? `Bal: ${formatUsdc(balance)} USDC` : 'USDC'}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    DESCRIPTION
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the deliverable..."
                    rows={2}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none resize-none"
                    style={{
                      background: 'var(--surface-muted)',
                      borderColor: 'var(--border)',
                      color: 'var(--ink)',
                    }}
                  />
                </div>

                {/* Deadline + Review */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                      DELIVER BY
                    </label>
                    <input
                      type="datetime-local"
                      value={deliverByDate}
                      min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                      onChange={(e) => setDeliverByDate(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                      style={{
                        background: 'var(--surface-muted)',
                        borderColor: 'var(--border)',
                        color: 'var(--ink)',
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                      REVIEW WINDOW (DAYS)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={reviewDays}
                      onChange={(e) => setReviewDays(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                      style={{
                        background: 'var(--surface-muted)',
                        borderColor: 'var(--border)',
                        color: 'var(--ink)',
                      }}
                    />
                  </div>
                </div>

                {/* Payees */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                      PAYEES (split by basis points — must total 10,000)
                    </label>
                    {payees.length < 3 && (
                      <button
                        onClick={addPayee}
                        className="flex items-center gap-1 text-xs font-semibold"
                        style={{ color: 'var(--accent-hover)' }}
                      >
                        <Plus className="size-3" /> Add payee
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {payees.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={p.addr}
                          onChange={(e) => updatePayee(i, 'addr', e.target.value)}
                          placeholder={i === 0 ? 'Freelancer address' : '0x...'}
                          className="mono flex-1 rounded-xl border px-2 py-2 text-xs outline-none"
                          style={{
                            background: 'var(--surface-muted)',
                            borderColor: 'var(--border)',
                            color: 'var(--ink)',
                          }}
                        />
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          value={p.bps}
                          onChange={(e) => updatePayee(i, 'bps', e.target.value)}
                          className="w-20 rounded-xl border px-2 py-2 text-xs tabular-nums outline-none text-right"
                          style={{
                            background: 'var(--surface-muted)',
                            borderColor: 'var(--border)',
                            color: 'var(--ink)',
                          }}
                        />
                        {i > 0 && (
                          <button onClick={() => removePayee(i)}>
                            <Trash2 className="size-4" style={{ color: 'var(--danger)' }} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {!bpsValid && (
                    <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
                      Total basis points: {totalBps} / 10,000
                    </p>
                  )}
                </div>

                {/* Actions */}
                {!address ? (
                  <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>
                    Connect your wallet to create a job.
                  </p>
                ) : wrongChain ? (
                  <button
                    onClick={() => switchChain({ chainId: targetChainId })}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white"
                    style={{ background: 'var(--accent)' }}
                  >
                    Switch to {targetChainId === 5042 ? 'Arc Mainnet' : 'Arc Testnet'}
                  </button>
                ) : needsApprove ? (
                  <button
                    disabled={!formValid || isApprovePending || isApproveConfirming}
                    onClick={handleApprove}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white disabled:opacity-40 transition-all hover:scale-[1.01] active:scale-[0.99]"
                    style={{ background: 'var(--accent)' }}
                  >
                    {isApprovePending ? (
                      <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm in wallet...</span>
                    ) : isApproveConfirming ? (
                      <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Approving USDC...</span>
                    ) : isApproveSuccess ? (
                      'Approved! Now create job below'
                    ) : (
                      `Allow ${amount} USDC`
                    )}
                  </button>
                ) : null}

                {(!needsApprove || isApproveSuccess) && address && !wrongChain && (
                  <button
                    disabled={!formValid || isCreatePending || isCreateConfirming}
                    onClick={handleCreate}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white disabled:opacity-40 transition-all hover:scale-[1.01] active:scale-[0.99]"
                    style={{ background: 'var(--accent)' }}
                  >
                    {isCreatePending ? (
                      <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm in wallet...</span>
                    ) : isCreateConfirming ? (
                      <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Creating job...</span>
                    ) : (
                      `Create Job · ${amount || '0'} USDC`
                    )}
                  </button>
                )}
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
