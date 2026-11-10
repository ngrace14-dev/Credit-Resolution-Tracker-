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

export const buildMonthlyReportSummaries = ({ ledgerEvents, targetMonth, targetSite, calendarMonths, masterBrands, isPromoSelected, fallbackEmailMap }) => {
    const groups = {};

    const ensureStructure = (m, v) => {
        if (!groups[m]) {
            groups[m] = { month: m, total: 0, count: 0, brands: {} };
        }
        const vendorName = v || 'UNKNOWN';
        if (!groups[m].brands[vendorName]) {
            const brandInfo = masterBrands.find(b => String(b.vendor || '').toUpperCase() === vendorName.toUpperCase()) || {};
            groups[m].brands[vendorName] = {
                vendor: vendorName, month: m, email: (fallbackEmailMap && fallbackEmailMap[vendorName]) || brandInfo.email || "", rep: brandInfo.rep || "",
                credits: [], total: 0, generated: 0, recovered: 0
            };
        }
        return groups[m].brands[vendorName];
    };

    ledgerEvents.forEach(e => {
        if (e.site !== targetSite) return;
        if (targetMonth !== 'All' && e.isolation_month !== targetMonth) return;
        
        // Respect dynamic promo filters
        if (e.type === 'GENERATED' && typeof isPromoSelected === 'function') {
            const vendorName = e.brand || e.vendor || '';
            const promoTitle = e.discountTitle || e.promoType || '';
            if (promoTitle && !isPromoSelected(vendorName, promoTitle)) {
                return; // Skip this event because user deselected this promo
            }
        }

        const mName = e.isolation_month;
        const brand = ensureStructure(mName, e.brand);

        if (e.type === 'GENERATED' || e.type === 'ADJUSTMENT') {
            brand.generated += e.amount;
            brand.total += e.amount;
            groups[mName].total += e.amount;
        } else if (e.type === 'RECOVERY') {
            brand.recovered += e.amount;
        }

        brand.credits.push({
            id: e.id, site: e.site, trackingMonth: mName,
            vendor: e.brand, amount: e.amount, creditType: e.type,
            dates: e.isolation_month, status: e.status, invoice: e.invoice_ref
        });
    });

    return Object.values(groups)
        .sort((a, b) => calendarMonths.indexOf(a.month) - calendarMonths.indexOf(b.month))
        .map(group => ({
            ...group,
            count: Object.keys(group.brands).length,
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
