export class RedactionUtil {
  static redactHeaders(
    headers: Record<string, string>,
    redactKeys: string[]
  ): Record<string, string> {
    const result: Record<string, string> = {};
    const lowerKeys = new Set(redactKeys.map((k) => k.toLowerCase()));

    for (const key of Object.keys(headers)) {
      result[key] = lowerKeys.has(key.toLowerCase())
        ? '[REDACTED]'
        : headers[key];
    }
    return result;
  }

  static redactBody(body: unknown, redactKeys: string[]): unknown {
    if (body == null || typeof body !== 'object') {
      return body;
    }

    if (Array.isArray(body)) {
      return body.map((item) => RedactionUtil.redactBody(item, redactKeys));
    }

    const lowerKeys = new Set(redactKeys.map((k) => k.toLowerCase()));
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (lowerKeys.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = RedactionUtil.redactBody(value, redactKeys);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  static truncateBody(
    body: unknown,
    maxBytes: number
  ): { body: unknown; truncated: boolean } {
    const json = JSON.stringify(body);
    if (json == null) {
      return { body, truncated: false };
    }

    const byteLength = new Blob([json]).size;
    if (byteLength <= maxBytes) {
      return { body, truncated: false };
    }

    const truncatedJson = json.substring(0, maxBytes);
    try {
      return { body: JSON.parse(truncatedJson), truncated: true };
    } catch {
      return { body: truncatedJson, truncated: true };
    }
  }
}
