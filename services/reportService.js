// services/reportService.js

export const buildDefinitiveBrandMetrics = (masterWorkbookData) => {
    const metrics = { total: {}, redding: {}, redBluff: {} };
    if (!masterWorkbookData) return metrics;

    const processSheet = (sheetName, siteKey) => {
        const rows = masterWorkbookData[sheetName] || [];
        rows.forEach(row => {
            const brandRaw = row["Brand"];
            if (!brandRaw) return;
            const brand = String(brandRaw).trim();

            const cleanBrand = brand.toLowerCase();
            if (['nan', 'grand total', '(blank)', 'store-funded', 'brand'].includes(cleanBrand)) return;

            const applied = parseFloat(String(row["YTD Received (GL)"] || 0).replace(/[^0-9.-]+/g,"")) || 0;
            const generated = parseFloat(String(row["YTD Generated (POS)"] || 0).replace(/[^0-9.-]+/g,"")) || 0;

            if (!metrics.total[brand]) metrics.total[brand] = { applied: 0, generated: 0 };
            metrics.total[brand].applied += applied;
            metrics.total[brand].generated += generated;

            if (!metrics[siteKey][brand]) metrics[siteKey][brand] = { applied: 0, generated: 0 };
            metrics[siteKey][brand].applied += applied;
            metrics[siteKey][brand].generated += generated;
        });
    };

    processSheet('Redding Store Audit', 'redding');
    processSheet('Red Bluff Store Audit', 'redBluff');
    return metrics;
};

export const buildMonthlyReportSummaries = (params) => {
    const { masterWorkbookData, targetMonth, targetSite, calendarMonths, masterBrands, promoCredits, treesSalesData } = params;
    const groups = {};

    const ensureStructure = (m, v) => {
        if (!groups[m]) {
            groups[m] = { month: m, total: 0, count: 0, credits: [], brands: {} };
        }
        const vendorName = v || 'Unmapped Brand';
        if (!groups[m].brands[vendorName]) {
            const brandInfo = masterBrands.find(b => (b.vendor || '').toLowerCase() === vendorName.toLowerCase()) || {};
            groups[m].brands[vendorName] = {
                vendor: vendorName, month: m, email: brandInfo.email || '', rep: brandInfo.rep || '',
                credits: [], total: 0, workbookTotal: 0, posTotal: 0
            };
        }
        return groups[m].brands[vendorName];
    };

    if (masterWorkbookData) {
        Object.keys(masterWorkbookData).forEach(sheetName => {
            if (!sheetName.includes('2026')) return;
            const mName = sheetName.split(' ')[0];
            if (targetMonth !== 'All' && mName !== targetMonth) return;

            const rows = masterWorkbookData[sheetName] || [];
            rows.forEach(row => {
                const vendor = row["Brand"] || row[0];
                if (!vendor || vendor === "Brand" || vendor.toLowerCase().includes('total')) return;

                const siteKey = targetSite === "Redding" ? "Redding" : "Red-Bluff";
                let rawAmt = 0;
                const rowKeys = Object.keys(row);
                const exactKey = rowKeys.find(k => k.trim().toLowerCase() === targetSite.toLowerCase() || k.trim().toLowerCase() === siteKey.toLowerCase());
                
                if (exactKey) {
                    const val = String(row[exactKey]).trim().toLowerCase();
                    if (val === 'x') {
                        const promoKey = rowKeys.find(k => k.toLowerCase().includes('promo credits'));
                        rawAmt = row[promoKey] || 0;
                    } else {
                        rawAmt = row[exactKey];
                    }
                } else if (siteKey === "Redding" && row[1] !== undefined) {
                    rawAmt = row[1];
                } else if (siteKey === "Red-Bluff" && row[2] !== undefined) {
                    rawAmt = row[2];
                }

                const amt = parseFloat(String(rawAmt || 0).replace(/[^0-9.-]+/g,"")) || 0;

                if (amt > 0) {
                    const brand = ensureStructure(mName, vendor);
                    brand.workbookTotal += amt;
                    brand.total += amt;
                    groups[mName].total += amt;
                    groups[mName].count += 1;
                    
                    const approvedKey = rowKeys.find(k => k.toLowerCase().includes('approved') || k.toLowerCase().includes('applied') || k.toLowerCase().includes('collected'));
                    
                    brand.credits.push({
                        id: `sim-${mName}-${vendor}`, site: targetSite, trackingMonth: mName,
                        vendor: vendor, amount: amt, creditType: row["Promo Credits"] || 'Aggregated POS Sales',
                        dates: row["Date Requested"] || 'Workbook Sync',
                        status: (parseFloat(String(row[approvedKey] || row["Credits Approved"] || 0).replace(/[^0-9.-]+/g,"")) > 0) ? 'Applied' : 'Pending'
                    });
                }
            });
        });
    }

    promoCredits.forEach(c => {
        if (!c || c.site !== targetSite) return;
        if (targetMonth !== 'All' && c.trackingMonth !== targetMonth) return;
        if (c.invoice === 'WB-V9-SYNC') return;

        const brand = ensureStructure(c.trackingMonth, c.vendor);
        brand.credits.push(c);
        brand.total += (parseFloat(c.amount) || 0);
        groups[c.trackingMonth].total += (parseFloat(c.amount) || 0);
        groups[c.trackingMonth].count += 1;
    });

    treesSalesData.forEach(s => {
        if (!s || s.detectedSite !== targetSite) return;
        if (targetMonth !== 'All' && s.month !== targetMonth) return;
        const brand = ensureStructure(s.month, s.brand);
        brand.posTotal += (parseFloat(s.owed) || 0);
    });

    return Object.values(groups)
        .sort((a, b) => calendarMonths.indexOf(a.month) - calendarMonths.indexOf(b.month))
        .map(group => ({
            ...group,
            brandList: Object.values(group.brands).sort((a, b) => a.vendor.localeCompare(b.vendor))
        }));
};

export const buildBrandAuditData = (params) => {
    const { masterWorkbookData, targetMonth, targetSite, auditRangeStart, auditRangeEnd, promoCredits, masterBrands, definitiveBrandMetrics } = params;
    const siteKey = targetSite === "Redding" ? "redding" : "redBluff";
    const start = auditRangeStart ? new Date(auditRangeStart) : null;
    const end = auditRangeEnd ? new Date(auditRangeEnd) : null;
    const brandMap = {};

    (promoCredits || []).forEach(c => {
        if (c.site !== targetSite) return;
        if (start || end) {
            const creditDate = c.dateRequested || c.dates ? new Date(c.dateRequested || c.dates) : null;
            if (creditDate && !isNaN(creditDate.getTime())) {
                if (start && creditDate < start) return;
                if (end && creditDate > end) return;
            }
        } else if (targetMonth !== 'All' && c.trackingMonth !== targetMonth) {
            return;
        }

        const vendor = c.vendor || 'Unknown Brand';
        if (!brandMap[vendor]) {
            const brandInfo = masterBrands.find(b => (b.vendor || '').toLowerCase() === vendor.toLowerCase()) || {};
            brandMap[vendor] = { vendor: vendor, email: brandInfo.email || '', rep: brandInfo.rep || '', generated: 0, collected: 0, treezTotal: 0, credits: [] };
        }

        const amt = parseFloat(c.amount) || 0;
        brandMap[vendor].generated += amt;
        if (c.status === 'Applied') brandMap[vendor].collected += amt;

        brandMap[vendor].credits.push({
            month: c.trackingMonth, amount: amt, dates: c.dateRequested || c.dates || '-',
            status: c.status === 'Applied' ? 'Collected' : 'Pending'
        });
    });

    Object.keys(brandMap).forEach(vendor => {
        const brandMetrics = definitiveBrandMetrics[siteKey] ? definitiveBrandMetrics[siteKey][vendor] : null;
        if (brandMetrics) {
            brandMap[vendor].collected = brandMetrics.applied;
            brandMap[vendor].recovered = brandMetrics.applied;
            if (!start && !end && targetMonth === 'All') {
                brandMap[vendor].generated = brandMetrics.generated;
            }
        }
    });

    return Object.values(brandMap).sort((a, b) => (b.generated - b.collected) - (a.generated - a.collected));
};

export const buildSageAuditData = (params, helpers) => {
    const { masterWorkbookData, targetSite, targetMonth, promoCredits } = params;
    const { detectSiteFromName, detectMonthFromDate } = helpers;
    
    if (!masterWorkbookData) return [];
    const rawSageRows = masterWorkbookData["GL Raw by Store"] || [];
    if (rawSageRows.length === 0) return [];

    const sageMap = {};

    rawSageRows.forEach(row => {
        const site = detectSiteFromName(row["Store"] || row[1] || row["Location"] || row[2]);
        const dateStr = row["Posted dt."] || row[0] || 'Unknown';
        const month = detectMonthFromDate(dateStr);

        if (site !== targetSite) return;
        if (targetMonth !== 'All' && month !== targetMonth) return;

        const brand = row["Mapped Brand"] || row[5] || 'Unmapped';
        if (brand === "Mapped Brand" || !brand) return;

        if (!sageMap[brand]) sageMap[brand] = { brand, totalApplied: 0, totalGenerated: 0, transactions: [], sites: { "Redding": 0, "Red Bluff": 0 } };

        const amt = parseFloat(String(row["Credit"] || row[4] || 0).replace(/[^0-9.-]+/g,"")) || 0;
        const memo = row["Memo/Description"] || row[3] || '';

        sageMap[brand].totalApplied += amt;
        sageMap[brand].sites[site] += amt;
        sageMap[brand].transactions.push({ date: dateStr, site, memo, amount: amt });
    });

    promoCredits.forEach(c => {
        if (c.site !== targetSite) return;
        if (targetMonth !== 'All' && c.trackingMonth !== targetMonth) return;
        const brand = c.vendor || 'Unknown';
        if (!sageMap[brand]) sageMap[brand] = { brand, totalApplied: 0, totalGenerated: 0, transactions: [], sites: { "Redding": 0, "Red Bluff": 0 } };
        sageMap[brand].totalGenerated += (parseFloat(c.amount) || 0);
    });

    return Object.values(sageMap).sort((a, b) => b.totalApplied - a.totalApplied);
};

export const calculateMonthlyReportData = (brandName, params, helpers) => {
    const { startMonthValue, endMonthValue, calendarMonths, masterWorkbookData } = params;
    const { getStandardizedBrandName, detectMonthFromDate, detectSiteFromName } = helpers;
    
    if (!brandName) return { reddingGenerated: 0, reddingRecovered: 0, redBluffGenerated: 0, redBluffRecovered: 0, totalGenerated: 0, totalRecovered: 0, balance: 0 };
    
    let redGen = 0, redRec = 0, rbGen = 0, rbRec = 0;
    const startIdx = calendarMonths.indexOf(startMonthValue || 'January');
    const endIdx = calendarMonths.indexOf(endMonthValue || 'September');
    const auditedMonths = calendarMonths.slice(startIdx, Math.max(startIdx, endIdx) + 1);
    const standardizedTarget = getStandardizedBrandName(brandName).trim().toLowerCase();

    if (masterWorkbookData) {
        auditedMonths.forEach(m => {
            const sheetName = `${m} 2026`;
            const rows = masterWorkbookData[sheetName] || [];
            rows.forEach(row => {
                const keys = Object.keys(row);
                const brandKey = keys.find(k => k.trim().toLowerCase() === 'brand');
                const promoKey = keys.find(k => k.trim().toLowerCase() === 'promo credits');

                const reddingKey = keys.find(k => k.trim().toLowerCase().includes('redding'));
                const redBluffKey = keys.find(k => k.trim().toLowerCase().includes('red-bluff') || k.trim().toLowerCase().includes('red bluff'));
                const rowBrand = brandKey ? String(row[brandKey]).trim() : String(row[0] || '').trim();
                
                if (rowBrand && getStandardizedBrandName(rowBrand).toLowerCase() === standardizedTarget) {
                    const promoAmt = promoKey ? parseFloat(String(row[promoKey]).replace(/[^0-9.-]+/g, "")) || 0 : 0;
                    const isRedding = reddingKey && String(row[reddingKey]).trim().toLowerCase() === 'x';
                    const isRedBluff = redBluffKey && String(row[redBluffKey]).trim().toLowerCase() === 'x';
                    if (isRedding) redGen += promoAmt;
                    if (isRedBluff) rbGen += promoAmt;
                }
            });
        });
        const sageRows = masterWorkbookData["GL Raw by Store"] || [];
        sageRows.forEach(row => {
            const rowBrand = row["Mapped Brand"] || '';
            if (getStandardizedBrandName(rowBrand).trim().toLowerCase() === standardizedTarget) {
                const dateStr = row["Posted dt."] || '';
                const month = detectMonthFromDate(dateStr);
                if (auditedMonths.includes(month)) {
                    const amt = parseFloat(String(row["Credit"] || 0).replace(/[^0-9.-]+/g, "")) || 0;
                    const site = detectSiteFromName(row["Store"] || row["Location"]);
                    if (site === 'Redding') redRec += amt;
                    if (site === 'Red Bluff') rbRec += amt;
                }
            }
        });
    }
    
    let gen = redGen + rbGen;
    let rec = redRec + rbRec;
    return { reddingGenerated: redGen, reddingRecovered: redRec, redBluffGenerated: rbGen, redBluffRecovered: rbRec, totalGenerated: gen, totalRecovered: rec, balance: gen - rec };
};
