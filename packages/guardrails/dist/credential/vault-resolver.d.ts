import type { CredentialResolver, ResolvedCredential } from './types.js';
/**
 * Stub resolver for "vault://path/to/secret" refs.
 *
 * In production, replace `fetchSecret()` with a real Vault/SecretsManager client.
 * The stub supports pre-seeded secrets for testing via `seed()`.
 */
export declare class VaultCredentialResolver implements CredentialResolver {
    private readonly secrets;
    canResolve(ref: string): boolean;
    resolve(ref: string): Promise<ResolvedCredential | undefined>;
    /**
     * Seed a secret for testing purposes.
     * In production this method would not be called; secrets come from the real vault.
     */
    seed(path: string, value: string): void;
    /**
     * Fetch a secret from the vault backend.
     * Currently a stub - override this method or replace the implementation for production use.
     */
    protected fetchSecret(path: string): Promise<string | undefined>;
}
//# sourceMappingURL=vault-resolver.d.ts.map
