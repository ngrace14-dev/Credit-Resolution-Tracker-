import { cleanCurrency } from './csvService.js';
export const parseExcelDate = (value) => {
if (!value || value === 'N/A') return null;
if (typeof value === 'number') return new Date(Math.round((value - 25569) * 86400 * 1000));
const d = new Date(value);
return isNaN(d.getTime()) ? null : d;
};
const isSoftPromoMatch = (targetPromo, posPromo) => {
    if (!targetPromo || !posPromo) return false;
    // Strip everything except letters and numbers, then uppercase
    const clean = (str) => str.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const cleanTarget = clean(targetPromo);
    const cleanPos = clean(posPromo);
    // Soft match: Does the POS string contain the core target string?
    return cleanPos.includes(cleanTarget) || cleanTarget.includes(cleanPos);
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
        const targetBrand = (brandVendor || '').toUpperCase();

    // Stage 1 (YTD Pool): Create a baseline array of all events for this specific brand and store across the entire year.
    const ytdEvents = ledgerEvents.filter(ev => {
        const evBrand = (ev.brand || ev.vendor || '').toUpperCase();
        return evBrand === targetBrand && ev.site === targetSite;
    });

    // Stage 2 (Active Month Pool): Create a subset for the itemized section.
    const isPromoSelected = (promo) => !selectedPromos || selectedPromos.length === 0 || selectedPromos.some(targetPromo => isSoftPromoMatch(targetPromo, promo));
    
    const activeMonthEvents = ytdEvents.filter(ev => {
        // Exclude general ledger baseline summary rows from granular item lists
        if (ev.source === 'WORKBOOK_BASELINE' || ev.type === 'APPLIED') return false;

        const evMonth = (ev.month || ev.isolation_month || '').toUpperCase();
        const monthMatch = activeMonth ? evMonth === activeMonth.toUpperCase() : true;

        const promo = ev.discountTitle || ev.creditType || '';
        const promoMatch = isPromoSelected(promo);

        return monthMatch && promoMatch;
    });
    
    console.log("=== AUDIT SERVICE FILTER DEBUG ===");
    console.log("Target Brand:", targetBrand);
    console.log("Target Site:", targetSite);
    console.log("Active Month required:", activeMonth);
    console.log("YTD Events Pool Size:", ytdEvents.length);
    console.log("Active Month Events (Itemized Pool):", activeMonthEvents.length);
    console.log("=====================================");

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

                // Calculate New Credits Generated for this month from ytdEvents (unfiltered by promo)
        const monthEvents = ytdEvents.filter(e => {
            const m = (e.isolation_month || e.month || '').toUpperCase();
            return m === mUpper && e.type !== 'APPLIED' && e.source !== 'WORKBOOK_BASELINE';
        });

        let newGen = monthEvents.reduce((sum, e) => 
            sum + Number(e.amount ?? e.owed ?? e.creditOwed ?? e.Vendor_Credit_Owed ?? 0), 0
        );

        // Fallback: baseline row (ignoring filters for summary)
        if (monthEvents.length === 0) {
            const baselineRow = ytdEvents.find(e => 
                e.source === 'WORKBOOK_BASELINE' &&
                (e.isolation_month || e.month || '').toUpperCase() === mUpper
            );
            if (baselineRow) {
                newGen = Number(baselineRow.amount ?? baselineRow.owed ?? 0);
            }
        }

        // Match Credits Applied from ytdEvents
        const appliedEvents = ytdEvents.filter(e => 
            e.type === 'APPLIED' && 
            (e.isolation_month || e.month || '').toUpperCase() === mUpper
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

        if (activeMonthEvents.length === 0) {
        csvRows.push(csvEscape('No promotional line-item activity cataloged matching current filters.'));
    } else {
        // Group transactions by Discount Title
        const promoGroups = {};
        activeMonthEvents.forEach(e => {
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
                        const sortedItems = [...groupItems].sort((a, b) => {
                const dateA = parseExcelDate(a.dateClosed || a.date);
                const dateB = parseExcelDate(b.dateClosed || b.date);
                return (dateA || new Date(0)) - (dateB || new Date(0));
            });

            sortedItems.forEach(item => {
                const rawDate = item.dateClosed || item['Date Closed'] || item.date || '';
                const parsedD = parseExcelDate(rawDate);
                const dateStr = parsedD ? parsedD.toISOString().split('T')[0] : 'N/A';
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

        if (activeMonthEvents.length === 0) {
        csvRows.push(csvEscape('No promotional run dates cataloged.'));
    } else {
        // Map keyed by "MONTH:::PROMO_TITLE"
        const scheduleMap = {};

        activeMonthEvents.forEach(e => {
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
                const d = parseExcelDate(rawDate);
                if (d) {
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
