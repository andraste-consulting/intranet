/**
 * Cloudflare Worker that serves the Eleventy-built portal (the `_site/`
 * directory, exposed through the `ASSETS` static-assets binding) and adds a
 * few hardening headers suitable for an internal tool.
 */
export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);

    // Clone so we can attach security headers to the static response.
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=()"
    );

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
