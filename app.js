// app.js

// 1. FIREBASE IMPORTS
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, onSnapshot, setDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app-check.js";


// 2. FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyAslKhO_Wn2l1paJkqWj5lhxX_2YSekynk",
    authDomain: "rredco-database.firebaseapp.com",
    projectId: "rredco-database",
    storageBucket: "rredco-database.firebasestorage.app",
    messagingSenderId: "968362680607",
    appId: "1:968362680607:web:dea3fe719d8f8d619fbe8a",
    measurementId: "G-PGY27N2N17"
};

const firebaseApp = initializeApp(firebaseConfig);

// APP CHECK DEBUG MODE (Prevents 403 Throttling in Dev)
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

try {
    initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaEnterpriseProvider("6LeNEb8tAAAAAN454U2BgfO-ot6wN8T3VexIgIMq"),
        isTokenAutoRefreshEnabled: true
    });
} catch (error) {
    console.error("App Check Error:", error);
}


const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp); 
const storage = getStorage(firebaseApp); 

// 3. VUE APP INIT
const { createApp, ref, computed, nextTick, onMounted, watch } = window.Vue;

createApp({
        setup() {
        const isManagerUnlocked = ref(false);
        const loggedInUser = ref('');
        const emailInput = ref('');
        const passwordInput = ref('');
        const authError = ref('');
        const activeSite = ref('Red Bluff');
        const activeTab = ref('Ledger');
        const promoCredits = ref([]); 
        const calendarMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const activeMonth = ref('August');
        const masterBrands = ref([]);
        const selectedBrands = ref([]);

        const treesSalesData = ref(JSON.parse(localStorage.getItem('treesSalesData')) || []);
        const auditRange = ref({ start: '', end: '' });

        const selectedLedgerVendor = ref(null);
        const masterLedgerData = ref([]);
        const ledgerTotals = ref({ generated: 0, recovered: 0, outstanding: 0, variance: 0 });


        const refreshLedger = async () => {

            if (!promoCredits.value) return; // Prevent execution against undefined/null

            // Computed ledger simulation for UI wireframe
            const ledger = {};
            const site = activeSite.value;
            const month = activeMonth.value;
            
            // 1. Process Promo Credits as Discovery/Recovery Events
            promoCredits.value.forEach(c => {
                if (c.site !== site) return;
                
                // NEW: Respect the global month filter
                if (month !== 'All' && c.trackingMonth !== month) return;

                const v = c.vendor || 'Unknown';

                if (!ledger[v]) {
                    ledger[v] = { 
                        vendor: v, site: site, generated: 0, recovered: 0, outstanding: 0, 
                        variance: 0, discoveryEvents: [], recoveryEvents: [],
                        generatedCount: 0, recoveredCount: 0,
                        aging: { '0-30': 0, '31-60': 0, '61-90': 0, '91+': 0 }
                    };
                }
                
                // DISCOVERY EVENT
                ledger[v].generated += (parseFloat(c.amount) || 0);
                ledger[v].generatedCount++;
                ledger[v].discoveryEvents.push({
                    id: c.id,
                    type: c.creditType,
                    date: c.dateRequested || c.dates,
                    amount: c.amount
                });

                                                // RECOVERY EVENT (Rules: Status MUST be Applied, but logic is separate in ledger)
                // NEW SYSTEM: This will be sourced from 'promoRecovered' collection.
                if (c.status === 'Applied') {
                    const recoveredAmount = (parseFloat(c.amount) || 0); 
                    ledger[v].recovered += recoveredAmount;
                    
                    if (recoveredAmount > 0) {
                        ledger[v].recoveredCount++;
                        ledger[v].recoveryEvents.push({
                            id: 'rec-' + c.id,
                            ref: c.invoice || 'CREDIT-MEMO',
                            date: c.dateReceived || 'Confirmed',
                            amount: recoveredAmount
                        });
                    }
                }
            });


                        // 2. Finalize Calculations
            const totals = { generated: 0, recovered: 0, outstanding: 0, variance: 0 };
            
            Object.values(ledger).forEach(item => {
                item.outstanding = item.generated - item.recovered;
                item.variance = 0;
                
                // Aging calculation based on actual outstanding
                if (item.outstanding > 0) {
                    item.aging['0-30'] = item.outstanding;
                }
                
                totals.generated += item.generated;
                totals.recovered += item.recovered;
                totals.outstanding += item.outstanding;
                totals.variance += item.variance;
            });

            ledgerTotals.value = totals;
            masterLedgerData.value = Object.values(ledger).sort((a, b) => b.outstanding - a.outstanding);
        };


                watch([promoCredits, activeSite, activeMonth], () => {
            if (activeTab.value === 'Ledger') refreshLedger();
        });


        const openLegacyVerification = (vendorItem) => {
            alert(`Opening Legacy Verification Stage for ${vendorItem.vendor}...\n\nThis stage allows cross-referencing old 'promoCredits' records against the new Ledger events to ensure no data loss during transition.`);
        };

        
        const systemUsers = {
            'lenay@rredco.com': { name: 'Lenay A.', access: ['Red Bluff', 'Redding'], active: false },
            'tricia@rredco.com': { name: 'Tricia K.', access: ['Red Bluff', 'Redding'], active: false },
            'whitney@rredco.com': { name: 'Whitney M.', access: ['Red Bluff', 'Redding'], active: false },
            'nicholas.grace@rredco.com': { name: 'Nicholas G.', access: ['Red Bluff', 'Redding'], active: true, superAdmin: true },
            'accounting@rredco.com': { name: 'Accounting Team', access: ['Red Bluff', 'Redding'], active: true, superAdmin: true }
        };

        const logSystemAction = async (actionType, details) => {
            try {
                await addDoc(collection(db, "systemLogs"), {
                    timestamp: Date.now(),
                    user: loggedInUser.value || 'System',
                    actionType: actionType,
                    details: details
                });
            } catch (error) {
                console.error("Error logging action:", error);
            }
        };

                const saveTreesDataLocal = () => {
            localStorage.setItem('treesSalesData', JSON.stringify(treesSalesData.value));
        };


                const allBrandsSelected = computed(() => {
            return masterBrands.value.length > 0 && selectedBrands.value.length === masterBrands.value.length;
        });

        
        const toggleAllBrands = () => {
            if (allBrandsSelected.value) selectedBrands.value = [];
            else selectedBrands.value = masterBrands.value.map(b => b.id).filter(Boolean);
        };

        const deleteSelectedBrands = async () => {
            if (selectedBrands.value.length === 0) return;
            if (confirm(`Are you sure you want to permanently delete these ${selectedBrands.value.length} brands from the cloud directory?`)) {
                try {
                    const batch = writeBatch(db);
                    selectedBrands.value.forEach(brandId => {
                        batch.delete(doc(db, "brands", brandId));
                    });
                    await batch.commit();
                    selectedBrands.value = []; 
                } catch (error) {
                    console.error("Error deleting brands:", error);
                    alert("Failed to delete brands from the cloud.");
                }
            }
        };

                const updateBrandField = async (brandId, fieldName, event) => {
            const newValue = event.target.value;
            try {
                await updateDoc(doc(db, "brands", brandId), {
                    [fieldName]: newValue
                });
            } catch (error) {
                console.error("Error updating brand:", error);
                alert("Failed to save changes to the cloud.");
            }
        };


                const searchQueryInput = ref('');
        const searchQuery = ref('');      
      
        let searchTimeout = null;
        
        watch(searchQueryInput, (newVal) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchQuery.value = newVal;
            }, 300);
        });

        const showPromoModal = ref(false);
        const showBrandDropdown = ref(false);
        const editingId = ref(null);
        const showReportModal = ref(false);

        const showResolutionModal = ref(false);
        const resolutionCredit = ref(null);
        const resolutionForm = ref({ invoice: '', dateReceived: '' });

        const markAsSent = async (credit) => {
            if (confirm(`Mark this credit for ${credit.vendor} as 'Report Sent'?`)) {
                try {
                    await updateDoc(doc(db, "promoCredits", credit.id), { status: "Report Sent" });
                    
                    await addDoc(collection(db, "emailHistories"), {
                        creditId: credit.id,
                        vendor: credit.vendor,
                        amount: credit.amount,
                        site: credit.site,
                        action: "Report Sent",
                        sentBy: loggedInUser.value,
                        timestamp: Date.now()
                    });
                    
                    logSystemAction("UPDATE", `Marked credit for ${credit.vendor} as Report Sent`);
                } catch (error) {
                    console.error(error);
                    alert("Failed to update status.");
                }
            }
        };

        const markReportGroupAsSent = async (report) => {
            if (confirm(`Mark all ${report.credits.length} credits for ${report.vendor} as 'Report Sent'?`)) {
                try {
                    const batch = writeBatch(db);
                    const timestamp = Date.now();
                    
                    report.credits.forEach(credit => {
                        if (credit.status === 'Pending') {
                            const ref = doc(db, "promoCredits", credit.id);
                            batch.update(ref, { status: "Report Sent" });
                            
                            const historyRef = doc(collection(db, "emailHistories"));
                            batch.set(historyRef, {
                                creditId: credit.id,
                                vendor: credit.vendor,
                                amount: credit.amount,
                                site: credit.site,
                                action: "Report Sent (Batch)",
                                sentBy: loggedInUser.value,
                                timestamp: timestamp
                            });
                        }
                    });
                    
                    await batch.commit();
                    logSystemAction("UPDATE", `Batch updated ${report.vendor} credits to 'Report Sent'`);
                } catch (error) {
                    console.error("Batch update error:", error);
                    alert("Failed to update status for the group.");
                }
            }
        };

        const openResolutionModal = (credit) => {
            resolutionCredit.value = credit;
            resolutionForm.value = { invoice: '', dateReceived: new Date().toISOString().split('T')[0] };
            showResolutionModal.value = true;
            refreshIcons();
        };

        const submitResolution = async () => {
            if (!resolutionForm.value.invoice) return alert("Invoice / Memo number is required to resolve.");
            
            try {
                await updateDoc(doc(db, "promoCredits", resolutionCredit.value.id), { 
                    status: "Applied",
                    invoice: resolutionForm.value.invoice,
                    dateReceived: resolutionForm.value.dateReceived
                });
                
                await addDoc(collection(db, "emailHistories"), {
                    creditId: resolutionCredit.value.id,
                    vendor: resolutionCredit.value.vendor,
                    amount: resolutionCredit.value.amount,
                    site: resolutionCredit.value.site,
                    action: "Resolved (Applied)",
                    invoice: resolutionForm.value.invoice,
                    resolvedBy: loggedInUser.value,
                    timestamp: Date.now()
                });
                
                logSystemAction("UPDATE", `Resolved credit for ${resolutionCredit.value.vendor} (Memo: ${resolutionForm.value.invoice})`);
                showResolutionModal.value = false;
            } catch (error) {
                console.error(error);
                alert("Failed to resolve credit.");
            }
        };

        const monthlyReportSummaries = computed(() => {
            const groups = {};
            let baseCredits = promoCredits.value.filter(c => c && c.site === activeSite.value);
            
            if (activeMonth.value !== 'All') {
                baseCredits = baseCredits.filter(c => c.trackingMonth === activeMonth.value);
            }

            baseCredits.forEach(c => {
                const m = c.trackingMonth || 'Unknown';
                const vendorName = c.vendor || 'Unmapped Brand';
                
                if (!groups[m]) {
                    groups[m] = { month: m, total: 0, count: 0, credits: [], brands: {} };
                }
                
                if (!groups[m].brands[vendorName]) {
                    const brandInfo = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === vendorName.toLowerCase()) || {};
                    groups[m].brands[vendorName] = {
                        vendor: vendorName,
                        month: m,
                        email: brandInfo.email || '',
                        rep: brandInfo.rep || '',
                        credits: [],
                        total: 0
                    };
                }
                
                groups[m].brands[vendorName].credits.push(c);
                groups[m].brands[vendorName].total += (parseFloat(c.amount) || 0);
                groups[m].credits.push(c);
                groups[m].total += (parseFloat(c.amount) || 0);
                groups[m].count += 1;
            });

            return Object.values(groups)
                .sort((a, b) => calendarMonths.indexOf(a.month) - calendarMonths.indexOf(b.month))
                .map(group => ({
                    ...group,
                    brandList: Object.values(group.brands).sort((a, b) => a.vendor.localeCompare(b.vendor))
                }));
        });

        // REFACTORED FOR DIME REQUIREMENTS
        const downloadMonthlyReport = (report) => {
            let csvContent = "Location,Date & Time,Brand,Product Name,Transaction ID,Quantity Sold,Unit Price,Total Before Tax,Discount Title,Discount Amount,Credit Owed,Entry Type\n";
            let csvTotal = 0;
            const reportMonth = report.month || activeMonth.value;
            const cleanStr = (str) => String(str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
            const matchedRawSales = treesSalesData.value.filter(sale => {
                const brandMatch = cleanStr(sale.brand) === cleanStr(report.vendor);
                const siteMatch = cleanStr(sale.detectedSite) === cleanStr(activeSite.value);
                const monthMatch = cleanStr(sale.month) === cleanStr(reportMonth);
                return brandMatch && siteMatch && monthMatch;
            });

            if (matchedRawSales.length > 0) {
                matchedRawSales.forEach(sale => {
                    const safeLoc = `"${String(sale.detectedSite || '').replace(/"/g, '""')}"`;
                    const safeDate = `"${String(sale.dateClosed || '').replace(/"/g, '""')}"`;
                    const safeBrand = `"${String(sale.brand || '').replace(/"/g, '""')}"`;
                    const safeProd = `"${String(sale.productName || '').replace(/"/g, '""')}"`;
                    const safeTrack = `"${String(sale.trackingId || '').replace(/"/g, '""')}"`;
                    const safeQty = `"${sale.unitsSold || 0}"`;
                    const safePrice = `"${formatCurrency(sale.unitPrice || 0)}"`;
                    const safePreTax = `"${formatCurrency((sale.unitsSold || 0) * (sale.unitPrice || 0))}"`;
                    const safeDiscTitle = `"${String(sale.discountTitle || '').replace(/"/g, '""')}"`;
                    const safeDiscAmount = `"${formatCurrency(sale.discountAmount || 0)}"`;
                    const safeOwed = `"${formatCurrency(sale.owed || 0)}"`;
                    const safeType = `"POS Itemized"`;
                    
                    csvContent += `${safeLoc},${safeDate},${safeBrand},${safeProd},${safeTrack},${safeQty},${safePrice},${safePreTax},${safeDiscTitle},${safeDiscAmount},${safeOwed},${safeType}\n`;
                    csvTotal += parseFloat(sale.owed) || 0;
                });
            }

            const creditsToExport = report.credits || [];
            creditsToExport.forEach(c => {
                const isAggregated = c.creditType && String(c.creditType).includes('Aggregated POS Sales');
                if (!isAggregated) {
                    const safeLoc = `"${String(c.site || '').replace(/"/g, '""')}"`;
                    const safeDate = `"${String(c.dates || '').replace(/"/g, '""')}"`;
                    const safeBrand = `"${String(c.vendor || '').replace(/"/g, '""')}"`;
                    const safeProd = `"${String(c.creditType || '').replace(/"/g, '""')}"`; 
                    const safeTrack = `"${String(c.invoice || '').replace(/"/g, '""')}"`;
                    const safeQty = `"-"`;
                    const safePrice = `"-"`;
                    const safePreTax = `"-"`;
                    const safeDiscTitle = `"-"`;
                    const safeDiscAmount = `"-"`;
                    const safeOwed = `"${formatCurrency(c.amount)}"`;
                    const safeType = `"Manual Entry"`; 
                    
                    csvContent += `${safeLoc},${safeDate},${safeBrand},${safeProd},${safeTrack},${safeQty},${safePrice},${safePreTax},${safeDiscTitle},${safeDiscAmount},${safeOwed},${safeType}\n`;
                    csvTotal += parseFloat(c.amount) || 0;
                } else if (matchedRawSales.length === 0) {
                    const safeLoc = `"${String(c.site || '').replace(/"/g, '""')}"`;
                    const safeDate = `"${String(c.dates || '').replace(/"/g, '""')}"`;
                    const safeBrand = `"${String(c.vendor || '').replace(/"/g, '""')}"`;
                    const safeProd = `"${String(c.creditType || '').replace(/"/g, '""')}"`; 
                    const safeTrack = `"${String(c.invoice || '').replace(/"/g, '""')}"`;
                    const safeQty = `"-"`;
                    const safePrice = `"-"`;
                    const safePreTax = `"-"`;
                    const safeDiscTitle = `"-"`;
                    const safeDiscAmount = `"-"`;
                    const safeOwed = `"${formatCurrency(c.amount)}"`;
                    const safeType = `"Summary (Raw Data Missing)"`; 
                    
                    csvContent += `${safeLoc},${safeDate},${safeBrand},${safeProd},${safeTrack},${safeQty},${safePrice},${safePreTax},${safeDiscTitle},${safeDiscAmount},${safeOwed},${safeType}\n`;
                    csvTotal += parseFloat(c.amount) || 0;
                }
            });

            csvContent += `,,,,,,,,,, "TOTAL:", "${formatCurrency(csvTotal)}"\n`;

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            const currentYear = new Date().getFullYear();
            const reportName = report.vendor ? String(report.vendor).replace(/[^a-zA-Z0-9]/g, '_') : (reportMonth || 'Month');
            link.setAttribute("download", `${activeSite.value.replace(/\s/g, '_')}_Breakdown_${reportName}_${currentYear}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 150);

            logSystemAction("EXPORT", `Downloaded Detailed Report for ${reportName}`);
        };

        let chartMonthlyInstance = null;
        let chartDistrosInstance = null;
        let chartBrandsInstance = null;
        let chartStoresInstance = null;

        const drawCharts = () => {
            const activeCredits = promoCredits.value.filter(c => !c.archived);
            const currencyFormatter = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
            
            const customTooltip = {
                backgroundColor: '#111827', 
                titleColor: '#f59e0b', 
                titleFont: { size: 13, family: 'Calibri, sans-serif' },
                bodyFont: { size: 14, weight: 'bold', family: 'Calibri, sans-serif' },
                padding: 12,
                cornerRadius: 8,
                callbacks: { label: (ctx) => ` ${currencyFormatter(ctx.raw)}` }
            };

            const standardVerticalOptions = {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: customTooltip },
                scales: {
                    x: { grid: { display: false }, border: { display: false }, ticks: { font: { family: 'Calibri, sans-serif' }, color: '#64748b' } },
                    y: { grid: { color: '#e2e8f0', borderDash: [4, 4] }, border: { display: false }, ticks: { callback: currencyFormatter, font: { family: 'Calibri, sans-serif' }, color: '#64748b' } }
                }
            };

            const standardHorizontalOptions = {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: { legend: { display: false }, tooltip: customTooltip },
                scales: {
                    x: { grid: { color: '#e2e8f0', borderDash: [4, 4] }, border: { display: false }, ticks: { callback: currencyFormatter, font: { family: 'Calibri, sans-serif' }, color: '#64748b' } },
                    y: { grid: { display: false }, border: { display: false }, ticks: { font: { family: 'Calibri, sans-serif' }, color: '#64748b' } }
                }
            };

            const monthlySums = {};
            activeCredits.forEach(c => {
                const m = c.trackingMonth || 'Unknown';
                monthlySums[m] = (monthlySums[m] || 0) + (parseFloat(c.amount) || 0);
            });
            const sortedMonths = calendarMonths.filter(m => monthlySums[m] !== undefined);
            
            if(chartMonthlyInstance) chartMonthlyInstance.destroy();
            chartMonthlyInstance = new Chart(document.getElementById('chartMonthly'), {
                type: 'bar',
                data: { 
                    labels: sortedMonths, 
                    datasets: [{ 
                        data: sortedMonths.map(m => monthlySums[m]), 
                        backgroundColor: '#10b981', 
                        borderRadius: 6,
                        barPercentage: 0.65
                    }] 
                },
                options: standardVerticalOptions
            });

            const distroSums = {};
            activeCredits.forEach(c => {
                const d = (c.distributor || '').trim();
                if (d && d !== 'Trees POS Import' && d !== 'Auto-Imported' && d.toLowerCase() !== 'unmapped' && d !== '-') {
                    distroSums[d] = (distroSums[d] || 0) + (parseFloat(c.amount) || 0);
                }
            });
            const topDistros = Object.entries(distroSums).sort((a, b) => b[1] - a[1]).slice(0, 10);
            
            if(chartDistrosInstance) chartDistrosInstance.destroy();
            chartDistrosInstance = new Chart(document.getElementById('chartDistros'), {
                type: 'bar',
                data: { 
                    labels: topDistros.map(d => d[0]), 
                    datasets: [{ 
                        data: topDistros.map(d => d[1]), 
                        backgroundColor: '#f59e0b', 
                        borderRadius: 6,
                        barPercentage: 0.65
                    }] 
                },
                options: standardHorizontalOptions
            });

            const brandSums = {};
            activeCredits.forEach(c => {
                const b = (c.vendor || '').trim();
                if (b && b.toLowerCase() !== 'unmapped brand') {
                    brandSums[b] = (brandSums[b] || 0) + (parseFloat(c.amount) || 0);
                }
            });
            const topBrands = Object.entries(brandSums).sort((a, b) => b[1] - a[1]).slice(0, 10);
            
            if(chartBrandsInstance) chartBrandsInstance.destroy();
            chartBrandsInstance = new Chart(document.getElementById('chartBrands'), {
                type: 'bar',
                data: { 
                    labels: topBrands.map(b => b[0]), 
                    datasets: [{ 
                        data: topBrands.map(b => b[1]), 
                        backgroundColor: '#10b981', 
                        borderRadius: 6,
                        barPercentage: 0.65
                    }] 
                },
                options: standardHorizontalOptions
            });

            const storeSums = {};
            activeCredits.forEach(c => {
                const s = c.site || 'Unknown';
                storeSums[s] = (storeSums[s] || 0) + (parseFloat(c.amount) || 0);
            });
            
            if(chartStoresInstance) chartStoresInstance.destroy();
            chartStoresInstance = new Chart(document.getElementById('chartStores'), {
                type: 'doughnut',
                data: { 
                    labels: Object.keys(storeSums), 
                    datasets: [{ 
                        data: Object.values(storeSums), 
                        backgroundColor: ['#10b981', '#f59e0b', '#64748b', '#111827'], 
                        borderWidth: 0 
                    }] 
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '75%',
                    plugins: { 
                        tooltip: customTooltip, 
                        legend: { position: 'bottom', labels: { font: { family: 'Calibri, sans-serif' }, color: '#475569', padding: 20 } } 
                    }
                }
            });
        };

                watch(activeTab, (newTab) => {
            if (newTab === 'Dashboard') {
                nextTick(() => { drawCharts(); });
            }
            if (newTab === 'Ledger') {
                refreshLedger();
            }
        });


        watch(promoCredits, () => {
            if (activeTab.value === 'Dashboard') { drawCharts(); }
        }, { deep: true });

        const groupedPendingReports = computed(() => {
            if (!promoCredits.value) return [];
            let pending = promoCredits.value.filter(c => c && c.site === activeSite.value && (c.status || '').toLowerCase() === 'pending' && c.archived !== true);
            if (activeMonth.value !== 'All') {
                pending = pending.filter(c => c.trackingMonth === activeMonth.value);
            }

            const groups = {};
            pending.forEach(c => {
                const vendorName = c.vendor || 'Unmapped Brand';
                if (!groups[vendorName]) {
                    const brandInfo = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === vendorName.toLowerCase()) || {};
                    groups[vendorName] = { vendor: vendorName, email: brandInfo.email || '', rep: brandInfo.rep || '', credits: [], total: 0 };
                }
                groups[vendorName].credits.push(c);
                groups[vendorName].total += (parseFloat(c.amount) || 0);
            });
            return Object.values(groups).sort((a, b) => a.vendor.localeCompare(b.vendor));
        });

        // EMAIL DRAFTER WITH DIME COLUMNS, REDDING SUNDIAL SUBJECT, RESTRICTED CC & VARIABLE FIX
        const draftEmail = (report) => {
            if (!report.email) {
                alert(`No email mapped for ${report.vendor}. Please add one in the Brand Directory first.`);
                return;
            }

            const storeName = activeSite.value === 'Redding' ? 'Sundial' : activeSite.value;
            const currentYear = new Date().getFullYear();
            const monthStr = report.month || (report.credits[0] && report.credits[0].trackingMonth) || activeMonth.value;
            const periodStr = `${monthStr} ${currentYear}`;
            const cleanStr = (str) => String(str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

            let csvContent = "Location,Date & Time,Brand,Product Name,Transaction ID,Quantity Sold,Unit Price,Total Before Tax,Discount Title,Discount Amount,Credit Owed,Entry Type\n";
            let csvTotal = 0;

            const matchedRawSales = treesSalesData.value.filter(sale => {
                const brandMatch = cleanStr(sale.brand) === cleanStr(report.vendor);
                const siteMatch = cleanStr(sale.detectedSite) === cleanStr(activeSite.value);
                const monthMatch = cleanStr(sale.month) === cleanStr(monthStr);
                return brandMatch && siteMatch && monthMatch;
            });

            if (matchedRawSales.length > 0) {
                matchedRawSales.forEach(sale => {
                    const safeLoc = `"${String(sale.detectedSite || '').replace(/"/g, '""')}"`;
                    const safeDate = `"${String(sale.dateClosed || '').replace(/"/g, '""')}"`;
                    const safeBrand = `"${String(sale.brand || '').replace(/"/g, '""')}"`;
                    const safeProd = `"${String(sale.productName || '').replace(/"/g, '""')}"`;
                    const safeTrack = `"${String(sale.trackingId || '').replace(/"/g, '""')}"`;
                    const safeQty = `"${sale.unitsSold || 0}"`;
                    const safePrice = `"${formatCurrency(sale.unitPrice || 0)}"`;
                    const safePreTax = `"${formatCurrency((sale.unitsSold || 0) * (sale.unitPrice || 0))}"`;
                    const safeDiscTitle = `"${String(sale.discountTitle || '').replace(/"/g, '""')}"`;
                    const safeDiscAmount = `"${formatCurrency(sale.discountAmount || 0)}"`;
                    const safeOwed = `"${formatCurrency(sale.owed || 0)}"`;
                    const safeType = `"POS Itemized"`;
                    
                    csvContent += `${safeLoc},${safeDate},${safeBrand},${safeProd},${safeTrack},${safeQty},${safePrice},${safePreTax},${safeDiscTitle},${safeDiscAmount},${safeOwed},${safeType}\n`;
                    csvTotal += parseFloat(sale.owed) || 0;
                });
            }

            report.credits.forEach(c => {
                const isAggregated = c.creditType && String(c.creditType).includes('Aggregated POS Sales');
                if (!isAggregated) {
                    const safeLoc = `"${String(c.site || '').replace(/"/g, '""')}"`;
                    const safeDate = `"${String(c.dates || '').replace(/"/g, '""')}"`;
                    const safeBrand = `"${String(c.vendor || '').replace(/"/g, '""')}"`;
                    const safeProd = `"${String(c.creditType || '').replace(/"/g, '""')}"`; 
                    const safeTrack = `"${String(c.invoice || '').replace(/"/g, '""')}"`;
                    const safeQty = `"-"`;
                    const safePrice = `"-"`;
                    const safePreTax = `"-"`;
                    const safeDiscTitle = `"-"`;
                    const safeDiscAmount = `"-"`;
                    const safeOwed = `"${formatCurrency(c.amount)}"`;
                    const safeType = `"Manual Entry"`; 
                    
                    csvContent += `${safeLoc},${safeDate},${safeBrand},${safeProd},${safeTrack},${safeQty},${safePrice},${safePreTax},${safeDiscTitle},${safeDiscAmount},${safeOwed},${safeType}\n`;
                    csvTotal += parseFloat(c.amount) || 0;
                } else if (matchedRawSales.length === 0) {
                    const safeLoc = `"${String(c.site || '').replace(/"/g, '""')}"`;
                    const safeDate = `"${String(c.dates || '').replace(/"/g, '""')}"`;
                    const safeBrand = `"${String(c.vendor || '').replace(/"/g, '""')}"`;
                    const safeProd = `"${String(c.creditType || '').replace(/"/g, '""')}"`; 
                    const safeTrack = `"${String(c.invoice || '').replace(/"/g, '""')}"`;
                    const safeQty = `"-"`;
                    const safePrice = `"-"`;
                    const safePreTax = `"-"`;
                    const safeDiscTitle = `"-"`;
                    const safeDiscAmount = `"-"`;
                    const safeOwed = `"${formatCurrency(c.amount)}"`;
                    const safeType = `"Summary (Raw Data Missing)"`; 
                    
                    csvContent += `${safeLoc},${safeDate},${safeBrand},${safeProd},${safeTrack},${safeQty},${safePrice},${safePreTax},${safeDiscTitle},${safeDiscAmount},${safeOwed},${safeType}\n`;
                    csvTotal += parseFloat(c.amount) || 0;
                }
            });

            csvContent += `,,,,,,,,,, "TOTAL:", "${formatCurrency(csvTotal)}"\n`;

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            
            const cleanVendorName = String(report.vendor || 'Vendor').replace(/[^a-zA-Z0-9]/g, '_');
            const cleanPeriodStr = String(periodStr || '').replace(/\s/g, '_');
            link.setAttribute("download", `${cleanVendorName}_${storeName}_Credits_${cleanPeriodStr}.csv`);
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 150);

            const cleanEmails = String(report.email || '').split(/[,;\s]+/).map(e => e.trim()).filter(Boolean).join(',');
            const senderEmail = 'nicholas.grace@rredco.com';
            
            const subjectStoreName = activeSite.value === 'Redding' ? 'Redding Sundial' : activeSite.value;
            const subject = `credit report - ${subjectStoreName} promotions ${periodStr}`;

            let body = `Hello ${report.vendor || 'Vendor'},\n\n`;
            body += `Please see the attached itemized breakdown for vendor credits owed to ${storeName} for ${periodStr}.\n\n`;
            body += `The total amount for this period is ${formatCurrency(csvTotal)}.\n\n`;
            body += `Please review the attached CSV and let us know if you have any questions or when we can expect the credit to be applied to our account.\n\n`;
            body += `Best regards,\n\n`;
            body += `${storeName} Accounting Team\n`;
            body += `Nicholas Grace (${senderEmail})\n`;
            body += `(530)560-6624 - Office\n`;

            const encodedSubject = encodeURIComponent(subject);
            const encodedBody = encodeURIComponent(body);
            const encodedCc = encodeURIComponent(`accounting@rredco.com`);

            window.location.href = `mailto:${cleanEmails}?cc=${encodedCc}&subject=${encodedSubject}&body=${encodedBody}`;
        };

        const archiveAndExportAnnualReport = async () => {
            const creditsToArchive = promoCredits.value.filter(c => 
                (c.status === 'Applied' || c.status === 'Uncollectable') && c.archived !== true
            );

            if (creditsToArchive.length === 0) {
                alert("There are no resolved credits to archive! (Pending credits cannot be archived).");
                return;
            }

            if (!confirm(`You are about to export and archive ${creditsToArchive.length} resolved credits. They will be removed from your active tracker. Proceed?`)) {
                return;
            }

            let csvContent = "Site,Tracking Month,Vendor,Distributor,Credit Type,Dates,Credit Amount,Date Requested,Date Received,Invoice,Status,Archived Date\n";
            let csvTotal = 0;
            
            creditsToArchive.forEach(c => {
                const safeSite = `"${String(c.site || '').replace(/"/g, '""')}"`;
                const safeMonth = `"${String(c.trackingMonth || '').replace(/"/g, '""')}"`;
                const safeVendor = `"${String(c.vendor || '').replace(/"/g, '""')}"`;
                const safeDist = `"${String(c.distributor || '').replace(/"/g, '""')}"`;
                const safeType = `"${String(c.creditType || '').replace(/"/g, '""')}"`;
                const safeDates = `"${String(c.dates || '').replace(/"/g, '""')}"`;
                const safeAmount = `"${formatCurrency(c.amount)}"`;
                const safeReq = `"${String(c.dateRequested || '').replace(/"/g, '""')}"`;
                const safeRec = `"${String(c.dateReceived || '').replace(/"/g, '""')}"`;
                const safeInvoice = `"${String(c.invoice || '').replace(/"/g, '""')}"`;
                const safeStatus = `"${String(c.status || '').replace(/"/g, '""')}"`;
                const archiveDate = `"${new Date().toLocaleDateString()}"`;
                
                csvContent += `${safeSite},${safeMonth},${safeVendor},${safeDist},${safeType},${safeDates},${safeAmount},${safeReq},${safeRec},${safeInvoice},${safeStatus},${archiveDate}\n`;
                csvTotal += parseFloat(c.amount) || 0;
            });

            csvContent += `,,,,,, "TOTAL:", "${formatCurrency(csvTotal)}"\n`;

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            const currentYear = new Date().getFullYear();
            link.setAttribute("download", `Master_Annual_Report_${currentYear}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 150);

            try {
                const batch = writeBatch(db);
                creditsToArchive.forEach(c => {
                    const docRef = doc(db, "promoCredits", c.id);
                    batch.update(docRef, { archived: true, archivedAt: Date.now() });
                });
                await batch.commit();
                
                logSystemAction("ARCHIVE", `Archived & Exported ${creditsToArchive.length} records totaling ${formatCurrency(csvTotal)}`);
                
                alert(`Success! Master spreadsheet downloaded and ${creditsToArchive.length} records safely archived.`);
            } catch (error) {
                console.error("Archive Error:", error);
                alert("Failed to archive records in the cloud.");
            }
        };

        const exportVendorsAndBrandsCSV = () => {
            if (!masterBrands.value || masterBrands.value.length === 0) {
                alert("No brands available to export.");
                return;
            }

            // Group brands by distributor (Vendor)
            const grouped = {};
            masterBrands.value.forEach(b => {
                const distro = b.distributor ? b.distributor.trim() : 'Unassigned Vendor';
                const brand = b.vendor ? b.vendor.trim() : 'Unknown Brand';

                if (!grouped[distro]) {
                    grouped[distro] = [];
                }
                grouped[distro].push(brand);
            });

            // Sort the distributors alphabetically
            const sortedDistros = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

            // Create CSV headers
            let csvContent = "Vendor/Distributor,Attached Brand\n";

            // Populate rows
            sortedDistros.forEach(distro => {
                const sortedBrands = grouped[distro].sort((a, b) => a.localeCompare(b));
                
                sortedBrands.forEach(brand => {
                    const safeDistro = `"${distro.replace(/"/g, '""')}"`;
                    const safeBrand = `"${brand.replace(/"/g, '""')}"`;
                    csvContent += `${safeDistro},${safeBrand}\n`;
                });
            });

            // Trigger download
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            const currentYear = new Date().getFullYear();
            link.setAttribute("download", `Vendors_and_Brands_Directory_${currentYear}.csv`);
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 150);

            logSystemAction("EXPORT", "Downloaded Vendors and Brands Directory CSV");
        };

        const showImportModal = ref(false);
        const rawPasteData = ref('');
        const pastedGrid = ref([]);
        const mappedHeaders = ref([]);
        
        const showBrandImportModal = ref(false);
        const brandPasteData = ref('');
        const brandPastedGrid = ref([]);
        const brandMappedHeaders = ref([]);
        const brandAvailableHeaders = ref([
            '-- Ignore Column --', 'Brand', 'Rep', 'Email', 'Name as appears in TREES',
            'Distro', 'Asset Library', 'Order From', 'Payee', 'Notes'
        ]);
        
        const availableHeaders = ref([
            '-- Ignore Column --', 'Tracking Month', 'Vendor', 'Distributor', 'Credit Type',
            'Dates', 'Credit amount $$$', 'Date requested', 'Date received', 'Invoice / Credit Memo', 'Status'
        ]);
        
        const getEmptyForm = () => ({ 
            trackingMonth: activeMonth.value === 'All' ? 'August' : activeMonth.value,
            vendor: '', distributor: '', creditType: '', dates: '', 
            amount: '', dateRequested: '', dateReceived: '', 
            invoice: '', status: 'Pending', attachmentName: '', attachmentData: null 
        });
        
        const form = ref(getEmptyForm());
        let unsubscribeBrands = null;

                const showWorkspaceMenu = ref(false);
                const showAdminMenu = ref(false);


                const brandAuditData = computed(() => {
                    const start = auditRange.value.start ? new Date(auditRange.value.start) : null;
                    const end = auditRange.value.end ? new Date(auditRange.value.end) : null;
            
                    const brandMap = {};
            
                    promoCredits.value.forEach(c => {
                        if (c.site !== activeSite.value || c.archived) return;
                
                        // Use dateRequested or created timestamp for date range filtering
                        const cDate = c.dateRequested ? new Date(c.dateRequested) : new Date(c.createdAt || 0);
                        if (start && cDate < start) return;
                        if (end && cDate > end) return;
                
                        const v = c.vendor || 'Unknown Brand';
                        if (!brandMap[v]) {
                            const brandInfo = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === v.toLowerCase()) || {};
                            brandMap[v] = {
                                vendor: v,
                                email: brandInfo.email || '',
                                rep: brandInfo.rep || '',
                                generated: 0,
                                recovered: 0,
                                credits: []
                            };
                        }
                
                        brandMap[v].generated += (parseFloat(c.amount) || 0);
                        if (c.status === 'Applied') {
                            brandMap[v].recovered += (parseFloat(c.amount) || 0);
                        }
                        brandMap[v].credits.push(c);
                    });
            
                    return Object.values(brandMap).sort((a, b) => (b.generated - b.recovered) - (a.generated - a.recovered));
                });

                const draftAuditEmail = (brand) => {
                    if (!brand.email) return alert("No email found for this brand.");
            
                    const storeName = activeSite.value === 'Redding' ? 'Sundial' : activeSite.value;
                    const period = (auditRange.value.start && auditRange.value.end) 
                        ? `${auditRange.value.start} to ${auditRange.value.end}`
                        : "Year to Date";

                    const subject = `Promo Credit Audit Report - ${storeName} - ${brand.vendor}`;
            
                    let body = `Hello ${brand.rep || brand.vendor},\n\n`;
                    body += `This is a formal audit report for promo credits associated with ${brand.vendor} at ${storeName} for the period of ${period}.\n\n`;
                    body += `Summary of Account:\n`;
                    body += `- Total Credits Generated: ${formatCurrency(brand.generated)}\n`;
                    body += `- Total Credits Recovered: ${formatCurrency(brand.recovered)}\n`;
                    body += `- Outstanding Balance: ${formatCurrency(brand.generated - brand.recovered)}\n\n`;
            
                    body += `Itemized Outstanding Credits:\n`;
                    brand.credits.filter(c => c.status !== 'Applied').forEach(c => {
                        body += `- ${c.trackingMonth}: ${c.creditType} (${c.dates}) - ${formatCurrency(c.amount)}\n`;
                    });
            
                    body += `\nPlease review this statement and let us know if there are any discrepancies.\n\n`;
                    body += `Best regards,\n\n${storeName} Accounting Team\n`;

                    const cleanEmails = brand.email.split(/[,;\s]+/).filter(Boolean).join(',');
                    window.location.href = `mailto:${cleanEmails}?cc=accounting@rredco.com&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                };

                const workspaceTabs = [
                    { name: 'Dashboard', icon: 'bar-chart-2', group: 'Workbook' },
                    { name: 'WorkbookViewer', icon: 'file-spreadsheet', label: 'Complete Workbook', group: 'Workbook' },
                    { name: 'Sales', icon: 'inbox', label: 'Discovery Intake', group: 'Workbook' },
                    { name: 'Recovery', icon: 'dollar-sign', group: 'Workbook' },
                    { name: 'Ledger', icon: 'book-open', group: 'Workbook' },
                    { name: 'Reports', icon: 'building', label: 'Store Rec', group: 'Workbook' },
                    { name: 'BrandAudit', icon: 'clipboard-check', label: 'Brand Audit', group: 'Workbook' },
                    { name: 'Validation', icon: 'check-square', label: 'Workbook Validation', group: 'Workbook' },
                    { name: 'Tracker', icon: 'clock', label: 'Legacy Tracker', group: 'Workbook' },
                    { name: 'VendorMapping', icon: 'network', group: 'Identity' },
                    { name: 'Brands', icon: 'book-user', label: 'Brand Directory', group: 'Identity' },
                    { name: 'RepTracker', icon: 'contact', group: 'Identity' },
                    { name: 'MappingQueue', icon: 'list-todo', group: 'Identity' },
                    { name: 'Logs', icon: 'activity', group: 'Admin' }
                ];


        const selectWorkspace = (tab) => {
            activeTab.value = tab.name;
            showWorkspaceMenu.value = false;
            refreshIcons();
        };

        const activeWorkspaceInfo = computed(() => {
            return workspaceTabs.find(t => t.name === activeTab.value) || workspaceTabs[0];
        });

        const masterWorkbook = ref(null);
        const workbookSchema = {
            "Board Recon - Red Bluff": ["Red Bluff - YTD Promo Reconciliation"],
            "Board Recon - Redding": ["Redding - YTD Promo Reconciliation"],
            "YTD Dashboard": ["Month", "Master Tracked", "Treez Valid POS", "Sage Collected"],
            "Brand_Mapping": ["Master Workbook Legacy Name", "Standardized POS Name (CSV)"],
            "YTD Running Totals": ["Brand", "Redding", "Red-Bluff", "Running Total Promo Credits", "Combined Brand Total"],
            "January 2026": ["Brand", "Redding", "Red-Bluff", "Promo Credits ", "Date Requested", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total", "Month promo credits were generated"],
            "February 2026": ["Brand", "Redding", "Red-Bluff", "Promo Credits ", "Date Requested", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total", "Month promo credits were generated"],
            "March 2026": ["Brand", "Redding", "Red-Bluff", "Promo Credits ", "Date Requested", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total", "Month promo credits were generated"],
            "April 2026": ["Brand", "Redding", "Red-Bluff", "Promo Credits ", "Date Requested", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total", "Month promo credits were generated"],
            "May 2026": ["Brand", "Redding", "Red-Bluff", "Promo Credits ", "Date Requested", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total", "Month promo credits were generated"],
            "June 2026": ["Brand", "Redding", "Red-Bluff", "Promo Credits ", "Date Requested", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total", "Month promo credits were generated"],
            "July 2026": ["Brand", "Redding", "Red-Bluff", "Promo Credits ", "Date Requested", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total", "Month promo credits were generated"],
            "August 2026": ["Brand", "Redding", "Red-Bluff", "Promo Credits ", "Date Requested", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total", "Month promo credits were generated"],
            "September 2026": ["Brand", "Redding", "Red-Bluff", "Promo Credits ", "Date Requested", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total", "Month promo credits were generated"],
            "October 2026": ["Brand", "Redding", "Red-Bluff", "Promo Credits ", "Date Requested", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total", "Month promo credits were generated"],
            "November 2026": ["Brand", "Redding", "Red-Bluff", "Promo Credits ", "Date Requested", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total", "Month promo credits were generated"],
            "December 2026": ["Brand", "Redding", "Red-Bluff", "Promo Credits ", "Date Requested", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total", "Month promo credits were generated"],
            "Store Macro Summary": ["Store", "YTD Generated (POS)", "YTD Received (GL)", "Outstanding Balance"],
            "Redding Store Audit": ["Brand", "Store", "YTD Generated (POS)", "YTD Received (GL)", "Outstanding Balance"],
            "Red Bluff Store Audit": ["Brand", "Store", "YTD Generated (POS)", "YTD Received (GL)", "Outstanding Balance"],
            "GL Raw by Store": ["Posted dt.", "Store", "Location", "Memo/Description", "Credit", "Mapped Brand"],
            "Monthly Vendor Variance Report": ["Brand", "January Generated", "January Collected", "January Left on Table", "February Generated", "February Collected", "February Left on Table", "March Generated", "March Collected", "March Left on Table", "April Generated", "April Collected", "April Left on Table", "May Generated", "May Collected", "May Left on Table", "June Generated", "June Collected", "June Left on Table", "July Generated", "July Collected", "July Left on Table", "August Generated", "August Collected", "August Left on Table", "September Generated", "September Collected", "September Left on Table", "October Generated", "October Collected", "October Left on Table", "November Generated", "November Collected", "November Left on Table", "December Generated", "December Collected", "December Left on Table", "YTD Generated", "YTD Collected", "YTD Left on Table"],
            "Sheet1": ["Vendor", "Distributor", "Credit Type", "Dates", "Credit amount $$$"]
        };
        const activeWorkbookSheet = ref(Object.keys(workbookSchema)[0]);
        const isWorkbookLoaded = ref(false);



        onMounted(() => {
            refreshIcons();

            onAuthStateChanged(auth, (user) => {
                showImportModal.value = false;
                showBrandImportModal.value = false;

                if (!user) {
                    isManagerUnlocked.value = false;
                    loggedInUser.value = '';
                    return;
                }

                const userEmail = user.email.toLowerCase();
                const managerData = systemUsers[userEmail];

                                if (managerData && managerData.active) {
                    loggedInUser.value = managerData.name;
                    activeSite.value = managerData.access[0];
                    isManagerUnlocked.value = true;
                    isSuperAdmin.value = !!managerData.superAdmin;

                    
                    onSnapshot(doc(db, "promo tracker", "Master_Workbook_V9_Board_Report"), (docSnap) => {
                        if (docSnap.exists()) {
                            masterWorkbook.value = docSnap.data();
                        }
                    });

                                        onSnapshot(collection(db, "brands"), (snapshot) => {
                        const fetchedBrands = [];
                        snapshot.forEach(docSnap => { fetchedBrands.push({ id: docSnap.id, ...docSnap.data() }); });
                        fetchedBrands.sort((a, b) => (a.vendor || '').localeCompare(b.vendor || ''));
                        masterBrands.value = fetchedBrands;
                    }, (error) => {
                        console.error("Brands Snapshot Error:", error);
                    });

                    onSnapshot(query(collection(db, "treesSales"), where("detectedSite", "==", activeSite.value)), (snapshot) => {
                        const fetchedSales = [];
                        snapshot.forEach(docSnap => { fetchedSales.push({ id: docSnap.id, ...docSnap.data() }); });
                        treesSalesData.value = fetchedSales;
                    }, (error) => {
                        console.error("TreesSales Snapshot Error:", error);
                    });

                    onSnapshot(query(collection(db, "promoCredits"), where("site", "==", activeSite.value)), (snapshot) => {
                        const fetchedCredits = [];
                        snapshot.forEach(docSnap => { fetchedCredits.push({ id: docSnap.id, ...docSnap.data() }); });
                        promoCredits.value = fetchedCredits;
                    }, (error) => {
                        console.error("PromoCredits Snapshot Error:", error);
                    });


                    if (managerData.superAdmin) {
                        onSnapshot(collection(db, "systemLogs"), (snapshot) => {
                            const logs = [];
                            snapshot.forEach(docSnap => { logs.push({ id: docSnap.id, ...docSnap.data() }); });
                            logs.sort((a, b) => b.timestamp - a.timestamp);
                            systemLogs.value = logs;
                        });
                    }
                }
            });
        });

        const handleLogin = () => {
            authError.value = '';
            signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value)
                .then(() => { emailInput.value = ''; passwordInput.value = ''; refreshIcons(); })
                .catch((error) => { authError.value = "Invalid email or password."; });
        };

        const forceLock = () => { signOut(auth).then(() => { isManagerUnlocked.value = false; loggedInUser.value = ''; }); };

        const filteredBrands = computed(() => {
            const query = (form.value.vendor || '').toLowerCase();
            if (!query) return masterBrands.value;
            return masterBrands.value.filter(b => (b.vendor || '').toLowerCase().includes(query));
        });

        const selectBrand = (brand) => {
            form.value.vendor = brand.vendor;
            form.value.distributor = brand.distributor;
            showBrandDropdown.value = false;
        };

        const formatCurrency = (val) => {
            const num = parseFloat(val);
            if (isNaN(num)) return '$0.00';
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
        };
        
        const detectMonthFromDate = (dateString) => {
            if (!dateString) return 'Unknown';
            const d = new Date(dateString);
            if (isNaN(d.getTime())) return 'Unknown';
            return calendarMonths[d.getMonth()];
        };

        const detectSiteFromName = (storeNameStr) => {
            if (!storeNameStr) return activeSite.value; 
            const s = storeNameStr.toLowerCase();
            if (s.includes('red bluff') || s.includes('redbluff')) return 'Red Bluff';
            if (s.includes('redding') || s.includes('sundial')) return 'Redding';
            return activeSite.value; 
        };

        const filteredCredits = computed(() => {
            let base = promoCredits.value.filter(c => c && c.site === activeSite.value && c.archived !== true);
            if (activeMonth.value !== 'All') base = base.filter(c => c.trackingMonth === activeMonth.value);
            if (searchQuery.value.trim() !== '') {
                const q = searchQuery.value.toLowerCase();
                base = base.filter(c => 
                    ((c.vendor || '').toLowerCase().includes(q)) ||
                    ((c.distributor || '').toLowerCase().includes(q)) ||
                    ((c.invoice || '').toLowerCase().includes(q)) ||
                    ((c.creditType || '').toLowerCase().includes(q))
                );
            }
            return base.map(c => {
                const isMapped = masterBrands.value.some(b => (b.vendor || '').toLowerCase() === (c.vendor || '').toLowerCase());
                return { ...c, needsMapping: !isMapped };
            });
        });

        const filteredTreesSalesData = computed(() => {
            let base = treesSalesData.value; 
            if (activeMonth.value !== 'All') base = base.filter(sale => sale.month === activeMonth.value);
            if (searchQuery.value.trim() !== '') {
                const q = searchQuery.value.toLowerCase();
                base = base.filter(sale => 
                    ((sale.brand || '').toLowerCase().includes(q)) ||
                    ((sale.productName || '').toLowerCase().includes(q)) ||
                    ((sale.discountTitle || '').toLowerCase().includes(q)) ||
                    ((sale.trackingId || '').toLowerCase().includes(q)) ||
                    ((sale.detectedSite || '').toLowerCase().includes(q))
                );
            }
            return base;
        });

                const displayTreesSalesData = computed(() => filteredTreesSalesData.value.slice(0, 100));
        
        const totalTreesOwedYTD = computed(() => treesSalesData.value.filter(s => s.detectedSite === activeSite.value).reduce((sum, s) => sum + (parseFloat(s.owed) || 0), 0));
        const totalTreesPending = computed(() => treesSalesData.value.filter(s => s.detectedSite === activeSite.value && s.status === 'Unsynced').reduce((sum, s) => sum + (parseFloat(s.owed) || 0), 0));
        
        const totalPending = computed(() => filteredCredits.value.filter(c => c.status === 'Pending').reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0));

        const totalApplied = computed(() => filteredCredits.value.filter(c => c.status === 'Applied').reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0));
        
        const unsyncedSalesCount = computed(() => filteredTreesSalesData.value.filter(s => s.status === 'Unsynced').length);

        const openPromoModal = () => { form.value = getEmptyForm(); editingId.value = null; showPromoModal.value = true; refreshIcons(); };
        const closePromoModal = () => { showPromoModal.value = false; showBrandDropdown.value = false; };

        const handleFileUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            if (file.size > 800000) return alert("File is too large. Please keep attachments under 800KB.");
            form.value.attachmentName = file.name;
            form.value.attachmentData = "mock_file_data"; 
        };

        const saveCredit = async () => {
            if (!form.value.vendor) return alert("Vendor (Brand) is required.");
            if (!form.value.trackingMonth) return alert("Tracking Month is required.");
            const payload = { ...form.value, site: activeSite.value, createdAt: Date.now() };
            try {
                if (editingId.value) await updateDoc(doc(db, "promoCredits", editingId.value), payload);
                else await addDoc(collection(db, "promoCredits"), payload);
                closePromoModal();
            } catch (error) { alert("Failed to save to Firebase."); }
        };

        const editCredit = (credit) => { form.value = { ...credit }; editingId.value = credit.id; showPromoModal.value = true; refreshIcons(); };
        const deleteCredit = async () => {
            if (confirm("Are you sure you want to permanently delete this credit?")) {
                try { await deleteDoc(doc(db, "promoCredits", editingId.value)); closePromoModal(); } 
                catch (error) { console.error("Error deleting:", error); }
            }
        };
        
        const openImportModal = () => { resetImport(); showImportModal.value = true; refreshIcons(); };
        const closeImportModal = () => { showImportModal.value = false; };
        const resetImport = () => { pastedGrid.value = []; mappedHeaders.value = []; rawPasteData.value = ''; };

        const displayGrid = computed(() => {
            if (pastedGrid.value.length === 0) return [];
            return pastedGrid.value.slice(2, 22);
        });
        
        const detectMonthInString = (str) => {
            if (!str) return null;
            const cleanStr = str.toLowerCase();
            return calendarMonths.find(m => cleanStr.includes(m.toLowerCase())) || null;
        };

        const processRawPaste = () => {
            const text = rawPasteData.value;
            if (!text.trim()) return;
            const rows = text.split('\n').filter(r => r.trim() !== '');
            const grid = rows.map(r => r.split('\t').map(c => c.trim()));
            if (grid.length < 3) return; 
            pastedGrid.value = grid;
            mappedHeaders.value = grid[1].map(cell => {
                const lowerCell = cell.toLowerCase();
                const match = availableHeaders.value.find(h => h !== '-- Ignore Column --' && lowerCell.includes(h.toLowerCase()));
                return match || '-- Ignore Column --';
            });
        };

        const headerToFormKey = {
            'Tracking Month': 'trackingMonth', 'Vendor': 'vendor', 'Distributor': 'distributor',
            'Credit Type': 'creditType', 'Dates': 'dates', 'Credit amount $$$': 'amount',
            'Date requested': 'dateRequested', 'Date received': 'dateReceived',
            'Invoice / Credit Memo': 'invoice', 'Status': 'status'
        };

        const processImport = async () => {
            let importedCount = 0;
            const superHeaders = pastedGrid.value[0];
            const batch = writeBatch(db); 
            
            for (let r = 2; r < pastedGrid.value.length; r++) {
                const row = pastedGrid.value[r];
                let currentCredit = getEmptyForm();
                let hasData = false;
                let seenHeadersInChunk = new Set();
                let currentChunkMonth = 'Unknown';
                
                for (let c = 0; c < row.length; c++) {
                    const detectedMonth = detectMonthInString(superHeaders[c]);
                    if (detectedMonth) currentChunkMonth = detectedMonth;

                    const header = mappedHeaders.value[c];
                    if (header === '-- Ignore Column --') continue;
                    
                    if (seenHeadersInChunk.has(header)) {
                        if (hasData && currentCredit.vendor) {
                            currentCredit.site = activeSite.value;
                            currentCredit.trackingMonth = currentChunkMonth !== 'Unknown' ? currentChunkMonth : (activeMonth.value === 'All' ? 'August' : activeMonth.value);
                            currentCredit.amount = parseFloat(String(currentCredit.amount).replace(/[^0-9.-]+/g,"")) || 0;
                            currentCredit.createdAt = Date.now();
                            const newDocRef = doc(collection(db, "promoCredits"));
                            batch.set(newDocRef, currentCredit);
                            importedCount++;
                        }
                        currentCredit = getEmptyForm();
                        hasData = false;
                        seenHeadersInChunk.clear();
                    }
                    
                    const val = row[c];
                    if (val) hasData = true;
                    
                    const key = headerToFormKey[header];
                    if (key) {
                        currentCredit[key] = val;
                        seenHeadersInChunk.add(header);
                        if (key === 'vendor' && val) {
                            if (!masterBrands.value.find(b => (b.vendor || '').toLowerCase() === val.toLowerCase())) {
                                const newBrandRef = doc(collection(db, "brands"));
                                batch.set(newBrandRef, { vendor: val, distributor: 'Auto-Imported' });
                            }
                        }
                    }
                }
                
                if (hasData && currentCredit.vendor) {
                    currentCredit.site = activeSite.value;
                    currentCredit.trackingMonth = currentChunkMonth !== 'Unknown' ? currentChunkMonth : (activeMonth.value === 'All' ? 'August' : activeMonth.value);
                    currentCredit.amount = parseFloat(String(currentCredit.amount).replace(/[^0-9.-]+/g,"")) || 0;
                    currentCredit.createdAt = Date.now();
                    const newDocRef = doc(collection(db, "promoCredits"));
                    batch.set(newDocRef, currentCredit);
                    importedCount++;
                }
            }
            
            try {
                await batch.commit();
                alert(`Successfully extracted and saved ${importedCount} promo credits to Firebase!`);
                closeImportModal();
                refreshIcons();
            } catch (err) { alert("Failed to save import to cloud."); }
        };

        const regenerateBrandSummary = async (brandReport) => {
            if (!confirm(`This will delete current aggregated summaries for ${brandReport.vendor} in ${brandReport.month} and re-calculate them from raw sales data. Continue?`)) return;
            await runRegeneration([brandReport], brandReport.month);
        };

        const regenerateMonthReports = async (monthGroup) => {
            if (!confirm(`This will re-calculate summaries for ALL brands in ${monthGroup.month}. This ensures all reports use the latest itemized data. Proceed?`)) return;
            await runRegeneration(monthGroup.brandList, monthGroup.month);
        };

        const runRegeneration = async (brandList, month) => {
            try {
                const batch = writeBatch(db);
                let workFound = false;

                for (const brand of brandList) {
                    const existingAggregated = promoCredits.value.filter(c => 
                        c.site === activeSite.value && 
                        c.trackingMonth === month && 
                        (c.vendor || '').toLowerCase() === (brand.vendor || '').toLowerCase() &&
                        c.creditType && String(c.creditType).includes('Aggregated POS Sales')
                    );
            
                    existingAggregated.forEach(c => {
                        batch.delete(doc(db, "promoCredits", c.id));
                        workFound = true;
                    });

                    const relevantSales = treesSalesData.value.filter(sale => 
                        sale.detectedSite === activeSite.value &&
                        sale.month === month &&
                        (sale.brand || '').toLowerCase() === (brand.vendor || '').toLowerCase()
                    );

                    relevantSales.forEach(sale => {
                        batch.update(doc(db, "treesSales", sale.id), { status: 'Unsynced' });
                        workFound = true;
                    });
                }

                if (workFound) {
                    await batch.commit();
                    setTimeout(async () => {
                        await pushToMainTracker();
                        logSystemAction("UPDATE", `Regenerated reports for ${month} (${brandList.length} brands)`);
                    }, 800);
                } else {
                    alert("No automated POS credits found to regenerate for this selection.");
                }
            } catch (err) {
                console.error(err);
                alert("Failed to regenerate reports.");
            }
        };

                const handleTreesCsvUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // NEW PHASE 1: PRESERVE CSV TO STORAGE BEFORE PARSING
            const storagePath = `master_csvs/${activeSite.value}/${new Date().getFullYear()}/${activeMonth.value}/${Date.now()}_${file.name}`;
            const fileRef = sRef(storage, storagePath);
            
            try {
                // 1. Register the upload in Firestore manifest
                const uploadManifest = {
                    fileName: file.name,
                    storagePath: storagePath,
                    uploadedBy: loggedInUser.value,
                    uploadedAt: Date.now(),
                    site: activeSite.value,
                    month: activeMonth.value,
                    status: 'Preserved'
                };
                const manifestRef = await addDoc(collection(db, "source_uploads"), uploadManifest);
                const uploadId = manifestRef.id;

                // 2. Upload the raw binary to Storage
                await uploadBytes(fileRef, file);
                console.log("CSV preserved to storage:", storagePath);

                const reader = new FileReader();
                reader.onload = async (evt) => {
                    try {
                        const text = evt.target.result;
                        const rows = text.split(/\r?\n/);
                        if (rows.length < 2) return alert("File is empty or invalid.");

                        const parseCSVRow = (str) => {
                            const result = [];
                            let cell = '';
                            let inQuotes = false;
                            for (let i = 0; i < str.length; i++) {
                                const char = str[i];
                                if (char === '"') { inQuotes = !inQuotes; } 
                                else if (char === ',' && !inQuotes) { result.push(cell.trim()); cell = ''; } 
                                else { cell += char; }
                            }
                            result.push(cell.trim());
                            return result;
                        };

                        let headerIdx = 0;
                        let headers = [];
                        for (let i = 0; i < rows.length; i++) {
                            const cols = parseCSVRow(rows[i]);
                            if (cols.some(c => c.toLowerCase().includes('product brand') || c.toLowerCase().includes('vendor credit owed'))) {
                                headerIdx = i;
                                headers = cols.map(h => h.replace(/["']/g, '').trim());
                                break;
                            }
                        }

                        const getVal = (rowObj, ...keys) => {
                            for (const key of keys) {
                                const foundKey = Object.keys(rowObj).find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
                                if (foundKey && rowObj[foundKey] !== undefined) return rowObj[foundKey];
                            }
                            return '';
                        };

                        const batch = writeBatch(db);
                        let count = 0;

                        for (let i = headerIdx + 1; i < rows.length; i++) {
                            if (!rows[i].trim()) continue;
                            const cols = parseCSVRow(rows[i]);
                            const rowObj = {};
                            headers.forEach((h, idx) => { rowObj[h] = cols[idx] ? cols[idx].replace(/["']/g, '') : ''; });

                            const brandVal = getVal(rowObj, 'Product Brand', 'Brand');
                            const trackingVal = getVal(rowObj, 'State Tracking Id', 'Tracking Id');

                            if (!brandVal && !trackingVal) continue;

                            const dateStr = getVal(rowObj, 'Date Closed', 'Date');
                            const parsedMonth = detectMonthFromDate(dateStr) !== 'Unknown' ? detectMonthFromDate(dateStr) : 'August';
                            const storeString = getVal(rowObj, 'Store Name', 'Location');
                            const detectedSite = detectSiteFromName(storeString);

                            const units = parseFloat(getVal(rowObj, 'Units Sold', 'Unit Sold', 'Qty', 'Quantity')) || 0;
                            const unitPrice = parseFloat(String(getVal(rowObj, 'Cost Per Unit', 'Unit Price', 'Price')).replace(/[^0-9.-]+/g,"")) || 0;
                            const discAmt = parseFloat(String(getVal(rowObj, 'Discounts', 'Discount Amount', 'Discount')).replace(/[^0-9.-]+/g,"")) || 0;
                            const owedAmt = parseFloat(String(getVal(rowObj, 'Vendor Credit Owed', 'Credit Owed')).replace(/[^0-9.-]+/g,"")) || 0;

                            const newSale = {
                                uploadId: uploadId, // LINK TO SOURCE CSV
                                month: parsedMonth, 
                                brand: brandVal || 'Unknown Brand',
                                discountTitle: getVal(rowObj, 'Discount Title', 'Discount Name') || '',
                                dateClosed: dateStr,
                                storeName: storeString,
                                detectedSite: detectedSite,
                                productName: getVal(rowObj, 'Product Name', 'Product') || '',
                                owed: owedAmt,
                                trackingId: trackingVal || '',
                                unitsSold: units,
                                unitPrice: unitPrice,
                                discountAmount: discAmt,
                                status: 'Unsynced',
                                uploadedAt: Date.now()
                            };

                            const newDocRef = doc(collection(db, "treesSales"));
                            batch.set(newDocRef, newSale);
                            count++;

                            if (count % 400 === 0) {
                                await batch.commit();
                            }
                        }

                        await batch.commit();
                        await updateDoc(doc(db, "source_uploads", uploadId), { status: 'Parsed', rowCount: count });
                        
                        logSystemAction("IMPORT", `Uploaded ${count} raw sales items from Trees CSV (ID: ${uploadId})`);
                        alert(`Successfully uploaded ${count} sales items and preserved source CSV to cloud storage!`);
                        e.target.value = ''; 
                    } catch (error) { 
                        console.error(error);
                        alert("Error parsing CSV or uploading to cloud."); 
                    }
                };
                reader.readAsText(file); 

            } catch (err) {
                console.error("Storage Error:", err);
                alert("CRITICAL: Failed to preserve CSV to Storage. Import aborted for data safety.");
            }
        };

        const pushToMainTracker = async () => {
            const groupedBrands = {};
            const recordsToSync = treesSalesData.value.filter(s => s.status === 'Unsynced');
            
            if (recordsToSync.length === 0) return alert("No unsynced sales data found.");

            recordsToSync.forEach(sale => {
                const uniqueKey = `${sale.detectedSite}___${sale.brand}___${sale.month}`;
                if (!groupedBrands[uniqueKey]) {
                    groupedBrands[uniqueKey] = { site: sale.detectedSite, brand: sale.brand, month: sale.month, totalOwed: 0, itemCount: 0, salesItems: [] };
                }
                groupedBrands[uniqueKey].totalOwed += sale.owed;
                groupedBrands[uniqueKey].itemCount += 1;
                groupedBrands[uniqueKey].salesItems.push(sale.id);
            });

            let creditsCreated = 0;
            const batch = writeBatch(db); 
            
            for (const [key, data] of Object.entries(groupedBrands)) {
                if (data.totalOwed > 0) {
                    const masterRecord = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === data.brand.toLowerCase());
                    const payload = {
                        site: data.site, 
                        trackingMonth: data.month, 
                        vendor: data.brand,
                        distributor: (masterRecord && masterRecord.distributor) ? masterRecord.distributor : '', 
                        creditType: `Aggregated POS Sales (${data.itemCount} items)`,
                        dates: new Date().toLocaleDateString(),
                        amount: data.totalOwed,
                        dateRequested: new Date().toLocaleDateString(),
                        dateReceived: '',
                        invoice: 'CSV-AUTO-SYNC',
                        status: 'Pending',
                        createdAt: Date.now()
                    };
                    const newDocRef = doc(collection(db, "promoCredits"));
                    batch.set(newDocRef, payload);
                    creditsCreated++;

                    data.salesItems.forEach(saleId => {
                        const saleRef = doc(db, "treesSales", saleId);
                        batch.update(saleRef, { status: 'Synced' });
                    });
                }
            }
            
            try {
                await batch.commit();
                logSystemAction("UPDATE", `Synced and aggregated ${creditsCreated} vendor credits`);
                alert(`Success! Aggregated ${creditsCreated} vendor credits and pushed them to Firebase.`);
                activeTab.value = 'Tracker'; 
            } catch (err) { 
                console.error(err);
                alert("Failed to sync aggregated credits to the cloud."); 
            }
        };

        const resetBrandImport = () => {
            brandPastedGrid.value = [];
            brandMappedHeaders.value = [];
            brandPasteData.value = '';
        };

        const processBrandRawPaste = () => {
            const text = brandPasteData.value;
            if (!text.trim()) return;
            const rows = text.split(/\r?\n/).filter(r => r.trim() !== '');
            const grid = rows.map(r => r.split('\t').map(c => c.trim()));
            if (grid.length === 0) return;
            
            brandPastedGrid.value = grid;
            
            const firstRow = grid[0].map(c => c.toLowerCase());
            brandMappedHeaders.value = firstRow.map(cell => {
                if (cell.includes('brand') || cell.includes('vendor')) return 'Brand';
                if (cell.includes('rep')) return 'Rep';
                if (cell.includes('email')) return 'Email';
                if (cell.includes('trees')) return 'Name as appears in TREES';
                if (cell.includes('distro')) return 'Distro';
                if (cell.includes('asset')) return 'Asset Library';
                if (cell.includes('order')) return 'Order From';
                if (cell.includes('payee')) return 'Payee';
                if (cell.includes('note')) return 'Notes';
                return '-- Ignore Column --';
            });
        };

        const processBrandImport = async () => {
            let updatedCount = 0;
            let newCount = 0;
            
            let startRow = 0;
            if (brandPastedGrid.value.length > 0) {
                const firstRowStr = brandPastedGrid.value[0].join('').toLowerCase();
                if (firstRowStr.includes('brand') && (firstRowStr.includes('email') || firstRowStr.includes('rep') || firstRowStr.includes('distro'))) {
                    startRow = 1;
                }
            }
            
            const batch = writeBatch(db);

            for (let r = startRow; r < brandPastedGrid.value.length; r++) {
                const row = brandPastedGrid.value[r];
                let currentBrand = {};
                
                for (let c = 0; c < row.length; c++) {
                    const header = brandMappedHeaders.value[c];
                    if (header === '-- Ignore Column --') continue;
                    currentBrand[header] = row[c] || '';
                }
                
                const vendorName = currentBrand['Brand'];
                if (!vendorName || vendorName.length <= 1) continue; 
                
                const existingBrand = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === vendorName.toLowerCase());
                
                const payload = {};
                if (currentBrand['Rep'] !== undefined) payload.rep = currentBrand['Rep'];
                if (currentBrand['Email'] !== undefined) payload.email = currentBrand['Email'];
                if (currentBrand['Name as appears in TREES'] !== undefined) payload.treesName = currentBrand['Name as appears in TREES'];
                if (currentBrand['Distro'] !== undefined) payload.distributor = currentBrand['Distro'];
                if (currentBrand['Asset Library'] !== undefined) payload.assetLibrary = currentBrand['Asset Library'];
                if (currentBrand['Order From'] !== undefined) payload.orderFrom = currentBrand['Order From'];
                if (currentBrand['Payee'] !== undefined) payload.payee = currentBrand['Payee'];
                if (currentBrand['Notes'] !== undefined) payload.notes = currentBrand['Notes'];

                if (existingBrand) {
                    if (Object.keys(payload).length > 0) {
                        batch.update(doc(db, "brands", existingBrand.id), payload);
                        updatedCount++;
                    }
                } else {
                    payload.vendor = vendorName;
                    const newDocRef = doc(collection(db, "brands"));
                    batch.set(newDocRef, payload);
                    newCount++;
                }
            }
            
            try {
                await batch.commit();
                alert(`Success! Added ${newCount} new brands and updated ${updatedCount} existing entries in the cloud.`);
                resetBrandImport();
                showBrandImportModal.value = false;
            } catch (error) {
                console.error("Import error:", error);
                alert("Failed to save imported brands to the cloud.");
            }
        };

        const isSuperAdmin = ref(false);
        const systemLogs = ref([]);

        const refreshIcons = () => {
            nextTick(() => {
                if (window.lucide) window.lucide.createIcons();
            });
        };

        const clearAllSalesData = async () => {
            if (confirm("Are you sure you want to permanently delete ALL raw sales data from the cloud? This cannot be undone.")) {
                try {
                    const batch = writeBatch(db);
                    treesSalesData.value.forEach(sale => {
                        batch.delete(doc(db, "treesSales", sale.id));
                    });
                    await batch.commit();
                    logSystemAction("DELETE", "Cleared all raw sales data");
                    alert("All raw sales data has been cleared.");
                } catch (error) {
                    console.error("Error clearing sales data:", error);
                    alert("Failed to clear sales data.");
                }
            }
        };
        
        const openDimeHelper = async (brand) => {
            const storeName = activeSite.value === 'Redding' ? 'Sundial' : activeSite.value;
            const currentYear = new Date().getFullYear();
            const monthStr = brand.month || activeMonth.value;

            let textToCopy = `Store: ${storeName}\n`;
            textToCopy += `Promo Period: ${monthStr} ${currentYear}\n`;
            textToCopy += `Total Credit Requested: ${formatCurrency(brand.total)}\n\n`;
            textToCopy += `Promotion Details:\n`;
            
            brand.credits.forEach(c => {
                const type = c.creditType || 'Promo';
                const dates = c.dates || 'N/A';
                const amt = formatCurrency(c.amount);
                textToCopy += `- ${type} (${dates}): ${amt}\n`;
            });
            
            textToCopy += `\n*Itemized POS report attached to submission.`;

            try {
                await navigator.clipboard.writeText(textToCopy);
                alert(`✅ Text Copied to Clipboard!\n\nSimply paste into the DIME "Promotion Details" box.\n\nOpening the DIME Portal now...`);
                window.open('https://form.jotform.com/252994629916172', '_blank'); 
            } catch (err) {
                console.error('Failed to copy text: ', err);
                alert('Failed to copy to clipboard. Please check your browser permissions.');
            }
        };

                const scrollMonths = (direction) => {
            const container = document.getElementById('monthScrollContainer');
            if (container) {
                const scrollAmount = direction === 'left' ? -200 : 200;
                container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
            }
        };

                const showWorkbookSyncModal = ref(false);
        const workbookPasteData = ref('');

        const openWorkbookSyncModal = () => {
            workbookPasteData.value = '';
            showWorkbookSyncModal.value = true;
            refreshIcons();
        };

        const processWorkbookSync = async () => {
            if (!workbookPasteData.value.trim()) return;
            
            // Basic parser for Workbook V9 Summary Page
            // Expecting: Month [TAB] Total
            const rows = workbookPasteData.value.trim().split(/\r?\n/);
            const lastRow = rows[rows.length - 1].split('\t');
            
            if (lastRow.length < 2) {
                alert("Format Error: Please paste at least two columns (Month and Total) from your Excel Board Report.");
                return;
            }

            const month = lastRow[0];
            const total = parseFloat(String(lastRow[1]).replace(/[^0-9.-]+/g,"")) || 0;

            if (isNaN(total)) {
                alert("Could not parse a valid dollar amount from the second column.");
                return;
            }

            try {
                await setDoc(doc(db, "promo tracker", "Master_Workbook_V9_Board_Report"), {
                    reportMonth: month,
                    total: total,
                    updatedAt: Date.now(),
                    updatedBy: loggedInUser.value,
                    site: activeSite.value
                });
                
                logSystemAction("UPDATE", `Synced Workbook V9 Totals: ${month} - ${formatCurrency(total)}`);
                showWorkbookSyncModal.value = false;
                alert(`Success! The Master Workbook balance has been updated to ${formatCurrency(total)}.`);
            } catch (error) {
                console.error("Sync Error:", error);
                alert("Failed to sync totals to the cloud. Check your permissions.");
            }
        };

        return {
            isManagerUnlocked, isSuperAdmin, loggedInUser, emailInput, passwordInput, authError, activeSite, activeTab,
            treesSalesData, masterBrands, selectedBrands, allBrandsSelected, toggleAllBrands,
            deleteSelectedBrands, updateBrandField, promoCredits, calendarMonths, activeMonth,
            searchQueryInput, searchQuery, showPromoModal, showBrandDropdown, editingId, showReportModal,
            showResolutionModal, resolutionCredit, resolutionForm, markAsSent, markReportGroupAsSent,
            openResolutionModal, submitResolution, monthlyReportSummaries, downloadMonthlyReport,
            groupedPendingReports, draftEmail, archiveAndExportAnnualReport, showImportModal,
            rawPasteData, pastedGrid, mappedHeaders, showBrandImportModal, brandPasteData, brandPastedGrid,
            brandMappedHeaders, brandAvailableHeaders, availableHeaders, form, handleLogin, forceLock,
            filteredBrands, selectBrand, formatCurrency, filteredCredits, filteredTreesSalesData,
            displayTreesSalesData, totalPending, totalApplied, unsyncedSalesCount, openPromoModal,
            totalTreesOwedYTD, totalTreesPending,
            closePromoModal, handleFileUpload, saveCredit, editCredit, deleteCredit, openImportModal,
            closeImportModal, resetImport, displayGrid, processRawPaste, processImport, regenerateBrandSummary,
            regenerateMonthReports, handleTreesCsvUpload, pushToMainTracker, resetBrandImport,
            processBrandRawPaste, processBrandImport, systemLogs, refreshIcons, clearAllSalesData,
            detectMonthInString, drawCharts, openDimeHelper, exportVendorsAndBrandsCSV,
            masterLedgerData, selectedLedgerVendor, refreshLedger, openLegacyVerification, ledgerTotals,
            masterWorkbook, showWorkspaceMenu, showAdminMenu, workspaceTabs, selectWorkspace, activeWorkspaceInfo,
            scrollMonths, workbookSchema, activeWorkbookSheet, isWorkbookLoaded,
            auditRange, brandAuditData, draftAuditEmail,
            showWorkbookSyncModal, workbookPasteData, openWorkbookSyncModal, processWorkbookSync
        };

    }
}).mount('#app');
