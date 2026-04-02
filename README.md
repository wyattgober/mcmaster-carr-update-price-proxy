# McMaster-Carr API Proxy

A secure, Vercel-ready serverless proxy for parts-supplier APIs. It integrates **McMaster-Carr** (client certificate + username/password) and **Mouser** (API key to Mouser’s REST API). All vendor routes are protected by a single internal proxy key (`PROXY_API_KEY` via `x-api-key`).

**Shaped for Vercel serverless deployment.** No Express, no long-running process, no database, no UI.

## What it does

- **Certificate auth (McMaster)**: Every outbound request to McMaster uses a client certificate (.pfx).
- **Login (McMaster)**: Obtains an auth token via McMaster’s login API; token typically expires in ~24 hours.
- **Price (McMaster)**: Looks up price for one part number; optionally subscribes the part if McMaster requires it, then retries once. Returns one normalized price (lowest minimum-quantity break).
- **Image (McMaster)**: Fetches product info to resolve the Image link, then downloads the image bytes; same subscribe-and-retry behavior as price. Returns base64-encoded image data and `Content-Type`.
- **Search (Mouser)**: Calls Mouser API v2 `search/partnumberandmanufacturer` and returns a trimmed JSON payload (`errors`, `numberOfResult`, `parts`).
- **Image (Mouser)**: Searches by manufacturer + Mouser part number, resolves `ImagePath`, downloads the image server-side, returns base64 plus `fileName` and `contentType` (so clients like Airtable never hit Mouser’s image host directly).
- **API key**: All `/api/mcmaster/*` and `/api/mouser/*` routes require an `x-api-key` header matching `PROXY_API_KEY`.

## Required environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PROXY_API_KEY` | Yes (for `/api/mcmaster/*` and `/api/mouser/*`) | Secret key sent in `x-api-key` header. |
| `MCMASTER_USERNAME` | Yes for McMaster | McMaster API username. |
| `MCMASTER_PASSWORD` | Yes for McMaster | McMaster API password. |
| `MCMASTER_CERT_PASSWORD` | Yes for McMaster | Password for the .pfx client certificate. |
| `MCMASTER_CERT_BASE64` | One of these | Base64-encoded .pfx file contents (preferred on Vercel). |
| `MCMASTER_CERT_PATH` | One of these | Path to .pfx file (e.g. for local dev). |
| `MOUSER_API_KEY` | Yes for Mouser routes | API key from [Mouser API Hub](https://www.mouser.com/api-hub/); sent to Mouser only as query param `apiKey`. |

Optional:

- `MCMASTER_API_HOST` (default: `api.mcmaster.com`)
- `MCMASTER_API_BASE_PATH` (default: `/v1`)
- `MCMASTER_REQUEST_TIMEOUT_MS` (default: `15000`)
- `MOUSER_API_HOST` (default: `api.mouser.com`)
- `MOUSER_REQUEST_TIMEOUT_MS` (default: same as `MCMASTER_REQUEST_TIMEOUT_MS`, or `15000` if unset)
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

**Errors**: 400 (missing/invalid body, authToken, or partNumber), 401 (invalid/missing API key), 404 (no price data), 405 (wrong method), 429 (McMaster daily **add-product** subscription limit reached), 502/504 (upstream/timeout), 500 (config error).

---

### POST /api/mcmaster/image

Requires `x-api-key`. Body: `authToken` and `partNumber`. Resolves the product’s Image URL from McMaster product metadata, then returns the image (same subscription flow as price: add product and retry once if needed).

**Example**

```bash
curl -X POST http://localhost:3000/api/mcmaster/image \
  -H "x-api-key: YOUR_PROXY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"authToken":"YOUR_MCMASTER_TOKEN","partNumber":"91290A115"}'
```

**Response (200)**

```json
{
  "partNumber": "91290A115",
  "contentType": "image/png",
  "contentLength": 12345,
  "imageBase64": "..."
}
```

**Errors**: 400 (missing/invalid body, authToken, or partNumber), 401 (invalid/missing API key), 404 (no image link for part), 405 (wrong method), 429 (McMaster daily **add-product** subscription limit reached), 502/504 (upstream/timeout), 500 (config error).

---

### POST /api/mouser/search

Requires `x-api-key`. Body: `partNumber` and `manufacturerName`. Calls Mouser API v2 **SearchByPartMfrName** (`POST /api/v2/search/partnumberandmanufacturer`). Returns errors (if any), result count, and the `parts` array from Mouser.

`manufacturerName` should match a name from Mouser’s manufacturer list for reliable results (see Mouser’s **GetManufacturerList** in their API docs).

**Example**

```bash
curl -X POST http://localhost:3000/api/mouser/search \
  -H "x-api-key: YOUR_PROXY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"partNumber":"595-6501047742","manufacturerName":"Vishay Beyschag"}'
```

**Response (200)**

```json
{
  "errors": [],
  "numberOfResult": 1,
  "parts": [ { "MouserPartNumber": "...", "ImagePath": "...", "Manufacturer": "..." } ]
}
```

**Errors**: 400 (missing `partNumber` or `manufacturerName`), 401, 405, 502/504, 500 (e.g. missing `MOUSER_API_KEY`).

---

### POST /api/mouser/image

Requires `x-api-key`. Body: `partNumber` and `manufacturerName`. Performs the same Mouser search as above, takes the first result with an `ImagePath`, downloads the image on the server, and returns a normalized payload.

**Example**

```bash
curl -X POST http://localhost:3000/api/mouser/image \
  -H "x-api-key: YOUR_PROXY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"partNumber":"595-6501047742","manufacturerName":"Vishay Beyschag"}'
```

**Response (200)**

```json
{
  "partNumber": "595-6501047742",
  "contentType": "image/jpeg",
  "contentLength": 12345,
  "fileName": "595-6501047742.jpg",
  "imageBase64": "..."
}
```

**Errors**: 400 (missing fields), 401, 404 (no parts or no image), 405, 502 (Mouser API errors or image download failure), 504 (timeout), 500 (missing `MOUSER_API_KEY` or config).

## Request/response shapes

- **Error shape** (all error responses):

  ```json
  { "error": "<message>", "details": "<optional>", "status": <code> }
  ```

- **Price normalization**: The proxy picks the price break with the **lowest** `MinimumQuantity` and returns that `Amount`, `MinimumQuantity`, and `UnitOfMeasure`, plus the full `rawPriceBreaks` array.

## Security notes

- Do not commit `.env` or real certificates. Use Vercel (or your host) env for production.
- The proxy never logs or returns `PROXY_API_KEY`, `MCMASTER_PASSWORD`, `MCMASTER_CERT_PASSWORD`, `MOUSER_API_KEY`, or full auth tokens.
- Client certificate is loaded from env (base64 or path) and used only for outbound McMaster requests.
- `MOUSER_API_KEY` is sent only to `api.mouser.com` as the `apiKey` query parameter; it is not exposed to clients.

## McMaster assumptions

- **Login**: Response includes fields such as `AuthToken` and `ExpirationTS` (or similar); the proxy maps these to `authToken` and `tokenExpiresAt`.
- **Price**: Response is a JSON array of price breaks with `Amount`, `MinimumQuantity`, `UnitOfMeasure` (or common variants). The proxy tolerates slight field name differences.
- **Not subscribed**: Detected by HTTP status (e.g. 403/404) and/or error message text. The proxy then calls Add Product (`https://www.mcmaster.com/{partNumber}` with client cert) and retries the product/price lookup **once** (same for image after resolving the Image link).
- **Daily subscription limit**: McMaster caps how many products you can add per day per account; when that limit is hit, Add Product fails and the proxy returns **429** with `details` from McMaster (see [API limits](https://www.mcmaster.com/help/api/)). Retry the next day, remove unused subscriptions via their API, or contact McMaster.
- **Image**: Product metadata includes a `Links` entry with `Key: "Image"`; the proxy `GET`s that path on `api.mcmaster.com` with the same bearer token and client certificate.
- No token caching in the proxy; the client should obtain a token via `/api/mcmaster/login` and reuse it until it expires.

## Project structure

- `api/` – Vercel serverless handlers: `health.js`, `mcmaster/login.js`, `mcmaster/price.js`, `mcmaster/image.js`, `mouser/search.js`, `mouser/image.js`
- `src/config.js` – Env and config
- `src/lib/` – `cert.js`, `errors.js`, `http.js` (McMaster + cert), `httpsSimple.js` (plain HTTPS for Mouser), `logger.js`, `response.js`
- `src/middleware/requireApiKey.js` – API key check for protected routes
- `src/services/mcmasterClient.js` – McMaster login, getPrice, getProduct, getProductWithSubscribe, getImage, addProduct
- `src/services/mcmasterPrice.js` – Price orchestration and normalization
- `src/services/mcmasterImage.js` – Image orchestration (product link + binary fetch)
- `src/services/mouserClient.js` – Mouser search + image download
- `src/services/mouserImage.js` – Mouser image orchestration and normalized response

This project is intended for deployment as Vercel serverless functions; it does not include deployment steps beyond configuring env and certificate in the Vercel dashboard.
