/**
 * A pattern that identifies a sensitive credential type.
 */
interface RedactPattern {
    name: string;
    /** Regex to detect this credential in a string */
    pattern: RegExp;
    /** Replacement string (defaults to "[REDACTED:<name>]") */
    replacement?: string;
}
/**
 * Result of a redaction scan.
 */
export interface RedactResult {
    /** The redacted string (safe to log/return) */
    redacted: string;
    /** Whether any sensitive data was found and replaced */
    hadSensitiveData: boolean;
    /** Names of the credential types that were detected */
    detectedTypes: string[];
}
export declare class RedactGuardrail {
    private readonly patterns;
    constructor(additionalPatterns?: RedactPattern[]);
    /**
     * Scan `input` for sensitive credential patterns and replace them.
     * Safe to call on any string before logging or returning in API responses.
     */
    redact(input: string): RedactResult;
    /**
     * Returns true if `input` contains any known sensitive pattern.
     */
    containsSensitiveData(input: string): boolean;
    /**
     * Recursively redact all string values in a plain object/array.
     * Useful for sanitising JSON payloads before logging.
     */
    redactObject(obj: unknown): unknown;
}
export {};
//# sourceMappingURL=redact-guardrail.d.ts.map
