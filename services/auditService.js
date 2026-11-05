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
    ledgerEvents = [], // NEW: Use canonical events
    startMonthName,
    endMonthName,
    calendarMonths,
    csvEscape
}) => {
    const standardizedTarget = String(brandVendor).trim().toUpperCase();
    const currentYear = "2026";

    const headers = [
        "Period", "Location", "Brand", "New_Credits_Generated", "Running_Total_Generated",
        "Credits_Applied", "Cumulative_Applied", "Remaining_Unapplied_Balance", "Status"
    ];

    let csvLines = [headers.join(",")];
    let runningTotalGenerated = 0;
    let cumulativeApplied = 0;
    
    const startIdx = calendarMonths.indexOf(startMonthName || 'January');
    const endIdx = calendarMonths.indexOf(endMonthName || 'September');

    calendarMonths.forEach((month, idx) => {
        const monthlyEvents = ledgerEvents.filter(e => 
            e.isolation_month === month && 
            e.site === targetSite && 
            e.brand === standardizedTarget
        );

        const generatedCredits = monthlyEvents
            .filter(e => e.type === 'GENERATED' || e.type === 'ADJUSTMENT')
            .reduce((sum, e) => sum + e.amount, 0);

        const appliedCredits = monthlyEvents
            .filter(e => e.type === 'RECOVERY')
            .reduce((sum, e) => sum + e.amount, 0);

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
    csvLines.push([
        csvEscape("YTD Total"), csvEscape(targetSite), csvEscape(brandVendor),
        runningTotalGenerated.toFixed(2), runningTotalGenerated.toFixed(2),
        cumulativeApplied.toFixed(2), cumulativeApplied.toFixed(2),
        ytdBalance.toFixed(2), csvEscape("Summary")
    ].join(","));

    return csvLines.join("\r\n");
};

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
