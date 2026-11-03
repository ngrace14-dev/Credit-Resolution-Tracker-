// services/exportService.js
import { csvEscape } from './csvService.js';

export const buildVendorsAndBrandsCSV = (masterBrands) => {
    const grouped = {};
    masterBrands.forEach(b => {
        const distro = b.distributor ? b.distributor.trim() : 'Unassigned Vendor';
        const brand = b.vendor ? b.vendor.trim() : 'Unknown Brand';

        if (!grouped[distro]) {
            grouped[distro] = [];
        }
        grouped[distro].push(brand);
    });

    const sortedDistros = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
    let csvContent = "Vendor/Distributor,Attached Brand\n";

    sortedDistros.forEach(distro => {
        const sortedBrands = grouped[distro].sort((a, b) => a.localeCompare(b));
        sortedBrands.forEach(brand => {
            const safeDistro = `"${csvEscape(distro)}"`;
            const safeBrand = `"${csvEscape(brand)}"`;
            csvContent += `${safeDistro},${safeBrand}\n`;
        });
    });

    return csvContent;
};

export const buildAnnualReportCSV = (creditsToArchive, formatCurrency) => {
    let csvContent = "Site,Tracking Month,Vendor,Distributor,Credit Type,Dates,Credit Amount,Date Requested,Date Received,Invoice,Status,Archived Date\n";
    let csvTotal = 0;
    const archiveDateStr = new Date().toLocaleDateString();
    
    creditsToArchive.forEach(c => {
        const safeSite = `"${csvEscape(String(c.site || ''))}"`;
        const safeMonth = `"${csvEscape(String(c.trackingMonth || ''))}"`;
        const safeVendor = `"${csvEscape(String(c.vendor || ''))}"`;
        const safeDist = `"${csvEscape(String(c.distributor || ''))}"`;
        const safeType = `"${csvEscape(String(c.creditType || ''))}"`;
        const safeDates = `"${csvEscape(String(c.dates || ''))}"`;
        const safeAmount = `"${formatCurrency(c.amount)}"`;
        const safeReq = `"${csvEscape(String(c.dateRequested || ''))}"`;
        const safeRec = `"${csvEscape(String(c.dateReceived || ''))}"`;
        const safeInvoice = `"${csvEscape(String(c.invoice || ''))}"`;
        const safeStatus = `"${csvEscape(String(c.status || ''))}"`;
        const archiveDate = `"${archiveDateStr}"`;
        
        csvContent += `${safeSite},${safeMonth},${safeVendor},${safeDist},${safeType},${safeDates},${safeAmount},${safeReq},${safeRec},${safeInvoice},${safeStatus},${archiveDate}\n`;
        csvTotal += parseFloat(c.amount) || 0;
    });

    csvContent += `,,,,,, "TOTAL:", "${formatCurrency(csvTotal)}"\n`;
    return csvContent;
};

export const buildBrandVarianceCSV = (masterWorkbookData, targetSite, selectedBrand, calendarMonths, helpers) => {
    const { detectSiteFromName, detectMonthFromDate } = helpers;
    const brands = {};
    
    if (masterWorkbookData) {
        Object.keys(masterWorkbookData).forEach(sheetName => {
            const monthStr = sheetName.split(" ")[0];
            const monthIdx = calendarMonths.indexOf(monthStr);
            if (monthIdx !== -1 && sheetName.includes('2026')) {
                const rows = masterWorkbookData[sheetName] || [];
                rows.forEach(row => {
                    const siteCol = targetSite === "Redding" ? "Redding" : "Red-Bluff";
                    const rawSiteVal = row[siteCol];
                    if (rawSiteVal && String(rawSiteVal).trim().toLowerCase() === 'x') {
                        const brand = row["Brand"] || 'Unknown';
                        if (brand === "Brand" || brand.toLowerCase().includes('total')) return;
                        if (!brands[brand]) {
                            brands[brand] = { name: brand, months: Array(12).fill(0), collections: Array(12).fill(0) };
                        }
                        const promoAmt = row["Promo Credits "] || row["Promo Credits"] || 0;
                        brands[brand].months[monthIdx] += parseFloat(String(promoAmt).replace(/[^0-9.-]+/g, "")) || 0;
                    }
                });
            }
        });
        
        const sageRows = masterWorkbookData["GL Raw by Store"] || [];
        sageRows.forEach(row => {
            const site = detectSiteFromName(row["Store"] || row["Location"]);
            if (site !== targetSite) return;
            const dateStr = row["Posted dt."] || '';
            const month = detectMonthFromDate(dateStr);
            const monthIdx = calendarMonths.indexOf(month);
            const brand = row["Mapped Brand"] || 'Unmapped';
            if (monthIdx !== -1) {
                if (!brands[brand]) {
                    brands[brand] = { name: brand, months: Array(12).fill(0), collections: Array(12).fill(0) };
                }
                const amt = parseFloat(String(row["Credit"] || 0).replace(/[^0-9.-]+/g, "")) || 0;
                brands[brand].collections[monthIdx] += amt;
            }
        });
    }
    
    const headers = ['Brand/Vendor', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'YTD Total'];
    let csvContent = headers.join(',') + '\n';
    
    const brandList = selectedBrand
        ? [brands[selectedBrand]].filter(Boolean)
        : Object.values(brands).sort((a, b) => a.name.localeCompare(b.name));
        
    brandList.forEach(b => {
        let ytdGen = 0;
        let ytdColl = 0;
        const genRow = [`"${csvEscape(b.name)}"`];
        const collRow = ['Collected (GL)'];
        const varRow = ['Balance Owed'];
        for (let i = 0; i < 12; i++) {
            const gen = b.months[i];
            const coll = b.collections[i];
            const diff = gen - coll;
            genRow.push(gen.toFixed(2));
            collRow.push(coll.toFixed(2));
            varRow.push(diff.toFixed(2));
            ytdGen += gen;
            ytdColl += coll;
        }
        genRow.push(ytdGen.toFixed(2));
        collRow.push(ytdColl.toFixed(2));
        varRow.push((ytdGen - ytdColl).toFixed(2));
        
        csvContent += genRow.join(',') + '\n';
        csvContent += collRow.join(',') + '\n';
        csvContent += varRow.join(',') + '\n\n';
    });
    
    return csvContent;
};

export const buildYTDVariancePDFData = (masterWorkbookData, targetSite, calendarMonths, helpers) => {
    const { detectSiteFromName, detectMonthFromDate, formatCurrency } = helpers;
    const tableHeaders = [
        ['Brand/Vendor', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'YTD Total']
    ];
    const tableData = [];
    const brands = {};
    
    if (masterWorkbookData) {
        Object.keys(masterWorkbookData).forEach(sheetName => {
            const monthStr = sheetName.split(" ")[0];
            const monthIdx = calendarMonths.indexOf(monthStr);
            if (monthIdx !== -1 && sheetName.includes('2026')) {
                const rows = masterWorkbookData[sheetName] || [];
                rows.forEach(row => {
                    const siteCol = targetSite === "Redding" ? "Redding" : "Red-Bluff";
                    const rawSiteVal = row[siteCol];
                    if (rawSiteVal && String(rawSiteVal).trim().toLowerCase() === 'x') {
                        const brand = row["Brand"] || 'Unknown';
                        if (brand === "Brand" || brand.toLowerCase().includes('total')) return;
                        if (!brands[brand]) {
                            brands[brand] = { name: brand, months: Array(12).fill(0), collections: Array(12).fill(0) };
                        }
                        const promoAmt = row["Promo Credits "] || row["Promo Credits"] || 0;
                        brands[brand].months[monthIdx] += parseFloat(String(promoAmt).replace(/[^0-9.-]+/g, "")) || 0;
                    }
                });
            }
        });
        
        const sageRows = masterWorkbookData["GL Raw by Store"] || [];
        sageRows.forEach(row => {
            const site = detectSiteFromName(row["Store"] || row["Location"]);
            if (site !== targetSite) return;
            const dateStr = row["Posted dt."] || '';
            const month = detectMonthFromDate(dateStr);
            const monthIdx = calendarMonths.indexOf(month);
            const brand = row["Mapped Brand"] || 'Unmapped';
            if (monthIdx !== -1) {
                if (!brands[brand]) {
                    brands[brand] = { name: brand, months: Array(12).fill(0), collections: Array(12).fill(0) };
                }
                const amt = parseFloat(String(row["Credit"] || 0).replace(/[^0-9.-]+/g, "")) || 0;
                brands[brand].collections[monthIdx] += amt;
            }
        });
    }
    
    Object.values(brands).sort((a, b) => a.name.localeCompare(b.name)).forEach(b => {
        const row = [b.name];
        let ytdTotal = 0;
        for (let i = 0; i < 12; i++) {
            row.push(formatCurrency(b.months[i]));
            ytdTotal += b.months[i];
        }
        row.push(formatCurrency(ytdTotal));
        tableData.push(row);
        
        const collRow = ['   ↳ Collected (GL)'];
        let ytdColl = 0;
        for (let i = 0; i < 12; i++) {
            collRow.push(formatCurrency(b.collections[i]));
            ytdColl += b.collections[i];
        }
        collRow.push(formatCurrency(ytdColl));
        tableData.push(collRow);
        
        const varRow = ['   ↳ Balance Owed'];
        for (let i = 0; i < 12; i++) {
            const diff = b.months[i] - b.collections[i];
            varRow.push(formatCurrency(diff));
        }
        varRow.push(formatCurrency(ytdTotal - ytdColl));
        tableData.push(varRow);
        
        tableData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    });
    
    return { tableHeaders, tableData };
};
