# McMaster-Carr API Proxy

A secure, Vercel-ready serverless proxy for the McMaster-Carr API. It authenticates with McMaster using a client certificate and username/password, secures proxy endpoints with an internal API key, and exposes health, login, and single-part price endpoints.

**Shaped for Vercel serverless deployment.** No Express, no long-running process, no database, no UI.

## What it does

- **Certificate auth**: Every outbound request to McMaster uses a client certificate (.pfx).
- **Login**: Obtains an auth token via McMaster’s login API; token typically expires in ~24 hours.
- **Price**: Looks up price for one part number; optionally subscribes the part if McMaster requires it, then retries once. Returns one normalized price (lowest minimum-quantity break).
- **API key**: All `/api/mcmaster/*` routes require an `x-api-key` header matching `PROXY_API_KEY`.

## Required environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PROXY_API_KEY` | Yes (for mcmaster routes) | Secret key sent in `x-api-key` header. |
| `MCMASTER_USERNAME` | Yes | McMaster API username. |
| `MCMASTER_PASSWORD` | Yes | McMaster API password. |
| `MCMASTER_CERT_PASSWORD` | Yes | Password for the .pfx client certificate. |
| `MCMASTER_CERT_BASE64` | One of these | Base64-encoded .pfx file contents (preferred on Vercel). |
| `MCMASTER_CERT_PATH` | One of these | Path to .pfx file (e.g. for local dev). |

Optional:

- `MCMASTER_API_HOST` (default: `api.mcmaster.com`)
- `MCMASTER_API_BASE_PATH` (default: `/v1`)
- `MCMASTER_REQUEST_TIMEOUT_MS` (default: `15000`)
- `LOG_LEVEL` (default: `info`)

## Certificate handling

- **Prefer base64 on Vercel**: Set `MCMASTER_CERT_BASE64` to the full contents of your .pfx file, base64-encoded (e.g. `cat client.pfx | base64`). No file system needed.
- **Local fallback**: Set `MCMASTER_CERT_PATH` to the path to your .pfx file (e.g. `./certs/client.pfx`).
- **Password**: Always set `MCMASTER_CERT_PASSWORD`.
- If neither certificate source is available (or the password is missing), the app fails fast with a clear configuration error.

## Run locally

1. Copy `.env.example` to `.env` and fill in values (use `MCMASTER_CERT_PATH` for a local .pfx path).
2. Install and run with Vercel CLI:

   ```bash
   npm install
   npx vercel dev
   ```

3. Call the endpoints (examples below). Base URL is typically `http://localhost:3000`.

## Endpoints

### GET /api/health

No API key. Use to check that the proxy is up.

**Example**

```bash
curl -X GET http://localhost:3000/api/health
```

**Response (200)**

```json
{ "ok": true }
```

---

### POST /api/mcmaster/login

Requires `x-api-key`. No body. Calls McMaster login and returns token and expiration.

**Example**

```bash
curl -X POST http://localhost:3000/api/mcmaster/login \
  -H "x-api-key: YOUR_PROXY_API_KEY"
```

**Response (200)**

```json
{
  "authToken": "...",
  "tokenExpiresAt": "..."
}
```

**Errors**: 401 (invalid/missing API key), 405 (wrong method), 502/504 (upstream/login failure), 500 (config error).

---

### POST /api/mcmaster/price

Requires `x-api-key`. Body: `authToken` and `partNumber`. Returns normalized price for that part (and optionally subscribes the part and retries once if McMaster requires it).

**Example**

```bash
curl -X POST http://localhost:3000/api/mcmaster/price \
  -H "x-api-key: YOUR_PROXY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"authToken":"YOUR_MCMASTER_TOKEN","partNumber":"91290A115"}'
```

**Response (200)**

```json
{
  "partNumber": "91290A115",
  "price": 3.46,
  "minimumQuantity": 1,
  "unitOfMeasure": "Each",
  "rawPriceBreaks": [...]
}
```

**Errors**: 400 (missing/invalid body, authToken, or partNumber), 401 (invalid/missing API key), 404 (no price data), 405 (wrong method), 502/504 (upstream/timeout), 500 (config error).

## Request/response shapes

- **Error shape** (all error responses):

  ```json
  { "error": "<message>", "details": "<optional>", "status": <code> }
  ```

- **Price normalization**: The proxy picks the price break with the **lowest** `MinimumQuantity` and returns that `Amount`, `MinimumQuantity`, and `UnitOfMeasure`, plus the full `rawPriceBreaks` array.

## Security notes

- Do not commit `.env` or real certificates. Use Vercel (or your host) env for production.
- The proxy never logs or returns `PROXY_API_KEY`, `MCMASTER_PASSWORD`, `MCMASTER_CERT_PASSWORD`, or full auth tokens.
- Client certificate is loaded from env (base64 or path) and used only for outbound McMaster requests.

## McMaster assumptions

- **Login**: Response includes fields such as `AuthToken` and `ExpirationTS` (or similar); the proxy maps these to `authToken` and `tokenExpiresAt`.
- **Price**: Response is a JSON array of price breaks with `Amount`, `MinimumQuantity`, `UnitOfMeasure` (or common variants). The proxy tolerates slight field name differences.
- **Not subscribed**: Detected by HTTP status (e.g. 403/404) and/or error message text. The proxy then calls Add Product (`https://www.mcmaster.com/{partNumber}` with client cert) and retries the price lookup **once**.
- No token caching in the proxy; the client should obtain a token via `/api/mcmaster/login` and reuse it until it expires.

## Project structure

- `api/` – Vercel serverless handlers: `health.js`, `mcmaster/login.js`, `mcmaster/price.js`
- `src/config.js` – Env and config
- `src/lib/` – `cert.js`, `errors.js`, `http.js`, `logger.js`, `response.js`
- `src/middleware/requireApiKey.js` – API key check for mcmaster routes
- `src/services/mcmasterClient.js` – McMaster login, getPrice, addProduct
- `src/services/mcmasterPrice.js` – Price orchestration and normalization

This project is intended for deployment as Vercel serverless functions; it does not include deployment steps beyond configuring env and certificate in the Vercel dashboard.
