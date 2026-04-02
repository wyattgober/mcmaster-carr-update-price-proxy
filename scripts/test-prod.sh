#!/usr/bin/env bash
# Test Vercel production endpoints from the terminal.
# Usage: BASE_URL=https://your-app.vercel.app PROXY_API_KEY=yourkey ./scripts/test-prod.sh
# Or:   npm run test:prod  (after setting env in .env or shell)

set -e
BASE_URL="${BASE_URL:-}"
PROXY_API_KEY="${PROXY_API_KEY:-}"

if [ -z "$BASE_URL" ] || [ -z "$PROXY_API_KEY" ]; then
  echo "Set BASE_URL and PROXY_API_KEY (e.g. export BASE_URL=https://mc-master-carr-proxy.vercel.app PROXY_API_KEY=yourkey)"
  exit 1
fi

echo "→ GET $BASE_URL/api/health"
curl -s "$BASE_URL/api/health" | head -c 200
echo ""
echo ""

echo "→ POST $BASE_URL/api/mcmaster/login"
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/api/mcmaster/login" -H "x-api-key: $PROXY_API_KEY")
echo "$LOGIN_RESP" | head -c 300
echo ""

TOKEN=$(echo "$LOGIN_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(j.authToken||'')}catch(e){}})")
if [ -z "$TOKEN" ]; then
  echo "No authToken in login response; stopping."
  exit 1
fi
echo "(token received)"
echo ""

echo "→ POST $BASE_URL/api/mcmaster/price (partNumber: 91290A115)"
curl -s -X POST "$BASE_URL/api/mcmaster/price" \
  -H "x-api-key: $PROXY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"authToken\":\"$TOKEN\",\"partNumber\":\"91290A115\"}"
echo ""
echo ""

echo "→ POST $BASE_URL/api/mcmaster/image (partNumber: 91290A115)"
curl -s -X POST "$BASE_URL/api/mcmaster/image" \
  -H "x-api-key: $PROXY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"authToken\":\"$TOKEN\",\"partNumber\":\"91290A115\"}" | head -c 400
echo ""
echo ""
