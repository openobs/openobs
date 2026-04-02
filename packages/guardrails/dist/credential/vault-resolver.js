// VaultCredentialResolver - stub for HashiCorp Vault / AWS Secrets Manager / etc.
const VAULT_SCHEME = 'vault://';
/**
 * Stub resolver for "vault://path/to/secret" refs.
 *
 * In production, replace `fetchSecret()` with a real Vault/SecretsManager client.
 * The stub supports pre-seeded secrets for testing via `seed()`.
 */
export class VaultCredentialResolver {
    secrets = new Map();
    canResolve(ref) {
        return ref.startsWith(VAULT_SCHEME);
    }
    async resolve(ref) {
        if (!this.canResolve(ref)) {
            throw new Error(`VaultCredentialResolver cannot handle ref: ${ref}`);
        }
        const path = ref.slice(VAULT_SCHEME.length).trim();
        if (!path) {
            throw new Error(`VaultCredentialResolver: empty path in ref: ${ref}`);
        }
        const value = await this.fetchSecret(path);
        if (value === undefined) {
            return undefined;
        }
        return { value, ref, source: 'vault' };
    }
    /**
     * Seed a secret for testing purposes.
     * In production this method would not be called; secrets come from the real vault.
     */
    seed(path, value) {
        this.secrets.set(path, value);
    }
    /**
     * Fetch a secret from the vault backend.
     * Currently a stub - override this method or replace the implementation for production use.
     */
    async fetchSecret(path) {
        return this.secrets.get(path);
    }
}
//# sourceMappingURL=vault-resolver.js.map
