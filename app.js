// app.js

// 1. FIREBASE IMPORTS
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, onSnapshot, setDoc, query, where, limit } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getStorage, ref as sRef, uploadBytes, getBytes } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app-check.js";

// NEW PHASE 1, 2, 3, 4, 5, 6 & 7A IMPORTS
import { parseCSVText, parseCSVRow, cleanString, cleanCurrency, csvEscape, normalizeHeader, validateHeaders } from './services/csvService.js';
import { normalizeTreezLedger, normalizeSageLedger } from './services/ledgerService.js';
import { parseExcelDate, generateAuditStatementCSV as generateAuditStatementService } from './services/auditService.js';
import { buildStandardEmail, buildAuditFindingEmail, buildMailtoUrl } from './services/emailService.js';
import { buildVendorsAndBrandsCSV, buildAnnualReportCSV, buildBrandVarianceCSV, buildYTDVariancePDFData } from './services/exportService.js';
import { buildDefinitiveBrandMetrics, buildMonthlyReportSummaries, buildBrandAuditData, buildSageAuditData, calculateMonthlyReportData } from './services/reportService.js';
import { buildTrackerSyncPayloads, buildGridImportPayloads, buildBrandImportPayloads } from './services/importService.js';
import { processTreezUpload, processSageUpload } from './services/uploadService.js';
import { createUploadManifest, rollbackUpload } from './services/syncService.js';

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

// APP CHECK DEBUG MODE (Broadened for local network and dev environments)
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
        const normalizeSiteName = (val) => String(val || '').toLowerCase().replace(/[\s_-]/g, '');

        // --- Core State ---
        const isManagerUnlocked = ref(false);
        const loggedInUser = ref('');
        const emailInput = ref('');
        const passwordInput = ref('');
        const authError = ref('');
        const activeSite = ref('Red Bluff');
        const activeTab = ref('Ledger');
        const promoCreditsList = ref([]);
        const calendarMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const activeMonth = ref('August');
                const ledgerEventsList = ref([]);
        const USE_CANONICAL_LEDGER = ref(true);
        const showHistoryModal = ref(false);
        const activeBrandHistory = ref([]);
        const selectedBrandName = ref('');

        const openBrandHistory = (brandName) => {
            selectedBrandName.value = brandName;
            activeBrandHistory.value = ledgerEventsList.value.filter(e => 
                e.brand === brandName && 
                e.site === activeSite.value && 
                (activeMonth.value === 'All' || e.isolation_month === activeMonth.value)
            ).sort((a, b) => {
                const dateA = a.created_at?.seconds || 0;
                const dateB = b.created_at?.seconds || 0;
                return dateB - dateA;
            });
            showHistoryModal.value = true;
        };
                const masterBrands = ref([]);
        const selectedBrands = ref([]);

        // BATCH PROCESSING STATE
        const isBatchProcessing = ref(false);
        const batchProgress = ref(0);
        const batchTotal = ref(0);
        const batchType = ref('');
        const batchError = ref(null);
        let batchContext = null; // Store data for continuation


                // LEDGER MANAGEMENT STATE
        const treezLedgerCount = ref(0);
        const sage4545LedgerCount = ref(0);
        const treezLedgerLastUpload = ref(null);
        const sage4545LedgerLastUpload = ref(null);
        const treezLedgerSourceFile = ref(null);
        const sage4545LedgerSourceFile = ref(null);

        // Load persisted ledger metadata on startup
        try {
            const storedTreezCount = localStorage.getItem('treezLedgerCount');
            const storedSageCount = localStorage.getItem('sage4545LedgerCount');
            const storedTreezTime = localStorage.getItem('treezLedgerLastUpload');
            const storedSageTime = localStorage.getItem('sage4545LedgerLastUpload');
            const storedTreezFile = localStorage.getItem('treezLedgerSourceFile');
            const storedSageFile = localStorage.getItem('sage4545LedgerSourceFile');
            
            if (storedTreezCount) treezLedgerCount.value = parseInt(storedTreezCount);
            if (storedSageCount) sage4545LedgerCount.value = parseInt(storedSageCount);
            if (storedTreezTime) treezLedgerLastUpload.value = storedTreezTime;
            if (storedSageTime) sage4545LedgerLastUpload.value = storedSageTime;
            if (storedTreezFile) treezLedgerSourceFile.value = storedTreezFile;
            if (storedSageFile) sage4545LedgerSourceFile.value = storedSageFile;
        } catch (e) {
            console.error("Error loading persisted ledger metadata:", e);
        }

                const persistLedgerMetadata = () => {
            try {
                localStorage.setItem('treezLedgerCount', treezLedgerCount.value.toString());
                localStorage.setItem('sage4545LedgerCount', sage4545LedgerCount.value.toString());
                if (treezLedgerLastUpload.value) localStorage.setItem('treezLedgerLastUpload', treezLedgerLastUpload.value);
                if (sage4545LedgerLastUpload.value) localStorage.setItem('sage4545LedgerLastUpload', sage4545LedgerLastUpload.value);
                if (treezLedgerSourceFile.value) localStorage.setItem('treezLedgerSourceFile', treezLedgerSourceFile.value);
                if (sage4545LedgerSourceFile.value) localStorage.setItem('sage4545LedgerSourceFile', sage4545LedgerSourceFile.value);
            } catch (e) {
                console.error("Error persisting ledger metadata:", e);
            }
        };

        const sheetToDocId = (name) => String(name || '').replace(/[\s\/]/g, '_');



        // 1. DATA SOURCE: Master Workbook Fragments
        const masterWorkbook = ref({ data: {}, summary: {} });
        const treesSalesData = ref([]); 
        const auditRange = ref({ start: '', end: '' });
        
        // Form & Audit state
        const emailReportMode = ref('standard');
        const showEmailDraftModal = ref(false);
        const selectedBrandForEmail = ref(null);
        const emailDraftSubject = ref('');
        const emailDraftBody = ref('');
        const startMonth = ref('January');
        const endMonth = ref('September');

        // --- GLOBAL HELPERS (Hoisted for pure service injection) ---
        const formatCurrency = (val) => {
            const num = parseFloat(val);
            if (isNaN(num)) return '$0';
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
            const s = storeNameStr.toLowerCase();
            if (s.includes('red bluff') || s.includes('redbluff')) return 'Red Bluff';
            if (s.includes('redding') || s.includes('sundial')) return 'Redding';
            return activeSite.value; 
        };

        const getStandardizedBrandName = (name) => {
            if (!name) return '';
            const clean = String(name).trim();
            const mappingRows = masterWorkbook.value.data["Brand_Mapping"] || [];
            const match = mappingRows.find(r => 
                String(r["Master Workbook Legacy Name"] || '').trim().toLowerCase() === clean.toLowerCase()
            );
            return match ? String(match["Standardized POS Name (CSV)"] || '').trim() : clean;
        };


        // --- REPORT DATA EXTRACTIONS ---

        // 1. Extraction Rules Logic (Definitive Applied & Generated per Brand)
        const definitiveBrandMetrics = computed(() => {
            return buildDefinitiveBrandMetrics(masterWorkbook.value?.data);
        });

        // COMPUTED: promoCredits (This active tracker merge logic remains local)
        const promoCredits = computed(() => {
            const allCredits = [];
            if (!masterWorkbook.value || !masterWorkbook.value.data) return [];

            Object.keys(masterWorkbook.value.data).forEach(sheetName => {
                                if (sheetName.includes('2026')) {
                    const monthName = sheetName.split(' ')[0];
                    const rows = masterWorkbook.value.data[sheetName] || [];

                    rows.forEach((row, idx) => {
                        const vendor = row["Brand"] || row[0];
                        if (!vendor || vendor === "Brand" || vendor.toLowerCase().includes('total')) return;

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
                            } else if (siteKey === "Redding" && row["Redding"] !== undefined) {
                                rawAmt = row["Redding"];
                            } else if (siteKey === "Red-Bluff" && row["Red-Bluff"] !== undefined) {
                                rawAmt = row["Red-Bluff"];
                            }

                            const amt = parseFloat(String(rawAmt || 0).replace(/[^0-9.-]+/g,"")) || 0;

                            if (amt > 0) {
                                const approvedKey = rowKeys.find(k => k.toLowerCase().includes('approved') || k.toLowerCase().includes('applied') || k.toLowerCase().includes('collected'));
                                const approvedAmt = parseFloat(String(row[approvedKey] || row["Credits Approved"] || 0).replace(/[^0-9.-]+/g,"")) || 0;
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
                                    distributor: 'Workbook Sync', // Mark as synced for duplication check
                                    workbookRef: { sheet: sheetName, rowIdx: idx }
                                });
                            }
                        });
                    });
                }

                if (sheetName === "Monthly Vendor Variance Report") {
                    const rows = masterWorkbook.value.data[sheetName] || [];
                    rows.forEach((row, idx) => {
                        const vendor = row["Brand"];
                        if (!vendor || vendor.toLowerCase().includes('total')) return;

                        calendarMonths.forEach(m => {
                            const genKey = `${m} Generated`;
                            const colKey = `${m} Collected`;
                            
                            const genAmt = parseFloat(String(row[genKey] || 0).replace(/[^0-9.-]+/g,"")) || 0;
                            const colAmt = parseFloat(String(row[colKey] || 0).replace(/[^0-9.-]+/g,"")) || 0;

                            if (genAmt > 0) {
                                allCredits.push({
                                    id: `variance-${idx}-${m}`,
                                    site: "Corporate (Variance)",
                                    trackingMonth: m,
                                    vendor: vendor,
                                    amount: genAmt,
                                    creditType: "Variance Record",
                                    status: (colAmt >= genAmt) ? "Applied" : "Pending",
                                    archived: false,
                                    isVarianceOnly: true
                                });
                            }
                        });
                    });
                }
            });
            
            promoCreditsList.value.forEach(c => {
                if (c.invoice !== 'WB-V9-SYNC') allCredits.push(c);
            });

            return allCredits;
        });

                const monthlyReportSummaries = computed(() => {
            return buildMonthlyReportSummaries({
                ledgerEvents: ledgerEventsList.value,
                targetMonth: activeMonth.value,
                targetSite: activeSite.value,
                calendarMonths,
                masterBrands: masterBrands.value
            });
        });

        const brandAuditData = computed(() => {
            return buildBrandAuditData({
                masterWorkbookData: masterWorkbook.value?.data,
                targetMonth: activeMonth.value,
                targetSite: activeSite.value,
                auditRangeStart: auditRange.value.start,
                auditRangeEnd: auditRange.value.end,
                promoCredits: promoCredits.value,
                masterBrands: masterBrands.value,
                definitiveBrandMetrics: definitiveBrandMetrics.value
            });
        });

        const sageAuditData = computed(() => {
            return buildSageAuditData({
                masterWorkbookData: masterWorkbook.value?.data,
                targetSite: activeSite.value,
                targetMonth: activeMonth.value,
                promoCredits: promoCredits.value
            }, { detectSiteFromName, detectMonthFromDate });
        });

        const calculateMonthlyReport = (brandName) => {
            return calculateMonthlyReportData(brandName, {
                startMonthValue: startMonth.value,
                endMonthValue: endMonth.value,
                calendarMonths,
                masterWorkbookData: masterWorkbook.value?.data
            }, { getStandardizedBrandName, detectMonthFromDate, detectSiteFromName });
        };


        // --- DASHBOARD & LEDGER ---
        const selectedLedgerVendor = ref(null);
        const masterLedgerData = ref([]);
        const ledgerTotals = ref({ generated: 0, recovered: 0, outstanding: 0, variance: 0 });

                                const refreshLedger = async () => {
                                    if (!USE_CANONICAL_LEDGER.value) {
                                        console.warn("DEPRECATION WARNING: Legacy workbook shard scanning is still active.");
                                    }
                                    return await refreshLedgerCanonical();
                                };




        watch([promoCredits, activeSite, activeMonth], () => {
            if (activeTab.value === 'Ledger') refreshLedger();
        });

                const refreshLedgerCanonical = async () => {
            const site = activeSite.value;
            const month = activeMonth.value;
            const ledger = {};
            
            ledgerEventsList.value.forEach(event => {
                if (event.site !== site) return;
                
                const v = event.brand || 'Unknown';
                if (!ledger[v]) {
                    ledger[v] = { 
                        vendor: v, site: site, generated: 0, recovered: 0, outstanding: 0, 
                        variance: 0, discoveryEvents: [], recoveryEvents: [],
                        generatedCount: 0, recoveredCount: 0,
                        aging: { '0-30': 0, '31-60': 0, '61-90': 0, '91+': 0 }
                    };
                }

                // Aggregates
                if (event.type === 'GENERATED') {
                    ledger[v].generated += event.amount;
                    ledger[v].generatedCount++;
                    if (month === 'All' || event.isolation_month === month) {
                        ledger[v].discoveryEvents.push({ id: event.id, type: 'Generated', date: event.isolation_month, amount: event.amount });
                    }
                } else if (event.type === 'RECOVERY') {
                    ledger[v].recovered += event.amount;
                    ledger[v].recoveredCount++;
                    if (month === 'All' || event.isolation_month === month) {
                        ledger[v].recoveryEvents.push({ id: event.id, ref: event.invoice_ref, date: event.isolation_month, amount: event.amount });
                    }
                }
            });

            const totals = { generated: 0, recovered: 0, outstanding: 0, variance: 0 };
            Object.values(ledger).forEach(item => {
                item.outstanding = item.generated - item.recovered;
                totals.generated += item.generated;
                totals.recovered += item.recovered;
                totals.outstanding += item.outstanding;
            });

            ledgerTotals.value = totals;
            masterLedgerData.value = Object.values(ledger).sort((a, b) => b.outstanding - a.outstanding);
        };

        const runMigration = async () => {
            if (!confirm("This will migrate all workbook and manual data into the new Canonical Ledger. Proceed?")) return;
            try {
                isBatchProcessing.value = true;
                const helpers = { getStandardizedBrandName, detectSiteFromName, detectMonthFromDate, normalizeSiteName };
                const stats = await runCanonicalMigration(db, masterWorkbook.value.data, promoCreditsList.value, helpers);
                alert(`Migration Complete!\nGenerated: ${stats.generated}\nRecovery: ${stats.recovery}\nManual: ${stats.manual}`);
            } catch (err) {
                console.error(err);
                alert("Migration failed: " + err.message);
            } finally {
                isBatchProcessing.value = false;
            }
        };

        window.runLedgerMigration = runMigration;


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

        const processManualCredits = (credits, promoDates, csvTotal, csvContent) => {
            let runningTotal = csvTotal;
            let runningContent = csvContent;

            credits.forEach(c => {
                if (String(c.creditType).includes('Aggregated POS Sales')) return; 
                
                const safeLoc = `"${csvEscape(String(c.site || ''))}"`;
                const safeDate = `"${csvEscape(String(c.dates || ''))}"`;
                const safeBrand = `"${csvEscape(String(c.vendor || ''))}"`;
                const safeProd = `"${csvEscape(String(c.creditType || ''))}"`; 
                const safeTrack = `"${csvEscape(String(c.invoice || ''))}"`;
                
                runningContent += `${safeLoc},${safeDate},${safeBrand},${safeProd},${safeTrack},"-","-","-","-","-","${formatCurrency(c.amount)}","Manual Entry"\n`;
                runningTotal += parseFloat(c.amount) || 0;
                if (c.dates) promoDates.add(c.dates);
            });

            return { total: runningTotal, content: runningContent };
        };


                const generateAuditStatementCSV = (brand) => {
                    return generateAuditStatementService({
                        brandVendor: brand.vendor,
                        targetSite: activeSite.value,
                        ledgerEvents: ledgerEventsList.value, // Pass canonical events
                        startMonthName: startMonth.value,
                        endMonthName: endMonth.value,
                        calendarMonths,
                        csvEscape
                    });
                };

                const downloadMonthlyReport = (brand) => {
            const isFullMonth = !!brand.brandList; 
            
            if (!isFullMonth) {
                const csv = generateAuditStatementCSV(brand);
                const blob = new Blob(
                    ['\ufeff' + csv],
                    {
                        type: 'text/csv;charset=utf-8;'
                    }
                );
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", `${activeSite.value}_Statement_${brand.vendor}_${new Date().getFullYear()}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                logSystemAction("EXPORT", `Audit Statement exported for ${brand.vendor}`);
                setTimeout(() => URL.revokeObjectURL(url), 150);
                return;
            }

            const reportMonth = brand.month || activeMonth.value;
            let csvContent = "Location,Date & Time,Brand,Product Name,Transaction ID,Quantity Sold,Unit Price,Total Before Tax,Discount Title,Discount Amount,Credit Owed,Entry Type\n";

            let csvTotal = 0;
            const cleanStr = cleanString;
    
            const itemizedSales = [];

            treesSalesData.value.forEach(sale => {
                const matchBrand = isFullMonth ? true : (cleanStr(sale.brand) === cleanStr(brand.vendor));
                
                if (matchBrand && 
                    cleanStr(sale.detectedSite) === cleanStr(activeSite.value) && 
                    cleanStr(sale.month) === cleanStr(reportMonth)) {
                    itemizedSales.push({
                        loc: sale.detectedSite,
                        date: sale.dateClosed,
                        brand: sale.brand,
                        prod: sale.productName,
                        track: sale.trackingId,
                        qty: sale.unitsSold,
                        price: sale.unitPrice,
                        preTax: (sale.unitsSold || 0) * (sale.unitPrice || 0),
                        discTitle: sale.discountTitle,
                        discAmt: sale.discountAmount,
                        owed: sale.owed,
                        type: "POS Itemized"
                    });
                }
            });

            itemizedSales.forEach(s => {
                csvContent += `"${s.loc}","${s.date}","${s.brand}","${s.prod}","${s.track}","${s.qty}","${formatCurrency(s.price)}","${formatCurrency(s.preTax)}","${s.discTitle}","${formatCurrency(s.discAmt)}","${formatCurrency(s.owed)}","${s.type}"\n`;
                csvTotal += parseFloat(s.owed) || 0;
            });

            const dummyDates = new Set();
            if (isFullMonth) {
                brand.brandList.forEach(b => {
                    if (b.credits) {
                        const res = processManualCredits(b.credits, dummyDates, csvTotal, csvContent);
                        csvTotal = res.total;
                        csvContent = res.content;
                    }
                });
            } else if (brand.credits) {
                const res = processManualCredits(brand.credits, dummyDates, csvTotal, csvContent);
                csvTotal = res.total;
                csvContent = res.content;
            }

            csvContent += `,,,,,,,,,, "TOTAL:", "${formatCurrency(csvTotal)}"\n`;

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            const currentYear = new Date().getFullYear();
            const reportName = isFullMonth ? `${reportMonth}_All_Brands` : String(brand.vendor).replace(/[^a-zA-Z0-9]/g, '_');
            link.setAttribute("download", `${activeSite.value.replace(/\s/g, '_')}_Report_${reportName}_${currentYear}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 150);

            logSystemAction("EXPORT", `Downloaded Detailed Report for ${reportName}`);
        };

        const draftEmail = (brand) => {
            if (!brand.email) {
                alert(`No email mapped for ${brand.vendor}. Please add one in the Brand Directory first.`);
                return;
            }

            const storeName = activeSite.value === 'Redding' ? 'Sundial' : activeSite.value;
            const currentYear = new Date().getFullYear();
            const monthStr = brand.month || activeMonth.value;
            const periodStr = `${monthStr} ${currentYear}`;
            
            const csvContent = generateAuditStatementCSV(brand);
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `${brand.vendor.replace(/\s/g, '_')}_Statement_${activeSite.value.replace(/\s/g, '_')}_${currentYear}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            const subject = `Promo Credit Statement - ${storeName} - ${periodStr}`;
            
            let body = `Hello ${brand.vendor},\n\n`;
            body += `Please find the attached cumulative promo credit statement for ${storeName} for the period ending ${periodStr}.\n\n`;
            body += `This statement includes a month-by-month breakdown of credits generated vs. collections received and the remaining unapplied balance.\n\n`;
            body += `Please let us know if you have any questions or when we can expect the remaining balance to be applied to our account.\n\n`;
            body += `Best regards,\n\n${storeName} Accounting Team\n`;

            window.location.href = buildMailtoUrl(brand.email, 'accounting@rredco.com', subject, body);
            
            logSystemAction("EXPORT", `Generated Dual-Use Statement for ${brand.vendor}`);
        };


        let chartMonthlyInstance = null;
        let chartDistrosInstance = null;
        let chartBrandsInstance = null;
        let chartStoresInstance = null;

        const exportYTDVariancePDF = () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('l', 'mm', 'a4');
            const currentYear = new Date().getFullYear();
            const targetSite = activeSite.value;
            
            doc.setFontSize(20);
            doc.setTextColor(16, 185, 129); // Emerald-500
            doc.text(`YTD VENDOR VARIANCE AUDIT - ${currentYear}`, 14, 20);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 26);
            doc.text(`Store Location: ${targetSite}`, 14, 31);
            
                        const helpers = { formatCurrency };
                        const { tableHeaders, tableData } = buildYTDVariancePDFData(
                            activeSite.value, 
                            calendarMonths, 
                            ledgerEventsList.value,
                            helpers
                        );
            
            doc.autoTable({
                head: tableHeaders,
                body: tableData,
                startY: 40,
                theme: 'striped',
                headStyles: { fillColor: [17, 24, 39], textColor: [245, 158, 11], fontSize: 8 },
                bodyStyles: { fontSize: 7 },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 35 },
                    13: { fontStyle: 'bold', fillColor: [243, 244, 246] }
                },
                didParseCell: function(data) {
                    if (data.row.index % 4 === 1) data.cell.styles.textColor = [16, 185, 129]; // Collections Green
                    if (data.row.index % 4 === 2) {
                        const val = parseFloat(data.cell.text[0].replace(/[^0-9.-]+/g, ""));
                        if (val > 0) data.cell.styles.textColor = [239, 68, 68]; // Owed Red
                    }
                }
            });
            
            doc.save(`YTD_Variance_Report_${targetSite}_${currentYear}.pdf`);
            logSystemAction("EXPORT", `Generated YTD Variance PDF for ${targetSite}`);
        };

                const exportBrandCSVReports = (selectedBrand = null) => {
                    const csvContent = buildBrandVarianceCSV(
                        activeSite.value, 
                        selectedBrand, 
                        calendarMonths,
                        ledgerEventsList.value
                    );
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const fileName = selectedBrand
                ? `${selectedBrand.replace(/\s+/g, '_')}_Audit_${targetSite}_2026.csv`
                : `All_Brands_Variance_Audit_${targetSite}_2026.csv`;
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

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

            const csvContent = buildAnnualReportCSV(creditsToArchive, formatCurrency);
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

            alert("Export complete. Archiving is now managed directly through the Master Workbook process.");
        };

        const exportVendorsAndBrandsCSV = () => {
            if (!masterBrands.value || masterBrands.value.length === 0) {
                alert("No brands available to export.");
                return;
            }

            const csvContent = buildVendorsAndBrandsCSV(masterBrands.value);
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
            trackingMonth: '', 
            vendor: '', distributor: '', creditType: '', dates: '', 
            amount: '', dateRequested: '', dateReceived: '', 
            invoice: '', status: 'Pending', attachmentName: '', attachmentData: null 
        });
        
        const form = ref(getEmptyForm());
        
        let unsubscribeSales = null;
        let unsubscribeCredits = null;

        const setupFilteredListeners = () => {
            if (unsubscribeSales) unsubscribeSales();
            
            let salesQ = query(collection(db, "treesSales"), where("detectedSite", "==", activeSite.value));

            if (activeMonth.value !== 'All') {
                salesQ = query(salesQ, where("month", "==", activeMonth.value));
            }

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

        let unsubscribeBrands = null;

        const showWorkspaceMenu = ref(false);
        const showAdminMenu = ref(false);

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

        const selectWorkspace = (tab) => {
            activeTab.value = tab.name;
            showWorkspaceMenu.value = false;
            if (tab.name === 'Ledger') refreshLedger();
            nextTick(() => refreshIcons());
        };

        const activeWorkspaceInfo = computed(() => {
            return workspaceTabs.find(t => t.name === activeTab.value) || { name: 'Unknown', icon: 'help-circle' };
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
        const isWorkbookLoaded = ref(false);

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
                console.log("Fetching Workbook from Storage...");
                const fileRef = sRef(storage, "RRedco Server/Promo Tracker/Master_Workbook_V9_Board_Report.xlsx");
                const bytes = await getBytes(fileRef);
                
                const workbook = XLSX.read(bytes, { type: 'array' });
                const batch = writeBatch(db);
                let sheetsImported = 0;

                for (const sheetName of workbook.SheetNames) {
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                    
                                        const prunedRows = json.filter(row => {
                        return Object.values(row).some(val => val !== "" && val !== null && val !== undefined);
                    });

                    const docId = sheetToDocId(sheetName); 
                    const sheetRef = doc(db, "workbook_v9_sheets", docId);

                    
                    batch.set(sheetRef, {
                        sheetName: sheetName,
                        rows: prunedRows,
                        updatedAt: Date.now()
                    });
                    
                    masterWorkbook.value.data[sheetName] = prunedRows;
                    sheetsImported++;
                }

                await batch.commit();
                isWorkbookLoaded.value = true;
                console.log(`Success! ${sheetsImported} sheets broken into individual docs and saved permanently.`);
                alert(`Permanent Population Complete!\n\n${sheetsImported} sheets have been saved as individual records in Firestore. You will not need to pull the 2MB file from the server again.`);
            } catch (err) {
                console.error("Storage Workbook Error:", err);
                alert("Failed to pull and batch-save workbook: " + err.message);
            }
        };

                onMounted(() => {
            // CRITICAL STORAGE CLEANUP
            localStorage.removeItem('treesSalesData');
            
            refreshIcons();


            onAuthStateChanged(auth, (user) => {
                showImportModal.value = false;
                showBrandImportModal.value = false;

                if (!user) {
                    isManagerUnlocked.value = false;
                    loggedInUser.value = '';
                    if (unsubscribeSales) { unsubscribeSales(); unsubscribeSales = null; }
                    if (unsubscribeCredits) { unsubscribeCredits(); unsubscribeCredits = null; }
                    return;
                }

                const userEmail = user.email.toLowerCase();
                const managerData = systemUsers[userEmail];

                if (managerData && managerData.active) {
                    loggedInUser.value = managerData.name;
                    activeSite.value = managerData.access[0];
                    isManagerUnlocked.value = true;
                    isSuperAdmin.value = !!managerData.superAdmin;

                    console.log("Listening to workbook_v9_sheets...");
                    onSnapshot(collection(db, "workbook_v9_sheets"), (snapshot) => {
                        console.log(`Snapshot received: ${snapshot.size} sheets found.`);
                        snapshot.forEach(docSnap => {
                            const sheet = docSnap.data();
                            masterWorkbook.value.data[sheet.sheetName] = sheet.rows;
                            console.log(`- Loaded sheet: ${sheet.sheetName} (${sheet.rows.length} rows)`);
                        });
                        if (snapshot.size > 0) {
                            isWorkbookLoaded.value = true;
                            nextTick(() => { refreshLedger(); });
                        }
                    }, (err) => console.error("Sheets Listener Error:", err));

                                        watch(activeSite, (newSite) => {
                        const boardReconRef = doc(db, "promo tracker", `Board_Report_${newSite.replace(/\s/g, '_')}`);
                        // Keep snapshot for legacy, but we will override boardReconStats computed next
                    }, { immediate: true });

                    const boardReconStats = computed(() => {
                        const site = activeSite.value;
                        const stats = { generated: 0, recovered: 0, outstanding: 0, count: 0 };
                        ledgerEventsList.value.forEach(e => {
                            if (e.site !== site) return;
                            if (e.type === 'GENERATED' || e.type === 'ADJUSTMENT') {
                                stats.generated += e.amount;
                            } else if (e.type === 'RECOVERY') {
                                stats.recovered += e.amount;
                            }
                        });
                        stats.outstanding = stats.generated - stats.recovered;
                        return stats;
                    });
                    
                    window.getBoardRecon = () => boardReconStats.value;


                                        setupFilteredListeners();

                    console.log("Listening to promoCredits...");
                    unsubscribeCredits = onSnapshot(collection(db, "promoCredits"), (snapshot) => {
                        const fetched = [];
                        snapshot.forEach(docSnap => {
                            fetched.push({ id: docSnap.id, ...docSnap.data() });
                        });
                        promoCreditsList.value = fetched;
                    }, (err) => console.error("Credits Listener Failed:", err));

                    onSnapshot(collection(db, "brands"), (snapshot) => {
                        const fetchedBrands = [];
                        snapshot.forEach(docSnap => { fetchedBrands.push({ id: docSnap.id, ...docSnap.data() }); });
                        masterBrands.value = fetchedBrands;
                    }, (err) => console.error("Brands Listener Failed:", err));

                                        console.log("Listening to systemLogs...");
                    if (managerData.superAdmin) {
                        onSnapshot(collection(db, "systemLogs"), (snapshot) => {
                            const logs = [];
                            snapshot.forEach(docSnap => { logs.push({ id: docSnap.id, ...docSnap.data() }); });
                            logs.sort((a, b) => b.timestamp - a.timestamp);
                            systemLogs.value = logs;
                        });
                    }

                    console.log("Listening to ledger_events...");
                    onSnapshot(collection(db, "ledger_events"), (snapshot) => {
                        const fetched = [];
                        snapshot.forEach(docSnap => {
                            fetched.push({ id: docSnap.id, ...docSnap.data() });
                        });
                        ledgerEventsList.value = fetched;
                        if (activeTab.value === 'Ledger') refreshLedger();
                    }, (err) => console.error("Ledger Listener Failed:", err));
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

                const processImport = async () => {
            const { creditsToCreate, brandsToCreate, importedCount, skippedCount, errorRecords } = buildGridImportPayloads(
                pastedGrid.value,
                mappedHeaders.value,
                { activeSite: activeSite.value, activeMonth: activeMonth.value },
                masterBrands.value,
                { detectMonthInString }
            );

            if (importedCount === 0 && skippedCount === 0) {
                return alert("No valid credits found in paste data to import.");
            }

            try {
                if (importedCount > 0) {
                    const batch = writeBatch(db);
                    creditsToCreate.forEach(credit => {
                        const newDocRef = doc(collection(db, "promoCredits"));
                        batch.set(newDocRef, credit);
                    });
                    brandsToCreate.forEach(brand => {
                        const newBrandRef = doc(collection(db, "brands"));
                        batch.set(newBrandRef, brand);
                    });
                    await batch.commit();
                }

                let alertMsg = `Import Processed:\n- Saved: ${importedCount} items`;
                if (skippedCount > 0) {
                    alertMsg += `\n- ⚠️ Quarantined: ${skippedCount} items (Unknown Month)`;
                    
                    const csvErrorContent = "Vendor,Amount,Detected Month,Error\n" + errorRecords.map(r => `"${r.vendor}","${r.amount}","${r.trackingMonth}","${r.error}"`).join('\n');
                    const errorBlob = new Blob(['\ufeff' + csvErrorContent], { type: 'text/csv;charset=utf-8;' });
                    const errorUrl = URL.createObjectURL(errorBlob);
                    const errorLink = document.createElement("a");
                    errorLink.setAttribute("href", errorUrl);
                    errorLink.setAttribute("download", `Quarantine_Grid_Import_${activeMonth.value}_${Date.now()}.csv`);
                    document.body.appendChild(errorLink);
                    errorLink.click();
                    document.body.removeChild(errorLink);
                }
                
                alert(alertMsg);
                closeImportModal();
                refreshIcons();
            } catch (err) {
                console.error(err);
                alert("Failed to save import to cloud.");
            }
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

            const storagePath = `master_csvs/${activeSite.value}/${new Date().getFullYear()}/${activeMonth.value}/${Date.now()}_${file.name}`;
            const fileRef = sRef(storage, storagePath);
            
            try {
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

                await uploadBytes(fileRef, file);
                console.log("CSV preserved to storage:", storagePath);

                const reader = new FileReader();
                reader.onload = async (evt) => {
                    try {
                        const text = evt.target.result;
                        const { headers: baseHeaders, rows } = parseCSVText(text);
                        if (rows.length === 0) return alert("File is empty or invalid.");

                        let headerIdx = -1;
                        let headers = [];
                        
                        const baseValidation = validateHeaders(baseHeaders, ['product brand', 'vendor credit owed']);
                        if (baseValidation.valid) {
                            headers = baseHeaders;
                        } else {
                            for (let i = 0; i < rows.length; i++) {
                                const cols = parseCSVRow(rows[i]);
                                const validation = validateHeaders(cols, ['product brand', 'vendor credit owed']);
                                if (validation.valid) {
                                    headerIdx = i;
                                    headers = cols.map(normalizeHeader);
                                    break;
                                }
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
                        let skippedCount = 0;
                        const errorRecords = [];

                        for (let i = headerIdx + 1; i < rows.length; i++) {
                            if (!rows[i].trim()) continue;
                            const cols = parseCSVRow(rows[i]);
                            const rowObj = {};
                            headers.forEach((h, idx) => { rowObj[h] = cols[idx] ? cleanString(cols[idx]) : ''; });

                            const brandVal = getVal(rowObj, 'Product Brand', 'Brand');
                            const trackingVal = getVal(rowObj, 'State Tracking Id', 'Tracking Id');

                            if (!brandVal && !trackingVal) continue;

                                                        const dateStr = getVal(rowObj, 'Date Closed', 'Date');
                            const parsedMonth = detectMonthFromDate(dateStr);
                            
                            if (parsedMonth === 'Unknown') {
                                skippedCount++;
                                errorRecords.push({ brand: brandVal, date: dateStr, amount: owedAmt, reason: "Unknown Month" });
                                continue;
                            }

                            const storeString = getVal(rowObj, 'Store Name', 'Location');
                            const detectedSite = detectSiteFromName(storeString);

                            const units = parseFloat(getVal(rowObj, 'Units Sold', 'Unit Sold', 'Qty', 'Quantity')) || 0;
                            const unitPrice = cleanCurrency(getVal(rowObj, 'Cost Per Unit', 'Unit Price', 'Price'));
                            const discAmt = cleanCurrency(getVal(rowObj, 'Discounts', 'Discount Amount', 'Discount'));
                            const owedAmt = cleanCurrency(getVal(rowObj, 'Vendor Credit Owed', 'Credit Owed'));

                            const newSale = {
                                uploadId: uploadId, 
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
                        await updateDoc(doc(db, "source_uploads", uploadId), { status: 'Parsed', rowCount: count, skippedCount: skippedCount });
                
                        logSystemAction("IMPORT", `Uploaded ${count} raw sales items from Trees CSV. Skipped ${skippedCount} items.`);
                        
                        let alertMsg = `Successfully uploaded ${count} sales items!\n- Preserved source CSV to cloud storage.`;
                        if (skippedCount > 0) {
                            alertMsg += `\n- ⚠️ WARNING: ${skippedCount} items skipped due to unknown months.`;
                        }
                        alert(alertMsg);

                        if (errorRecords.length > 0) {
                            const csvErrorContent = "Brand,Date,Amount,Reason\n" + errorRecords.map(r => `"${r.brand}","${r.date}","${r.amount}","${r.reason}"`).join('\n');
                            const errorBlob = new Blob(['\ufeff' + csvErrorContent], { type: 'text/csv;charset=utf-8;' });
                            const errorUrl = URL.createObjectURL(errorBlob);
                            const errorLink = document.createElement("a");
                            errorLink.setAttribute("href", errorUrl);
                            errorLink.setAttribute("download", `Quarantine_Report_${activeMonth.value}_${Date.now()}.csv`);
                            document.body.appendChild(errorLink);
                            errorLink.click();
                            document.body.removeChild(errorLink);
                        }
                        
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

        const handleSageCsvUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!confirm("This will upload your Sage Report and update the 'GL Raw by Store' sheet in the Master Workbook. Continue?")) return;

            const storagePath = `sage_uploads/${activeSite.value}/${Date.now()}_${file.name}`;
            const fileRef = sRef(storage, storagePath);
            
            try {
                await uploadBytes(fileRef, file);
                
                const reader = new FileReader();
                reader.onload = async (evt) => {
                    try {
                        const text = evt.target.result;
                        const { headers, rows } = parseCSVText(text);
                        const importedSageData = [];

                        for (let i = 0; i < rows.length; i++) { 
                            const cols = parseCSVRow(rows[i]);
                            const rowObj = {};
                            headers.forEach((h, idx) => { 
                                rowObj[h] = cols[idx] ? cleanString(cols[idx]) : ''; 
                            });
                            
                            importedSageData.push({
                                "Posted dt.": rowObj["Posted dt."] || rowObj["Date"] || '',
                                "Store": rowObj["Store"] || rowObj["Location"] || '',
                                "Location": rowObj["Location"] || '',
                                "Memo/Description": rowObj["Memo/Description"] || rowObj["Description"] || rowObj["Memo"] || '',
                                "Credit": cleanCurrency(rowObj["Credit"] || rowObj["Amount"]),
                                "Mapped Brand": "" 
                            });
                        }

                        if (!masterWorkbook.value) return alert("Master Workbook not loaded.");
                        
                        const updatedData = JSON.parse(JSON.stringify(masterWorkbook.value.data));
                        updatedData["GL Raw by Store"] = [...(updatedData["GL Raw by Store"] || []), ...importedSageData];

                        const sheetDocId = "GL_Raw_by_Store";
                        await setDoc(doc(db, "workbook_v9_sheets", sheetDocId), {
                            sheetName: "GL Raw by Store",
                            rows: updatedData["GL Raw by Store"],
                            updatedAt: Date.now()
                        });

                        await setDoc(doc(db, "promo tracker", "Master_Workbook_V9_Board_Report"), {
                            lastModified: Date.now(),
                            modifiedBy: loggedInUser.value
                        }, { merge: true });

                        logSystemAction("IMPORT", `Uploaded ${importedSageData.length} Sage GL entries to Master Workbook`);
                        alert(`Success! Added ${importedSageData.length} entries from Sage to the 'GL Raw by Store' sheet.`);
                        e.target.value = '';
                    } catch (err) {
                        console.error(err);
                        alert("Error processing Sage CSV.");
                    }
                };
                reader.readAsText(file);
            } catch (err) {
                console.error(err);
                alert("Storage error during Sage upload.");
            }
        };

                                                                                                                                const handleTreezLedgerUpload = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const reader = new FileReader();
                const handleTreezLedgerUpload = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = async (evt) => {
                        try {
                            const { validEvents, quarantined } = processTreezUpload(evt.target.result, 
                                { targetMonth: activeMonth.value, calendarMonths, masterBrands: masterBrands.value },
                                { normalizeTreezLedger, normalizeSiteName, getStandardizedBrandName }
                            );

                            if (confirm(`Parsed ${validEvents.length} valid events. Proceed?`)) {
                                const uploadId = `TREEZ_${Date.now()}`;
                                await startBatchProcessing('Treez', validEvents, async (chunk) => {
                                    const batch = writeBatch(db);
                                    chunk.forEach(event => {
                                        const docId = `${event.brand.toUpperCase()}_${event.location.replace(/\s/g, '-')}_${event.isolation_month}_GENERATED_${Math.random().toString(16)}`;
                                        batch.set(doc(db, "ledger_events", docId), { 
                                            ...event, id: docId, upload_id: uploadId, site: event.location, 
                                            fiscal_year: 2026, status: 'Outstanding', created_at: serverTimestamp(), updated_at: serverTimestamp() 
                                        }, { merge: true });
                                    });
                                    await batch.commit();
                                });
                                await createUploadManifest(db, { upload_id: uploadId, source: 'TREEZ', site: activeSite.value, target_month: activeMonth.value, record_count: validEvents.length });
                            }
                        } catch (err) { alert(err.message); }
                    };
                    reader.readAsText(file);
                };

                const undoLastUpload = async (uploadId) => {
                    if (confirm("Rollback this upload?")) {
                        const count = await rollbackUpload(db, uploadId, loggedInUser.value);
                        alert(`Deleted ${count} records.`);
                    }
                };
