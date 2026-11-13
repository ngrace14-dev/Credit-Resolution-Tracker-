const fs = require('fs');
const content = fs.readFileSync('standalone_tool.html', 'utf8');
const startIdx = content.indexOf('// Pure single-month generated promo CSV export');
const endIdx = content.indexOf('// Full 12-month & YTD reconciliation statement CSV export');
const oldCode = content.substring(startIdx, endIdx);

const newCode = `// Pure single-month generated promo CSV export (Brand Reports tab - NO YTD, NO GL applied/remaining)
const downloadMonthlyReport = (brandOrMonthGroup) => {
    const isSingleBrand = !!brandOrMonthGroup.vendor;
    const targetVendor = isSingleBrand ? resolveToTreezBrandName(brandOrMonthGroup.vendor, masterWorkbook.value?.data, treesSalesData.value) : 'All';
    const targetMonth = brandOrMonthGroup.month || activeMonth.value;
    const targetSite = activeSite.value;

    const rawSales = inMemoryLedgerEvents.value.filter(sale => {
        if (sale.type !== 'GENERATED') return false;
        if (targetMonth !== 'All' && sale.isolation_month !== targetMonth) return false;
        const saleSite = detectSiteFromName(sale.site || '');
        if (targetSite !== 'All' && saleSite !== targetSite) return false;
        const promoTitle = sale.discountTitle || 'Promo';
        if (globalPromoFilters.value.length > 0 && !globalPromoFilters.value.includes(promoTitle)) return false;
        const v = resolveToTreezBrandName(sale.brand || 'Unmapped', masterWorkbook.value?.data, treesSalesData.value);
        if (targetVendor !== 'All' && v !== targetVendor) return false;
        return true;
    });

    const promoGroups = {};
    rawSales.forEach(sale => {
        const p = sale.discountTitle || 'Unknown Promo';
        if (!promoGroups[p]) promoGroups[p] = [];
        promoGroups[p].push(sale);
    });

    let grandTotal = 0;
    
    // Create Excel Workbook
    const wb = XLSX.utils.book_new();
    const wsData = [];
    
    // Header Row
    wsData.push(['Promotion', 'Date Closed', 'Month', 'Store Location', 'Product Brand', 'Product Name', 'Units Sold', 'Credit Amount Owed']);

    Object.keys(promoGroups).forEach(promoName => {
        let subtotal = 0;
        
        // Add Promo Summary Row (This will be visible by default)
        const summaryRowIndex = wsData.length;
        wsData.push([\`Total for \${promoName}\`, '', '', '', '', '', '', 0]); // 0 is a placeholder
        
        promoGroups[promoName].forEach(sale => {
            const date = sale.date || sale.dateClosed || '';
            const month = sale.isolation_month || '';
            const site = detectSiteFromName(sale.site || '');
            const brand = resolveToTreezBrandName(sale.brand, masterWorkbook.value?.data, treesSalesData.value);
            const prodName = String(sale['Product Name'] || sale.productName || 'N/A').replace(/"/g, '""');
            const units = sale['Qty Sold'] || sale.unitsSold || sale.qty || sale.units || 1;
            const amt = Number(sale.amount) || 0;
            
            subtotal += amt;
            grandTotal += amt;
            
            // Add Line Item Row
            wsData.push([promoName, date, month, site, brand, prodName, units, amt]);
        });
        
        // Update the summary row with the actual subtotal
        wsData[summaryRowIndex][7] = subtotal;
    });

    // Add Grand Total Row
    wsData.push([\`Grand Total (\${targetMonth})\`, '', '', '', '', '', '', grandTotal]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Auto-filter settings (Optional, helps users filter columns)
    ws['!autofilter'] = { ref: \`A1:H\${wsData.length}\` };

    // Set Column Widths for better visibility
    ws['!cols'] = [
        { wch: 30 }, // Promotion
        { wch: 15 }, // Date Closed
        { wch: 10 }, // Month
        { wch: 15 }, // Store Location
        { wch: 20 }, // Product Brand
        { wch: 40 }, // Product Name
        { wch: 10 }, // Units Sold
        { wch: 20 }  // Credit Amount Owed
    ];
    
    // Group rows logic (collapsing line items under their summary)
    ws['!rows'] = [];
    let currentRow = 1; // Start after header
    Object.keys(promoGroups).forEach(promoName => {
        currentRow++; // Skip the summary row
        for(let i = 0; i < promoGroups[promoName].length; i++) {
            ws['!rows'][currentRow] = { hidden: true, level: 1 };
            currentRow++;
        }
    });

    // Add sheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Report');

    const filename = isSingleBrand
        ? \`\${targetVendor}_\${targetMonth}_2026_Report.xlsx\`
        : \`\${targetMonth}_2026_Full_Promo_Report.xlsx\`;
        
    XLSX.writeFile(wb, filename);
};
`;

const newContent = content.replace(oldCode, newCode);
fs.writeFileSync('standalone_tool.html', newContent, 'utf8');
console.log('Update complete!');