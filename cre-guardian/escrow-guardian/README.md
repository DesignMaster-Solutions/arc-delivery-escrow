# Escrow Guardian (Chainlink CRE workflow)

Cron workflow that watches every DeliveryEscrow job on Arc and records an on-chain notice when a party breaches the escrow terms. See the "Escrow Guardian" section of the repository README for the full design and the live testnet run.

```bash
bun install
bun test                       # unit tests for breach selection and report encoding
# from cre-guardian/: needs a funded Arc testnet key in an env file (CRE_ETH_PRIVATE_KEY=...)
cre workflow simulate escrow-guardian -e <env-file> --target staging-settings --broadcast --non-interactive --trigger-index 0
```
