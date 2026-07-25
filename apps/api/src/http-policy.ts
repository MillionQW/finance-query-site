interface HeaderWriter {
  setHeader(name: string, value: string): unknown;
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'"
].join('; ');

export function applyHttpPolicy(path: string, response: HeaderWriter): void {
  response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');

  if (path === '/api' || path.startsWith('/api/')) {
    response.setHeader('Cache-Control', 'no-store');
  }
}

export function applyStaticCachePolicy(filePath: string, response: HeaderWriter): void {
  if (/[\\/]assets[\\/]/.test(filePath)) {
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }

  if (filePath.endsWith('.html')) {
    response.setHeader('Cache-Control', 'no-cache');
  }
}
