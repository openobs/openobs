import type { CredentialResolver, ResolvedCredential } from './types.js';
/**
 * Resolves credential refs of the form "env://VAR_NAME".
 *
 * Example:
 *   ref = "env://SLACK_WEBHOOK_URL"
 *   -> reads process.env.SLACK_WEBHOOK_URL
 */
export declare class EnvCredentialResolver implements CredentialResolver {
    canResolve(ref: string): boolean;
    resolve(ref: string): Promise<ResolvedCredential | undefined>;
}
//# sourceMappingURL=env-resolver.d.ts.map
