import { cleanCurrency } from './csvService.js';

export const parseExcelDate = (value) => {
    if (!value || value === 'N/A') return null;
    if (typeof value === 'number') return new Date(Math.round((value - 25569) * 86400 * 1000));
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
};

export const generateAuditStatementCSV = ({
    brandVendor,
    targetSite,
    masterWorkbookData,
    startMonthName,
    endMonthName,
    calendarMonths,
    getStandardizedBrandName,
    normalizeSiteName,
    detectSiteFromName,
    detectMonthFromDate,
    csvEscape
}) => {
    if (!masterWorkbookData) return "Error: Workbook data missing.";

    const standardizedTarget = getStandardizedBrandName(brandVendor).trim().toLowerCase();
    const currentYear = "2026";

    const headers = [
        "Period",
        "Location",
        "Brand",
        "New_Credits_Generated",
        "Running_Total_Generated",
        "Credits_Applied",
        "Cumulative_Applied",
        "Remaining_Unapplied_Balance",
        "Status"
    ];

    let csvLines = [headers.join(",")];
    
    let runningTotalGenerated = 0;
    let cumulativeApplied = 0;
    
    const startIdx = calendarMonths.indexOf(startMonthName || 'January');
    const endIdx = calendarMonths.indexOf(endMonthName || 'September');

    calendarMonths.forEach((month, idx) => {
        let generatedCredits = 0;
        let appliedCredits = 0;

        // GENERATED CREDITS SOURCE
        const sheetName = `${month} ${currentYear}`;
        const monthlyRows = masterWorkbookData[sheetName] || [];
        monthlyRows.forEach(row => {
            const rowKeys = Object.keys(row);
            const brandKey = rowKeys.find(k => k.trim().toLowerCase() === 'brand');
            const rowBrand = brandKey ? row[brandKey] : row[0];
            
            if (getStandardizedBrandName(rowBrand || '').trim().toLowerCase() === standardizedTarget) {
                const siteKey = rowKeys.find(k => normalizeSiteName(k) === normalizeSiteName(targetSite));
                if (siteKey) {
                    const val = String(row[siteKey] ?? '').trim().toLowerCase();
                    if (val === 'x') {
                        const pk = rowKeys.find(k => k.trim().toLowerCase() === 'promo credits');
                        generatedCredits += cleanCurrency(pk ? row[pk] : 0);
                    } else if (val && !isNaN(cleanCurrency(val))) {
                        generatedCredits += cleanCurrency(val);
                    }
                }
            }
        });

        // APPLIED CREDITS SOURCE
        (masterWorkbookData["GL Raw by Store"] || []).forEach(row => {
            const rowSiteNormalized = normalizeSiteName(detectSiteFromName(row["Store"] || row["Location"]));
            if (rowSiteNormalized === normalizeSiteName(targetSite) && 
                getStandardizedBrandName(row["Mapped Brand"] || '').trim().toLowerCase() === standardizedTarget &&
                detectMonthFromDate(row["Posted dt."]) === month) {
                appliedCredits += cleanCurrency(row["Credit"]);
            }
        });

        // Maintain running totals across ALL months
        runningTotalGenerated += generatedCredits;
        cumulativeApplied += appliedCredits;
        const remainingUnappliedBalance = runningTotalGenerated - cumulativeApplied;

        if (idx >= startIdx && idx <= endIdx) {
            let status = "No Activity";
            if (generatedCredits === 0 && appliedCredits === 0) status = "No Activity";
            else if (Math.abs(remainingUnappliedBalance) <= 0.01) status = "Reconciled / Settled";
            else if (remainingUnappliedBalance < -0.01) status = "Credit Balance / Overpaid";
            else if (appliedCredits > 0) status = "Partial Payment";
            else status = "Outstanding";

            csvLines.push([
                csvEscape(`${month} ${currentYear}`),
                csvEscape(targetSite),
                csvEscape(brandVendor),
                generatedCredits.toFixed(2),
                runningTotalGenerated.toFixed(2),
                appliedCredits.toFixed(2),
                cumulativeApplied.toFixed(2),
                remainingUnappliedBalance.toFixed(2),
                csvEscape(status)
            ].join(","));
        }
    });

    // YTD ROW
    const ytdBalance = runningTotalGenerated - cumulativeApplied;
    let ytdStatus = "No Activity";
    if (runningTotalGenerated === 0 && cumulativeApplied === 0) ytdStatus = "No Activity";
    else if (Math.abs(ytdBalance) <= 0.01) ytdStatus = "Reconciled / Settled";
    else if (ytdBalance < -0.01) ytdStatus = "Credit Balance / Overpaid";
    else if (cumulativeApplied > 0) ytdStatus = "Partial Payment";
    else ytdStatus = "Outstanding";

    csvLines.push([
        csvEscape("YTD Total"),
        csvEscape(targetSite),
        csvEscape(brandVendor),
        runningTotalGenerated.toFixed(2),
        runningTotalGenerated.toFixed(2),
        cumulativeApplied.toFixed(2),
        cumulativeApplied.toFixed(2),
        ytdBalance.toFixed(2),
        csvEscape(ytdStatus)
    ].join(","));

    return csvLines.join("\r\n");
};
