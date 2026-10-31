# Escrow Guardian (Chainlink CRE workflow)

Cron workflow that watches every DeliveryEscrow job on Arc, records an on-chain notice when a party breaches the escrow terms and serves the notice by e-mail. See the "Escrow Guardian" section of the repository README for the full design and the live testnet runs.

Capabilities used: cron trigger, EVM read (`callContract`), DON-signed report + EVM write (`writeReport` through the forwarder), HTTP (`HTTPClient.sendRequest` in node mode with `consensusIdenticalAggregation`) and secrets (`runtime.getSecret`).

Config (`config.*.json`): `schedule`, `chainSelectorName`, `escrowAddress`, `registryAddress`, `gasLimit`, `maxJobs`, and the optional service of notice: `noticeInbox` (who receives the service copy), `noticeFrom` (a sender verified in Resend) and `explorerTxUrl`. Without `noticeInbox` the workflow only records on-chain.

Secret (`../secrets.yaml`): `RESEND_API_KEY`. For the simulator put `CRE_RESEND_API_KEY=re_...` in the `-e` env file next to `CRE_ETH_PRIVATE_KEY`; for the DON use `cre secrets create`. Every DON node posts the same request with the same `Idempotency-Key` (one per report), so Resend sends a single e-mail.

```bash
bun install
bun test                       # unit tests for breach selection and report encoding
# from cre-guardian/: needs a funded Arc testnet key in an env file (CRE_ETH_PRIVATE_KEY=...)
cre workflow simulate escrow-guardian -e <env-file> --target staging-settings --broadcast --non-interactive --trigger-index 0
```
