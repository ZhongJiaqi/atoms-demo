export function redactProductionDiagnostic(value: unknown) {
  const text = String(value);
  // Header dumps can be quoted, escaped or name/value arrays: omit the entire
  // diagnostic rather than try to parse every serialization of authentication.
  if (/\bcookies?\b|\bauthorization\b|auth-token|base64-/i.test(text)) return "[敏感认证请求详情已省略]";
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:grant|token)=)[^\s&#]+/gi, "$1[REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/sbp_(?:oauth_)?[a-f0-9]{40}/g, "[REDACTED]");
}
