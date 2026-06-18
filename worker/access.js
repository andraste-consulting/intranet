/**
 * Verification of the JSON Web Token that Cloudflare Access injects into every
 * request it lets through.
 *
 * Cloudflare Access authenticates the user at the edge and forwards the signed
 * identity as a JWT, available both as the `Cf-Access-Jwt-Assertion` request
 * header and the `CF_Authorization` cookie. Verifying that token in the Worker
 * is defence-in-depth: it ensures the Worker can only ever be reached through
 * Access (and not, say, via a misconfigured route or a direct
 * `*.workers.dev` URL that bypasses the Access policy), and proves the request
 * carries a genuine, unexpired identity signed by *our* Access organisation.
 *
 * The verification follows Cloudflare's published guidance:
 *   https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 *
 *   1. Reject anything but RS256 (prevents `alg:none` / algorithm-confusion).
 *   2. Verify the signature against the org's public keys, published as a JWKS
 *      at `https://<team-domain>/cdn-cgi/access/certs`, matched by `kid`.
 *   3. Validate the registered claims: `iss` (our team domain), `aud` (this
 *      application's Audience tag) and the `exp` / `nbf` / `iat` time window.
 *
 * Implemented with the WebCrypto API that the Workers runtime exposes, so it
 * pulls in no third-party dependencies.
 */

// Small tolerance (seconds) for clock skew between the signer and the runtime.
const CLOCK_SKEW_SECONDS = 60;

// How long a fetched JWKS is trusted before being refreshed. Access rotates
// signing keys roughly every six weeks and publishes the next key ahead of
// time, so an hour-long cache is comfortably safe while keeping the cert
// endpoint from being hit on every request.
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

// Module-scoped JWKS cache, keyed by certs URL. Lives for the life of the
// isolate and is shared across the requests it serves.
const jwksCache = new Map();

/** Error type that carries an HTTP status, so callers can shape the response. */
export class AccessError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = "AccessError";
    this.status = status;
  }
}

/** Decode a base64url string to its raw bytes. */
function base64UrlToBytes(value) {
  // Restore standard base64 alphabet and padding, then decode.
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Decode a base64url-encoded JSON segment into an object. */
function decodeJsonSegment(segment) {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
  } catch {
    throw new AccessError("Malformed Access token segment", 403);
  }
}

/**
 * Extract the Access JWT from the request: the `Cf-Access-Jwt-Assertion`
 * header is the canonical source, with the `CF_Authorization` cookie as a
 * fallback (the cookie is what browsers send on navigations).
 */
export function extractToken(request) {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header.trim();

  const cookie = request.headers.get("Cookie");
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === "CF_Authorization" && rest.length) {
        return rest.join("=").trim();
      }
    }
  }
  return null;
}

/**
 * Fetch (and cache) the org's signing keys, returning the JWK whose `kid`
 * matches the token header. A miss triggers one forced refresh so freshly
 * rotated keys are picked up immediately rather than after the cache expires.
 */
async function getSigningKey(certsUrl, kid) {
  let entry = jwksCache.get(certsUrl);
  const isFresh = entry && Date.now() - entry.fetchedAt < JWKS_CACHE_TTL_MS;

  if (!isFresh) {
    entry = await fetchJwks(certsUrl);
  }

  let key = entry.keys.find((k) => k.kid === kid);
  if (!key && isFresh) {
    // Unknown key id on a cached JWKS — the signer may have rotated. Force a
    // refresh and look once more before giving up.
    entry = await fetchJwks(certsUrl);
    key = entry.keys.find((k) => k.kid === kid);
  }
  return key || null;
}

async function fetchJwks(certsUrl) {
  let response;
  try {
    response = await fetch(certsUrl, { cf: { cacheTtl: 3600 } });
  } catch (cause) {
    throw new AccessError("Unable to reach Access signing keys", 503);
  }
  if (!response.ok) {
    throw new AccessError(`Access signing keys unavailable (${response.status})`, 503);
  }
  const jwks = await response.json();
  const entry = { keys: Array.isArray(jwks.keys) ? jwks.keys : [], fetchedAt: Date.now() };
  jwksCache.set(certsUrl, entry);
  return entry;
}

/**
 * Verify a Cloudflare Access JWT.
 *
 * @param {string} token       the raw JWT
 * @param {object} opts
 * @param {string} opts.teamDomain  e.g. `your-team.cloudflareaccess.com`
 * @param {string} opts.aud         the application's Access Audience (AUD) tag
 * @returns {Promise<object>}  the verified claim set (payload)
 * @throws {AccessError}       on any verification failure
 */
export async function verifyAccessJwt(token, { teamDomain, aud }) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AccessError("Access token is not a well-formed JWT", 403);
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts;

  const header = decodeJsonSegment(headerSegment);
  // Pin the algorithm: only RS256 is accepted. This rejects `alg: none` and
  // any attempt to downgrade to a symmetric algorithm (algorithm confusion).
  if (header.alg !== "RS256") {
    throw new AccessError(`Unsupported token algorithm: ${header.alg}`, 403);
  }
  if (!header.kid) {
    throw new AccessError("Access token is missing a key id", 403);
  }

  const issuer = `https://${teamDomain}`;
  const certsUrl = `${issuer}/cdn-cgi/access/certs`;

  const jwk = await getSigningKey(certsUrl, header.kid);
  if (!jwk) {
    throw new AccessError("No matching Access signing key for token", 403);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signature = base64UrlToBytes(signatureSegment);
  const signedData = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);
  const signatureValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signature,
    signedData
  );
  if (!signatureValid) {
    throw new AccessError("Access token signature is invalid", 403);
  }

  // Signature is good — now the claims must match what we expect.
  const payload = decodeJsonSegment(payloadSegment);
  const now = Math.floor(Date.now() / 1000);

  if (payload.iss !== issuer) {
    throw new AccessError("Access token issuer mismatch", 403);
  }

  // `aud` may be a string or an array; the configured tag must be present.
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(aud)) {
    throw new AccessError("Access token audience mismatch", 403);
  }

  if (typeof payload.exp !== "number" || now > payload.exp + CLOCK_SKEW_SECONDS) {
    throw new AccessError("Access token has expired", 403);
  }
  if (typeof payload.nbf === "number" && now < payload.nbf - CLOCK_SKEW_SECONDS) {
    throw new AccessError("Access token is not yet valid", 403);
  }
  if (typeof payload.iat === "number" && now < payload.iat - CLOCK_SKEW_SECONDS) {
    throw new AccessError("Access token was issued in the future", 403);
  }

  return payload;
}
