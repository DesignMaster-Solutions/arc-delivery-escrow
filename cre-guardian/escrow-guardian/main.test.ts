import { describe, expect, test } from "bun:test";
import { decodeAbiParameters, parseAbiParameters } from "viem";
import { encodeNoticeReport, initWorkflow, selectBreaches, type Config } from "./main";

const party = "0x00000000000000000000000000000000000000aa";

describe("selectBreaches", () => {
  test("keeps only jobs with a due notice that was never recorded", () => {
    const out = selectBreaches([
      { jobId: 0n, recordedKind: 0, dueKind: 0, party }, // healthy
      { jobId: 1n, recordedKind: 0, dueKind: 1, party }, // deadline missed
      { jobId: 2n, recordedKind: 2, dueKind: 2, party }, // already noticed
      { jobId: 3n, recordedKind: 0, dueKind: 2, party }, // review lapsed
    ]);
    expect(out).toEqual([
      { jobId: 1n, kind: 1, party },
      { jobId: 3n, kind: 2, party },
    ]);
  });

  test("returns nothing when every escrow is within its terms", () => {
    expect(selectBreaches([{ jobId: 0n, recordedKind: 0, dueKind: 0, party }])).toEqual([]);
  });
});

describe("encodeNoticeReport", () => {
  test("matches the (uint256[], uint8[]) layout BreachNoticeRegistry decodes", () => {
    const hex = encodeNoticeReport([
      { jobId: 2n, kind: 1, party },
      { jobId: 3n, kind: 2, party },
    ]);
    const [ids, kinds] = decodeAbiParameters(parseAbiParameters("uint256[], uint8[]"), hex);
    expect(ids).toEqual([2n, 3n]);
    expect(kinds).toEqual([1, 2]);
  });
});

describe("initWorkflow", () => {
  test("registers one cron handler with the configured schedule", () => {
    const config: Config = {
      schedule: "0 */10 * * * *",
      chainSelectorName: "arc-testnet",
      escrowAddress: "0xd6D42F482585e8c5882a90860FB4cd1b875d29B2",
      registryAddress: "0x65746f288670b6CA853e3D212C6d0252356ae0CC",
      gasLimit: "500000",
      maxJobs: 50,
    };
    const handlers = initWorkflow(config);
    expect(handlers).toHaveLength(1);
    expect(handlers[0].trigger.config.schedule).toBe(config.schedule);
  });
});
