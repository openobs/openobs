/**
 * RFC 4515 §3 filter value escaping.
 *
 * Any character with special meaning inside an LDAP search filter MUST be
 * replaced by its `\XX` two-hex-digit encoding before being concatenated into
 * a filter string. Failing to do so lets a user-supplied login like
 * `admin)(|(uid=*` break out of the expected filter and match arbitrary
 * entries — a classic filter-injection vector.
 *
 * The characters we must escape (RFC 4515 §3 + §4):
 *   `\`  → `\5c`   (MUST be processed first so later replacements don't
 *                   double-escape the backslash we just introduced)
 *   `*`  → `\2a`
 *   `(`  → `\28`
 *   `)`  → `\29`
 *   NUL  → `\00`
 *
 * Other bytes outside the assertion-value grammar (e.g. 0x80+) are allowed as
 * UTF-8 in modern LDAP; we don't hex-encode them. This matches what Grafana's
 * `ldap.EscapeFilter` does.
 */
export function escapeLdapFilterValue(input: string): string {
  // Order matters: escape backslash BEFORE the characters whose encodings
  // contain a backslash, otherwise a literal `\` input would be double-escaped
  // into `\5c5c` via a second pass over the inserted `\` from `\2a` etc.
  return input
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00');
}
