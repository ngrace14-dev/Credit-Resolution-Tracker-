// services/auditService.js

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
    const standardizedTarget = getStandardizedBrandName(brandVendor).trim().toLowerCase();
    const currentYear = "2026"; // Consistent with Workbook V9 Schema
    
    if (!masterWorkbookData) return "Error: Workbook data missing.";

    const headers = ["Period", "Promo_Dates", "Beginning_Balance", "New_Credits_Generated", "Credits_Applied", "Ending_Balance", "Status"];
    let csvLines = [headers.join(",")];
    
    let runningBalance = 0, totalGenerated = 0, totalApplied = 0;
    const startIdx = calendarMonths.indexOf(startMonthName || 'January');
    const endIdx = calendarMonths.indexOf(endMonthName || 'September');

    const fullYearStats = calendarMonths.map((m, idx) => {
        let monthlyGen = 0, monthlyApp = 0, missingDateCount = 0;
        const promoDays = new Set();
        const sheetName = `${m} ${currentYear}`;
        const monthlyRows = masterWorkbookData[sheetName] || [];
        
        monthlyRows.forEach(row => {
            const rowKeys = Object.keys(row);
            const brandKey = rowKeys.find(k => k.trim().toLowerCase() === 'brand');
            const rowBrand = brandKey ? row[brandKey] : row[0];
            if (getStandardizedBrandName(rowBrand || '').trim().toLowerCase() === standardizedTarget) {
                const siteKey = rowKeys.find(k => normalizeSiteName(k) === normalizeSiteName(targetSite));
                let rawAmt = 0;
                if (siteKey) {
                    const val = String(row[siteKey]).trim().toLowerCase();
                    if (val === 'x') {
                        const pk = rowKeys.find(k => k.trim().toLowerCase() === 'promo credits');
                        rawAmt = pk ? row[pk] : 0;
                    } else rawAmt = row[siteKey];
                }
                const amt = parseFloat(String(rawAmt || 0).replace(/[^0-9.-]+/g, "")) || 0;
                monthlyGen += amt;

                if (amt > 0) {
                    const dk = rowKeys.find(k => k.trim().toLowerCase() === 'date requested');
                    const d = parseExcelDate(dk ? row[dk] : null);
                    if (d) promoDays.add(d.getDate());
                    else missingDateCount++;
                }
            }
        });
        
        (masterWorkbookData["GL Raw by Store"] || []).forEach(row => {
            const rowSiteNormalized = normalizeSiteName(detectSiteFromName(row["Store"] || row["Location"]));
            if (rowSiteNormalized === normalizeSiteName(targetSite) && 
                getStandardizedBrandName(row["Mapped Brand"] || '').trim().toLowerCase() === standardizedTarget &&
                detectMonthFromDate(row["Posted dt."] || '') === m) {
                monthlyApp += parseFloat(String(row["Credit"] || 0).replace(/[^0-9.-]+/g, "")) || 0;
            }
        });

        return { month: m, monthNum: idx + 1, generated: monthlyGen, applied: monthlyApp, days: Array.from(promoDays).sort((a, b) => a - b), missingDateCount };
    });

    fullYearStats.forEach((stat, idx) => {
        const begBal = runningBalance;
        const endBal = begBal + stat.generated - stat.applied;
        totalGenerated += stat.generated; totalApplied += stat.applied;

        if (idx >= startIdx && idx <= endIdx) {
            let promoDatesStr = "";
            if (stat.days.length > 0) {
                const mm = String(stat.monthNum).padStart(2, '0');
                promoDatesStr = `${mm}/${stat.days.map(d => String(d).padStart(2, '0')).join(',')}/${currentYear}`;
            }

            let status = "No Activity";
            if (stat.missingDateCount > 0 && stat.generated > 0) {
                status = "Audit Review Required";
                console.warn(`[Audit Discrepancy] ${stat.month} ${currentYear} has ${stat.missingDateCount} credits without date support for ${brandVendor}.`);
            } else if (stat.generated === 0 && stat.applied === 0) status = "No Activity";
            else if (Math.abs(endBal) <= 0.01) status = "Reconciled / Settled";
            else if (stat.applied > 0) status = "Partial Payment";
            else if (endBal > 0.01) status = "Outstanding";
            else status = "Credit Balance / Overpaid";

            csvLines.push([csvEscape(`${stat.month} ${currentYear}`), csvEscape(promoDatesStr), begBal.toFixed(2), stat.generated.toFixed(2), stat.applied.toFixed(2), endBal.toFixed(2), csvEscape(status)].join(","));
        }
        runningBalance = endBal;
    });
    
    const ytdBalance = totalGenerated - totalApplied;
    let ytdStatus = Math.abs(ytdBalance) <= 0.01 ? "Settled" : (ytdBalance > 0 ? "Outstanding Balance" : "Credit Balance / Overpaid");
    csvLines.push([csvEscape("YTD Total"), "", "0.00", totalGenerated.toFixed(2), totalApplied.toFixed(2), ytdBalance.toFixed(2), csvEscape(ytdStatus)].join(","));
    
    return csvLines.join("\r\n");
};
