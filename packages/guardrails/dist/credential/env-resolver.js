// EnvCredentialResolver - resolves "env://VAR_NAME" refs from process.env
const ENV_SCHEME = 'env://';
/**
 * Resolves credential refs of the form "env://VAR_NAME".
 *
 * Example:
 *   ref = "env://SLACK_WEBHOOK_URL"
 *   -> reads process.env.SLACK_WEBHOOK_URL
 */
export class EnvCredentialResolver {
    canResolve(ref) {
        return ref.startsWith(ENV_SCHEME);
    }
    async resolve(ref) {
        if (!this.canResolve(ref)) {
            throw new Error(`EnvCredentialResolver cannot handle ref: ${ref}`);
        }
        const varName = ref.slice(ENV_SCHEME.length).trim();
        if (!varName) {
            throw new Error(`EnvCredentialResolver: empty variable name in ref: ${ref}`);
        }
        const value = process.env[varName];
        if (value === undefined) {
            return undefined;
        }
        return { value, ref, source: 'env' };
    }
}
//# sourceMappingURL=env-resolver.js.map
