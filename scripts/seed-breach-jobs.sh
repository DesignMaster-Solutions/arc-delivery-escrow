#!/usr/bin/env bash
# Seeds three DeliveryEscrow jobs on Arc testnet so the CRE Escrow Guardian has something to judge:
#   A) freelancer never delivers and the deadline passes  -> DELIVERY_DEADLINE_MISSED (client may refund)
#   B) freelancer delivers, client stays silent past review -> REVIEW_WINDOW_LAPSED (freelancer may claim)
#   C) healthy job, deadline a week away                    -> no notice
# Env: RPC_URL, ESCROW, CLIENT_KEY, FREELANCER_KEY, EXPLORER. Each job escrows 0.10 USDC.
set -euo pipefail
USDC=0x3600000000000000000000000000000000000000
Z=0x0000000000000000000000000000000000000000
FREELANCER=$(cast wallet address --private-key "$FREELANCER_KEY")
send() {
  for i in 1 2 3 4 5; do
    h=$(cast send --rpc-url "$RPC_URL" --private-key "$1" --json "${@:2}" 2>/dev/null | jq -r .transactionHash) && [ "$h" != null ] && [ -n "$h" ] && { echo "$h"; return; }
    sleep 2
  done
  echo "FAILED: ${*:2}" >&2; exit 1
}
log() { echo "$1: $EXPLORER/tx/$2"; }
create() { # deliverBy reviewWindow description
  local id; id=$(cast call --rpc-url "$RPC_URL" "$ESCROW" 'jobCount()(uint256)')
  log "createJob #$id ($3)" "$(send "$CLIENT_KEY" "$ESCROW" 'createJob(address,uint128,uint40,uint32,string,address[3],uint16[3],uint8)' \
    "$FREELANCER" 100000 "$1" "$2" "$3" "[$FREELANCER,$Z,$Z]" "[10000,0,0]" 1)" >&2
  echo "$id"
}
NOW=$(date +%s)
log "fund freelancer gas" "$(send "$CLIENT_KEY" "$FREELANCER" --value 0.02ether)"
log "approve" "$(send "$CLIENT_KEY" $USDC 'approve(address,uint256)' "$ESCROW" 300000)"
A=$(create $((NOW + 90)) 3600 "Logo redesign (deadline will be missed)")
B=$(create $((NOW + 7200)) 60 "Contract translation EN-PT (client goes silent)")
C=$(create $((NOW + 604800)) 86400 "Monthly SEO report (healthy)")
log "markDelivered #$B" "$(send "$FREELANCER_KEY" "$ESCROW" 'markDelivered(uint256,string)' "$B" "ipfs://bafy-translation-delivery")"
echo "jobs: A=$A (deadline missed after ~90 s), B=$B (review lapses after 60 s), C=$C (healthy)"
