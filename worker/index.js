/**
 * Cloudflare Worker that serves the Eleventy-built portal (the `_site/`
 * directory, exposed through the `ASSETS` static-assets binding) and adds a
 * few hardening headers suitable for an internal tool.
 *
 * Before serving anything it verifies the Cloudflare Access JWT, so the portal
 * can only be reached by a request that Access has authenticated (see
 * `verifyAccessJwt` in ./access.js for the details and rationale).
 *
 * Enforcement is gated on configuration: when both `ACCESS_TEAM_DOMAIN` and
 * `ACCESS_AUD` are set (see wrangler.toml `[vars]`) the JWT is required and
 * verified; when they are absent — e.g. `wrangler dev` with no Access in
 * front — verification is skipped with a warning so local development still
 * works. Configure both vars for any deployment that sits behind Access.
 */
import { AccessError, extractToken, verifyAccessJwt } from "./access.js";

function securityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function denied(message, status) {
  return securityHeaders(
    new Response(`${status} — ${message}\n`, {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  );
}

export default {
  async fetch(request, env) {
    const teamDomain = env.ACCESS_TEAM_DOMAIN;
    const aud = env.ACCESS_AUD;

    if (teamDomain && aud) {
      const token = extractToken(request);
      if (!token) {
        return denied("Missing Cloudflare Access token", 403);
      }
      try {
        await verifyAccessJwt(token, { teamDomain, aud });
      } catch (err) {
        if (err instanceof AccessError) {
          return denied(err.message, err.status);
        }
        // Unexpected failure — fail closed rather than serve unverified.
        console.error("Access verification error:", err);
        return denied("Access verification failed", 500);
      }
    } else {
      console.warn(
        "Cloudflare Access verification is DISABLED: set ACCESS_TEAM_DOMAIN " +
          "and ACCESS_AUD to enforce it."
      );
    }

    const response = await env.ASSETS.fetch(request);
    return securityHeaders(response);
  },
};
