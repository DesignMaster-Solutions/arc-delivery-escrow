#!/usr/bin/env bash
# Runs one real DeliveryEscrow job end to end (create -> deliver -> release -> withdraw) on Arc.
# Env: RPC_URL, ESCROW, CLIENT_KEY, FREELANCER_KEY, EXPLORER (tx link prefix). Amount: 1 USDC.
set -euo pipefail
USDC=0x3600000000000000000000000000000000000000
CLIENT=$(cast wallet address --private-key "$CLIENT_KEY")
FREELANCER=$(cast wallet address --private-key "$FREELANCER_KEY")
# load-balanced RPC can lag one call behind the previous receipt: retry a few times
send() {
  for i in 1 2 3 4 5; do
    h=$(cast send --rpc-url "$RPC_URL" --private-key "$1" --json "${@:2}" 2>/dev/null | jq -r .transactionHash) && [ "$h" != null ] && [ -n "$h" ] && { echo "$h"; return; }
    sleep 2
  done
  echo "FAILED: ${*:2}" >&2; exit 1
}
log() { echo "$1: $EXPLORER/tx/$2"; }

# freelancer needs a little native USDC for gas
log "fund freelancer gas" "$(send "$CLIENT_KEY" "$FREELANCER" --value 0.05ether)"
log "approve" "$(send "$CLIENT_KEY" $USDC 'approve(address,uint256)' "$ESCROW" 1000000)"
ID=$(cast call --rpc-url "$RPC_URL" "$ESCROW" 'jobCount()(uint256)')
DEADLINE=$(( $(date +%s) + 7200 ))
log "createJob #$ID" "$(send "$CLIENT_KEY" "$ESCROW" 'createJob(address,uint128,uint40,uint32,string,address[3],uint16[3],uint8)' \
  "$FREELANCER" 1000000 $DEADLINE 3600 "Landing page copy review" \
  "[$FREELANCER,0x0000000000000000000000000000000000000000,0x0000000000000000000000000000000000000000]" "[10000,0,0]" 1)"
log "markDelivered" "$(send "$FREELANCER_KEY" "$ESCROW" 'markDelivered(uint256,string)' "$ID" "https://github.com/DesignMaster-Solutions/arc-delivery-escrow")"
log "release" "$(send "$CLIENT_KEY" "$ESCROW" 'release(uint256)' "$ID")"
log "withdraw" "$(send "$FREELANCER_KEY" "$ESCROW" 'withdraw()')"
echo "freelancer USDC (6 dec): $(cast call --rpc-url "$RPC_URL" $USDC 'balanceOf(address)(uint256)' "$FREELANCER")"
