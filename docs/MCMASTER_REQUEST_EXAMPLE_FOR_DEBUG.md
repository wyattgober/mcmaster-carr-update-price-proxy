# McMaster-Carr API – Request Example for Debugging

This document describes exactly how our proxy sends the **Log in** request to the McMaster-Carr Product Information API, including how credentials and the client certificate are passed. You can share this with McMaster’s team to help debug 401 LOGIN_FAILED or TLS issues.

---

## 1. Log in request (what we send)

| Field | Value |
|-------|--------|
| **URL** | `https://api.mcmaster.com/v1/login` |
| **Method** | `POST` |
| **TLS** | Mutual TLS (client certificate presented during handshake) |

### 1.1 HTTP headers we send

```
Content-Type: application/json
Content-Length: <length of body in bytes>
```

We do **not** send `Authorization`, `Basic`, or `Bearer` on the login request. Credentials are only in the request body.

### 1.2 Request body (JSON)

We send a **single JSON object** with exactly these two keys (PascalCase as in your API docs):

```json
{
  "UserName": "<McMaster API username>",
  "Password": "<McMaster API password>"
}
```

- **UserName** and **Password** are the API credentials provided by McMaster for the Product Information API.
- Values are trimmed of leading/trailing whitespace; otherwise sent as-is in UTF-8.
- No other fields are included in the body.

### 1.3 Client certificate (how it’s sent)

- We attach a **client certificate** to the **TLS connection** for every request to `api.mcmaster.com` (login, price, add product).
- The certificate is a **PKCS#12 (.pfx)** file and passphrase that McMaster provided for our account.
- In Node.js we use the built-in `https` module with these options on the connection:
  - `pfx`: buffer containing the .pfx file (binary)
  - `passphrase`: string password for the .pfx
- The client certificate is sent during the **TLS handshake** (not in HTTP headers or body). The server sees it at the TLS layer before any HTTP request is sent.

We do **not** send the certificate or password in any header or in the JSON body.

---

## 2. Example (redacted) of our login call

Conceptually, our code does the equivalent of:

```js
const https = require('https');

const body = JSON.stringify({
  UserName: process.env.MCMASTER_USERNAME,  // e.g. our API username
  Password: process.env.MCMASTER_PASSWORD   // e.g. our API password
});

https.request({
  host: 'api.mcmaster.com',
  path: '/v1/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body, 'utf8')
  },
  pfx: <buffer from .pfx file>,
  passphrase: '<certificate password>',
  rejectUnauthorized: true  // or false if we had to relax for env issues
}, callback).end(body);
```

So in one sentence: we **POST** JSON `{ "UserName", "Password" }` to `https://api.mcmaster.com/v1/login` over a **TLS connection that uses the client certificate (pfx + passphrase)**.

---

## 3. What we see when it fails

- **Response HTTP status:** `401`
- **Response body (from your API):**  
  `{ "ErrorCode": 401, "ErrorMessage": "LOGIN_FAILED", "ErrorDescription": "Login failed." }`

We do not see a TLS handshake failure at this point; the TCP/TLS connection and client cert are accepted, and the 401 is returned as the HTTP response to the login request.

---

## 4. Certificate details (for TLS debugging)

- **Format:** PKCS#12 (.pfx), with private key and certificate.
- **Source:** Provided by McMaster for our account; we load it from file or from a base64-encoded env var (same contents).
- **Usage:** Sent as the TLS client certificate on every request to `api.mcmaster.com` (login, GET price, PUT add product).
- **Password:** We use the passphrase provided with the .pfx; it is only used to decrypt the pfx for the TLS stack, never sent in HTTP.

If McMaster’s team wants to verify behavior, they can compare:
- That the client certificate we present is the one they have on file for our account.
- That the account is enabled for the Product Information API and that the **UserName** / **Password** we send in the JSON body are the correct API credentials for that account.

---

## 5. Summary for McMaster

| Item | How we send it |
|------|----------------|
| **API endpoint** | `POST https://api.mcmaster.com/v1/login` |
| **Credentials** | JSON body only: `{ "UserName": "...", "Password": "..." }` (UTF-8, no extra fields) |
| **Client certificate** | TLS client certificate (pfx + passphrase) on the same connection; not in headers or body |
| **Headers** | `Content-Type: application/json`, `Content-Length` |

If useful, we can also provide the same style of description for the **Price** (GET) and **Add product** (PUT) requests.
