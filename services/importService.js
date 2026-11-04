// services/importService.js

const getEmptyCreditForm = (defaultMonth = '') => ({
    trackingMonth: defaultMonth,
    vendor: '',
    distributor: '',
    creditType: '',
    dates: '',
    amount: '',
    dateRequested: '',
    dateReceived: '',
    invoice: '',
    status: 'Pending',
    attachmentName: '',
    attachmentData: null
});

const HEADER_TO_FORM_KEY = {
    'Tracking Month': 'trackingMonth',
    'Vendor': 'vendor',
    'Distributor': 'distributor',
    'Credit Type': 'creditType',
    'Dates': 'dates',
    'Credit amount $$$': 'amount',
    'Date requested': 'dateRequested',
    'Date received': 'dateReceived',
    'Invoice / Credit Memo': 'invoice',
    'Status': 'status'
};

/**
 * Builds credit creation and sale update payloads from unsynced POS sales records.
 * @param {Array} unsyncedSales 
 * @param {Array} masterBrands 
 * @param {Object} [options]
 * @returns {{ creditsToCreate: Array, salesToUpdate: Array }}
 */
export const buildTrackerSyncPayloads = (unsyncedSales, masterBrands, options = {}) => {
    const groupedBrands = {};
    const dateStr = options.dateStr || new Date().toLocaleDateString();
    const timestamp = options.timestamp || Date.now();

    unsyncedSales.forEach(sale => {
        const uniqueKey = `${sale.detectedSite}___${sale.brand}___${sale.month}`;
        if (!groupedBrands[uniqueKey]) {
            groupedBrands[uniqueKey] = {
                site: sale.detectedSite,
                brand: sale.brand,
                month: sale.month,
                totalOwed: 0,
                itemCount: 0,
                salesItems: []
            };
        }
        groupedBrands[uniqueKey].totalOwed += (parseFloat(sale.owed) || 0);
        groupedBrands[uniqueKey].itemCount += 1;
        groupedBrands[uniqueKey].salesItems.push(sale.id);
    });

    const creditsToCreate = [];
    const salesToUpdate = [];

    for (const [, data] of Object.entries(groupedBrands)) {
        if (data.totalOwed > 0) {
            const masterRecord = (masterBrands || []).find(b => (b.vendor || '').toLowerCase() === data.brand.toLowerCase());
            const payload = {
                site: data.site,
                trackingMonth: data.month,
                vendor: data.brand,
                distributor: (masterRecord && masterRecord.distributor) ? masterRecord.distributor : '',
                creditType: `Aggregated POS Sales (${data.itemCount} items)`,
                dates: dateStr,
                amount: data.totalOwed,
                dateRequested: dateStr,
                dateReceived: '',
                invoice: 'WB-V9-SYNC',
                status: 'Pending',
                createdAt: timestamp
            };
            creditsToCreate.push(payload);

            data.salesItems.forEach(saleId => {
                salesToUpdate.push({ id: saleId, status: 'Synced' });
            });
        }
    }

    return {
        creditsToCreate,
        salesToUpdate
    };
};

/**
 * Parses a 2D grid of pasted spreadsheet data into credit and brand creation payloads.
 * @param {Array<Array<string>>} pastedGrid 
 * @param {Array<string>} mappedHeaders 
 * @param {Object} config { activeSite, activeMonth }
 * @param {Array} masterBrands 
 * @param {Object} helpers { detectMonthInString }
 * @returns {{ creditsToCreate: Array, brandsToCreate: Array, importedCount: number, skippedCount: number, errorRecords: Array }}
 */
export const buildGridImportPayloads = (pastedGrid, mappedHeaders, config, masterBrands, helpers) => {
    const { activeSite, activeMonth } = config;
    const { detectMonthInString } = helpers;

    const creditsToCreate = [];
    const brandsToCreate = [];
    let importedCount = 0;
    let skippedCount = 0;
    const errorRecords = [];

    if (!pastedGrid || pastedGrid.length < 3) {
        return { creditsToCreate, brandsToCreate, importedCount: 0, skippedCount: 0, errorRecords: [] };
    }

    const superHeaders = pastedGrid[0];
    const knownBrandVendors = new Set(
        (masterBrands || []).map(b => (b.vendor || '').toLowerCase().trim()).filter(Boolean)
    );

    const validateAndPush = (credit, chunkMonth) => {
        if (!credit.vendor) return;

        // Use detected month from column super-header OR fallback to Tracking Month column
        const finalMonth = chunkMonth !== 'Unknown' ? chunkMonth : (credit.trackingMonth || 'Unknown');

        if (!finalMonth || finalMonth === 'Unknown') {
            skippedCount++;
            errorRecords.push({ ...credit, error: "Missing or Unknown Month" });
            return;
        }

        credit.site = activeSite;
        credit.trackingMonth = finalMonth;
        credit.amount = parseFloat(String(credit.amount).replace(/[^0-9.-]+/g, "")) || 0;
        credit.createdAt = Date.now();
        creditsToCreate.push({ ...credit });
        importedCount++;
    };

    for (let r = 2; r < pastedGrid.length; r++) {
        const row = pastedGrid[r];
        let currentCredit = getEmptyCreditForm(''); 
        let hasData = false;
        let seenHeadersInChunk = new Set();
        let currentChunkMonth = 'Unknown';

        for (let c = 0; c < row.length; c++) {
            const detectedMonth = detectMonthInString ? detectMonthInString(superHeaders[c]) : null;
            if (detectedMonth) currentChunkMonth = detectedMonth;

            const header = mappedHeaders[c];
            if (header === '-- Ignore Column --') continue;

            if (seenHeadersInChunk.has(header)) {
                if (hasData) {
                    validateAndPush(currentCredit, currentChunkMonth);
                }
                currentCredit = getEmptyCreditForm('');
                hasData = false;
                seenHeadersInChunk.clear();
            }

            const val = row[c];
            if (val) hasData = true;

            const key = HEADER_TO_FORM_KEY[header];
            if (key) {
                currentCredit[key] = val;
                seenHeadersInChunk.add(header);
                if (key === 'vendor' && val) {
                    const cleanVal = String(val).trim().toLowerCase();
                    if (cleanVal && !knownBrandVendors.has(cleanVal)) {
                        knownBrandVendors.add(cleanVal);
                        brandsToCreate.push({ vendor: val, distributor: 'Auto-Imported' });
                    }
                }
            }
        }

        if (hasData) {
            validateAndPush(currentCredit, currentChunkMonth);
        }
    }

    return {
        creditsToCreate,
        brandsToCreate,
        importedCount,
        skippedCount,
        errorRecords
    };
};

/**
 * Parses a 2D grid of pasted brand directory data into update and creation payloads.
 * @param {Array<Array<string>>} brandPastedGrid 
 * @param {Array<string>} brandMappedHeaders 
 * @param {Array} masterBrands 
 * @returns {{ brandsToUpdate: Array<{ id: string, data: Object }>, brandsToCreate: Array<Object> }}
 */
export const buildBrandImportPayloads = (brandPastedGrid, brandMappedHeaders, masterBrands) => {
    const brandsToUpdate = [];
    const brandsToCreate = [];

    if (!brandPastedGrid || brandPastedGrid.length === 0) {
        return { brandsToUpdate, brandsToCreate };
    }

    let startRow = 0;
    const firstRowStr = brandPastedGrid[0].join('').toLowerCase();
    if (firstRowStr.includes('brand') && (firstRowStr.includes('email') || firstRowStr.includes('rep') || firstRowStr.includes('distro'))) {
        startRow = 1;
    }

    for (let r = startRow; r < brandPastedGrid.length; r++) {
        const row = brandPastedGrid[r];
        let currentBrand = {};

        for (let c = 0; c < row.length; c++) {
            const header = brandMappedHeaders[c];
            if (header === '-- Ignore Column --') continue;
            currentBrand[header] = row[c] || '';
        }

        const vendorName = currentBrand['Brand'];
        if (!vendorName || vendorName.length <= 1) continue;

        const existingBrand = (masterBrands || []).find(b => (b.vendor || '').toLowerCase() === vendorName.toLowerCase());

        const payload = {};
        if (currentBrand['Rep'] !== undefined) payload.rep = currentBrand['Rep'];
        if (currentBrand['Email'] !== undefined) payload.email = currentBrand['Email'];
        if (currentBrand['Name as appears in TREES'] !== undefined) payload.treesName = currentBrand['Name as appears in TREES'];
        if (currentBrand['Distro'] !== undefined) payload.distributor = currentBrand['Distro'];
        if (currentBrand['Asset Library'] !== undefined) payload.assetLibrary = currentBrand['Asset Library'];
        if (currentBrand['Order From'] !== undefined) payload.orderFrom = currentBrand['Order From'];
        if (currentBrand['Payee'] !== undefined) payload.payee = currentBrand['Payee'];
        if (currentBrand['Notes'] !== undefined) payload.notes = currentBrand['Notes'];

        if (existingBrand) {
            if (Object.keys(payload).length > 0) {
                brandsToUpdate.push({ id: existingBrand.id, data: payload });
            }
        } else {
            payload.vendor = vendorName;
            brandsToCreate.push(payload);
        }
    }

    return {
        brandsToUpdate,
        brandsToCreate
    };
};
