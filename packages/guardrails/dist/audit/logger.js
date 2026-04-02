// AuditLogger - in-memory audit log with query and export API
let _counter = 0;
function newId() {
    return `audit_${Date.now().toString(36)}_${(++_counter).toString(36)}`;
}
export class AuditLogger {
    entries = [];
    // -- Write --
    log(entry) {
        const record = {
            id: newId(),
            timestamp: new Date().toISOString(),
            ...entry,
        };
        this.entries.push(record);
        return record;
    }
    // -- Read --
    query(q) {
        let results = this.entries.filter((e) => this.matches(e, q));
        if (q.limit !== undefined && q.limit > 0) {
            results = results.slice(0, q.limit);
        }
        return results;
    }
    /** All entries for an investigation, sorted chronologically */
    getByInvestigation(investigationId) {
        return this.entries
            .filter((e) => e.investigationId === investigationId)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }
    /** Most recent entries for a user */
    getByUser(userId, limit = 50) {
        const matching = this.entries.filter((e) => e.userId === userId);
        // Return most recent first
        return matching.slice(-limit).reverse();
    }
    /** Export matching entries as a JSON string */
    export(q) {
        return JSON.stringify(this.query(q), null, 2);
    }
    count() {
        return this.entries.length;
    }
    clear() {
        this.entries = [];
    }
    // -- Internal --
    matches(entry, q) {
        if (q.investigationId && entry.investigationId !== q.investigationId)
            return false;
        if (q.userId && entry.userId !== q.userId)
            return false;
        if (q.action && entry.action !== q.action)
            return false;
        if (q.timeRange) {
            if (entry.timestamp < q.timeRange.start)
                return false;
            if (entry.timestamp > q.timeRange.end)
                return false;
        }
        return true;
    }
}
//# sourceMappingURL=logger.js.map
