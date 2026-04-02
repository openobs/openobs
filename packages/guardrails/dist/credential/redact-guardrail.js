// RedactGuardrail - detects and redacts sensitive credentials in output strings
// - Built-in patterns
const BUILT_IN_PATTERNS = [
    {
        name: 'BearerToken',
        // "Bearer <token>" - token is typically base64url or hex, 20+ chars
        pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*(?:\.[A-Za-z0-9\-._~+/]+=*)?/g,
    },
    {
        name: 'ApiKey',
        // Generic "api[_-]?key: <value>" or "apikey: <value>" header patterns
        pattern: /(?:api[_-]?key|x-api-key)\s*[:=]\s*["']?[A-Za-z0-9\-_~+/]{16,}["']?/gi,
    },
    {
        name: 'AwsAccessKey',
        // AWS Access Key IDs start with AKIA or ASIA
        pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
    },
    {
        name: 'AwsSecretKey',
        // AWS Secret Access Keys: 40-char base64
        pattern: /(?:aws_secret_access_key|aws_secret)\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}["']?/gi,
    },
    {
        name: 'SlackWebhookUrl',
        pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9/]+/gi,
    },
    {
        name: 'TeamsWebhookUrl',
        pattern: /https:\/\/[a-z0-9-]+\.webhook\.office\.com\/[^"'\s]+/gi,
    },
    {
        name: 'PagerDutyRoutingKey',
        // PagerDuty routing key: 32 hex chars
        pattern: /(?:routing[_-]?key|integration[_-]?key)\s*[:=]\s*["']?[a-f0-9]{32}["']?/gi,
    },
    {
        name: 'GenericSecret',
        // "password", "secret", "token" followed by a non-trivial value
        pattern: /(?:password|secret|token)\b.{0,12}["']?[A-Za-z0-9\-._~+/=]{12,}["']?/gi,
    },
];
export class RedactGuardrail {
    patterns;
    constructor(additionalPatterns = []) {
        this.patterns = [...BUILT_IN_PATTERNS, ...additionalPatterns];
    }
    /**
     * Scan `input` for sensitive credential patterns and replace them.
     * Safe to call on any string before logging or returning in API responses.
     */
    redact(input) {
        let redacted = input;
        const detectedTypes = [];
        for (const { name, pattern, replacement } of this.patterns) {
            // Reset lastIndex for global regexes
            pattern.lastIndex = 0;
            if (pattern.test(input)) {
                detectedTypes.push(name);
            }
            // Apply replacement
            pattern.lastIndex = 0;
            const sub = replacement ?? `[REDACTED:${name}]`;
            redacted = redacted.replace(pattern, sub);
        }
        return {
            redacted,
            hadSensitiveData: detectedTypes.length > 0,
            detectedTypes,
        };
    }
    /**
     * Returns true if `input` contains any known sensitive pattern.
     */
    containsSensitiveData(input) {
        return this.patterns.some((p) => {
            p.pattern.lastIndex = 0;
            return p.pattern.test(input);
        });
    }
    /**
     * Recursively redact all string values in a plain object/array.
     * Useful for sanitising JSON payloads before logging.
     */
    redactObject(obj) {
        if (typeof obj === 'string') {
            return this.redact(obj).redacted;
        }
        if (Array.isArray(obj)) {
            return obj.map((item) => this.redactObject(item));
        }
        if (obj !== null && typeof obj === 'object') {
            const result = {};
            for (const [key, val] of Object.entries(obj)) {
                result[key] = this.redactObject(val);
            }
            return result;
        }
        return obj;
    }
}
//# sourceMappingURL=redact-guardrail.js.map
