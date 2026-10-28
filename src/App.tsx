import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Briefcase, RefreshCw, AlertTriangle } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { getEscrowAddress, SUPPORTED_CHAIN_IDS } from '@/contracts/DeliveryEscrow'
import {
  useJobCount, useJobs, useUsdcBalance,
  ARC_TESTNET_CHAIN_ID, ARC_MAINNET_CHAIN_ID, isSupportedChain,
} from '@/hooks/useEscrow'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { formatUsdc } from '@/utils/format'
import CreateJobSheet from '@/components/CreateJobSheet'
import JobCard from '@/components/JobCard'
import WithdrawBanner from '@/components/WithdrawBanner'

type TabView = 'all' | 'client' | 'freelancer'

const CHAIN_LABELS: Record<number, string> = {
  [ARC_TESTNET_CHAIN_ID]: 'Arc Testnet',
  [ARC_MAINNET_CHAIN_ID]: 'Arc Mainnet',
}

export default function App() {
  const { address, isConnected, chainId: walletChainId } = useAccount()
  const queryClient = useQueryClient()
  const { switchChain } = useSwitchChain()

  const [createOpen, setCreateOpen] = useState(false)
  const [tab, setTab] = useState<TabView>('all')

  // Use wallet's chain if supported, else default to testnet
  const activeChainId: number = isSupportedChain(walletChainId) ? walletChainId : ARC_TESTNET_CHAIN_ID
  const chainLabel = CHAIN_LABELS[activeChainId] ?? 'Arc Testnet'
  const explorerBase = activeChainId === ARC_MAINNET_CHAIN_ID
    ? 'https://explorer.arc.io'
    : 'https://explorer.testnet.arc.io'

  const escrowAddress = getEscrowAddress(activeChainId)
  const contractDeployed = !!escrowAddress

  const { data: jobCount, isLoading: countLoading } = useJobCount(activeChainId)
  const count = Number(jobCount ?? 0n)
  const { data: jobResults, isLoading: jobsLoading } = useJobs(count, activeChainId)
  const { data: balance } = useUsdcBalance(activeChainId)

  type JobRow = {
    client: string; freelancer: string; amount: bigint; deliverBy: number
    reviewWindow: number; payeeCount: number; status: number; deliveredAt: number
    description: string; deliveryUri: string
    payeeAddrs: readonly string[]; payeeBps: readonly number[]
  }

  const jobs = (jobResults ?? []).map((r, i) => ({
    id: BigInt(i),
    data: r.result as JobRow | undefined,
  })).filter((j): j is { id: bigint; data: JobRow } => !!j.data)

  const filteredJobs = jobs.filter((j) => {
    if (!address) return tab === 'all'
    if (tab === 'client') return j.data.client.toLowerCase() === address.toLowerCase()
    if (tab === 'freelancer') return j.data.freelancer.toLowerCase() === address.toLowerCase()
    return true
  })

  const isLoading = countLoading || jobsLoading
  const onWrongChain = isConnected && walletChainId !== undefined && !isSupportedChain(walletChainId)

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-30 border-b"
        style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(24px)', borderColor: 'var(--border)' }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl" style={{ background: 'var(--accent)' }}>
              <Briefcase className="size-4 text-white" />
            </div>
            <div>
              <h1 className="display text-base font-bold leading-tight" style={{ color: 'var(--ink)' }}>
                Delivery Escrow
              </h1>
              <p className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>{chainLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isConnected && balance !== undefined && (
              <div
                className="hidden sm:flex items-center gap-1.5 rounded-full px-3 py-1.5"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
              >
                <TokenUSDC variant="branded" size={14} />
                <span className="display text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {formatUsdc(balance)}
                </span>
              </div>
            )}
            <ConnectKitButton />
          </div>
        </div>

        {/* Network switcher bar */}
        {isConnected && (
          <div className="mx-auto flex max-w-2xl gap-1 px-4 pb-2">
            {SUPPORTED_CHAIN_IDS.map((cid) => (
              <button
                key={cid}
                onClick={() => switchChain({ chainId: cid })}
                className="rounded-full px-3 py-1 text-xs font-semibold transition-all"
                style={
                  activeChainId === cid
                    ? { background: 'var(--accent)', color: 'white' }
                    : { background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }
                }
              >
                {CHAIN_LABELS[cid]}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 pb-24">
        {/* Wrong chain warning */}
        {onWrongChain && (
          <div
            className="mb-4 flex items-start gap-3 rounded-2xl p-4"
            style={{ background: 'rgba(186,43,76,0.08)', border: '1px solid rgba(186,43,76,0.2)' }}
          >
            <AlertTriangle className="size-4 mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>Unsupported network</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                Switch to Arc Testnet or Arc Mainnet using the buttons above.
              </p>
            </div>
          </div>
        )}

        {!contractDeployed ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <Briefcase className="size-8 mx-auto mb-3" style={{ color: 'var(--subtle)' }} />
            <p className="font-semibold mb-1" style={{ color: 'var(--ink)' }}>No contract on {chainLabel}</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {activeChainId === ARC_MAINNET_CHAIN_ID
                ? 'Deploy the contract to Arc Mainnet using the Deploy.s.sol script, then set VITE_ESCROW_ADDRESS_5042.'
                : 'The escrow contract address will appear here after deploy.'}
            </p>
          </div>
        ) : (
          <>
            {/* Withdraw banner */}
            {isConnected && <WithdrawBanner chainId={activeChainId} />}

            {/* Hero card */}
            <section
              className="rounded-3xl p-5 mb-5"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(18,45,69,0.08)' }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>
                TOTAL JOBS ON {chainLabel.toUpperCase()}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="display text-4xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {isLoading ? '...' : count}
                </span>
                <span className="text-base" style={{ color: 'var(--subtle)' }}>jobs</span>
              </div>
              {isConnected ? (
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  Create a job to escrow USDC for your next freelance project.
                </p>
              ) : (
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  Connect your wallet to create or manage jobs.
                </p>
              )}
            </section>

            {/* Create button */}
            {isConnected && !onWrongChain && (
              <button
                onClick={() => setCreateOpen(true)}
                className="w-full mb-5 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{ background: 'var(--accent)' }}
              >
                <Plus className="size-4" />
                Create New Job
              </button>
            )}

            {/* Tabs */}
            <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: 'var(--surface-muted)' }}>
              {(['all', 'client', 'freelancer'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition-all"
                  style={
                    tab === t
                      ? { background: 'white', color: 'var(--ink)', boxShadow: '0 1px 3px rgba(18,45,69,0.1)' }
                      : { color: 'var(--muted)' }
                  }
                >
                  {t === 'all' ? 'All Jobs' : t === 'client' ? 'As Client' : 'As Freelancer'}
                </button>
              ))}
            </div>

            {/* Job list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-16 gap-3" style={{ color: 'var(--subtle)' }}>
                <RefreshCw className="size-5 animate-spin" />
                <span className="text-sm">Loading jobs...</span>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div
                className="rounded-2xl p-8 text-center"
                style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}
              >
                <Briefcase className="size-8 mx-auto mb-3" style={{ color: 'var(--subtle)' }} />
                <p className="font-semibold mb-1" style={{ color: 'var(--ink)' }}>
                  {tab === 'all' ? 'No jobs yet' : `No jobs as ${tab}`}
                </p>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  {tab === 'all' && isConnected
                    ? 'Create the first job above.'
                    : tab === 'all'
                    ? 'Connect your wallet to create jobs.'
                    : 'Jobs you created or were assigned will appear here.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredJobs.map((j) => (
                  <JobCard key={j.id.toString()} jobId={j.id} job={j.data} chainId={activeChainId} />
                ))}
              </div>
            )}

            {/* Contract address */}
            <div className="mt-8 text-center">
              <a
                href={`${explorerBase}/address/${escrowAddress}`}
                target="_blank"
                rel="noreferrer"
                className="mono text-xs underline"
                style={{ color: 'var(--subtle)' }}
              >
                {escrowAddress}
              </a>
            </div>
          </>
        )}
      </main>

      <CreateJobSheet
        chainId={activeChainId}
        open={createOpen}
        onClose={() => {
          setCreateOpen(false)
          void queryClient.invalidateQueries()
        }}
      />

      {/* Hidden preload for explorer links — needs buildTxExplorerUrl in scope */}
      {false && buildTxExplorerUrl(activeChainId, '0x0')}
    </div>
  )
}
