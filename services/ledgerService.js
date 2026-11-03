// services/ledgerService.js
import { parseCSVRow, cleanString, cleanCurrency } from './csvService.js';

export const normalizeTreezLedger = (rows, headers, fileName, uploadTime, normalizeSiteFn, standardizeBrandFn, masterBrands = []) => {
    const parsedData = [];
    const HOLIDAY_PROGRAMS = ['fundial friday', 'vendor day', 'pop up', 'holiday blast'];
    const EXCLUDED_KEYWORDS = ['employee', 'industry', 'senior', 'military', 'veteran', 'wisdom', 'staff', 'internal', 'test'];

    for (let i = 0; i < rows.length; i++) {
        const cols = parseCSVRow(rows[i]);
        const rowObj = {};
        headers.forEach((h, idx) => { rowObj[h] = cols[idx] ? cleanString(cols[idx]) : ''; });

        const rawBrand = rowObj['brand'] || rowObj['product brand'] || rowObj['vendor'];
        const promoName = String(rowObj['promotion name'] || rowObj['discount title'] || rowObj['discount'] || '').toLowerCase();
        if (!rawBrand) continue;

        const standardizedBrand = standardizeBrandFn(rawBrand);
        let promoType = 'UNKNOWN';
        let isRecoverable = false;

        // Classification Engine
        const hasBrandMatch = masterBrands.some(b => 
            promoName.includes(String(b.vendor || '').toLowerCase()) || 
            promoName.includes(standardizedBrand.toLowerCase())
        );

        const isExcluded = EXCLUDED_KEYWORDS.some(key => promoName.includes(key));
        const isHoliday = HOLIDAY_PROGRAMS.some(prog => promoName.includes(promoName));

        if (isExcluded) {
            if (promoName.includes('employee')) promoType = 'EMPLOYEE';
            else if (promoName.includes('industry')) promoType = 'INDUSTRY';
            else if (promoName.includes('senior')) promoType = 'SENIOR';
            else promoType = 'IN_HOUSE';
        } else if (hasBrandMatch) {
            promoType = 'VENDOR_PROMO';
            isRecoverable = true;
        } else if (isHoliday) {
            promoType = 'HOLIDAY_PROMO';
            isRecoverable = true;
        }

        parsedData.push({
            promoDate: rowObj['date closed'] || rowObj['date'] || rowObj['created at'] || '',
            location: normalizeSiteFn(rowObj['store name'] || rowObj['location'] || rowObj['site']),
            brand: standardizedBrand,
            promoName: rowObj['promotion name'] || rowObj['discount title'] || 'Unnamed Promo',
            creditGenerated: isRecoverable ? cleanCurrency(rowObj['vendor credit owed'] || rowObj['credit owed'] || rowObj['owed']) : 0,
            promoType,
            isRecoverable,
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
