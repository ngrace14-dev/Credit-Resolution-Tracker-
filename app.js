// app.js

// 1. FIREBASE IMPORTS
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, 
    writeBatch, onSnapshot, setDoc, query, where, limit 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { 
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { 
    getStorage, ref as sRef, uploadBytes, getBytes 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { 
    initializeAppCheck, ReCaptchaEnterpriseProvider 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app-check.js";

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

// APP CHECK DEBUG MODE
if (location.hostname === 'localhost' || 
    location.hostname === '127.0.0.1' || 
    location.hostname.startsWith('192.168.') || 
    location.hostname.includes('github.dev')) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    console.log("App Check Debug Mode Active");
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
        const isSuperAdmin = ref(false);
        const isProcessingUpload = ref(false);
        const isRecalculating = ref(false);
        const loggedInUser = ref('');
        const emailInput = ref('');
        const passwordInput = ref('');
        const authError = ref('');
        const activeSite = ref('Red Bluff');
        const activeTab = ref('Ledger');
        const activeMonth = ref('August');
        const calendarMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        const sageFileInput = ref(null);
        const treezFileInput = ref(null);
        const showWorkbookSyncModal = ref(false);
        const showBrandDropdown = ref(false);
        const showPromoModal = ref(false);
        const showReportModal = ref(false);
        const showResolutionModal = ref(false);
        const showImportModal = ref(false);
        const showBrandImportModal = ref(false);
        const showWorkspaceMenu = ref(false);
        const showAdminMenu = ref(false);

        const promoCreditsList = ref([]);
        const masterBrands = ref([]);
        const selectedBrands = ref([]);
        const treesSalesData = ref([]);
        const systemLogs = ref([]);
        const auditRange = ref({ start: '', end: '' });

        const selectedLedgerVendor = ref(null);
        const masterLedgerData = ref([]);
        const ledgerTotals = ref({ generated: 0, recovered: 0, outstanding: 0, variance: 0 });

        const masterWorkbook = ref({ data: {}, summary: {} });
        const isWorkbookLoaded = ref(false);

        const emailReportMode = ref('standard');
        const startMonth = ref('January');
        const endMonth = ref('September');
        const showEmailDraftModal = ref(false);
        const selectedBrandForEmail = ref(null);
        const emailDraftSubject = ref('');
        const emailDraftBody = ref('');

        const resolutionCredit = ref(null);
        const resolutionForm = ref({ invoice: '', dateReceived: '' });
        const editingId = ref(null);

        const searchQueryInput = ref('');
        const searchQuery = ref('');
        let searchTimeout = null;

        watch(searchQueryInput, (newVal) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchQuery.value = newVal;
            }, 300);
        });

        const workbookSchema = {
            "Board Recon - Red Bluff": ["Red Bluff - YTD Promo Reconciliation", "Gross Promos Generated", "Store-Funded deductions", "Net Collectibles", "Sage Collected", "Monthly Outstanding", "YTD balances"],
            "Board Recon - Redding": ["Redding - YTD Promo Reconciliation", "Gross Promos Generated", "Store-Funded deductions", "Net Collectibles", "Sage Collected", "Monthly Outstanding", "YTD balances"],
            "YTD Dashboard": ["Month", "Master Tracked", "Treez Valid POS", "Sage Collected"],
            "Brand_Mapping": ["Master Workbook Legacy Name", "Standardized POS Name (CSV)"],
            "YTD Running Totals": ["Brand", "Redding", "Red-Bluff", "Running Total Promo Credits", "Combined Brand Total"],
            "January 2026": ["Brand", "Redding", "Red-Bluff", "Date Requested", "Month promo credits were generated", "Promo Credits", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total"],
            "February 2026": ["Brand", "Redding", "Red-Bluff", "Date Requested", "Month promo credits were generated", "Promo Credits", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total"],
            "March 2026": ["Brand", "Redding", "Red-Bluff", "Date Requested", "Month promo credits were generated", "Promo Credits", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total"],
            "April 2026": ["Brand", "Redding", "Red-Bluff", "Date Requested", "Month promo credits were generated", "Promo Credits", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total"],
            "May 2026": ["Brand", "Redding", "Red-Bluff", "Date Requested", "Month promo credits were generated", "Promo Credits", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total"],
            "June 2026": ["Brand", "Redding", "Red-Bluff", "Date Requested", "Month promo credits were generated", "Promo Credits", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total"],
            "July 2026": ["Brand", "Redding", "Red-Bluff", "Date Requested", "Month promo credits were generated", "Promo Credits", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total"],
            "August 2026": ["Brand", "Redding", "Red-Bluff", "Date Requested", "Month promo credits were generated", "Promo Credits", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total"],
            "September 2026": ["Brand", "Redding", "Red-Bluff", "Date Requested", "Month promo credits were generated", "Promo Credits", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total"],
            "October 2026": ["Brand", "Redding", "Red-Bluff", "Date Requested", "Month promo credits were generated", "Promo Credits", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total"],
            "November 2026": ["Brand", "Redding", "Red-Bluff", "Date Requested", "Month promo credits were generated", "Promo Credits", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total"],
            "December 2026": ["Brand", "Redding", "Red-Bluff", "Date Requested", "Month promo credits were generated", "Promo Credits", "Date Applied", "Credits Approved", "Credits Rejected", "Treez Total"],
            "Store Macro Summary": ["Store", "YTD Generated (POS)", "YTD Received (GL)", "Outstanding Balance"],
            "Redding Store Audit": ["Brand", "Store", "YTD Generated (POS)", "YTD Received (GL)", "Outstanding Balance"],
            "Red Bluff Store Audit": ["Brand", "Store", "YTD Generated (POS)", "YTD Received (GL)", "Outstanding Balance"],
            "GL Raw by Store": ["Posted dt.", "Store", "Location", "Memo/Description", "Mapped Brand", "Credit"],
            "Monthly Vendor Variance Report": ["Brand", "January Generated", "January Collected", "January Left on Table", "February Generated", "February Collected", "February Left on Table", "March Generated", "March Collected", "March Left on Table", "April Generated", "April Collected", "April Left on Table", "May Generated", "May Collected", "May Left on Table", "June Generated", "June Collected", "June Left on Table", "July Generated", "July Collected", "July Left on Table", "August Generated", "August Collected", "August Left on Table", "September Generated", "September Collected", "September Left on Table", "October Generated", "October Collected", "October Left on Table", "November Generated", "November Collected", "November Left on Table", "December Generated", "December Collected", "December Left on Table", "YTD Generated", "YTD Collected", "YTD Left on Table"],
            "Sheet1": ["Vendor", "Credit Type", "Dates", "Distributor", "Credit amount $$$"]
        };

        const activeWorkbookSheet = ref(Object.keys(workbookSchema)[0]);

        const workspaceTabs = [
            { name: 'Ledger', label: 'Master Ledger', icon: 'layout-dashboard', group: 'Workbook' },
            { name: 'Tracker', label: 'Digital PCRP', icon: 'list-todo', group: 'Workbook' },
            { name: 'Sales', label: 'Discovery Intake', icon: 'zap', group: 'Workbook' },
            { name: 'Recovery', label: 'Recovery Log', icon: 'check-circle', group: 'Workbook' },
            { name: 'Reports', label: 'Brand Reports', icon: 'file-text', group: 'Workbook' },
            { name: 'WorkbookViewer', label: 'Excel Viewer', icon: 'table', group: 'Workbook' },
            { name: 'Validation', label: 'Workbook Parity', icon: 'shield-check', group: 'Workbook' },
            { name: 'BrandAudit', label: 'Brand Audit', icon: 'search', group: 'Workbook' },
            { name: 'QuarterlyAudit', label: 'Quarterly Audit', icon: 'calendar-days', group: 'Workbook' },
            { name: 'Brands', label: 'Brand Directory', icon: 'building', group: 'Identity' }
        ];

        const activeWorkspaceInfo = computed(() => workspaceTabs.find(t => t.name === activeTab.value) || { name: 'Unknown', icon: 'help-circle' });

        const systemUsers = {
            'lenay@rredco.com': { name: 'Lenay A.', access: ['Red Bluff', 'Redding'], active: false },
            'tricia@rredco.com': { name: 'Tricia K.', access: ['Red Bluff', 'Redding'], active: false },
            'whitney@rredco.com': { name: 'Whitney M.', access: ['Red Bluff', 'Redding'], active: false },
            'nicholas.grace@rredco.com': { name: 'Nicholas G.', access: ['Red Bluff', 'Redding'], active: true, superAdmin: true },
            'accounting@rredco.com': { name: 'Accounting Team', access: ['Red Bluff', 'Redding'], active: true, superAdmin: true }
        };

        const formatCurrency = (val) => {
            const num = parseFloat(val);
            if (isNaN(num)) return '$0.00';
            const rounded = Math.round(num * 100) / 100;
            return new Intl.NumberFormat('en-US', { 
                style: 'currency', 
                currency: 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(rounded);
        };

        const detectMonthFromDate = (dateString) => {
            if (!dateString) return 'Unknown';
            const d = new Date(dateString);
            if (isNaN(d.getTime())) return 'Unknown';
            return calendarMonths[d.getMonth()];
        };

        const detectSiteFromName = (storeNameStr) => {
            if (!storeNameStr) return activeSite.value; 
            const s = String(storeNameStr).toLowerCase();
            if (s.includes('red bluff') || s.includes('redbluff')) return 'Red Bluff';
            if (s.includes('redding') || s.includes('sundial')) return 'Redding';
            return activeSite.value; 
        };

        const getStandardizedBrandName = (name) => {
            if (!name) return '';
            const clean = String(name).trim();
            const mappingRows = masterWorkbook.value?.data?.["Brand_Mapping"] || [];
            const match = mappingRows.find(r => String(r["Master Workbook Legacy Name"] || '').trim().toLowerCase() === clean.toLowerCase());
            return match ? String(match["Standardized POS Name (CSV)"] || '').trim() : clean;
        };

        const definitiveBrandMetrics = computed(() => {
            const metrics = { total: {}, redding: {}, redBluff: {} };
            if (!masterWorkbook.value || !masterWorkbook.value.data) return metrics;

            const processSheet = (sheetName, siteKey) => {
                const rows = masterWorkbook.value.data[sheetName] || [];
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
        });

        // COMPUTED: Consolidated promoCredits
        const promoCredits = computed(() => {
            const allCredits = promoCreditsList.value.filter(c => c.invoice !== 'WB-V9-SYNC');
            if (!masterWorkbook.value || !masterWorkbook.value.data) return allCredits;

            Object.keys(masterWorkbook.value.data).forEach(sheetName => {
                if (sheetName.includes('2026')) {
                    const monthName = sheetName.split(' ')[0];
                    const rows = masterWorkbook.value.data[sheetName] || [];

                    rows.forEach((row, idx) => {
                        const vendor = row["Brand"] || row[0];
                        if (!vendor || vendor === "Brand" || String(vendor).toLowerCase().includes('total')) return;

                        ["Redding", "Red-Bluff"].forEach(siteKey => {
                            const siteName = siteKey === "Red-Bluff" ? "Red Bluff" : "Redding";
                            let rawAmt = 0;
                            const rowKeys = Object.keys(row);
                            const exactKey = rowKeys.find(k => k.trim().toLowerCase() === siteName.toLowerCase() || k.trim().toLowerCase() === siteKey.toLowerCase());

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

                            const amt = parseFloat(String(rawAmt || 0).replace(/[^0-9.-]+/g, "")) || 0;

                            if (amt > 0) {
                                const approvedKey = rowKeys.find(k => k.toLowerCase().includes('approved') || k.toLowerCase().includes('applied') || k.toLowerCase().includes('collected'));
                                const approvedAmt = parseFloat(String(row[approvedKey] || row["Credits Approved"] || 0).replace(/[^0-9.-]+/g, "")) || 0;
                                const dateKey = rowKeys.find(k => k.toLowerCase().includes('date') && (k.toLowerCase().includes('applied') || k.toLowerCase().includes('received')));
                                const isApplied = (approvedAmt > 0) || (!!row[dateKey] && row[dateKey] !== 'N/A') || (!!row["Date Applied"] && row["Date Applied"] !== 'N/A');

                                allCredits.push({
                                    id: `${sheetName}-${idx}-${siteKey}`,
                                    site: siteName,
                                    trackingMonth: monthName,
                                    vendor: vendor,
                                    amount: amt,
                                    creditType: row["Promo Credits"] || 'Promo',
                                    dateRequested: row["Date Requested"] || '',
                                    dateReceived: row[dateKey] || row["Date Applied"] || '',
                                    status: isApplied ? "Applied" : "Pending",
                                    archived: false,
                                    workbookRef: { sheet: sheetName, rowIdx: idx },
                                    dates: row["Dates"] || row["Date Requested"] || ''
                                });
                            }
                        });
                    });
                }
            });

            return allCredits;
        });

        // REFRESH / CALCULATE LEDGER
        const refreshLedger = async () => {
            isRecalculating.value = true;
            try {
                if (!promoCredits.value) return;

                const ledger = {};
                const site = activeSite.value;
                const month = activeMonth.value;
                
                promoCredits.value.forEach(c => {
                    if (c.site !== site) return;
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
                    
                    ledger[v].generated += (parseFloat(c.amount) || 0);
                    ledger[v].generatedCount++;
                    ledger[v].discoveryEvents.push({ id: c.id, type: c.creditType, date: c.dateRequested || c.dates, amount: c.amount });

                    if (c.status === 'Applied') {
                        const recoveredAmount = (parseFloat(c.amount) || 0); 
                        ledger[v].recovered += recoveredAmount;
                        
                        if (recoveredAmount > 0) {
                            ledger[v].recoveredCount++;
                            ledger[v].recoveryEvents.push({ id: 'rec-' + c.id, ref: c.invoice || 'CREDIT-MEMO', date: c.dateReceived || 'Confirmed', amount: recoveredAmount });
                        }
                    }
                });

                const totals = { generated: 0, recovered: 0, outstanding: 0, variance: 0 };
                const siteKey = site === "Redding" ? "redding" : "redBluff";
                
                const liveGLRows = masterWorkbook.value?.data?.["GL Raw by Store"] || [];
                const liveGLMap = {};
                liveGLRows.forEach(row => {
                    const rStore = detectSiteFromName(row["Store"] || row["Location"]);
                    if (rStore !== site) return;
                    const rDate = row["Posted dt."];
                    if (month !== 'All' && detectMonthFromDate(rDate) !== month) return;
                    const rBrand = getStandardizedBrandName(row["Mapped Brand"]);
                    const rAmt = parseFloat(row["Credit"]) || 0;
                    liveGLMap[rBrand] = (liveGLMap[rBrand] || 0) + rAmt;
                });
        
                Object.values(ledger).forEach(item => {
                    const brandMetrics = definitiveBrandMetrics.value[siteKey][item.vendor];
                    if (brandMetrics) {
                        item.recovered = brandMetrics.applied;
                        if (month === 'All') item.generated = brandMetrics.generated;
                    }
                    if (liveGLMap[item.vendor] !== undefined) item.recovered = Math.max(item.recovered, liveGLMap[item.vendor]);
                    item.outstanding = item.generated - item.recovered;
                    item.variance = 0;
                    if (item.outstanding > 0) item.aging['0-30'] = item.outstanding;
                    
                    totals.generated += item.generated;
                    totals.recovered += item.recovered;
                    totals.outstanding += item.outstanding;
                    totals.variance += item.variance;
                });

                ledgerTotals.value = totals;
                masterLedgerData.value = Object.values(ledger).sort((a, b) => b.outstanding - a.outstanding);
            } finally {
                isRecalculating.value = false;
            }
        };

        const recalculateMasterLedger = refreshLedger;

        watch([promoCredits, activeSite, activeMonth], () => {
            if (activeTab.value === 'Ledger') refreshLedger();
        });

        watch(activeTab, (newTab) => {
            if (newTab === 'Dashboard') nextTick(() => drawCharts());
            if (newTab === 'Ledger') refreshLedger();
        });

        const selectWorkspace = (tab) => {
            activeTab.value = tab.name;
            showWorkspaceMenu.value = false;
            if (tab.name === 'Ledger') refreshLedger();
            nextTick(() => refreshIcons());
        };

        const getEmptyForm = () => ({ 
            trackingMonth: activeMonth.value === 'All' ? 'August' : activeMonth.value,
            vendor: '', distributor: '', creditType: '', dates: '', 
            amount: '', dateRequested: '', dateReceived: '', 
            invoice: '', status: 'Pending', attachmentName: '', attachmentData: null 
        });
        
        const form = ref(getEmptyForm());

        const extractBrandFromSageMemo = (memo) => {
            if (!memo) return 'Unassigned';
            const cleanMemo = String(memo).trim();
            const billMatch = cleanMemo.match(/Bill\s*-\s*([^:]+):/i);
            if (billMatch && billMatch[1]) return billMatch[1].replace(/LLC|Inc\.?|Distribution/gi, '').trim();
            if (/nabifive/i.test(cleanMemo)) return "Nabifive Portfolio";
            if (/kiva/i.test(cleanMemo)) return "Kiva";
            if (/thirtyone|almora|heavy hitters/i.test(cleanMemo)) return "Heavy Hitters / Almora";
            return cleanMemo;
        };

        const logSystemAction = async (actionType, details) => {
            try {
                await addDoc(collection(db, "systemLogs"), {
                    timestamp: Date.now(), user: loggedInUser.value || 'System', actionType: actionType, details: details
                });
            } catch (error) { console.error("Error logging action:", error); }
        };

        const handleSageGLUpload = async (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            isProcessingUpload.value = true;
            try {
                const text = await file.text();
                const parseCSVLine = (line) => {
                    const result = [];
                    let cur = '';
                    let inQuotes = false;
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        if (char === '"') inQuotes = !inQuotes;
                        else if (char === ',' && !inQuotes) { result.push(cur.trim()); cur = ''; }
                        else cur += char;
                    }
                    result.push(cur.trim());
                    return result.map(cell => cell.replace(/^"(.*)"$/, '$1').trim());
                };

                const rows = text.split(/\r?\n/).filter(line => line.trim()).map(parseCSVLine);
                if (rows.length < 2) return alert("The uploaded Sage GL CSV appears to be empty.");

                const header = rows[0].map(h => h.toLowerCase());
                const postedDtIdx = header.findIndex(h => h.includes('posted dt'));
                const docIdx = header.findIndex(h => h === 'doc');
                const memoIdx = header.findIndex(h => h.includes('memo') || h.includes('description'));
                const locIdx = header.findIndex(h => h.includes('location'));
                const creditIdx = header.findIndex(h => h.includes('credit'));

                if (postedDtIdx === -1 || creditIdx === -1 || locIdx === -1) {
                    return alert("Invalid Sage GL Report. Missing required columns: Posted dt., Location, or Credit.");
                }

                const existingGLRows = (masterWorkbook.value?.data?.["GL Raw by Store"]) || [];
                const newGLRows = [];
                let skippedDuplicates = 0;

                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row || row.length <= Math.max(postedDtIdx, creditIdx, locIdx, memoIdx, docIdx)) continue;
                    
                    const postedDt = row[postedDtIdx];
                    const memo = row[memoIdx] || '';
                    const docVal = row[docIdx] || '';
                    const loc = (row[locIdx] || '').toUpperCase();
                    const rawCredit = row[creditIdx];

                    if (!postedDt || postedDt.toLowerCase().includes('total') || postedDt.toLowerCase().includes('balance forward')) continue;

                    const creditAmt = parseFloat(String(rawCredit).replace(/[^0-9.-]+/g, '')) || 0;
                    if (creditAmt <= 0) continue;

                    const store = loc === 'E12' ? 'Red Bluff' : (loc === 'E11' ? 'Redding' : (loc || 'Unknown'));
                    const extractedBrand = extractBrandFromSageMemo(memo);
                    const standardizedBrand = getStandardizedBrandName(extractedBrand);

                    const isDuplicate = existingGLRows.some(e => 
                        String(e["Posted dt."]).trim() === String(postedDt).trim() &&
                        String(e["Location"]).trim().toUpperCase() === loc &&
                        Math.abs((parseFloat(e["Credit"]) || 0) - creditAmt) < 0.01 &&
                        String(e["Memo/Description"]).trim() === String(memo).trim()
                    );

                    if (isDuplicate) {
                        skippedDuplicates++;
                        continue;
                    }

                    const formattedEntry = {
                        "Posted dt.": postedDt, "Store": store, "Location": loc,
                        "Doc": docVal, "Memo/Description": memo, "Credit": creditAmt, "Mapped Brand": standardizedBrand
                    };
                    newGLRows.push(formattedEntry);
                    existingGLRows.push(formattedEntry);
                }

                if (newGLRows.length === 0) return alert(`No new entries added. ${skippedDuplicates} entries were identified as duplicates.`);

                await setDoc(doc(db, "workbook_v9_sheets", "GL_Raw_by_Store"), {
                    sheetName: "GL Raw by Store", rows: existingGLRows, updatedAt: Date.now()
                }, { merge: true });

                if (!masterWorkbook.value.data) masterWorkbook.value.data = {};
                masterWorkbook.value.data["GL Raw by Store"] = existingGLRows;

                logSystemAction("UPLOAD", `Ingested ${newGLRows.length} new Sage GL 4545 records (${skippedDuplicates} duplicates skipped).`);
                alert(`Successfully imported ${newGLRows.length} Sage GL entries! (${skippedDuplicates} duplicates skipped)`);
                await refreshLedger();
            } catch (err) {
                console.error("Sage GL Import Error:", err);
                alert("Failed to process Sage GL CSV: " + err.message);
            } finally {
                isProcessingUpload.value = false;
                if (event.target) event.target.value = '';
            }
        };

        const handleTreezPOSUpload = async (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            isProcessingUpload.value = true;
            try {
                const text = await file.text();
                const rows = text.split(/\r?\n/).map(line => line.split(',').map(c => c.replace(/^"(.*)"$/, '$1').trim()));
                if (rows.length < 2) return alert("The uploaded Treez POS CSV is empty.");

                const header = rows[0].map(h => h.toLowerCase());
                const brandIdx = header.findIndex(h => h.includes('brand'));
                const discountIdx = header.findIndex(h => h.includes('discount') || h.includes('owed') || h.includes('credit'));

                if (brandIdx === -1 || discountIdx === -1) return alert("Treez CSV must contain at least 'Brand' and 'Discount Amount/Credit Owed' columns.");
                alert(`Treez parser ready: Identified ${rows.length - 1} records.`);
            } catch (err) {
                console.error("Treez Import Error:", err);
                alert("Failed to read Treez POS CSV: " + err.message);
            } finally {
                isProcessingUpload.value = false;
                if (event.target) event.target.value = '';
            }
        };

        const handleLogin = () => {
            authError.value = '';
            signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value)
                .then(() => { emailInput.value = ''; passwordInput.value = ''; refreshIcons(); })
                .catch(() => { authError.value = "Invalid email or password."; });
        };

        const forceLock = () => { 
            signOut(auth).then(() => { 
                isManagerUnlocked.value = false; 
                loggedInUser.value = ''; 
            }); 
        };

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
                catch (error) { alert("Failed to delete."); }
            }
        };

        const openResolutionModal = (credit) => {
            resolutionCredit.value = credit;
            resolutionForm.value = { invoice: '', dateReceived: new Date().toISOString().split('T')[0] };
            showResolutionModal.value = true;
            refreshIcons();
        };

        const processResolution = async () => {
            if (!resolutionForm.value.invoice) return alert("Invoice / Memo number is required to resolve.");
            try {
                await updateDoc(doc(db, "promoCredits", resolutionCredit.value.id), { 
                    status: "Applied", invoice: resolutionForm.value.invoice, dateReceived: resolutionForm.value.dateReceived
                });
                await addDoc(collection(db, "emailHistories"), {
                    creditId: resolutionCredit.value.id, vendor: resolutionCredit.value.vendor, amount: resolutionCredit.value.amount,
                    site: resolutionCredit.value.site, action: "Resolved (Applied)", invoice: resolutionForm.value.invoice,
                    resolvedBy: loggedInUser.value, timestamp: Date.now()
                });
                logSystemAction("UPDATE", `Resolved credit for ${resolutionCredit.value.vendor} (Memo: ${resolutionForm.value.invoice})`);
                showResolutionModal.value = false;
            } catch (error) { console.error(error); alert("Failed to resolve."); }
        };

        const regenerateBrandSummary = async (brandReport) => {
            if (!confirm(`This will delete current aggregated summaries for ${brandReport.vendor} in ${brandReport.month} and re-calculate them from raw sales data. Continue?`)) return;
            await runRegeneration([brandReport], brandReport.month);
        };

        const regenerateMonthReports = async (monthGroup) => {
            if (!confirm(`Regenerate all brand summaries for ${monthGroup.month}? This will sync with latest Treez sales data.`)) return;
            await runRegeneration(monthGroup.brandList, monthGroup.month);
        };

        const runRegeneration = async (brandList, month) => {
            try {
                const batch = writeBatch(db);
                let workFound = false;

                for (const brand of brandList) {
                    const existingAggregated = promoCreditsList.value.filter(c => 
                        c.site === activeSite.value && c.trackingMonth === month &&
                        (c.vendor || '').toLowerCase() === (brand.vendor || '').toLowerCase() &&
                        c.creditType && String(c.creditType).includes('Aggregated POS Sales')
                    );
                    existingAggregated.forEach(c => {
                        batch.delete(doc(db, "promoCredits", c.id));
                        workFound = true;
                    });

                    const relevantSales = treesSalesData.value.filter(sale => 
                        sale.detectedSite === activeSite.value && sale.month === month &&
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

        const allBrandsSelected = computed(() => masterBrands.value.length > 0 && selectedBrands.value.length === masterBrands.value.length);

        const toggleAllBrands = () => {
            if (allBrandsSelected.value) selectedBrands.value = [];
            else selectedBrands.value = masterBrands.value.map(b => b.id).filter(Boolean);
        };

        const deleteSelectedBrands = async () => {
            if (selectedBrands.value.length === 0) return;
            if (confirm(`Are you sure you want to permanently delete these ${selectedBrands.value.length} brands from the cloud directory?`)) {
                try {
                    const batch = writeBatch(db);
                    selectedBrands.value.forEach(brandId => batch.delete(doc(db, "brands", brandId)));
                    await batch.commit();
                    selectedBrands.value = []; 
                } catch (error) { alert("Failed to delete brands from the cloud."); }
            }
        };

        const updateBrandField = async (brandId, fieldName, event) => {
            const newValue = event.target.value;
            try { await updateDoc(doc(db, "brands", brandId), { [fieldName]: newValue }); } 
            catch (error) { alert("Failed to save changes to the cloud."); }
        };

        const markAsSent = async (credit) => {
            if (confirm(`Mark this credit for ${credit.vendor} as 'Report Sent'?`)) {
                try {
                    await updateDoc(doc(db, "promoCredits", credit.id), { status: "Report Sent" });
                    await addDoc(collection(db, "emailHistories"), {
                        creditId: credit.id, vendor: credit.vendor, amount: credit.amount, site: credit.site,
                        action: "Report Sent", sentBy: loggedInUser.value, timestamp: Date.now()
                    });
                    logSystemAction("UPDATE", `Marked credit for ${credit.vendor} as Report Sent`);
                } catch (error) { alert("Failed to update status."); }
            }
        };

        const markReportGroupAsSent = async (report) => {
            if (confirm(`Mark all ${report.credits.length} credits for ${report.vendor} as 'Report Sent'?`)) {
                try {
                    const batch = writeBatch(db);
                    const timestamp = Date.now();
                    report.credits.forEach(credit => {
                        if (credit.status === 'Pending') {
                            batch.update(doc(db, "promoCredits", credit.id), { status: "Report Sent" });
                            batch.set(doc(collection(db, "emailHistories")), {
                                creditId: credit.id, vendor: credit.vendor, amount: credit.amount, site: credit.site,
                                action: "Report Sent (Batch)", sentBy: loggedInUser.value, timestamp: timestamp
                            });
                        }
                    });
                    await batch.commit();
                    logSystemAction("UPDATE", `Batch updated ${report.vendor} credits to 'Report Sent'`);
                } catch (error) { alert("Failed to update status for the group."); }
            }
        };

        const monthlyReportSummaries = computed(() => {
            const groups = {};
            const ensureStructure = (m, v) => {
                if (!groups[m]) groups[m] = { month: m, total: 0, count: 0, credits: [], brands: {} };
                const vendorName = getStandardizedBrandName(v) || 'Unmapped Brand';
                if (!groups[m].brands[vendorName]) {
                    const brandInfo = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === vendorName.toLowerCase()) || {};
                    groups[m].brands[vendorName] = { vendor: vendorName, month: m, email: brandInfo.email || '', rep: brandInfo.rep || '', credits: [], total: 0, workbookTotal: 0, posTotal: 0 };
                }
                return groups[m].brands[vendorName];
            };

            const targetMonth = activeMonth.value;
            const targetSite = activeSite.value;

            if (masterWorkbook.value && masterWorkbook.value.data) {
                Object.keys(masterWorkbook.value.data).forEach(sheetName => {
                    if (!sheetName.includes('2026')) return;
                    const mName = sheetName.split(' ')[0];
                    if (targetMonth !== 'All' && mName !== targetMonth) return;

                    const rows = masterWorkbook.value.data[sheetName] || [];
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
                                id: `sim-${mName}-${vendor}`, site: targetSite, trackingMonth: mName, vendor: vendor,
                                amount: amt, creditType: row["Promo Credits"] || 'Aggregated POS Sales',
                                dates: row["Date Requested"] || 'Workbook Sync',
                                status: (parseFloat(String(row[approvedKey] || row["Credits Approved"] || 0).replace(/[^0-9.-]+/g,"")) > 0) ? 'Applied' : 'Pending'
                            });
                        }
                    });
                });
            }

            promoCredits.value.forEach(c => {
                if (!c || c.site !== targetSite) return;
                if (targetMonth !== 'All' && c.trackingMonth !== targetMonth) return;
                if (c.invoice === 'WB-V9-SYNC') return;

                const brand = ensureStructure(c.trackingMonth, c.vendor);
                brand.credits.push(c);
                brand.total += (parseFloat(c.amount) || 0);
                groups[c.trackingMonth].total += (parseFloat(c.amount) || 0);
                groups[c.trackingMonth].count += 1;
            });

            return Object.values(groups).sort((a, b) => calendarMonths.indexOf(a.month) - calendarMonths.indexOf(b.month)).map(group => ({
                ...group, brandList: Object.values(group.brands).sort((a, b) => a.vendor.localeCompare(b.vendor))
            }));
        });

        const generateAuditStatementCSV = (brand) => {
            const targetSite = activeSite.value;
            const targetBrand = brand.vendor || brand.name || brand;
            const standardizedTarget = getStandardizedBrandName(targetBrand).trim().toLowerCase();
            const currentYear = "2026";
            
            const formatDayNumber = (d) => {
                const parsed = parseInt(d, 10);
                return isNaN(parsed) ? String(d).trim() : String(parsed).padStart(2, '0');
            };

            let csvLines = [
                "Period,Month_Ran,Location,Brand,Promo_Name,Days_Ran,New_Credits_Generated,Running_Total_Generated,Credits_Applied,Cumulative_Applied,Remaining_Unapplied_Balance,Status"
            ];

            let runningTotalGenerated = 0;
            let cumulativeApplied = 0;
            const expandedPromoDetails = [];

            const startIdx = calendarMonths.indexOf(startMonth.value || 'January');
            const endIdx = calendarMonths.indexOf(endMonth.value || 'September');
            const monthsToProcess = calendarMonths.slice(startIdx, Math.max(startIdx, endIdx) + 1);

            monthsToProcess.forEach(month => {
                const monthNum = String(calendarMonths.indexOf(month) + 1).padStart(2, '0');
                const monthLabel = `${monthNum} (${month})`;
                let monthlyGenerated = 0;
                let monthlyApplied = 0;

                const monthPromos = {};
                const ensurePromo = (pName) => {
                    const cleanName = (pName || 'Vendor Promotion').trim().replace(/,/g, ' ');
                    if (!monthPromos[cleanName]) {
                        monthPromos[cleanName] = { promoName: cleanName, days: new Set(), amount: 0 };
                    }
                    return monthPromos[cleanName];
                };

                const salesForThisMonth = (treesSalesData.value || []).filter(s => 
                    s.month === month && 
                    s.detectedSite === targetSite && 
                    getStandardizedBrandName(s.brand).toLowerCase() === standardizedTarget
                );

                salesForThisMonth.forEach(s => {
                    const pName = s.discountTitle || 'POS Promo Discount';
                    const promoEntry = ensurePromo(pName);
                    promoEntry.amount += (parseFloat(s.owed) || 0);

                    if (s.dateClosed) {
                        const d = new Date(s.dateClosed);
                        if (!isNaN(d.getTime())) promoEntry.days.add(formatDayNumber(d.getDate()));
                    }
                });

                const sheetName = `${month} ${currentYear}`;
                const monthlyRows = masterWorkbook.value?.data?.[sheetName] || [];

                monthlyRows.forEach(row => {
                    const rowKeys = Object.keys(row);
                    const brandKey = rowKeys.find(k => k.trim().toLowerCase() === 'brand');
                    const rowBrand = brandKey ? row[brandKey] : row[0];
                    if (!rowBrand) return;

                    if (getStandardizedBrandName(rowBrand).trim().toLowerCase() === standardizedTarget) {
                        const siteKey = rowKeys.find(k => k.trim().toLowerCase() === targetSite.toLowerCase() || (targetSite === 'Red Bluff' && k.trim().toLowerCase() === 'red-bluff'));
                        let rawAmt = 0;
                        if (siteKey) {
                            const val = String(row[siteKey]).trim().toLowerCase();
                            if (val === 'x') {
                                const promoKey = rowKeys.find(k => k.trim().toLowerCase() === 'promo credits' || k.trim().toLowerCase() === 'promo credits ');
                                rawAmt = promoKey ? row[promoKey] : 0;
                            } else {
                                rawAmt = row[siteKey];
                            }
                        }

                        const amt = parseFloat(String(rawAmt || 0).replace(/[^0-9.-]+/g, "")) || 0;
                        if (amt > 0) {
                            const promoKey = rowKeys.find(k => k.trim().toLowerCase() === 'promo credits' || k.trim().toLowerCase() === 'promo credits ');
                            let pName = promoKey && String(row[promoKey]).trim() ? String(row[promoKey]).trim() : 'Contracted Promo';
                            if (!isNaN(parseFloat(pName))) pName = 'Vendor Promotion';

                            const promoEntry = ensurePromo(pName);
                            if (promoEntry.amount === 0) promoEntry.amount = amt;

                            const sheet1Rows = masterWorkbook.value?.data?.["Sheet1"] || [];
                            let inMonthSection = false;
                            const targetHeader = `--- ${month} ${currentYear} ---`.toLowerCase();
                            sheet1Rows.forEach(s1Row => {
                                const vVal = String(s1Row["Vendor"] || '').trim().toLowerCase();
                                if (vVal.includes('---')) {
                                    inMonthSection = vVal.includes(targetHeader);
                                    return;
                                }
                                if (inMonthSection && getStandardizedBrandName(vVal) === standardizedTarget) {
                                    const datesStr = String(s1Row["Dates"] || '').trim();
                                    if (datesStr && !['/', 'n/a', 'nan', ''].includes(datesStr.toLowerCase())) {
                                        datesStr.split(/[,|;]+/).forEach(p => {
                                            const cleanP = p.trim();
                                            if (/^\d{1,2}$/.test(cleanP)) promoEntry.days.add(formatDayNumber(cleanP));
                                            else if (cleanP) promoEntry.days.add(cleanP.replace(/,/g, ' '));
                                        });
                                    }
                                }
                            });
                        }
                    }
                });

                const manualCredits = (promoCreditsList.value || []).filter(c => 
                    c.site === targetSite && c.trackingMonth === month &&
                    getStandardizedBrandName(c.vendor).toLowerCase() === standardizedTarget && c.invoice !== 'WB-V9-SYNC'
                );

                manualCredits.forEach(c => {
                    const amt = parseFloat(c.amount) || 0;
                    if (amt > 0) {
                        const pName = c.creditType || 'Manual Promo Credit';
                        const promoEntry = ensurePromo(pName);
                        promoEntry.amount += amt;

                        if (c.dates && !['n/a', 'workbook import', 'workbook sync', 'nan', ''].includes(c.dates.trim().toLowerCase())) {
                            c.dates.split(/[,|;]+/).forEach(p => {
                                const cleanP = p.trim();
                                if (/^\d{1,2}$/.test(cleanP)) promoEntry.days.add(formatDayNumber(cleanP));
                                else if (cleanP) promoEntry.days.add(cleanP.replace(/,/g, ' '));
                            });
                        }
                    }
                });

                const glRows = masterWorkbook.value?.data?.["GL Raw by Store"] || [];
                glRows.forEach(row => {
                    const rowStore = detectSiteFromName(row["Store"] || row["Location"]);
                    if (rowStore !== targetSite) return;
                    const rowBrand = row["Mapped Brand"] || '';
                    if (getStandardizedBrandName(rowBrand).trim().toLowerCase() === standardizedTarget) {
                        const dateStr = row["Posted dt."] || '';
                        if (detectMonthFromDate(dateStr) === month) {
                            monthlyApplied += parseFloat(String(row["Credit"] || 0).replace(/[^0-9.-]+/g, "")) || 0;
                        }
                    }
                });

                const activePromosList = Object.values(monthPromos);
                monthlyGenerated = activePromosList.reduce((sum, p) => sum + p.amount, 0);

                runningTotalGenerated += monthlyGenerated;
                cumulativeApplied += monthlyApplied;
                const balance = runningTotalGenerated - cumulativeApplied;

                let status = "No Activity";
                if (balance <= 0.01 && (monthlyGenerated > 0 || monthlyApplied > 0)) status = "Reconciled / Settled";
                else if (monthlyApplied > 0 && balance > 0.01) status = "Partial Payment";
                else if (monthlyGenerated > 0 && monthlyApplied === 0) status = "Outstanding";
                else if (balance < 0) status = "Credit Balance";

                let summaryPromoName = "-";
                let summaryDaysRan = "-";

                if (activePromosList.length > 0) {
                    summaryPromoName = activePromosList.map(p => p.promoName).join(" | ");
                    const allDaysSet = new Set();
                    activePromosList.forEach(p => p.days.forEach(d => allDaysSet.add(d)));
                    const sortedDays = Array.from(allDaysSet).sort();
                    summaryDaysRan = sortedDays.length > 0 ? sortedDays.join(", ") : "-";

                    activePromosList.forEach(p => {
                        const pDaysSorted = Array.from(p.days).sort();
                        const pDaysStr = pDaysSorted.length > 0 ? pDaysSorted.join(", ") : "-";
                        expandedPromoDetails.push(`"${monthLabel}","${targetBrand}","${targetSite}","${p.promoName}","${pDaysStr}",${pDaysSorted.length || 1},${p.amount.toFixed(2)}`);
                    });
                }

                csvLines.push(`"${month} ${currentYear}","${monthLabel}","${targetSite}","${targetBrand}","${summaryPromoName}","${summaryDaysRan}",${monthlyGenerated.toFixed(2)},${runningTotalGenerated.toFixed(2)},${monthlyApplied.toFixed(2)},${cumulativeApplied.toFixed(2)},${balance.toFixed(2)},"${status}"`);
            });

            const finalBalance = runningTotalGenerated - cumulativeApplied;
            const finalStatus = finalBalance > 0.01 ? "ACTION REQUIRED" : "Settled";
            csvLines.push(`YTD Total,-,"${targetSite}","${targetBrand}","All Active Promos","-",${runningTotalGenerated.toFixed(2)},${runningTotalGenerated.toFixed(2)},${cumulativeApplied.toFixed(2)},${cumulativeApplied.toFixed(2)},${finalBalance.toFixed(2)},"${finalStatus}"`);

            csvLines.push("");
            csvLines.push("EXPANDED PROMOTIONAL EVENT DETAILS");
            csvLines.push("Month_Ran,Brand,Location,Promo_Name,Days_Ran,Total_Days,Amount_Generated ($)");

            if (expandedPromoDetails.length > 0) expandedPromoDetails.forEach(line => csvLines.push(line));
            else csvLines.push(`-,"${targetBrand}","${targetSite}","No promotional events recorded","-",0,0.00`);

            return csvLines.join("\n");
        };

        const downloadMonthlyReport = (brand) => {
            const targetBrand = brand.vendor || brand.brand || brand.name || '';
            const csvContent = generateAuditStatementCSV(brand);
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            const currentYear = new Date().getFullYear();
            const safeBrandName = String(targetBrand).replace(/[^a-zA-Z0-9]/g, '_');
            link.setAttribute("download", `${activeSite.value.replace(/\s/g, '_')}_Statement_${safeBrandName}_${currentYear}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 150);
            logSystemAction("EXPORT", `Downloaded Statement for ${targetBrand}`);
        };

<<<<<<< HEAD
                const exportVendorsAndBrandsCSV = () => {
            if (!masterBrands.value || masterBrands.value.length === 0) {
                return alert("No brands available to export.");
            }
=======
        const exportVendorsAndBrandsCSV = () => {
            if (!masterBrands.value || masterBrands.value.length === 0) return alert("No brands available to export.");
>>>>>>> e6dffa0337c71c8654a27c7804377458df720b09
            const grouped = {};
            masterBrands.value.forEach(b => {
                const distro = b.distributor ? b.distributor.trim() : 'Unassigned Vendor';
                const brand = b.vendor ? b.vendor.trim() : 'Unknown Brand';
                if (!grouped[distro]) grouped[distro] = [];
                grouped[distro].push(brand);
            });

            const sortedDistros = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
            let csvContent = "Vendor/Distributor,Attached Brand\n";
            sortedDistros.forEach(distro => {
                const sortedBrands = grouped[distro].sort((a, b) => a.localeCompare(b));
                sortedBrands.forEach(brand => {
                    csvContent += `"${distro.replace(/"/g, '""')}","${brand.replace(/"/g, '""')}"\n`;
                });
            });

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `Vendors_and_Brands_Directory_${new Date().getFullYear()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 150);
            logSystemAction("EXPORT", "Downloaded Vendors and Brands Directory CSV");
        };

<<<<<<< HEAD
        const calculateMonthlyReport = (brandName) => {
            if (!brandName) return { reddingGenerated: 0, reddingRecovered: 0, redBluffGenerated: 0, redBluffRecovered: 0, totalGenerated: 0, totalRecovered: 0, balance: 0 };
            let redGen = 0, redRec = 0, rbGen = 0, rbRec = 0;
            const startIdx = calendarMonths.indexOf(startMonth.value || 'January');
            const endIdx = calendarMonths.indexOf(endMonth.value || 'September');
            const monthsToProcess = calendarMonths.slice(startIdx, Math.max(startIdx, endIdx) + 1);
            const standardizedTarget = getStandardizedBrandName(brandName).trim().toLowerCase();
            if (masterWorkbook.value?.data) {
                monthsToProcess.forEach(m => {
                    const sheetName = `${m} 2026`;
                    const rows = masterWorkbook.value.data[sheetName] || [];
                    rows.forEach(row => {
                        const keys = Object.keys(row);
                        const brandKey = keys.find(k => k.trim().toLowerCase() === 'brand');
                        const promoKey = keys.find(k => k.trim().toLowerCase() === 'promo credits');
                        const reddingKey = keys.find(k => k.trim().toLowerCase().includes('redding'));
                        const redBluffKey = keys.find(k => k.trim().toLowerCase().includes('red-bluff') || k.trim().toLowerCase().includes('red bluff'));
                        const rowBrand = brandKey ? String(row[brandKey]).trim() : String(row[0] || '').trim();
                        if (rowBrand && getStandardizedBrandName(rowBrand).toLowerCase() === standardizedTarget) {
                            const promoAmt = promoKey ? parseFloat(String(row[promoKey]).replace(/[^0-9.-]+/g, "")) || 0 : 0;
                            if (reddingKey && String(row[reddingKey]).trim().toLowerCase() === 'x') redGen += promoAmt;
                            if (redBluffKey && String(row[redBluffKey]).trim().toLowerCase() === 'x') rbGen += promoAmt;
                        }
                    });
                });
                const sageRows = masterWorkbook.value.data["GL Raw by Store"] || [];
                sageRows.forEach(row => {
                    const rowBrand = row["Mapped Brand"] || '';
                    if (getStandardizedBrandName(rowBrand).trim().toLowerCase() === standardizedTarget) {
                        const dateStr = row["Posted dt."] || '';
                        const month = detectMonthFromDate(dateStr);
                        if (monthsToProcess.includes(month)) {
                            const amt = parseFloat(String(row["Credit"] || 0).replace(/[^0-9.-]+/g, "")) || 0;
                            const site = detectSiteFromName(row["Store"] || row["Location"]);
                            if (site === 'Redding') redRec += amt;
                            if (site === 'Red Bluff') rbRec += amt;
                        }
                    }
                });
            }
            const gen = redGen + rbGen;
            const rec = redRec + rbRec;
            return { reddingGenerated: redGen, reddingRecovered: redRec, redBluffGenerated: rbGen, redBluffRecovered: rbRec, totalGenerated: gen, totalRecovered: rec, balance: gen - rec };
        };

        const generateStandardEmail = (brand) => {
            const vendorName = brand.vendor || brand.name || brand;
            const reportData = calculateMonthlyReport(vendorName);
            let finalGen = (!activeSite.value || activeSite.value === 'All') ? reportData.totalGenerated : (activeSite.value === 'Redding' ? reportData.reddingGenerated : reportData.redBluffGenerated);
            const longSiteName = (!activeSite.value || activeSite.value === 'All') ? 'Sundial Collective – All Locations' : `Sundial Collective – ${activeSite.value}`;
            const startPeriod = startMonth.value || 'January';
            const endPeriod = endMonth.value || 'September';
            const userName = loggedInUser.value || 'Nicholas G.';
            return `Hi ${vendorName} Team,\n\nI hope you're doing well!\n\nAs part of our ongoing monthly reporting, we are providing the promotional credit summary for ${longSiteName} for the period of ${startPeriod} through ${endPeriod} 2026. This summary reflects the promotional discounts issued at our retail registers for your products.\n\nOur records indicate a total of ${formatCurrency(finalGen)} in promotional credits generated during this period.\n\nPromotional Credit Summary – ${startPeriod} through ${endPeriod} 2026\n${longSiteName}\n- Total Credits Generated: ${formatCurrency(finalGen)}\n\nFor your convenience, we have attached a detailed chronological breakdown showing the promotional credits generated by store.\n\nPlease review the attached summary with your Accounting or Accounts Receivable team and let us know when we can expect a credit memo or offset applied to our upcoming inventory invoices for these generated credits.\n\nWe appreciate your continued partnership and assistance in keeping our promotional credits current. Thank you for your support!\n\nBest regards,\n${userName}\nRREDCO`;
        };

        const generateAuditFindingEmail = (brand) => {
            const vendorName = brand.vendor || brand.name || brand;
            const auditData = calculateMonthlyReport(vendorName);
            let finalGen = (!activeSite.value || activeSite.value === 'All') ? auditData.totalGenerated : (activeSite.value === 'Redding' ? auditData.reddingGenerated : auditData.redBluffGenerated);
            let finalRec = (!activeSite.value || activeSite.value === 'All') ? auditData.totalRecovered : (activeSite.value === 'Redding' ? auditData.reddingRecovered : auditData.redBluffRecovered);
            let finalBal = finalGen - finalRec;
            const longSiteName = (!activeSite.value || activeSite.value === 'All') ? 'Sundial Collective – All Locations' : `Sundial Collective – ${activeSite.value}`;
            const startPeriod = startMonth.value || 'January';
            const endPeriod = endMonth.value || 'September';
            const userName = loggedInUser.value || 'Nicholas G.';
            const locationText = (!activeSite.value || activeSite.value === 'All') ? 'combined locations' : `${activeSite.value} location`;
            return `Hi ${vendorName} Team,\n\nI hope you're doing well!\n\nAs part of our ongoing financial review, we recently reconciled our promotional credits for ${longSiteName} for the period of ${startPeriod} through ${endPeriod} 2026. This included comparing promotional discounts issued at our retail registers against vendor credits received and applied to our account.\n\nOur reconciliation identified an outstanding promotional credit balance of ${formatCurrency(finalBal)} for your products at our ${locationText}.\n\nPromotional Credit Summary – ${startPeriod} through ${endPeriod} 2026\n${longSiteName}\n- Total Credits Generated: ${formatCurrency(finalGen)}\n- Total Credits Received: ${formatCurrency(finalRec)}\n- Outstanding Balance: ${formatCurrency(finalBal)}\n\nFor your convenience, we have attached a detailed monthly reconciliation showing the promotional credits generated, reimbursements received, and remaining outstanding balance.\n\nPlease review the attached summary with your Accounting or Accounts Receivable team and let us know when we can expect the outstanding credits to be issued or applied toward upcoming inventory invoices.\n\nIf any credits have already been issued that are not reflected in our records, please provide copies so we can update our reconciliation accordingly.\n\nWe appreciate your continued partnership and assistance in keeping our promotional credits current. Thank you for your support!\n\nBest regards,\n${userName}\nRREDCO`;
        };

        const refreshEmailDraft = () => {
            if (!selectedBrandForEmail.value) return;
            const brand = selectedBrandForEmail.value;
            const startPeriod = startMonth.value || 'January';
            const endPeriod = endMonth.value || 'September';
            emailDraftSubject.value = `Promo Credit Statement (${startPeriod} 2026 - ${endPeriod} 2026)`;
            emailDraftBody.value = emailReportMode.value === 'standard' ? generateStandardEmail(brand) : generateAuditFindingEmail(brand);
        };

        const openEmailDraft = (brand) => {
            selectedBrandForEmail.value = brand;
            showEmailDraftModal.value = true;
            refreshEmailDraft();
        };

        const sendEmailDraft = () => {
            if (!selectedBrandForEmail.value) return;
            const brand = selectedBrandForEmail.value;
            const startPeriod = startMonth.value || 'January';
            const endPeriod = endMonth.value || 'September';
            const csvContent = generateAuditStatementCSV(brand);
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `${(brand.vendor || brand.name || brand).replace(/\s/g, '_')}_Statement_${startPeriod}_to_${endPeriod}_2026.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            const cleanEmails = String(brand.email || '').split(/[,;\s]+/).map(e => e.trim()).filter(Boolean).join(',');
            const mailtoUrl = `mailto:${cleanEmails}?cc=accounting@rredco.com&subject=${encodeURIComponent(emailDraftSubject.value)}&body=${encodeURIComponent(emailDraftBody.value)}`;
            setTimeout(() => {
                const mailLink = document.createElement("a");
                mailLink.href = mailtoUrl;
                mailLink.setAttribute("target", "_top");
                document.body.appendChild(mailLink);
                mailLink.click();
                document.body.removeChild(mailLink);
            }, 300);
            showEmailDraftModal.value = false;
            logSystemAction("EXPORT", `Dispatched Statement Email for ${brand.vendor || brand.name}`);
        };

        const copyEmailToClipboard = async () => {
            const fullText = `Subject: ${emailDraftSubject.value}\n\n${emailDraftBody.value}`;
            try {
                await navigator.clipboard.writeText(fullText);
                alert("Email content copied to clipboard!");
            } catch (err) {
                alert("Failed to copy to clipboard.");
            }
        };

        // CHARTS LOGIC
        let chartMonthlyInstance = null;
        let chartDistrosInstance = null;
        let chartBrandsInstance = null;
        let chartStoresInstance = null;
=======
        let chartMonthlyInstance = null, chartDistrosInstance = null, chartBrandsInstance = null, chartStoresInstance = null;
>>>>>>> e6dffa0337c71c8654a27c7804377458df720b09

        const drawCharts = () => {
            const activeCredits = promoCredits.value.filter(c => !c.archived);
            const currencyFormatter = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
            
            const customTooltip = { backgroundColor: '#111827', titleColor: '#f59e0b', padding: 12, cornerRadius: 8, callbacks: { label: (ctx) => ` ${currencyFormatter(ctx.raw)}` } };
            const standardVerticalOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: customTooltip }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#64748b' } }, y: { grid: { color: '#e2e8f0', borderDash: [4, 4] }, border: { display: false }, ticks: { callback: currencyFormatter, color: '#64748b' } } } };
            const standardHorizontalOptions = { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: customTooltip }, scales: { x: { grid: { color: '#e2e8f0', borderDash: [4, 4] }, border: { display: false }, ticks: { callback: currencyFormatter, color: '#64748b' } }, y: { grid: { display: false }, border: { display: false }, ticks: { color: '#64748b' } } } };

            const monthlySums = {};
            activeCredits.forEach(c => {
                const m = c.trackingMonth || 'Unknown';
                monthlySums[m] = (monthlySums[m] || 0) + (parseFloat(c.amount) || 0);
            });
            const sortedMonths = calendarMonths.filter(m => monthlySums[m] !== undefined);
            
            const mEl = document.getElementById('chartMonthly');
            if (mEl) {
                if (chartMonthlyInstance) chartMonthlyInstance.destroy();
                chartMonthlyInstance = new Chart(mEl, { type: 'bar', data: { labels: sortedMonths, datasets: [{ data: sortedMonths.map(m => monthlySums[m]), backgroundColor: '#10b981', borderRadius: 6 }] }, options: standardVerticalOptions });
            }

            const distroSums = {};
            activeCredits.forEach(c => {
                const d = (c.distributor || '').trim();
                if (d && !['Trees POS Import', 'Auto-Imported', 'unmapped', '-'].includes(d.toLowerCase())) {
                    distroSums[d] = (distroSums[d] || 0) + (parseFloat(c.amount) || 0);
                }
            });
            const topDistros = Object.entries(distroSums).sort((a, b) => b[1] - a[1]).slice(0, 10);
            
            const dEl = document.getElementById('chartDistros');
            if (dEl) {
                if (chartDistrosInstance) chartDistrosInstance.destroy();
                chartDistrosInstance = new Chart(dEl, { type: 'bar', data: { labels: topDistros.map(d => d[0]), datasets: [{ data: topDistros.map(d => d[1]), backgroundColor: '#f59e0b', borderRadius: 6 }] }, options: standardHorizontalOptions });
            }

            const brandSums = {};
            activeCredits.forEach(c => {
                const b = (c.vendor || '').trim();
                if (b && b.toLowerCase() !== 'unmapped brand') {
                    brandSums[b] = (brandSums[b] || 0) + (parseFloat(c.amount) || 0);
                }
            });
            const topBrands = Object.entries(brandSums).sort((a, b) => b[1] - a[1]).slice(0, 10);
            
            const bEl = document.getElementById('chartBrands');
            if (bEl) {
                if (chartBrandsInstance) chartBrandsInstance.destroy();
                chartBrandsInstance = new Chart(bEl, { type: 'bar', data: { labels: topBrands.map(b => b[0]), datasets: [{ data: topBrands.map(b => b[1]), backgroundColor: '#10b981', borderRadius: 6 }] }, options: standardHorizontalOptions });
            }

            const storeSums = {};
            activeCredits.forEach(c => {
                const s = c.site || 'Unknown';
                storeSums[s] = (storeSums[s] || 0) + (parseFloat(c.amount) || 0);
            });
            
            const sEl = document.getElementById('chartStores');
            if (sEl) {
                if (chartStoresInstance) chartStoresInstance.destroy();
                chartStoresInstance = new Chart(sEl, { type: 'doughnut', data: { labels: Object.keys(storeSums), datasets: [{ data: Object.values(storeSums), backgroundColor: ['#10b981', '#f59e0b', '#64748b', '#111827'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'bottom', labels: { color: '#475569' } }, tooltip: customTooltip } } });
            }
        };

        // WORKBOOK LOAD & LISTENERS
        let unsubscribeSales = null;
        let unsubscribeCredits = null;
        let unsubscribeBrands = null;
        let unsubscribeWorkbookSheets = null;
        let unsubscribeWorkbookMetadata = null;
        let unsubscribeLogs = null;

        const setupFilteredListeners = () => {
            if (unsubscribeSales) unsubscribeSales();
            let salesQ = query(collection(db, "treesSales"), where("detectedSite", "==", activeSite.value));
            if (activeMonth.value !== 'All') salesQ = query(salesQ, where("month", "==", activeMonth.value));
            salesQ = query(salesQ, limit(4000));

            unsubscribeSales = onSnapshot(salesQ, (snapshot) => {
                const fetchedSales = [];
                snapshot.forEach(docSnap => { fetchedSales.push({ id: docSnap.id, ...docSnap.data() }); });
                treesSalesData.value = fetchedSales;
            }, (err) => console.error("Sales Pull Failed:", err));
        };

        watch([activeSite, activeMonth], () => {
            if (isManagerUnlocked.value) setupFilteredListeners();
        });

        const activeWorkbookHeaders = computed(() => {
            const rows = masterWorkbook.value?.data?.[activeWorkbookSheet.value] || [];
            if (rows.length === 0) return workbookSchema[activeWorkbookSheet.value] || [];
            const keys = new Set();
            rows.slice(0, 10).forEach(row => {
                Object.keys(row).forEach(k => {
                    if (k !== '__rowNum__' && !k.startsWith('EMPTY')) keys.add(k);
                });
            });
            return Array.from(keys);
        });

        const loadWorkbookFromStorage = async () => {
            try {
                const fileRef = sRef(storage, "RRedco Server/Promo Tracker/Master_Workbook_V9_Board_Report.xlsx");
                const bytes = await getBytes(fileRef);
                const workbook = window.XLSX.read(bytes, { type: 'array' });
                const batch = writeBatch(db);
                let sheetsImported = 0;

                for (const sheetName of workbook.SheetNames) {
                    const worksheet = workbook.Sheets[sheetName];
                    const json = window.XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                    const prunedRows = json.filter(row => Object.values(row).some(val => val !== "" && val !== null && val !== undefined));

                    const docId = sheetName.replace(/\//g, '_');
                    const sheetRef = doc(db, "workbook_v9_sheets", docId);
                    batch.set(sheetRef, { sheetName, rows: prunedRows, updatedAt: Date.now() });
                    masterWorkbook.value.data[sheetName] = prunedRows;
                    sheetsImported++;
                }

                await batch.commit();
                isWorkbookLoaded.value = true;
                alert(`Permanent Population Complete!\n\n${sheetsImported} sheets saved into Firestore.`);
            } catch (err) {
                console.error("Storage Workbook Error:", err);
                alert("Failed to load workbook: " + err.message);
            }
        };

        const repopulateFromMasterWorkbook = async () => {
            if (!masterWorkbook.value?.data) return alert("No workbook data found.");
            if (!confirm("⚠️ CRITICAL ACTION: Clear active credits and repopulate from Workbook?")) return;

            try {
                const batch = writeBatch(db);
                let creditsDeleted = 0, creditsCreated = 0;

                promoCredits.value.forEach(c => {
                    if (!c.archived) {
                        batch.delete(doc(db, "promoCredits", c.id));
                        creditsDeleted++;
                    }
                });

                for (const sheetName of Object.keys(masterWorkbook.value.data)) {
                    if (!sheetName.includes('2026')) continue;
                    const monthName = sheetName.split(' ')[0];
                    const rows = masterWorkbook.value.data[sheetName] || [];

                    rows.forEach(row => {
                        const vendor = row["Brand"] || row[0];
                        if (!vendor || vendor === "Brand" || String(vendor).toLowerCase().includes('total')) return;

                        ["Redding", "Red-Bluff"].forEach((siteKey, idx) => {
                            const siteName = siteKey === "Red-Bluff" ? "Red Bluff" : "Redding";
                            const rawAmt = row[siteKey] || row[idx + 1];
                            const amt = parseFloat(String(rawAmt || 0).replace(/[^0-9.-]+/g,"")) || 0;

                            if (amt > 0) {
                                const creditRef = doc(collection(db, "promoCredits"));
                                const approvedAmt = parseFloat(String(row["Credits Approved"] || 0).replace(/[^0-9.-]+/g,"")) || 0;
                                const isApplied = (approvedAmt > 0) || (!!row["Date Applied"] && row["Date Applied"] !== 'N/A');

                                batch.set(creditRef, {
                                    site: siteName,
                                    trackingMonth: monthName,
                                    vendor: vendor,
                                    distributor: 'Workbook Sync',
                                    creditType: row["Promo Credits "] || 'Promo',
                                    dates: row["Date Requested"] || 'Workbook Import',
                                    amount: amt,
                                    dateRequested: row["Date Requested"] || '',
                                    dateReceived: row["Date Applied"] || '',
                                    invoice: 'WB-V9-SYNC',
                                    status: isApplied ? "Applied" : "Pending",
                                    createdAt: Date.now(),
                                    archived: false
                                });
                                creditsCreated++;
                            }
                        });
                    });
                }

                await batch.commit();
                logSystemAction("IMPORT", `Master Wipe & Sync: Cleared ${creditsDeleted}, created ${creditsCreated}.`);
                alert(`Sync Complete! Cleared ${creditsDeleted}, created ${creditsCreated} records.`);
            } catch (err) {
                console.error(err);
                alert("Failed to repopulate: " + err.message);
            }
        };

        const updateWorkbookFromSales = async () => {
            if (!masterWorkbook.value?.data) return alert("Master Workbook not loaded.");
            const unsynced = treesSalesData.value.filter(s => s.status === 'Unsynced');
            if (unsynced.length === 0) return alert("No unsynced sales found.");

            if (!confirm(`Merge ${unsynced.length} sales into Master Workbook Document?`)) return;

            try {
                const updatedData = JSON.parse(JSON.stringify(masterWorkbook.value.data));
                const currentYear = "2026";
                let updatesCount = 0;

                unsynced.forEach(sale => {
                    const sheetName = `${sale.month} ${currentYear}`;
                    if (!updatedData[sheetName]) return;
                    const rows = updatedData[sheetName];
                    const cleanBrand = (sale.brand || '').toLowerCase().trim();

                    let brandRow = rows.find(r => (r["Brand"] || r[0] || '').toLowerCase().trim() === cleanBrand);
                    if (!brandRow) {
                        brandRow = { "Brand": sale.brand, "Redding": 0, "Red-Bluff": 0, "Promo Credits ": 0, "Treez Total": 0 };
                        rows.push(brandRow);
                    }

                    const siteKey = sale.detectedSite === "Redding" ? "Redding" : "Red-Bluff";
                    brandRow[siteKey] = (parseFloat(String(brandRow[siteKey] || 0).replace(/[^0-9.-]+/g,"")) || 0) + (sale.owed || 0);
                    brandRow["Treez Total"] = (parseFloat(String(brandRow["Treez Total"] || 0).replace(/[^0-9.-]+/g,"")) || 0) + (sale.owed || 0);
                    updatesCount++;
                });

                const sheetsToUpdate = new Set(unsynced.map(s => `${s.month} ${currentYear}`));
                for (const sheetName of sheetsToUpdate) {
                    if (updatedData[sheetName]) {
                        await setDoc(doc(db, "workbook_v9_sheets", sheetName.replace(/\//g, '_')), {
                            sheetName, rows: updatedData[sheetName], updatedAt: Date.now()
                        });
                    }
                }

                const batch = writeBatch(db);
                unsynced.forEach(sale => {
                    batch.update(doc(db, "treesSales", sale.id), { status: 'Synced' });
                });
                await batch.commit();

                logSystemAction("UPDATE", `Merged ${unsynced.length} sales into Master Workbook.`);
                alert(`Success! Updated ${updatesCount} line items.`);
            } catch (err) {
                console.error(err);
                alert("Failed to update workbook: " + err.message);
            }
        };

        const pushToMainTracker = async () => {
            const recordsToSync = treesSalesData.value.filter(s => s.status === 'Unsynced');
            if (recordsToSync.length === 0) return alert("No unsynced sales found.");

            const groupedBrands = {};
            recordsToSync.forEach(sale => {
                const uniqueKey = `${sale.detectedSite}___${sale.brand}___${sale.month}`;
                if (!groupedBrands[uniqueKey]) {
                    groupedBrands[uniqueKey] = { 
                        site: sale.detectedSite, 
                        brand: sale.brand, 
                        month: sale.month, 
                        totalOwed: 0, 
                        itemCount: 0, 
                        salesItems: [],
                        saleDates: new Set()
                    };
                }
                groupedBrands[uniqueKey].totalOwed += sale.owed;
                groupedBrands[uniqueKey].itemCount += 1;
                groupedBrands[uniqueKey].salesItems.push(sale.id);
                if (sale.dateClosed) {
                    const cleanDate = sale.dateClosed.split(' ')[0];
                    if (cleanDate) groupedBrands[uniqueKey].saleDates.add(cleanDate);
                }
            });

            let creditsCreated = 0;
            const batch = writeBatch(db);

            for (const [, data] of Object.entries(groupedBrands)) {
                if (data.totalOwed > 0) {
                    const masterRecord = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === data.brand.toLowerCase());
                    const payload = {
                        site: data.site,
                        trackingMonth: data.month,
                        vendor: data.brand,
                        distributor: masterRecord?.distributor || '',
                        creditType: `Aggregated POS Sales (${data.itemCount} items)`,
                        dates: Array.from(data.saleDates).sort().join(", "),
                        amount: data.totalOwed,
                        dateRequested: new Date().toLocaleDateString(),
                        dateReceived: '',
                        invoice: 'CSV-AUTO-SYNC',
                        status: 'Pending',
                        createdAt: Date.now()
                    };
                    batch.set(doc(collection(db, "promoCredits")), payload);
                    creditsCreated++;

                    data.salesItems.forEach(saleId => {
                        batch.update(doc(db, "treesSales", saleId), { status: 'Synced' });
                    });
                }
            }

            try {
                await batch.commit();
                logSystemAction("UPDATE", `Synced and aggregated ${creditsCreated} vendor credits.`);
                alert(`Success! Aggregated ${creditsCreated} vendor credits.`);
            } catch (err) {
                console.error(err);
                alert("Failed to sync aggregated credits.");
            }
        };

        const handleTreesCsvUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const storagePath = `master_csvs/${activeSite.value}/${new Date().getFullYear()}/${activeMonth.value}/${Date.now()}_${file.name}`;
            const fileRef = sRef(storage, storagePath);

            try {
                const manifestRef = await addDoc(collection(db, "source_uploads"), {
                    fileName: file.name,
                    storagePath: storagePath,
                    uploadedBy: loggedInUser.value,
                    uploadedAt: Date.now(),
                    site: activeSite.value,
                    month: activeMonth.value,
                    status: 'Preserved'
                });
                const uploadId = manifestRef.id;
                await uploadBytes(fileRef, file);

                const reader = new FileReader();
                reader.onload = async (evt) => {
                    try {
                        const rows = evt.target.result.split(/\r?\n/);
                        if (rows.length < 2) return alert("File is empty or invalid.");

                        const parseCSVRow = (str) => {
                            const result = [];
                            let cell = '';
                            let inQuotes = false;
                            for (let i = 0; i < str.length; i++) {
                                const char = str[i];
                                if (char === '"') inQuotes = !inQuotes;
                                else if (char === ',' && !inQuotes) { result.push(cell.trim()); cell = ''; }
                                else cell += char;
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
                                uploadId,
                                month: parsedMonth,
                                brand: brandVal || 'Unknown Brand',
                                discountTitle: getVal(rowObj, 'Discount Title', 'Discount Name') || '',
                                dateClosed: dateStr,
                                storeName: storeString,
                                detectedSite,
                                productName: getVal(rowObj, 'Product Name', 'Product') || '',
                                owed: owedAmt,
                                trackingId: trackingVal || '',
                                unitsSold: units,
                                unitPrice,
                                discountAmount: discAmt,
                                status: 'Unsynced',
                                uploadedAt: Date.now()
                            };

                            batch.set(doc(collection(db, "treesSales")), newSale);
                            count++;
                            if (count % 400 === 0) await batch.commit();
                        }

                        await batch.commit();
                        await updateDoc(doc(db, "source_uploads", uploadId), { status: 'Parsed', rowCount: count });
                        logSystemAction("IMPORT", `Uploaded ${count} raw sales items.`);
                        alert(`Successfully uploaded ${count} sales records!`);
                        e.target.value = '';
                    } catch (error) {
                        console.error(error);
                        alert("Error parsing CSV.");
                    }
                };
                reader.readAsText(file);
            } catch (err) {
                console.error(err);
                alert("Failed to preserve file to Storage.");
            }
        };

        const handleSageCsvUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!confirm("Upload Sage Report to 'GL Raw by Store'?")) return;

            try {
                const storagePath = `sage_uploads/${activeSite.value}/${Date.now()}_${file.name}`;
                await uploadBytes(sRef(storage, storagePath), file);

                const reader = new FileReader();
                reader.onload = async (evt) => {
                    const rows = evt.target.result.split(/\r?\n/).filter(r => r.trim() !== '');
                    const parseCSVRow = (str) => {
                        const result = [];
                        let cell = '';
                        let inQuotes = false;
                        for (let i = 0; i < str.length; i++) {
                            const char = str[i];
                            if (char === '"') inQuotes = !inQuotes;
                            else if (char === ',' && !inQuotes) { result.push(cell.trim()); cell = ''; }
                            else cell += char;
                        }
                        result.push(cell.trim());
                        return result;
                    };

                    const headers = parseCSVRow(rows[0]).map(h => h.replace(/["']/g, '').trim());
                    const imported = [];

                    for (let i = 1; i < rows.length; i++) {
                        const cols = parseCSVRow(rows[i]);
                        const rowObj = {};
                        headers.forEach((h, idx) => { rowObj[h] = cols[idx] ? cols[idx].replace(/["']/g, '') : ''; });
                        imported.push({
                            "Posted dt.": rowObj["Posted dt."] || rowObj["Date"] || '',
                            "Store": rowObj["Store"] || rowObj["Location"] || '',
                            "Location": rowObj["Location"] || '',
                            "Memo/Description": rowObj["Memo/Description"] || rowObj["Description"] || rowObj["Memo"] || '',
                            "Credit": parseFloat(String(rowObj["Credit"] || rowObj["Amount"] || 0).replace(/[^0-9.-]+/g,"")) || 0,
                            "Mapped Brand": ""
                        });
                    }

                    const updatedData = JSON.parse(JSON.stringify(masterWorkbook.value.data || {}));
                    updatedData["GL Raw by Store"] = [...(updatedData["GL Raw by Store"] || []), ...imported];

                    await setDoc(doc(db, "workbook_v9_sheets", "GL_Raw_by_Store"), {
                        sheetName: "GL Raw by Store",
                        rows: updatedData["GL Raw by Store"],
                        updatedAt: Date.now()
                    });

                    logSystemAction("IMPORT", `Uploaded ${imported.length} Sage GL entries.`);
                    alert(`Success! Added ${imported.length} entries.`);
                    e.target.value = '';
                };
                reader.readAsText(file);
            } catch (err) {
                console.error(err);
                alert("Storage error.");
            }
        };

        const processWorkbookSync = async () => {
            if (!workbookPasteData.value.trim()) return;
            const rows = workbookPasteData.value.trim().split(/\r?\n/);
            const lastRow = rows[rows.length - 1].split('\t');
            if (lastRow.length < 2) return alert("Please paste at least two columns (Month and Total).");

            const month = lastRow[0];
            const total = parseFloat(String(lastRow[1]).replace(/[^0-9.-]+/g,"")) || 0;
            if (isNaN(total)) return alert("Invalid amount.");

            try {
                const docId = `Board_Report_${activeSite.value.replace(/\s/g, '_')}`;
                await setDoc(doc(db, "promo tracker", docId), {
                    reportMonth: month,
                    total: total,
                    updatedAt: Date.now(),
                    updatedBy: loggedInUser.value,
                    site: activeSite.value
                });
                logSystemAction("UPDATE", `Synced Workbook Totals: ${month} - ${formatCurrency(total)}`);
                showWorkbookSyncModal.value = false;
                alert(`Success! Balance updated to ${formatCurrency(total)}.`);
            } catch (error) {
                console.error(error);
                alert("Failed to sync totals.");
            }
        };

        // BRAND CONTACT ROSTER PASTE IMPORT
        const brandPasteData = ref('');
        const brandPastedGrid = ref([]);
        const brandMappedHeaders = ref([]);
        const brandAvailableHeaders = ref([
            '-- Ignore Column --', 'Brand', 'Rep', 'Email', 'Name as appears in TREES',
            'Distro', 'Asset Library', 'Order From', 'Payee', 'Notes'
        ]);

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
            let updatedCount = 0, newCount = 0;
            let startRow = 0;
            if (brandPastedGrid.value.length > 0) {
                const firstRowStr = brandPastedGrid.value[0].join('').toLowerCase();
                if (firstRowStr.includes('brand') && (firstRowStr.includes('email') || firstRowStr.includes('rep'))) {
                    startRow = 1;
                }
            }

            const batch = writeBatch(db);
            for (let r = startRow; r < brandPastedGrid.value.length; r++) {
                const row = brandPastedGrid.value[r];
                const currentBrand = {};
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
                    batch.set(doc(collection(db, "brands")), payload);
                    newCount++;
                }
            }

            try {
                await batch.commit();
                alert(`Success! Added ${newCount} new brands and updated ${updatedCount}.`);
                resetBrandImport();
                showBrandImportModal.value = false;
            } catch (error) {
                console.error(error);
                alert("Failed to save imported brands.");
            }
        };

<<<<<<< HEAD
        

        const openDimeHelper = async (brand) => {
            const storeName = activeSite.value === 'Redding' ? 'Sundial' : activeSite.value;
            let textToCopy = `Store: ${storeName}\nPromo Period: ${brand.month || activeMonth.value} 2026\nTotal Credit Requested: ${formatCurrency(brand.total)}\n\nPromotion Details:\n`;
            brand.credits.forEach(c => {
                textToCopy += `- ${c.creditType || 'Promo'} (${c.dates || 'N/A'}): ${formatCurrency(c.amount)}\n`;
            });
            textToCopy += `\n*Itemized POS report attached to submission.`;

            try {
                await navigator.clipboard.writeText(textToCopy);
                alert("✅ Copied to Clipboard! Opening DIME Portal now...");
                window.open('https://form.jotform.com/252994629916172', '_blank');
            } catch (err) {
                alert("Failed to copy text.");
            }
        };

        const openLegacyVerification = (vendorItem) => {
            alert(`Opening Legacy Verification for ${vendorItem.vendor}...\n\nEnsuring no data loss during transition.`);
        };

        const scrollMonths = (direction) => {
            const el = document.getElementById('monthScrollContainer');
            if (el) el.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' });
        };

        const scrollWorkbookTabs = (direction) => {
            const el = document.getElementById('workbookTabContainer');
            if (el) el.scrollBy({ left: direction === 'left' ? -300 : 300, behavior: 'smooth' });
        };

        const openWorkbookSyncModal = () => {
            workbookPasteData.value = '';
            showWorkbookSyncModal.value = true;
            refreshIcons();
        };

        const clearAllSalesData = async () => {
            if (confirm("Permanently delete ALL raw sales data from cloud?")) {
                try {
                    const batch = writeBatch(db);
                    treesSalesData.value.forEach(sale => {
                        batch.delete(doc(db, "treesSales", sale.id));
                    });
                    await batch.commit();
                    logSystemAction("DELETE", "Cleared all raw sales data");
                    alert("All raw sales data cleared.");
                } catch (error) {
                    console.error(error);
                    alert("Failed to clear sales data.");
                }
            }
        };

        const exportYTDVariancePDF = () => {
            const { jsPDF } = window.jspdf;
            const docPdf = new jsPDF('l', 'mm', 'a4');
            const targetSite = activeSite.value;
            
            docPdf.setFontSize(20);
            docPdf.setTextColor(16, 185, 129);
            docPdf.text(`YTD VENDOR VARIANCE AUDIT - 2026`, 14, 20);
            docPdf.setFontSize(10);
            docPdf.setTextColor(100);
            docPdf.text(`Store Location: ${targetSite}`, 14, 28);

            const tableHeaders = [['Brand/Vendor', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'YTD Total']];
            const tableData = [];
            const brands = {};

            if (masterWorkbook.value?.data) {
                Object.keys(masterWorkbook.value.data).forEach(sheetName => {
                    const monthStr = sheetName.split(" ")[0];
                    const monthIdx = calendarMonths.indexOf(monthStr);
                    if (monthIdx !== -1 && sheetName.includes('2026')) {
                        const rows = masterWorkbook.value.data[sheetName] || [];
                        rows.forEach(row => {
                            const siteCol = targetSite === "Redding" ? "Redding" : "Red-Bluff";
                            if (row[siteCol] && String(row[siteCol]).trim().toLowerCase() === 'x') {
                                const brand = row["Brand"] || 'Unknown';
                                if (brand === "Brand" || brand.toLowerCase().includes('total')) return;
                                if (!brands[brand]) brands[brand] = { name: brand, months: Array(12).fill(0), collections: Array(12).fill(0) };
                                const promoAmt = row["Promo Credits "] || row["Promo Credits"] || 0;
                                brands[brand].months[monthIdx] += parseFloat(String(promoAmt).replace(/[^0-9.-]+/g, "")) || 0;
                            }
                        });
                    }
                });

                const sageRows = masterWorkbook.value.data["GL Raw by Store"] || [];
                sageRows.forEach(row => {
                    const site = detectSiteFromName(row["Store"] || row["Location"]);
                    if (site !== targetSite) return;
                    const month = detectMonthFromDate(row["Posted dt."] || '');
                    const monthIdx = calendarMonths.indexOf(month);
                    const brand = row["Mapped Brand"] || 'Unmapped';
                    if (monthIdx !== -1) {
                        if (!brands[brand]) brands[brand] = { name: brand, months: Array(12).fill(0), collections: Array(12).fill(0) };
                        brands[brand].collections[monthIdx] += parseFloat(String(row["Credit"] || 0).replace(/[^0-9.-]+/g, "")) || 0;
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
            });

            docPdf.autoTable({
                head: tableHeaders,
                body: tableData,
                startY: 35,
                theme: 'striped',
                headStyles: { fillColor: [17, 24, 39], textColor: [245, 158, 11], fontSize: 8 },
                bodyStyles: { fontSize: 7 }
            });

            docPdf.save(`YTD_Variance_Report_${targetSite}_2026.pdf`);
            logSystemAction("EXPORT", `Generated Variance PDF for ${targetSite}`);
        };

        const exportBrandCSVReports = (selectedBrand = null) => {
            const targetSite = activeSite.value;
            const headers = ['Brand/Vendor', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'YTD Total'];
            let csvContent = headers.join(',') + '\n';
            const brands = {};

            if (masterWorkbook.value?.data) {
                Object.keys(masterWorkbook.value.data).forEach(sheetName => {
                    const monthStr = sheetName.split(" ")[0];
                    const monthIdx = calendarMonths.indexOf(monthStr);
                    if (monthIdx !== -1 && sheetName.includes('2026')) {
                        const rows = masterWorkbook.value.data[sheetName] || [];
                        rows.forEach(row => {
                            const siteCol = targetSite === "Redding" ? "Redding" : "Red-Bluff";
                            if (row[siteCol] && String(row[siteCol]).trim().toLowerCase() === 'x') {
                                const brand = row["Brand"] || 'Unknown';
                                if (brand === "Brand" || brand.toLowerCase().includes('total')) return;
                                if (!brands[brand]) brands[brand] = { name: brand, months: Array(12).fill(0) };
                                const promoAmt = row["Promo Credits "] || row["Promo Credits"] || 0;
                                brands[brand].months[monthIdx] += parseFloat(String(promoAmt).replace(/[^0-9.-]+/g, "")) || 0;
                            }
                        });
                    }
                });
            }

            const brandList = selectedBrand ? [brands[selectedBrand]].filter(Boolean) : Object.values(brands).sort((a, b) => a.name.localeCompare(b.name));
            brandList.forEach(b => {
                let ytdGen = 0;
                const genRow = [b.name];
                for (let i = 0; i < 12; i++) {
                    genRow.push(b.months[i].toFixed(2));
                    ytdGen += b.months[i];
                }
                genRow.push(ytdGen.toFixed(2));
                csvContent += genRow.join(',') + '\n';
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `${selectedBrand ? selectedBrand.replace(/\s+/g, '_') : 'All_Brands'}_Audit_${targetSite}_2026.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        const brandAuditData = computed(() => {
            if (!masterWorkbook.value?.data) return [];
            const targetMonth = activeMonth.value;
            const targetSite = activeSite.value;
            const siteKey = targetSite === "Redding" ? "redding" : "redBluff";
            const start = auditRange.value.start ? new Date(auditRange.value.start) : null;
            const end = auditRange.value.end ? new Date(auditRange.value.end) : null;
            const brandMap = {};

            (promoCredits.value || []).forEach(c => {
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
                    const brandInfo = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === vendor.toLowerCase()) || {};
                    brandMap[vendor] = {
                        vendor,
                        email: brandInfo.email || '',
                        rep: brandInfo.rep || '',
                        generated: 0,
                        collected: 0,
                        credits: []
                    };
                }

                const amt = parseFloat(c.amount) || 0;
                brandMap[vendor].generated += amt;
                if (c.status === 'Applied') brandMap[vendor].collected += amt;
                brandMap[vendor].credits.push(c);
            });

            Object.keys(brandMap).forEach(vendor => {
                const brandMetrics = definitiveBrandMetrics.value[siteKey]?.[vendor];
                if (brandMetrics) {
                    brandMap[vendor].collected = brandMetrics.applied;
                    if (!start && !end && targetMonth === 'All') {
                        brandMap[vendor].generated = brandMetrics.generated;
                    }
                }
            });

            return Object.values(brandMap).sort((a, b) => (b.generated - b.collected) - (a.generated - a.collected));
        });

        const sageAuditData = computed(() => {
            if (!masterWorkbook.value?.data) return [];
            const rawSageRows = masterWorkbook.value.data["GL Raw by Store"] || [];
            if (rawSageRows.length === 0) return [];

            const sageMap = {};
            const targetSite = activeSite.value;
            const targetMonth = activeMonth.value;

            rawSageRows.forEach(row => {
                const site = detectSiteFromName(row["Store"] || row[1] || row["Location"] || row[2]);
                const dateStr = row["Posted dt."] || row[0] || 'Unknown';
                const month = detectMonthFromDate(dateStr);

                if (site !== targetSite) return;
                if (targetMonth !== 'All' && month !== targetMonth) return;

                const brand = row["Mapped Brand"] || row[5] || 'Unmapped';
                if (brand === "Mapped Brand" || !brand) return;

                if (!sageMap[brand]) {
                    sageMap[brand] = {
                        brand,
                        totalApplied: 0,
                        totalGenerated: 0,
                        transactions: [],
                        sites: { "Redding": 0, "Red Bluff": 0 }
                    };
                }

                const amt = parseFloat(String(row["Credit"] || row[4] || 0).replace(/[^0-9.-]+/g,"")) || 0;
                sageMap[brand].totalApplied += amt;
                sageMap[brand].sites[site] += amt;
                sageMap[brand].transactions.push({
                    date: dateStr,
                    site: site,
                    memo: row["Memo/Description"] || row[3] || '',
                    amount: amt
                });
            });

            promoCredits.value.forEach(c => {
                if (c.site !== targetSite) return;
                if (targetMonth !== 'All' && c.trackingMonth !== targetMonth) return;

                const brand = c.vendor || 'Unknown';
                if (!sageMap[brand]) {
                    sageMap[brand] = {
                        brand,
                        totalApplied: 0,
                        totalGenerated: 0,
                        transactions: [],
                        sites: { "Redding": 0, "Red Bluff": 0 }
                    };
                }
                sageMap[brand].totalGenerated += (parseFloat(c.amount) || 0);
            });

            return Object.values(sageMap).sort((a, b) => b.totalApplied - a.totalApplied);
        });

        const refreshIcons = () => {
            nextTick(() => {
                if (window.lucide) window.lucide.createIcons();
            });
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

        const totalTreesOwedYTD = computed(() => {
            let total = 0;
            const siteKey = activeSite.value === "Redding" ? "redding" : "redBluff";
            Object.values(definitiveBrandMetrics.value[siteKey] || {}).forEach(m => {
                total += (m.generated || 0);
            });
            return total;
        });

        const totalTreesPending = computed(() => 
            treesSalesData.value.filter(s => s.detectedSite === activeSite.value && s.status === 'Unsynced')
                .reduce((sum, s) => sum + (parseFloat(s.owed) || 0), 0)
        );

        const totalPending = computed(() => filteredCredits.value.filter(c => c.status === 'Pending').reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0));
        const totalApplied = computed(() => filteredCredits.value.filter(c => c.status === 'Applied').reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0));
        const unsyncedSalesCount = computed(() => filteredTreesSalesData.value.filter(s => s.status === 'Unsynced').length);

        const handleLogin = () => {
            authError.value = '';
            signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value)
                .then(() => { emailInput.value = ''; passwordInput.value = ''; refreshIcons(); })
                .catch(() => { authError.value = "Invalid email or password."; });
        };

                const forceLock = () => { 
            signOut(auth).then(() => { 
                isManagerUnlocked.value = false; 
                loggedInUser.value = ''; 
            }); 
        };

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
                catch (error) { alert("Failed to delete."); }
            }
        };

        const openResolutionModal = (credit) => {
            resolutionCredit.value = credit;
            resolutionForm.value = {
                invoice: '',
                dateReceived: new Date().toISOString().split('T')[0]
            };
            showResolutionModal.value = true;
            refreshIcons();
        };

        const processResolution = async () => {
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
                alert("Failed to resolve.");
            }
        };

        const regenerateBrandSummary = async (brandReport) => {
            if (!confirm(`This will delete current aggregated summaries for ${brandReport.vendor} in ${brandReport.month} and re-calculate them from raw sales data. Continue?`)) return;
            await runRegeneration([brandReport], brandReport.month);
        };

        const regenerateMonthReports = async (monthGroup) => {
            if (!confirm(`Regenerate all brand summaries for ${monthGroup.month}? This will sync with latest Treez sales data.`)) return;
            await runRegeneration(monthGroup.brandList, monthGroup.month);
        };

                const runRegeneration = async (brandList, month) => {
            try {
                const batch = writeBatch(db);
                let workFound = false;

                for (const brand of brandList) {
                    // Find existing aggregated credits for this brand/month and delete them
                    const existingAggregated = promoCreditsList.value.filter(c => 
                        c.site === activeSite.value &&
                        c.trackingMonth === month &&
                        (c.vendor || '').toLowerCase() === (brand.vendor || '').toLowerCase() &&
                        c.creditType && String(c.creditType).includes('Aggregated POS Sales')
                    );
                    existingAggregated.forEach(c => {
                        batch.delete(doc(db, "promoCredits", c.id));
                        workFound = true;
                    });

                    // Find the raw POS items and flip them back to Unsynced
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
                        await pushToMainTracker(); // Automatically resync after flipping
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

=======
>>>>>>> e6dffa0337c71c8654a27c7804377458df720b09
        onMounted(() => {
            refreshIcons();

            onAuthStateChanged(auth, (user) => {
                showImportModal.value = false;
                showBrandImportModal.value = false;

                if (!user) {
                    isManagerUnlocked.value = false;
                    loggedInUser.value = '';
                    if (unsubscribeSales) { unsubscribeSales(); unsubscribeSales = null; }
                    if (unsubscribeCredits) { unsubscribeCredits(); unsubscribeCredits = null; }
                    if (unsubscribeBrands) { unsubscribeBrands(); unsubscribeBrands = null; }
                    if (unsubscribeWorkbookSheets) { unsubscribeWorkbookSheets(); unsubscribeWorkbookSheets = null; }
                    if (unsubscribeWorkbookMetadata) { unsubscribeWorkbookMetadata(); unsubscribeWorkbookMetadata = null; }
                    if (unsubscribeLogs) { unsubscribeLogs(); unsubscribeLogs = null; }
                    return;
                }

                const userEmail = user.email.toLowerCase();
                const managerData = systemUsers[userEmail];

                if (managerData && managerData.active) {
                    loggedInUser.value = managerData.name;
                    activeSite.value = managerData.access[0];
                    isManagerUnlocked.value = true;
                    isSuperAdmin.value = !!managerData.superAdmin;

                    unsubscribeWorkbookSheets = onSnapshot(collection(db, "workbook_v9_sheets"), (snapshot) => {
                        snapshot.forEach(docSnap => {
                            const sheet = docSnap.data();
                            masterWorkbook.value.data[sheet.sheetName] = sheet.rows;
                        });
                        if (snapshot.size > 0) {
                            isWorkbookLoaded.value = true;
                            nextTick(() => { refreshLedger(); });
                        }
                    }, (err) => console.error("Sheets Listener Error:", err));

                    watch(activeSite, (newSite) => {
                        if (unsubscribeWorkbookMetadata) unsubscribeWorkbookMetadata();
                        const docId = `Board_Report_${newSite.replace(/\s/g, '_')}`;
                        unsubscribeWorkbookMetadata = onSnapshot(doc(db, "promo tracker", docId), (docSnap) => {
                            masterWorkbook.value.summary = docSnap.exists() ? docSnap.data() : { total: 0, reportMonth: 'N/A' };
                        });
                    }, { immediate: true });

                    setupFilteredListeners();

                    unsubscribeCredits = onSnapshot(collection(db, "promoCredits"), (snapshot) => {
                        const fetched = [];
                        snapshot.forEach(docSnap => { fetched.push({ id: docSnap.id, ...docSnap.data() }); });
                        promoCreditsList.value = fetched;
                    }, (err) => console.error("PromoCredits Listener Error:", err));

                    unsubscribeBrands = onSnapshot(collection(db, "brands"), (snapshot) => {
                        const fetchedBrands = [];
                        snapshot.forEach(docSnap => { fetchedBrands.push({ id: docSnap.id, ...docSnap.data() }); });
                        masterBrands.value = fetchedBrands;
                    }, (err) => console.error("Brands Listener Failed:", err));

                    if (managerData.superAdmin) {
                        unsubscribeLogs = onSnapshot(collection(db, "systemLogs"), (snapshot) => {
                            const logs = [];
                            snapshot.forEach(docSnap => { logs.push({ id: docSnap.id, ...docSnap.data() }); });
                            logs.sort((a, b) => b.timestamp - a.timestamp);
                            systemLogs.value = logs;
                        });
                    }
                }
            });
        });

        return {
            isManagerUnlocked, isSuperAdmin, loggedInUser, emailInput, passwordInput, authError, activeSite, activeTab,
            treesSalesData, masterBrands, selectedBrands, allBrandsSelected, toggleAllBrands,
            deleteSelectedBrands, updateBrandField, promoCredits, calendarMonths, activeMonth,
            searchQueryInput, searchQuery, showPromoModal, showBrandDropdown, editingId, showReportModal,
            showResolutionModal, resolutionCredit, resolutionForm, markAsSent, markReportGroupAsSent,
            monthlyReportSummaries, downloadMonthlyReport, draftEmail: openEmailDraft, showImportModal,
            showBrandImportModal, brandPasteData, brandPastedGrid, brandMappedHeaders, brandAvailableHeaders,
            handleLogin, forceLock, formatCurrency, filteredCredits, filteredTreesSalesData,
            displayTreesSalesData, totalPending, totalApplied, unsyncedSalesCount,
            totalTreesOwedYTD, totalTreesPending,
            openPromoModal, closePromoModal, form, handleFileUpload, saveCredit, editCredit, deleteCredit,
            openResolutionModal, processResolution, regenerateBrandSummary, regenerateMonthReports, filteredBrands, selectBrand,
            handleTreesCsvUpload, handleSageCsvUpload, pushToMainTracker, resetBrandImport,
            processBrandRawPaste, processBrandImport, systemLogs, refreshIcons, clearAllSalesData,
            openDimeHelper, exportVendorsAndBrandsCSV,
            masterLedgerData, selectedLedgerVendor, refreshLedger, openLegacyVerification, ledgerTotals,
            masterWorkbook, showWorkspaceMenu, showAdminMenu, workspaceTabs, selectWorkspace, activeWorkspaceInfo,
            scrollMonths, scrollWorkbookTabs, workbookSchema, activeWorkbookSheet, isWorkbookLoaded,
            auditRange, brandAuditData, sageAuditData, activeWorkbookHeaders,
            showWorkbookSyncModal, workbookPasteData: ref(''), openWorkbookSyncModal, processWorkbookSync,
            repopulateFromMasterWorkbook, updateWorkbookFromSales, loadWorkbookFromStorage,
            exportYTDVariancePDF, exportBrandCSVReports,
            emailReportMode, auditStartMonth: startMonth, auditEndMonth: endMonth, showEmailDraftModal, selectedBrandForEmail,
            emailDraftSubject, emailDraftBody, openEmailDraft, refreshEmailDraft, sendEmailDraft, copyEmailToClipboard,
            isProcessingUpload, sageFileInput, treezFileInput, handleSageGLUpload, handleTreezPOSUpload,
            recalculateMasterLedger, isRecalculating
        };
    }
}).mount('#app');
