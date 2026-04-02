import type { AuditEntry, AuditQuery } from './types.js';
export declare class AuditLogger {
    private entries;
    log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry;
    query(q: AuditQuery): AuditEntry[];
    /** All entries for an investigation, sorted chronologically */
    getByInvestigation(investigationId: string): AuditEntry[];
    /** Most recent entries for a user */
    getByUser(userId: string, limit?: number): AuditEntry[];
    /** Export matching entries as a JSON string */
    export(q: AuditQuery): string;
    count(): number;
    clear(): void;
    private matches;
}
//# sourceMappingURL=logger.d.ts.map
