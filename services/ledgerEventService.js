// services/ledgerEventService.js
import { 
    doc, 
    setDoc, 
    getDocs, 
    query, 
    where, 
    collection, 
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/**
 * Generates a deterministic hash for idempotency.
 * Simple string hash for demonstration; in production, use crypto.subtle.digest('SHA-256', ...)
 */
const generateEventHash = (input) => {
    let hash = 0;
    const str = JSON.stringify(input);
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
};

/**
 * Creates or updates a canonical ledger event with a deterministic ID.
 */
export const createLedgerEvent = async (db, eventData) => {
    const { brand, site, isolation_month, type, amount, source, invoice_ref, upload_id } = eventData;
    
    // Validate inputs
    const cleanAmount = parseFloat(amount) || 0;
    const standardizedBrand = String(brand || 'UNKNOWN').trim().toUpperCase();
    const standardizedSite = String(site || 'UNKNOWN').trim();
    const standardizedMonth = String(isolation_month || 'UNKNOWN').trim();
    
    // Generate deterministic hash of core payload
    const payloadForHash = { brand: standardizedBrand, site: standardizedSite, month: standardizedMonth, type, amount: cleanAmount, invoice_ref, source };
    const hash = generateEventHash(payloadForHash);
    
    const docId = `${standardizedBrand}_${standardizedSite.replace(/\s/g, '-')}_${standardizedMonth}_${type}_${hash}`;
    const docRef = doc(db, "ledger_events", docId);
    
    const eventRecord = {
        id: docId,
        brand: standardizedBrand,
        site: standardizedSite,
        type: type, // GENERATED | RECOVERY | ADJUSTMENT
        amount: cleanAmount,
        isolation_month: standardizedMonth,
        fiscal_year: 2026,
        source: source, // WORKBOOK_MIGRATION | TREEZ | SAGE | MANUAL
        status: eventData.status || (type === 'RECOVERY' ? 'Applied' : 'Outstanding'),
        invoice_ref: invoice_ref || '',
        upload_id: upload_id || 'MANUAL',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
    };

    await setDoc(docRef, eventRecord, { merge: true });
    return docId;
};

/**
 * Fetches all events for a specific site and month.
 */
export const queryEventsByMonth = async (db, site, month) => {
    const q = query(
        collection(db, "ledger_events"),
        where("site", "==", site),
        where("isolation_month", "==", month)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
};

/**
 * Fetches all events for a specific brand and site across all months.
 */
export const queryEventsByBrand = async (db, brand, site) => {
    const q = query(
        collection(db, "ledger_events"),
        where("brand", "==", String(brand).trim().toUpperCase()),
        where("site", "==", site)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
};

/**
 * Migration Service: Extracts and seeds workbook_v9_sheets and promoCredits into ledger_events.
 */
export const runCanonicalMigration = async (db, masterWorkbookData, promoCreditsList, helpers) => {
    const { getStandardizedBrandName, detectSiteFromName, detectMonthFromDate, normalizeSiteName } = helpers;
    const batchOps = [];
    const stats = { generated: 0, recovery: 0, manual: 0, total: 0, errors: 0 };
    const calendarMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const addToBatch = async (eventData) => {
        const { brand, site, isolation_month, type, amount, source, invoice_ref, status } = eventData;
        const cleanAmount = parseFloat(amount) || 0;
        if (cleanAmount === 0 && type !== 'ADJUSTMENT') return;

        const stdBrand = String(brand || 'UNKNOWN').trim().toUpperCase();
        const stdSite = String(site || 'UNKNOWN').trim();
        const stdMonth = String(isolation_month || 'UNKNOWN').trim();
        
        const payloadForHash = { brand: stdBrand, site: stdSite, month: stdMonth, type, amount: cleanAmount, invoice_ref, source };
        
        // Simple hash function (internal to migration for performance)
        const hash = Math.abs(JSON.stringify(payloadForHash).split("").reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)).toString(16);
        
        const docId = `${stdBrand}_${stdSite.replace(/\s/g, '-')}_${stdMonth}_${type}_${hash}`;
        const docRef = doc(db, "ledger_events", docId);
        
        batchOps.push({
            ref: docRef,
            data: {
                id: docId,
                brand: stdBrand,
                site: stdSite,
                type: type,
                amount: cleanAmount,
                isolation_month: stdMonth,
                fiscal_year: 2026,
                source: source,
                status: status || (type === 'RECOVERY' ? 'Applied' : 'Outstanding'),
                invoice_ref: invoice_ref || 'MIGRATION',
                upload_id: 'MIGRATION_V1',
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            }
        });
        stats.total++;
        if (type === 'GENERATED') stats.generated++;
        else if (type === 'RECOVERY') stats.recovery++;
    };

    // 1. WORKBOOK MONTHLY SHEETS (GENERATED)
    for (const [sheetName, rows] of Object.entries(masterWorkbookData)) {
        if (!sheetName.includes('2026')) continue;
        const monthName = sheetName.split(' ')[0];

        rows.forEach((row, idx) => {
            const rawBrand = row["Brand"] || row[0];
            if (!rawBrand || String(rawBrand).toLowerCase().includes('total')) return;

            ["Redding", "Red-Bluff"].forEach(siteKey => {
                const siteName = siteKey === "Red-Bluff" ? "Red Bluff" : "Redding";
                let rawAmt = 0;
                const rowKeys = Object.keys(row);
                const exactKey = rowKeys.find(k => k.trim().toLowerCase() === siteName.toLowerCase() || k.trim().toLowerCase() === siteKey.toLowerCase());
                
                if (exactKey) {
                    const val = String(row[exactKey]).trim().toLowerCase();
                    if (val === 'x') {
                        const pk = rowKeys.find(k => k.toLowerCase().includes('promo credits'));
                        rawAmt = row[promoKey] || 0;
                    } else {
                        rawAmt = row[exactKey];
                    }
                }
                
                const amt = parseFloat(String(rawAmt || 0).replace(/[^0-9.-]+/g,"")) || 0;
                if (amt > 0) {
                    addToBatch({
                        brand: getStandardizedBrandName(rawBrand),
                        site: siteName,
                        isolation_month: monthName,
                        type: 'GENERATED',
                        amount: amt,
                        source: 'WORKBOOK_MIGRATION',
                        invoice_ref: `WB_ROW_${idx}`
                    });
                }
            });
        });
    }

    // 2. GL RAW BY STORE (RECOVERY)
    const glRows = masterWorkbookData["GL Raw by Store"] || [];
    glRows.forEach((row, idx) => {
        const brand = row["Mapped Brand"] || 'UNMAPPED';
        const site = detectSiteFromName(row["Store"] || row["Location"]);
        const amount = parseFloat(String(row["Credit"] || 0).replace(/[^0-9.-]+/g,"")) || 0;
        const date = row["Posted dt."] || '';
        const month = detectMonthFromDate(date);

        if (amount > 0) {
            addToBatch({
                brand: getStandardizedBrandName(brand),
                site: site,
                isolation_month: month,
                type: 'RECOVERY',
                amount: amount,
                source: 'WORKBOOK_MIGRATION',
                status: 'Applied',
                invoice_ref: `GL_ROW_${idx}`
            });
        }
    });

    // 3. PROMOCREDITS COLLECTION (MANUAL/TREEZ)
    promoCreditsList.forEach(c => {
        if (c.invoice === 'WB-V9-SYNC') return; // Skip already migrated workbook items
        
        addToBatch({
            brand: getStandardizedBrandName(c.vendor),
            site: c.site,
            isolation_month: c.trackingMonth,
            type: 'GENERATED',
            amount: c.amount,
            source: c.distributor === 'Workbook Sync' ? 'WORKBOOK_MIGRATION' : 'MANUAL',
            status: c.status,
            invoice_ref: c.invoice || 'MANUAL'
        });
        stats.manual++;
    });

    // EXECUTE BATCHES
    const chunkSize = 450;
    for (let i = 0; i < batchOps.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = batchOps.slice(i, i + chunkSize);
        chunk.forEach(op => {
            batch.set(op.ref, op.data, { merge: true });
        });
        await batch.commit();
        console.log(`Committed batch ${Math.floor(i/chunkSize) + 1} of ${Math.ceil(batchOps.length/chunkSize)}`);
    }

    return stats;
};

