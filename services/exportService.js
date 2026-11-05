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

export const buildBrandVarianceCSV = (targetSite, selectedBrand, calendarMonths, ledgerEvents = []) => {
    const brands = {};
    const stdTarget = selectedBrand ? String(selectedBrand).trim().toUpperCase() : null;
    
    ledgerEvents.forEach(e => {
        if (e.site !== targetSite) return;
        const brand = e.brand;
        if (stdTarget && brand !== stdTarget) return;

        const monthIdx = calendarMonths.indexOf(e.isolation_month);
        if (monthIdx === -1) return;

        if (!brands[brand]) {
            brands[brand] = { name: brand, months: Array(12).fill(0), collections: Array(12).fill(0) };
        }

        if (e.type === 'GENERATED' || e.type === 'ADJUSTMENT') {
            brands[brand].months[monthIdx] += e.amount;
        } else if (e.type === 'RECOVERY') {
            brands[brand].collections[monthIdx] += e.amount;
        }
    });
    
    const headers = ['Brand/Vendor', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'YTD Total'];
    let csvContent = headers.join(',') + '\n';
    
    const brandList = Object.values(brands).sort((a, b) => a.name.localeCompare(b.name));
        
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

export const generateMasterWorkbookArtifact = (ledgerEvents, calendarMonths, sites) => {
    const workbookData = {};

    // 1. Monthly Sheets
    calendarMonths.forEach(month => {
        const sheetName = `${month} 2026`;
        const rows = [];
        const brandsInMonth = [...new Set(ledgerEvents.filter(e => e.isolation_month === month).map(e => e.brand))];
        
        brandsInMonth.forEach(brand => {
            const brandEvents = ledgerEvents.filter(e => e.isolation_month === month && e.brand === brand);
            const row = { "Brand": brand };
            sites.forEach(site => {
                const siteAmt = brandEvents.filter(e => e.site === site && (e.type === 'GENERATED' || e.type === 'ADJUSTMENT')).reduce((sum, e) => sum + e.amount, 0);
                row[site] = siteAmt > 0 ? siteAmt : 0;
            });
            const total = sites.reduce((sum, site) => sum + (row[site] || 0), 0);
            row["Treez Total"] = total;
            if (total > 0) rows.push(row);
        });
        workbookData[sheetName] = rows;
    });

    // 2. GL Raw Sheet
    workbookData["GL Raw by Store"] = ledgerEvents.filter(e => e.type === 'RECOVERY').map(e => ({
        "Posted dt.": e.isolation_month,
        "Store": e.site,
        "Mapped Brand": e.brand,
        "Credit": e.amount,
        "Memo/Description": e.invoice_ref
    }));

    return workbookData;
};
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

export const generateMasterWorkbookArtifact = (ledgerEvents, calendarMonths, sites) => {
    const workbookData = {};

    // 1. Monthly Sheets
    calendarMonths.forEach(month => {
        const sheetName = `${month} 2026`;
        const rows = [];
        const brandsInMonth = [...new Set(ledgerEvents.filter(e => e.isolation_month === month).map(e => e.brand))];
        
        brandsInMonth.forEach(brand => {
            const brandEvents = ledgerEvents.filter(e => e.isolation_month === month && e.brand === brand);
            const row = { "Brand": brand };
            sites.forEach(site => {
                const siteAmt = brandEvents.filter(e => e.site === site && (e.type === 'GENERATED' || e.type === 'ADJUSTMENT')).reduce((sum, e) => sum + e.amount, 0);
                row[site] = siteAmt > 0 ? siteAmt : 0;
            });
            const total = sites.reduce((sum, site) => sum + (row[site] || 0), 0);
            row["Treez Total"] = total;
            if (total > 0) rows.push(row);
        });
        workbookData[sheetName] = rows;
    });

    // 2. GL Raw Sheet
    workbookData["GL Raw by Store"] = ledgerEvents.filter(e => e.type === 'RECOVERY').map(e => ({
        "Posted dt.": e.isolation_month,
        "Store": e.site,
        "Mapped Brand": e.brand,
        "Credit": e.amount,
        "Memo/Description": e.invoice_ref
    }));

    return workbookData;
};
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
