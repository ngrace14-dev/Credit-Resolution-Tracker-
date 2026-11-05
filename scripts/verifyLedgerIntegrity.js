// scripts/verifyLedgerIntegrity.js

/**
 * Production Health Check: Verifies the integrity of the ledger_events collection.
 */
export const runLedgerIntegrityAudit = (ledgerEvents) => {
    const stats = {
        totalRecords: ledgerEvents.length,
        anomalies: [],
        precisionErrors: 0,
        missingUploadId: 0,
        missingSource: 0,
        siteMismatches: 0,
        invalidAmounts: 0
    };

    const validSites = ['Redding', 'Red Bluff', 'Red-Bluff'];
    const validMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    ledgerEvents.forEach(event => {
        // 1. Data Presence
        if (!event.upload_id) stats.missingUploadId++;
        if (!event.source) stats.missingSource++;

        // 2. Format Validation
        if (!validSites.includes(event.site)) {
            stats.siteMismatches++;
            stats.anomalies.push(`Invalid Site: ${event.site} on doc ${event.id}`);
        }
        
        if (!validMonths.includes(event.isolation_month)) {
            stats.anomalies.push(`Invalid Month: ${event.isolation_month} on doc ${event.id}`);
        }

        // 3. Numeric Integrity
        if (typeof event.amount !== 'number' || isNaN(event.amount)) {
            stats.invalidAmounts++;
        }

        // 4. Floating Point check (simple epsilon)
        if (event.amount % 0.0001 > 0.0000001) {
            stats.precisionErrors++;
        }
    });

    return stats;
};
