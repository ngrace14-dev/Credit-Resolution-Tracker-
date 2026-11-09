import { cleanCurrency } from './csvService.js';
export const parseExcelDate = (value) => {
if (!value || value === 'N/A') return null;
if (typeof value === 'number') return new Date(Math.round((value - 25569) * 86400 * 1000));
const d = new Date(value);
return isNaN(d.getTime()) ? null : d;
};
export function generateAuditStatementCSV({
    brandVendor,
    targetSite,
    activeMonth,
    ledgerEvents = [],
    selectedPromos = null, // Array of approved promo titles from brandPromoFilters; null = all
    calendarMonths = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ],
    csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
}) {
    const csvRows = [];
    const sitePrefix = (targetSite || '').toUpperCase().split(' ')[0]; // Matches "RED" or "REDDING"
    const targetBrand = (brandVendor || '').toUpperCase();

    // 1. Filter raw transactions to this Brand, Site, and Active Promo Selection
    const activeRawEvents = ledgerEvents.filter(e => {
        // Exclude general ledger baseline summary rows from granular item lists
        if (e.source === 'WORKBOOK_BASELINE' || e.type === 'APPLIED') return false;

        const b = (e.brand || e['Product Brand'] || e.vendor || '').toUpperCase();
        const s = (e.site || e.detectedSite || e['Store Name'] || e.Location || '').toUpperCase();
        const promo = e.discountTitle || e['Discount Title'] || e.promoType || 'Standard Promo';

                const brandMatch = b === targetBrand;
        const siteMatch = s.includes(sitePrefix) || s.includes((targetSite || '').toUpperCase());
        const promoMatch = !selectedPromos || selectedPromos.length === 0 || selectedPromos.includes(promo);

        return brandMatch && siteMatch && promoMatch;
    });

    // ========================================================
    // SECTION 1: MONTHLY YTD RECONCILIATION SUMMARY (9 COLUMNS)
    // ========================================================
    csvRows.push([
        'Period',
        'Location',
        'Brand',
        'New_Credits_Generated',
        'Running_Total_Generated',
        'Credits_Applied',
        'Cumulative_Applied',
        'Remaining_Unapplied_Balance',
        'Status'
    ].join(','));

        let runningGen = 0;
    let cumulativeApplied = 0;
    let ytdGen = 0;
    let ytdApplied = 0;

    const activeMonthIdx = calendarMonths.indexOf(activeMonth);

    calendarMonths.forEach((mName, idx) => {
        const mUpper = mName.toUpperCase();

        if (activeMonthIdx !== -1 && idx > activeMonthIdx) {
            csvRows.push([
                csvEscape(`${mName} 2026`),
                csvEscape(targetSite),
                csvEscape(brandVendor),
                "-",
                "-",
                "-",
                "-",
                "-",
                csvEscape("Pending")
            ].join(','));
            return;
        }

        // Calculate New Credits Generated for this month from active events
        const monthEvents = activeRawEvents.filter(e => {
            const m = (e.isolation_month || e.month || '').toUpperCase();
            return m === mUpper;
        });

        let newGen = monthEvents.reduce((sum, e) => 
            sum + Number(e.amount ?? e.owed ?? e.creditOwed ?? e.Vendor_Credit_Owed ?? 0), 0
        );

        // Fallback: If no granular Treez records exist for this month, check for a baseline workbook row
        // (Only use baseline if user hasn't explicitly filtered out promotions)
        if (monthEvents.length === 0 && (!selectedPromos || selectedPromos.length === 0)) {
            const baselineRow = ledgerEvents.find(e => 
                e.source === 'WORKBOOK_BASELINE' &&
                (e.isolation_month || e.month || '').toUpperCase() === mUpper &&
                (e.brand || e.vendor || '').toUpperCase() === targetBrand &&
                (e.site || e.detectedSite || '').toUpperCase().includes(sitePrefix)
            );
            if (baselineRow) {
                newGen = Number(baselineRow.amount ?? baselineRow.owed ?? 0);
            }
        }

        // Match Credits Applied from SAGE GL 4545
        const appliedEvents = ledgerEvents.filter(e => 
            e.type === 'APPLIED' && 
            (e.isolation_month || e.month || '').toUpperCase() === mUpper &&
            (e.brand || e.vendor || '').toUpperCase() === targetBrand &&
            (e.site || e.detectedSite || '').toUpperCase().includes(sitePrefix)
        );
        const newApplied = appliedEvents.reduce((sum, e) => sum + Number(e.amount || 0), 0);

        runningGen += newGen;
        cumulativeApplied += newApplied;
        ytdGen += newGen;
        ytdApplied += newApplied;

        const remaining = runningGen - cumulativeApplied;
        let status = 'No Activity';
        if (remaining > 0 && newApplied > 0) status = 'Partial Payment';
        else if (remaining > 0) status = 'Outstanding';
        else if (remaining < 0) status = 'Credit Balance / Overpaid';
        else if (runningGen > 0 && remaining === 0) status = 'Fully Settled';

        csvRows.push([
            csvEscape(`${mName} 2026`),
            csvEscape(targetSite),
            csvEscape(brandVendor),
            newGen.toFixed(2),
            runningGen.toFixed(2),
            newApplied.toFixed(2),
            cumulativeApplied.toFixed(2),
            remaining.toFixed(2),
            csvEscape(status)
        ].join(','));
    });

    // Section 1: YTD Total Row
    const ytdRemaining = ytdGen - ytdApplied;
    let ytdStatus = ytdRemaining === 0 ? 'Fully Settled' : (ytdApplied > 0 ? 'Partial Payment' : 'Outstanding');
    if (ytdGen === 0 && ytdApplied === 0) ytdStatus = 'No Activity';

    csvRows.push([
        csvEscape('YTD Total'),
        csvEscape(targetSite),
        csvEscape(brandVendor),
        ytdGen.toFixed(2),
        ytdGen.toFixed(2),
        ytdApplied.toFixed(2),
        ytdApplied.toFixed(2),
        ytdRemaining.toFixed(2),
        csvEscape(ytdStatus)
    ].join(','));

    // ========================================================
    // SECTION 2: ITEMIZED ACTIVITY GROUPED BY PROMO TYPE
    // ========================================================
    csvRows.push(''); // Blank row separator
    csvRows.push(csvEscape('--- SECTION 2: ITEMIZED ACTIVITY GROUPED BY PROMOTION ---'));

    if (activeRawEvents.length === 0) {
        csvRows.push(csvEscape('No promotional line-item activity cataloged matching current filters.'));
    } else {
        // Group transactions by Discount Title
        const promoGroups = {};
        activeRawEvents.forEach(e => {
            const promo = e.discountTitle || e['Discount Title'] || e.promoType || 'Standard Discount';
            if (!promoGroups[promo]) promoGroups[promo] = [];
            promoGroups[promo].push(e);
        });

        // Output each promotion group with its own header, rows, and subtotal
        Object.keys(promoGroups).sort().forEach(promoTitle => {
            const groupItems = promoGroups[promoTitle];
            
            csvRows.push('');

            csvRows.push([
                csvEscape(`PROMOTION: ${promoTitle}`),
                '', '', '', '', '', '', ''
            ].join(','));

            csvRows.push([
                'Date Closed',
                'Month',
                'Store Location',
                'Product Brand',
                'Product Name',
                'Units Sold',
                'Discount %',
                'Credit Amount Owed'
            ].join(','));

            let groupSubtotal = 0;
            const sortedItems = [...groupItems].sort((a, b) => 
                new Date(a.dateClosed || a.date || 0) - new Date(b.dateClosed || b.date || 0)
            );

            sortedItems.forEach(item => {
                const rawDate = item.dateClosed || item['Date Closed'] || item.date || '';
                const dateStr = rawDate.split(' ')[0] || 'N/A';
                const monthStr = item.isolation_month || item.month || '';
                const prodName = item.productName || item['Product Name'] || item.product || 'N/A';
                const units = item.unitsSold || item['Units Sold'] || item.units || 1;
                const discPct = item.discountPercent || item['Discount %'] || item.discPct || '';
                const owed = Number(item.amount ?? item.owed ?? item.creditOwed ?? item.Vendor_Credit_Owed ?? 0);
                groupSubtotal += owed;

                csvRows.push([
                    csvEscape(dateStr),
                    csvEscape(monthStr),
                    csvEscape(targetSite),
                    csvEscape(brandVendor),
                    csvEscape(prodName),
                    units,
                    csvEscape(discPct),
                    owed.toFixed(2)
                ].join(','));
            });

            // Group Subtotal Row
            csvRows.push([
                csvEscape(`Subtotal for ${promoTitle}`),
                '', '', '', '', '', '',
                groupSubtotal.toFixed(2)
            ].join(','));
        });
    }

    // ========================================================
    // SECTION 3: MONTHLY PROMO RUN SCHEDULE & ACTIVE DAYS AUDIT
    // ========================================================
    csvRows.push(''); // Blank row separator
    csvRows.push(csvEscape('--- SECTION 3: MONTHLY PROMOTIONAL SCHEDULE & ACTIVE DAYS ---'));
    csvRows.push([
        'Month',
        'Discount Title / Promo Type',
        'Days Promo Ran (Calendar Days)',
        'Total Active Days',
        'Total Promo Credit Generated'
    ].join(','));

    if (activeRawEvents.length === 0) {
        csvRows.push(csvEscape('No promotional run dates cataloged.'));
    } else {
        // Map keyed by "MONTH:::PROMO_TITLE"
        const scheduleMap = {};

        activeRawEvents.forEach(e => {
            const m = e.isolation_month || e.month || 'October';
            const promo = e.discountTitle || e['Discount Title'] || e.promoType || 'Standard Discount';
            const key = `${m}:::${promo}`;

            if (!scheduleMap[key]) {
                scheduleMap[key] = {
                    month: m,
                    promoTitle: promo,
                    daysSet: new Set(),
                    totalCredit: 0
                };
            }

            const rawDate = e.dateClosed || e['Date Closed'] || e.date;
            if (rawDate) {
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) {
                    scheduleMap[key].daysSet.add(d.getDate().toString().padStart(2, '0'));
                }
            }

            scheduleMap[key].totalCredit += Number(e.amount ?? e.owed ?? e.creditOwed ?? e.Vendor_Credit_Owed ?? 0);
        });

        // Sort schedule chronologically by calendar month, then alphabetically by promo name
        const sortedKeys = Object.keys(scheduleMap).sort((a, b) => {
            const [mA, pA] = a.split(':::');
            const [mB, pB] = b.split(':::');
            const diff = calendarMonths.indexOf(mA) - calendarMonths.indexOf(mB);
            return diff !== 0 ? diff : pA.localeCompare(pB);
        });

        sortedKeys.forEach(k => {
            const entry = scheduleMap[k];
            const sortedDays = Array.from(entry.daysSet).sort((a, b) => parseInt(a) - parseInt(b));
            const daysString = sortedDays.length > 0 ? sortedDays.join(', ') : 'N/A';

            csvRows.push([
                csvEscape(entry.month),
                csvEscape(entry.promoTitle),
                // `="01, 02"` tells Excel to treat this strictly as a text string instead of a date
                `="${daysString}"`,
                entry.daysSet.size,
                entry.totalCredit.toFixed(2)
            ].join(','));
        });
    }

    return csvRows.join('\r\n');
}
