import {
  bytesToHex,
  CronCapability,
  EVMClient,
  encodeCallMsg,
  getNetwork,
  handler,
  hexToBase64,
  LATEST_BLOCK_NUMBER,
  Runner,
  TxStatus,
  type Runtime,
} from "@chainlink/cre-sdk";
import {
  type Address,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
} from "viem";

export type Config = {
  schedule: string;
  chainSelectorName: string;
  escrowAddress: string;
  registryAddress: string;
  gasLimit: string;
  maxJobs: number;
};

export const KIND_LABEL: Record<number, string> = {
  1: "DELIVERY_DEADLINE_MISSED (client may refund)",
  2: "REVIEW_WINDOW_LAPSED (freelancer may claim payment)",
};

const escrowAbi = parseAbi(["function jobCount() view returns (uint256)"]);
const registryAbi = parseAbi([
  "function notices(uint256) view returns (uint8 kind, uint40 recordedAt, address entitledParty)",
  "function noticeDue(uint256) view returns (uint8 kind, address party)",
]);
const reportParams = parseAbiParameters("uint256[] jobIds, uint8[] kinds");

export type Breach = { jobId: bigint; kind: number; party: string };

/** Picks the jobs that need a new notice: one is due now and none was recorded before. */
export const selectBreaches = (
  jobs: { jobId: bigint; recordedKind: number; dueKind: number; party: string }[],
): Breach[] =>
  jobs
    .filter((j) => j.recordedKind === 0 && j.dueKind !== 0)
    .map((j) => ({ jobId: j.jobId, kind: j.dueKind, party: j.party }));

export const encodeNoticeReport = (breaches: Breach[]) =>
  encodeAbiParameters(reportParams, [breaches.map((b) => b.jobId), breaches.map((b) => b.kind)]);

export const onCronTrigger = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config;
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainSelectorName });
  if (!network) throw new Error(`Network not found: ${cfg.chainSelectorName}`);
  const evm = new EVMClient(network.chainSelector.selector);

  const read = <T>(to: string, abi: any, functionName: string, args: unknown[] = []): T => {
    const reply = evm
      .callContract(runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: to as Address,
          data: encodeFunctionData({ abi, functionName, args } as any),
        }),
        blockNumber: LATEST_BLOCK_NUMBER,
      })
      .result();
    return decodeFunctionResult({ abi, functionName, data: bytesToHex(reply.data) } as any) as T;
  };

  const count = read<bigint>(cfg.escrowAddress, escrowAbi, "jobCount");
  const total = Number(count) < cfg.maxJobs ? Number(count) : cfg.maxJobs;
  runtime.log(`Escrow ${cfg.escrowAddress}: ${count} jobs, checking ${total}`);

  const jobs = [];
  for (let i = 0; i < total; i++) {
    const jobId = BigInt(i);
    const [recordedKind] = read<[number, number, string]>(cfg.registryAddress, registryAbi, "notices", [jobId]);
    const [dueKind, party] = read<[number, string]>(cfg.registryAddress, registryAbi, "noticeDue", [jobId]);
    jobs.push({ jobId, recordedKind, dueKind, party });
  }

  const breaches = selectBreaches(jobs);
  if (breaches.length === 0) {
    runtime.log("No new breach: every escrow is within its terms.");
    return "no-breach";
  }
  for (const b of breaches) {
    runtime.log(`Job #${b.jobId}: ${KIND_LABEL[b.kind]} -> entitled party ${b.party}`);
  }

  const report = runtime
    .report({
      encodedPayload: hexToBase64(encodeNoticeReport(breaches)),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const write = evm
    .writeReport(runtime, {
      receiver: cfg.registryAddress,
      report,
      gasConfig: { gasLimit: cfg.gasLimit },
    })
    .result();

  if (write.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`Notice report failed: ${write.errorMessage || write.txStatus}`);
  }
  const txHash = bytesToHex(write.txHash || new Uint8Array(32));
  runtime.log(`Recorded ${breaches.length} notice(s) on-chain: ${txHash}`);
  return txHash;
};

export const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
