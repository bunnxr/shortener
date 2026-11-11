// Optional: verifies the Cf-Access-Jwt-Assertion header. Skipped when the vars are empty.
let keys, keysAt = 0;
const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const dec = (s) => JSON.parse(new TextDecoder().decode(b64(s)));

export async function verifyAccess(request, env) {
  const team = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD;
  if (!team || !aud) return true; // rely on Access at the edge only
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwt) return false;
  try {
    const [h, p, s] = jwt.split(".");
    const head = dec(h), claims = dec(p);
    if (!keys || Date.now() - keysAt > 3600e3) {
      keys = (await (await fetch(`https://${team}/cdn-cgi/access/certs`)).json()).keys;
      keysAt = Date.now();
    }
    const jwk = keys.find((k) => k.kid === head.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64(s), new TextEncoder().encode(h + "." + p));
    return ok && [].concat(claims.aud).includes(aud) && claims.exp > Date.now() / 1000 && claims.iss === `https://${team}`;
  } catch {
    return false;
  }
}
