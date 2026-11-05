// services/uploadService.js
import { parseCSVText, parseCSVRow, normalizeHeader, cleanCurrency } from './csvService.js';
import { validateMonthContainment } from './ledgerEventService.js';

/**
 * Orchestrates the parsing and validation of Treez Ledger CSVs.
 */
export const processTreezUpload = (fileContent, config, helpers) => {
    const { targetMonth, calendarMonths, masterBrands } = config;
    const { normalizeTreezLedger, normalizeSiteName, getStandardizedBrandName } = helpers;

    const lines = parseCSVText(fileContent);
    if (lines.length === 0) throw new Error("File is empty.");

    const headers = parseCSVRow(lines[0]).map(normalizeHeader);
    const rows = lines.slice(1);
    
    const rawParsed = normalizeTreezLedger(
        rows, headers, 'upload_file', new Date().toLocaleString(), normalizeSiteName, getStandardizedBrandName, masterBrands
    );

    const validEvents = [];
    const quarantined = [];

    rawParsed.forEach(item => {
        const containment = validateMonthContainment(item.promoDate, targetMonth, calendarMonths);
        if (containment.valid && item.isRecoverable) {
            validEvents.push({
                ...item,
                isolation_month: targetMonth,
                type: 'GENERATED',
                amount: item.creditGenerated
            });
        } else {
            quarantined.push({ ...item, reason: containment.reason || 'NOT_RECOVERABLE' });
        }
    });

    return { validEvents, quarantined };
};

/**
 * Orchestrates the parsing and validation of Sage GL CSVs.
 */
export const processSageUpload = (fileContent, config, helpers) => {
    const { targetMonth, calendarMonths } = config;
    const { normalizeSageLedger, normalizeSiteName, getStandardizedBrandName } = helpers;

    const lines = parseCSVText(fileContent);
    const headers = parseCSVRow(lines[0]).map(normalizeHeader);
    const rows = lines.slice(1);

    const rawParsed = normalizeSageLedger(
        rows, headers, 'upload_file', new Date().toLocaleString(), normalizeSiteName, getStandardizedBrandName
    );

    const validEvents = [];
    const quarantined = [];

    rawParsed.forEach(item => {
        const containment = validateMonthContainment(item.postingDate, targetMonth, calendarMonths);
        if (containment.valid) {
            validEvents.push({
                ...item,
                isolation_month: targetMonth,
                type: 'RECOVERY'
            });
        } else {
            quarantined.push({ ...item, reason: containment.reason });
        }
    });

    return { validEvents, quarantined };
};
