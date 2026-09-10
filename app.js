// app.js

// 1. FIREBASE IMPORTS
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
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

try {
    initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaEnterpriseProvider("6LfACLQtAAAAAOWiSEhR1WsVPcu4qwhhv1PNqJSd"),
        isTokenAutoRefreshEnabled: true
    });
} catch (error) {
    console.error("App Check Error:", error);
}

const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp); 

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
        const activeTab = ref('Tracker');
        
        const systemUsers = {
            'lenay@rredco.com': { name: 'Lenay A.', access: ['Red Bluff', 'Redding'] },
            'tricia@rredco.com': { name: 'Tricia K.', access: ['Red Bluff', 'Redding'] },
            'whitney@rredco.com': { name: 'Whitney M.', access: ['Red Bluff', 'Redding'] },
            'nicholas.grace@rredco.com': { name: 'Nicholas G.', access: ['Red Bluff', 'Redding'] } 
        };

        const treesSalesData = ref(JSON.parse(localStorage.getItem('treesSalesData')) || []);
        watch(treesSalesData, (newVal) => localStorage.setItem('treesSalesData', JSON.stringify(newVal)), { deep: true });

        const masterBrands = ref([]);
        const selectedBrands = ref([]);
        
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

        const promoCredits = ref([]);
        const calendarMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const activeMonth = ref('August');
        const searchQuery = ref('');

        const showPromoModal = ref(false);
        const showBrandDropdown = ref(false);
        const editingId = ref(null);
        const showReportModal = ref(false);

        // --- NEW: MONTHLY REPORTS TAB LOGIC ---
        const monthlyReportSummaries = computed(() => {
            const groups = {};
            // Gather all credits for the active site (including archived ones)
            promoCredits.value.filter(c => c && c.site === activeSite.value).forEach(c => {
                const m = c.trackingMonth || 'Unknown';
                if (!groups[m]) {
                    groups[m] = { month: m, total: 0, count: 0, credits: [] };
                }
                groups[m].total += (parseFloat(c.amount) || 0);
                groups[m].count += 1;
                groups[m].credits.push(c);
            });
            // Sort by month order
            return Object.values(groups).sort((a, b) => calendarMonths.indexOf(a.month) - calendarMonths.indexOf(b.month));
        });

        const downloadMonthlyReport = (report) => {
            let csvContent = "Site,Tracking Month,Vendor,Distributor,Credit Type,Dates,Credit Amount,Date Requested,Date Received,Invoice,Status,Archived\n";
            let csvTotal = 0;
            
            report.credits.forEach(c => {
                const safeSite = `"${(c.site || '').replace(/"/g, '""')}"`;
                const safeMonth = `"${(c.trackingMonth || '').replace(/"/g, '""')}"`;
                const safeVendor = `"${(c.vendor || '').replace(/"/g, '""')}"`;
                const safeDist = `"${(c.distributor || '').replace(/"/g, '""')}"`;
                const safeType = `"${(c.creditType || '').replace(/"/g, '""')}"`;
                const safeDates = `"${(c.dates || '').replace(/"/g, '""')}"`;
                const safeAmount = `"${formatCurrency(c.amount)}"`;
                const safeReq = `"${(c.dateRequested || '').replace(/"/g, '""')}"`;
                const safeRec = `"${(c.dateReceived || '').replace(/"/g, '""')}"`;
                const safeInvoice = `"${(c.invoice || '').replace(/"/g, '""')}"`;
                const safeStatus = `"${(c.status || '').replace(/"/g, '""')}"`;
                const safeArchived = `"${c.archived ? 'Yes' : 'No'}"`;
                
                csvContent += `${safeSite},${safeMonth},${safeVendor},${safeDist},${safeType},${safeDates},${safeAmount},${safeReq},${safeRec},${safeInvoice},${safeStatus},${safeArchived}\n`;
                csvTotal += parseFloat(c.amount) || 0;
            });

            csvContent += `,,,,,, "TOTAL:", "${formatCurrency(csvTotal)}"\n`;

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            const currentYear = new Date().getFullYear();
            link.setAttribute("download", `${activeSite.value.replace(/\s/g, '_')}_Monthly_Report_${report.month}_${currentYear}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        };

        // --- DASHBOARD CHARTS LOGIC ---
        let chartMonthlyInstance = null;
        let chartDistrosInstance = null;
        let chartBrandsInstance = null;
        let chartStoresInstance = null;

        const drawCharts = () => {
            const activeCredits = promoCredits.value.filter(c => !c.archived);

            const currencyFormatter = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
            const standardOptions = {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => currencyFormatter(ctx.raw) } } }
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
                data: { labels: sortedMonths, datasets: [{ data: sortedMonths.map(m => monthlySums[m]), backgroundColor: '#4f46e5' }] },
                options: { ...standardOptions, scales: { y: { ticks: { callback: currencyFormatter } } } }
            });

            const distroSums = {};
            activeCredits.forEach(c => {
                const d = c.distributor || 'Unmapped';
                distroSums[d] = (distroSums[d] || 0) + (parseFloat(c.amount) || 0);
            });
            const topDistros = Object.entries(distroSums).sort((a, b) => b[1] - a[1]).slice(0, 10);
            
            if(chartDistrosInstance) chartDistrosInstance.destroy();
            chartDistrosInstance = new Chart(document.getElementById('chartDistros'), {
                type: 'bar',
                data: { labels: topDistros.map(d => d[0]), datasets: [{ data: topDistros.map(d => d[1]), backgroundColor: '#4f46e5' }] },
                options: { ...standardOptions, indexAxis: 'y', scales: { x: { ticks: { callback: currencyFormatter } } } }
            });

            const brandSums = {};
            activeCredits.forEach(c => {
                const b = c.vendor || 'Unmapped';
                brandSums[b] = (brandSums[b] || 0) + (parseFloat(c.amount) || 0);
            });
            const topBrands = Object.entries(brandSums).sort((a, b) => b[1] - a[1]).slice(0, 10);
            
            if(chartBrandsInstance) chartBrandsInstance.destroy();
            chartBrandsInstance = new Chart(document.getElementById('chartBrands'), {
                type: 'bar',
                data: { labels: topBrands.map(b => b[0]), datasets: [{ data: topBrands.map(b => b[1]), backgroundColor: '#14b8a6' }] },
                options: { ...standardOptions, indexAxis: 'y', scales: { x: { ticks: { callback: currencyFormatter } } } }
            });

            const storeSums = {};
            activeCredits.forEach(c => {
                const s = c.site || 'Unknown';
                storeSums[s] = (storeSums[s] || 0) + (parseFloat(c.amount) || 0);
            });
            
            if(chartStoresInstance) chartStoresInstance.destroy();
            chartStoresInstance = new Chart(document.getElementById('chartStores'), {
                type: 'doughnut',
                data: { labels: Object.keys(storeSums), datasets: [{ data: Object.values(storeSums), backgroundColor: ['#4f46e5', '#38bdf8', '#14b8a6'] }] },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '70%',
                    plugins: { tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${currencyFormatter(ctx.raw)}` } }, legend: { position: 'bottom' } }
                }
            });
        };

        watch(activeTab, (newTab) => {
            if (newTab === 'Dashboard') {
                nextTick(() => { drawCharts(); });
            }
        });

        watch(promoCredits, () => {
            if (activeTab.value === 'Dashboard') { drawCharts(); }
        }, { deep: true });

        // --- EMAIL DRAFTER LOGIC ---
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

        const draftEmail = (report) => {
            if (!report.email) {
                alert(`No email mapped for ${report.vendor}. Please add one in the Brand Directory first.`);
                return;
            }

            const storeName = activeSite.value === 'Redding' ? 'Sundial' : activeSite.value;
            const currentYear = new Date().getFullYear();
            const monthStr = activeMonth.value === 'All' ? 'Current' : activeMonth.value;
            const periodStr = `${monthStr} ${currentYear}`;

            let csvContent = "";
            csvContent += "Date,Location,Brand,Product / Description,Discount Title,Tracking ID / Invoice,Entry Type,Credit Amount\n";
            let csvTotal = 0;

            report.credits.forEach(c => {
                const isAggregated = c.creditType && String(c.creditType).includes('Aggregated POS Sales');
                let matchedRawSales = [];
                if (isAggregated) {
                    matchedRawSales = treesSalesData.value.filter(sale => {
                        return (sale.brand || '').toLowerCase() === (c.vendor || '').toLowerCase() && sale.detectedSite === c.site && sale.month === c.trackingMonth && sale.status === 'Synced';
                    });
                }

                if (isAggregated && matchedRawSales.length > 0) {
                    matchedRawSales.forEach(sale => {
                        const safeDate = `"${(sale.dateClosed || '').replace(/"/g, '""')}"`;
                        const safeLoc = `"${(sale.storeName || '').replace(/"/g, '""')}"`;
                        const safeBrand = `"${(sale.brand || '').replace(/"/g, '""')}"`;
                        const safeProd = `"${(sale.productName || '').replace(/"/g, '""')}"`;
                        const safeDisc = `"${(sale.discountTitle || '').replace(/"/g, '""')}"`;
                        const safeTrack = `"${(sale.trackingId || '').replace(/"/g, '""')}"`;
                        const safeType = `"POS Itemized"`;
                        const safeAmount = `"${formatCurrency(sale.owed)}"`;
                        
                        csvContent += `${safeDate},${safeLoc},${safeBrand},${safeProd},${safeDisc},${safeTrack},${safeType},${safeAmount}\n`;
                        csvTotal += parseFloat(sale.owed) || 0;
                    });
                } else {
                    const safeDate = `"${(c.dates || '').replace(/"/g, '""')}"`;
                    const safeLoc = `"${(c.site || '').replace(/"/g, '""')}"`;
                    const safeBrand = `"${(c.vendor || '').replace(/"/g, '""')}"`;
                    const safeProd = `"${(c.creditType || '').replace(/"/g, '""')}"`; 
                    const safeDisc = `"-"`;
                    const safeTrack = `"${(c.invoice || '').replace(/"/g, '""')}"`;
                    const safeType = isAggregated ? `"Summary (Raw Data Missing)"` : `"Manual Entry"`; 
                    const safeAmount = `"${formatCurrency(c.amount)}"`;
                    
                    csvContent += `${safeDate},${safeLoc},${safeBrand},${safeProd},${safeDisc},${safeTrack},${safeType},${safeAmount}\n`;
                    csvTotal += parseFloat(c.amount) || 0;
                }
            });

            csvContent += `,,,,,, "TOTAL:", "${formatCurrency(csvTotal)}"\n`;

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            const cleanVendorName = report.vendor.replace(/[^a-zA-Z0-9]/g, '_');
            link.setAttribute("download", `${cleanVendorName}_${storeName}_Credits_${periodStr.replace(/\s/g, '_')}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            const cleanEmails = report.email.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean).join(',');
            const senderEmail = 'nicholas.grace@rredco.com';
            const subject = `credit report - ${storeName} promotions ${periodStr}`;

            let body = `Hello ${report.vendor},\n\n`;
            body += `Attached is a CSV breakdown of your promo reports from ${storeName} generating vendor credits for the promotions ran listed below:\n\n`;
            body += `For the period: ${periodStr}.\n`;
            body += `Total: ${formatCurrency(report.total)}.\n\n`;
            body += `------------------------------------------------------------\n`;
            body += `DISCOUNT TITLE / TYPE      |   DATES   |   CREDIT AMOUNT\n`;
            body += `------------------------------------------------------------\n`;

            report.credits.forEach(c => {
                const title = c.creditType || 'Promo';
                const dates = c.dates || 'N/A';
                const amt = formatCurrency(c.amount);
                body += `${title}   |   ${dates}   |   ${amt}\n`;
            });

            body += `------------------------------------------------------------\n\n`;
            body += `Please note that the above credits will be deducted (on our end). Keep an eye out for a credit memo on the payment applied to the next order. Let me know if you have any questions or concerns.\n\n`;
            body += `Thank you for participating in the deals!!\n\n`;
            body += `${storeName} Accounting Team\n`;
            body += `Nicholas Grace (${senderEmail})\n`;
            body += `(530)560-6624 - Office\n`;

            const encodedSubject = encodeURIComponent(subject);
            const encodedBody = encodeURIComponent(body);
            const encodedCc = encodeURIComponent(`accounting@rredco.com,${senderEmail}`);

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
            
            creditsToArchive.forEach(c => {
                const safeSite = `"${(c.site || '').replace(/"/g, '""')}"`;
                const safeMonth = `"${(c.trackingMonth || '').replace(/"/g, '""')}"`;
                const safeVendor = `"${(c.vendor || '').replace(/"/g, '""')}"`;
                const safeDist = `"${(c.distributor || '').replace(/"/g, '""')}"`;
                const safeType = `"${(c.creditType || '').replace(/"/g, '""')}"`;
                const safeDates = `"${(c.dates || '').replace(/"/g, '""')}"`;
                const safeAmount = `"${formatCurrency(c.amount)}"`;
                const safeReq = `"${(c.dateRequested || '').replace(/"/g, '""')}"`;
                const safeRec = `"${(c.dateReceived || '').replace(/"/g, '""')}"`;
                const safeInvoice = `"${(c.invoice || '').replace(/"/g, '""')}"`;
                const safeStatus = `"${(c.status || '').replace(/"/g, '""')}"`;
                const archiveDate = `"${new Date().toLocaleDateString()}"`;
                
                csvContent += `${safeSite},${safeMonth},${safeVendor},${safeDist},${safeType},${safeDates},${safeAmount},${safeReq},${safeRec},${safeInvoice},${safeStatus},${archiveDate}\n`;
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            const currentYear = new Date().getFullYear();
            link.setAttribute("download", `Master_Annual_Report_${currentYear}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            try {
                const batch = writeBatch(db);
                creditsToArchive.forEach(c => {
                    const docRef = doc(db, "promoCredits", c.id);
                    batch.update(docRef, { archived: true, archivedAt: Date.now() });
                });
                await batch.commit();
                alert(`Success! Master spreadsheet downloaded and ${creditsToArchive.length} records safely archived.`);
            } catch (error) {
                console.error("Archive Error:", error);
                alert("Failed to archive records in the cloud.");
            }
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
        let unsubscribeSnapshot = null;
        let unsubscribeBrands = null;

        onMounted(() => {
            refreshIcons();
            onAuthStateChanged(auth, (user) => {
                if (user) {
                    const userEmail = user.email.toLowerCase();
                    const managerData = systemUsers[userEmail] || { name: 'Manager', access: ['Red Bluff', 'Redding'] };
                    loggedInUser.value = managerData.name;
                    activeSite.value = managerData.access[0];
                    isManagerUnlocked.value = true;
                    
                    unsubscribeSnapshot = onSnapshot(collection(db, "promoCredits"), (snapshot) => {
                        const fetchedCredits = [];
                        snapshot.forEach(docSnap => { fetchedCredits.push({ id: docSnap.id, ...docSnap.data() }); });
                        fetchedCredits.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                        promoCredits.value = fetchedCredits;
                    });

                    unsubscribeBrands = onSnapshot(collection(db, "brands"), (snapshot) => {
                        const fetchedBrands = [];
                        snapshot.forEach(docSnap => { fetchedBrands.push({ id: docSnap.id, ...docSnap.data() }); });
                        
                        if (fetchedBrands.length === 0) {
                            const localBrands = JSON.parse(localStorage.getItem('masterBrands') || '[]');
                            if (localBrands.length > 0) {
                                const batch = writeBatch(db);
                                localBrands.forEach(b => {
                                    const newDocRef = doc(collection(db, "brands"));
                                    batch.set(newDocRef, b);
                                });
                                batch.commit().then(() => { localStorage.removeItem('masterBrands'); });
                            }
                        }
                        fetchedBrands.sort((a, b) => (a.vendor || '').localeCompare(b.vendor || ''));
                        masterBrands.value = fetchedBrands;
                    });
                } else {
                    isManagerUnlocked.value = false;
                    promoCredits.value = [];
                    masterBrands.value = [];
                    if (unsubscribeSnapshot) unsubscribeSnapshot();
                    if (unsubscribeBrands) unsubscribeBrands();
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
            if (s.includes('redding')) return 'Redding';
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

        const handleTreesCsvUpload = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
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

                    const newSales = [];
                    for (let i = headerIdx + 1; i < rows.length; i++) {
                        if (!rows[i].trim()) continue;
                        const cols = parseCSVRow(rows[i]);
                        const rowObj = {};
                        headers.forEach((h, idx) => { rowObj[h] = cols[idx] ? cols[idx].replace(/["']/g, '') : ''; });

                        if (!rowObj['Product Brand'] && !rowObj['State Tracking Id']) continue;

                        const dateStr = rowObj['Date Closed'] || '';
                        const parsedMonth = detectMonthFromDate(dateStr) !== 'Unknown' ? detectMonthFromDate(dateStr) : 'August';
                        const storeString = rowObj['Store Name'] || '';
                        const detectedSite = detectSiteFromName(storeString);

                        newSales.push({
                            id: Date.now() + Math.random().toString(36).substr(2, 5),
                            month: parsedMonth, 
                            brand: rowObj['Product Brand'] || 'Unknown Brand',
                            discountTitle: rowObj['Discount Title'] || '',
                            dateClosed: dateStr.split(' ')[0], 
                            storeName: storeString,
                            detectedSite: detectedSite,
                            productName: rowObj['Product Name'] || '',
                            owed: parseFloat(String(rowObj['Vendor Credit Owed']).replace(/[^0-9.-]+/g,"")) || 0,
                            trackingId: rowObj['State Tracking Id'] || '',
                            status: 'Unsynced'
                        });
                    }

                    treesSalesData.value = newSales.concat(treesSalesData.value);
                    e.target.value = ''; 
                    refreshIcons();
                } catch (error) { alert("Error parsing CSV. Ensure it is a valid comma-separated file."); }
            };
            reader.readAsText(file); 
        };

        const pushToMainTracker = async () => {
            const groupedBrands = {};
            const recordsToSync = treesSalesData.value.filter(s => s.status === 'Unsynced');
            
            recordsToSync.forEach(sale => {
                const uniqueKey = `${sale.detectedSite}___${sale.brand}___${sale.month}`;
                if (!groupedBrands[uniqueKey]) {
                    groupedBrands[uniqueKey] = { site: sale.detectedSite, brand: sale.brand, month: sale.month, totalOwed: 0, itemCount: 0, ids: [] };
                }
                groupedBrands[uniqueKey].totalOwed += sale.owed;
                groupedBrands[uniqueKey].itemCount += 1;
                groupedBrands[uniqueKey].ids.push(sale.trackingId);
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
                        distributor: masterRecord ? masterRecord.distributor : 'Trees POS Import',
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
                }
            }
            
            try {
                await batch.commit();
                treesSalesData.value = treesSalesData.value.map(s => s.status === 'Unsynced' ? { ...s, status: 'Synced' } : s);
                alert(`Success! Aggregated ${creditsCreated} vendor credits and pushed them to Firebase.`);
                activeTab.value = 'Tracker'; 
            } catch (err) { alert("Failed to sync aggregated credits to the cloud."); }
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

        const refreshIcons = () => { nextTick(() => { if(window.lucide) window.lucide.createIcons(); }); };

        return {
            isManagerUnlocked, loggedInUser, emailInput, passwordInput, authError, handleLogin, forceLock, activeSite, 
            activeTab, treesSalesData, filteredTreesSalesData, displayTreesSalesData, unsyncedSalesCount, handleTreesCsvUpload, pushToMainTracker,
            promoCredits, filteredCredits, showPromoModal, form, editingId, 
            openPromoModal, closePromoModal, saveCredit, editCredit, deleteCredit, handleFileUpload,
            formatCurrency, totalPending, totalApplied,
            masterBrands, filteredBrands, showBrandDropdown, selectBrand,
            selectedBrands, allBrandsSelected, toggleAllBrands, deleteSelectedBrands, 
            showReportModal, groupedPendingReports, draftEmail,
            archiveAndExportAnnualReport, 
            monthlyReportSummaries, downloadMonthlyReport, // <-- NEW FOR REPORTS TAB
            showImportModal, openImportModal, closeImportModal, resetImport, 
            rawPasteData, pastedGrid, displayGrid, mappedHeaders, availableHeaders, processRawPaste, processImport,
            showBrandImportModal, brandPasteData, brandPastedGrid, brandMappedHeaders, brandAvailableHeaders,
            resetBrandImport, processBrandRawPaste, processBrandImport, updateBrandField,
            calendarMonths, activeMonth, detectMonthInString, searchQuery
        };
    }
}).mount('#app');
