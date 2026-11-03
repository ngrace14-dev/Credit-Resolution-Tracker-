// services/ledgerService.js
import { parseCSVRow, cleanString, cleanCurrency } from './csvService.js';

export const normalizeTreezLedger = (rows, headers, fileName, uploadTime, normalizeSiteFn, standardizeBrandFn) => {
    const parsedData = [];
    for (let i = 0; i < rows.length; i++) {
        const cols = parseCSVRow(rows[i]);
        const rowObj = {};
        headers.forEach((h, idx) => { rowObj[h] = cols[idx] ? cleanString(cols[idx]) : ''; });

        const rawBrand = rowObj['brand'] || rowObj['product brand'] || rowObj['vendor'];
        if (!rawBrand) continue;

        parsedData.push({
            promoDate: rowObj['date closed'] || rowObj['date'] || rowObj['created at'] || '',
            location: normalizeSiteFn(rowObj['store name'] || rowObj['location'] || rowObj['site']),
            brand: standardizeBrandFn(rawBrand),
            creditGenerated: cleanCurrency(rowObj['vendor credit owed'] || rowObj['credit owed'] || rowObj['owed']),
            sourceFile: fileName,
            uploadTimestamp: uploadTime
        });
    }
    return parsedData;
};

export const normalizeSageLedger = (rows, headers, fileName, uploadTime, normalizeSiteFn, standardizeBrandFn) => {
    const parsedData = [];
    for (let i = 0; i < rows.length; i++) {
        const cols = parseCSVRow(rows[i]);
        const rowObj = {};
        headers.forEach((h, idx) => { rowObj[h] = cols[idx] ? cleanString(cols[idx]) : ''; });

        // Account Detection Logic
        const firstColValue = cols[0] ? String(cols[0]).trim() : '';
        const glAccount = rowObj['account'] || rowObj['gl account'] || rowObj['gl'] || firstColValue;
                
        if (glAccount.includes('4545') || glAccount.toLowerCase().includes('promo credit')) {
            const rawBrand = rowObj['mapped brand'] || rowObj['vendor'] || rowObj['brand'] || rowObj['memo/description'] || rowObj['description'] || '';
            if (!rawBrand) continue;

            parsedData.push({
                postingDate: rowObj['posted dt.'] || rowObj['date'] || rowObj['posting date'] || '',
                location: normalizeSiteFn(rowObj['location'] || rowObj['store'] || rowObj['site']),
                brand: standardizeBrandFn(rawBrand),
                amount: cleanCurrency(rowObj['credit'] || rowObj['amount']),
                documentNumber: rowObj['doc'] || rowObj['document number'] || rowObj['ref'] || rowObj['reference'] || '',
                glAccount: glAccount,
                sourceFile: fileName,
                uploadTimestamp: uploadTime
            });
        }
    }
    return parsedData;
};
