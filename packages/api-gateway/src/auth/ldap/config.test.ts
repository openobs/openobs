import { describe, it, expect } from 'vitest';
import { ldapEnabled, ldapConfigPath, loadLdapConfig } from './config.js';

describe('ldapEnabled', () => {
  it('defaults to false', () => {
    expect(ldapEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
  it('true when env var matches', () => {
    expect(
      ldapEnabled({ OPENOBS_AUTH_LDAP_ENABLED: 'true' } as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});

describe('ldapConfigPath', () => {
  it('default path', () => {
    expect(ldapConfigPath({} as NodeJS.ProcessEnv)).toBe('config/ldap.toml');
  });
  it('honours OPENOBS_LDAP_CONFIG_PATH', () => {
    expect(
      ldapConfigPath({
        OPENOBS_LDAP_CONFIG_PATH: '/etc/openobs/ldap.toml',
      } as NodeJS.ProcessEnv),
    ).toBe('/etc/openobs/ldap.toml');
  });
});

describe('loadLdapConfig', () => {
  it('returns null for non-existent file', async () => {
    const cfg = await loadLdapConfig('/definitely/does/not/exist.toml');
    expect(cfg).toBeNull();
  });
});
