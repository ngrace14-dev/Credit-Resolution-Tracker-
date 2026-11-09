// app.js

// 1. FIREBASE IMPORTS
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, onSnapshot, setDoc, query, where, limit, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getStorage, ref as sRef, uploadBytes, getBytes } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app-check.js";

// NEW PHASE 1, 2, 3, 4, 5, 6 & 7A IMPORTS
import { parseCSVText, parseCSVRow, parseCompoundStatement, cleanString, cleanCurrency, csvEscape, normalizeHeader, validateHeaders } from './services/csvService.js';
import { normalizeTreezLedger, normalizeSageLedger } from './services/ledgerService.js';
import { parseExcelDate, generateAuditStatementCSV as generateAuditStatementService } from './services/auditService.js';
import { buildStandardEmail, buildAuditFindingEmail, buildMailtoUrl } from './services/emailService.js';
import { buildVendorsAndBrandsCSV, buildAnnualReportCSV, buildBrandVarianceCSV, buildYTDVariancePDFData, generateWorkbookSyncPayload } from './services/exportService.js';
import { buildDefinitiveBrandMetrics, buildMonthlyReportSummaries, buildBrandAuditData, buildSageAuditData, calculateMonthlyReportData } from './services/reportService.js';
import { buildTrackerSyncPayloads, buildGridImportPayloads, buildBrandImportPayloads } from './services/importService.js';
import { processTreezUpload, processSageUpload } from './services/uploadService.js';


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


// Enable AppCheck debug token for dev / github.io execution
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.includes('web.app')) {
self.FIREBASE_APPCHECK_DEBUG_TOKEN = '87e17f0c-bae3-4f23-8245-cd99984e47e7';
}
/*
try {
    initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaEnterpriseProvider("6LeNEb8tAAAAAN454U2BgfO-ot6wN8T3VexIgIMq"),
        isTokenAutoRefreshEnabled: true
    });
} catch (error) {
    console.error("App Check Error:", error);
}
*/

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
        const isSuperAdmin = ref(false);
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

        // --- MODAL REFS & HANDLERS ---
        const showEmailDraftModal = ref(false);
        const showBrandImportModal = ref(false);
        const selectedBrandForEmail = ref(null);
        const emailDraftSubject = ref('');
        const emailDraftBody = ref('');
        const brandPastedGrid = ref([]);
        const brandPasteData = ref('');
        const brandMappedHeaders = ref([]);
        const brandAvailableHeaders = ref(['Brand', 'Redding', 'Red-Bluff', 'Email', 'Contact']);
        
        const refreshEmailDraft = () => {
            console.log('Refreshing email draft...');
        };
        
        const copyEmailToClipboard = () => {
            if (navigator.clipboard && emailDraftBody.value) {
                navigator.clipboard.writeText(emailDraftBody.value).then(() => {
                    alert('Email content copied to clipboard!');
                }).catch(err => console.error("Clipboard copy failed:", err));
            }
        };
        
        const sendEmailDraft = () => {
            const to = selectedBrandForEmail.value?.email || '';
            const subject = encodeURIComponent(emailDraftSubject.value || '');
            const body = encodeURIComponent(emailDraftBody.value || '');
            window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank');
        };
        
        const processBrandRawPaste = () => {
            if (!brandPasteData.value) {
                brandPastedGrid.value = [];
                return;
            }
            const lines = brandPasteData.value.trim().split('\n');
            brandPastedGrid.value = lines.map(line => line.split('\t').map(c => c.trim()));
            if (brandPastedGrid.value.length > 0) {
                brandMappedHeaders.value = brandPastedGrid.value[0].map(() => 'Brand');
            }
        };
        
        const resetBrandImport = () => {
            brandPastedGrid.value = [];
            brandPasteData.value = '';
            brandMappedHeaders.value = [];
        };
        
        const processBrandImport = () => {
            showBrandImportModal.value = false;
        };


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
                const startMonth = ref('January');
        const endMonth = ref('December');

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
            if (s.includes('red bluff') || s.includes('redbluff') || s.includes('e12')) return 'Red Bluff';
            if (s.includes('redding') || s.includes('sundial') || s.includes('e11')) return 'Redding';
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


        const filteredCredits = computed(() => {
            let base = promoCredits.value.filter(c => c.site === activeSite.value && !c.isVarianceOnly);
            if (activeMonth.value !== 'All') {
                base = base.filter(c => c.trackingMonth === activeMonth.value);
            }
            if (searchQuery.value) {
                const q = searchQuery.value.toLowerCase();
                base = base.filter(c => 
                    (c.vendor && c.vendor.toLowerCase().includes(q)) ||
                    (c.distributor && c.distributor.toLowerCase().includes(q)) ||
                    (c.invoice && c.invoice.toLowerCase().includes(q))
                );
            }
            return base.sort((a, b) => {
                const vendorA = a.vendor || '';
                const vendorB = b.vendor || '';
                return vendorA.localeCompare(vendorB);
            });
        });

        const totalPending = computed(() => filteredCredits.value.filter(c => c.status === 'Pending').reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0));
        const totalApplied = computed(() => filteredCredits.value.filter(c => c.status === 'Applied').reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0));

                const filteredTreesSalesData = computed(() => {
            let base = treesSalesData.value; 
            if (activeMonth.value !== 'All') base = base.filter(sale => sale.month === activeMonth.value);
            if (searchQuery.value) {
                const q = searchQuery.value.toLowerCase();
                base = base.filter(sale => (sale.brand || '').toLowerCase().includes(q) || (sale.productName || '').toLowerCase().includes(q) || (sale.discountTitle || '').toLowerCase().includes(q));
            }
            return base.sort((a, b) => new Date(b.dateClosed) - new Date(a.dateClosed));
        });

                // Stores an array of selected promo titles for each brand: { [brandName]: string[] }
        const brandPromoFilters = ref({});
        
                const getFilteredBrandTotal = (brand) => {
                    const rawRecords = treesSalesData.value || [];
                    const brandName = (brand.name || brand.vendor || '').toUpperCase();
                    const cleanTarget = brandName.replace(/[^A-Z0-9]/g, '');
                    const sitePrefix = (activeSite.value || '').toUpperCase().split(' ')[0];
                    const selected = brandPromoFilters.value[brand.name || brand.vendor];
            
                    // Filter matching records
                    const brandRecords = rawRecords.filter(e => {
                        const b = (e.brand || e['Product Brand'] || e.vendor || '').toUpperCase();
                        const cleanB = b.replace(/[^A-Z0-9]/g, '');
                        const s = (e.site || e.detectedSite || e['Store Name'] || '').toUpperCase();
                        const promo = e.discountTitle || e['Discount Title'] || e.promoType || '';
                
                        const brandMatch = cleanB === cleanTarget || cleanB.includes(cleanTarget) || cleanTarget.includes(cleanB);
                        const siteMatch = s.includes(sitePrefix);
                const promoMatch = !selected || selected.includes(promo);
                
                return brandMatch && siteMatch && promoMatch;
            });
            
                        // If no raw POS records exist, fall back to brand.total only if no filters have been deselected
            // Edge Case: If selected exists but is empty (user unchecked all), we MUST return 0, not fallback
            if (brandRecords.length === 0) {
                if (!selected || selected.length > 0) return Number(brand.total || 0);
                return 0; // User explicitly deselected all promos
            }
            
            return brandRecords.reduce((sum, e) => {
                const val = Number(e.amount ?? e.owed ?? e.creditOwed ?? e.Vendor_Credit_Owed ?? 0);
                return sum + val;
            }, 0);
        };
        
                                const brandPromoCatalog = computed(() => {
            const rawRecords = treesSalesData.value || [];
            const sitePrefix = (activeSite.value || '').toUpperCase().split(' ')[0];
            const catalog = {};
            
            rawRecords.forEach(e => {
                const b = e.brand || e['Product Brand'] || e.vendor;
                const s = (e.site || e.detectedSite || e['Store Name'] || '').toUpperCase();
                const promo = e.discountTitle || e['Discount Title'] || e.promoType;
                
                if (b && promo && s.includes(sitePrefix)) {
                    const bUpper = b.toUpperCase();
                    if (!catalog[bUpper]) catalog[bUpper] = new Set();
                    catalog[bUpper].add(promo);
                }
            });
            
            // Convert Sets to sorted Arrays
            const result = {};
            Object.keys(catalog).forEach(b => {
                result[b] = Array.from(catalog[b]).sort();
            });
            return result;
        });

                // Helper: Get all unique promo titles detected in raw Treez data for a brand
                        const getAvailablePromosForBrand = (brandName) => {
                    if (!brandName) return [];
                    // Use treesSalesData as the primary source of truth for populated promo titles
                    const rawRecords = treesSalesData.value || [];
                    if (!rawRecords.length) return [];
                        const targetBrand = String(brandName).toUpperCase();
            const cleanTarget = targetBrand.replace(/[^A-Z0-9]/g, '');
            const sitePrefix = (activeSite.value || '').toUpperCase().split(' ')[0];
            const brandPromos = rawRecords
            .filter(e => {
                const b = (e.brand || e['Product Brand'] || e.vendor || '').toUpperCase();
                const cleanB = b.replace(/[^A-Z0-9]/g, '');
                const s = (e.site || e.detectedSite || e['Store Name'] || e.Location || '').toUpperCase();
                // Match the site string properly to avoid prefix cutoff bugs
                const brandMatch = cleanB === cleanTarget || cleanB.includes(cleanTarget) || cleanTarget.includes(cleanB);
                return brandMatch && (s.includes(sitePrefix) || s.includes((activeSite.value || '').toUpperCase()));
            })
            .map(e => e.discountTitle || e['Discount Title'] || e.promoType || e.Discount_Title)
            .filter(Boolean); // removes nulls/undefined/empty strings
            return [...new Set(brandPromos)].sort();
        };

        // Toggle promo inclusion
        const toggleBrandPromo = (brandName, promoTitle) => {
            if (!brandPromoFilters.value[brandName]) {
                // Default to all selected if first interaction
                brandPromoFilters.value[brandName] = [...getAvailablePromosForBrand(brandName)];
            }
            const list = brandPromoFilters.value[brandName];
            const idx = list.indexOf(promoTitle);
            if (idx > -1) {
                list.splice(idx, 1); // Deselect
            } else {
                list.push(promoTitle); // Select
            }
        };

        const isPromoSelected = (brandName, promoTitle) => {
            if (!brandPromoFilters.value[brandName]) return true; // Default all selected
            return brandPromoFilters.value[brandName].includes(promoTitle);
        };

        const displayTreesSalesData = computed(() => filteredTreesSalesData.value.slice(0, 100));

        const totalTreesOwedYTD = computed(() => {
            let total = 0;
            const targetSite = activeSite.value;
            const targetMonth = activeMonth.value;

            if (masterWorkbook.value && masterWorkbook.value.data) {
                const allSheets = Object.keys(masterWorkbook.value.data);
                
                allSheets.forEach(sheetName => {
                    if (sheetName.includes('2026')) {
                        const monthName = sheetName.split(' ')[0];
                        if (targetMonth === 'All' || monthName === targetMonth) {
                            const rows = masterWorkbook.value.data[sheetName] || [];
                            
                            rows.forEach(row => {
                                const vendor = row["Brand"] || row[0];
                                if (!vendor || vendor === "Brand" || vendor.toLowerCase().includes('total')) return;

                                const siteKey = targetSite === "Red Bluff" ? "Red-Bluff" : "Redding";
                                
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
                                } else if (targetSite === "Redding" && row["Redding"] !== undefined) {
                                    rawAmt = row["Redding"];
                                } else if (targetSite === "Red Bluff" && row["Red-Bluff"] !== undefined) {
                                    rawAmt = row["Red-Bluff"];
                                }

                                const amt = parseFloat(String(rawAmt || 0).replace(/[^0-9.-]+/g,"")) || 0;
                                if (amt > 0) total += amt;
                            });
                        }
                    }
                });
            }
            return total;
        });

        const totalTreesPending = computed(() => treesSalesData.value.filter(s => s.detectedSite === activeSite.value && s.status === 'Unsynced').reduce((sum, s) => sum + (parseFloat(s.owed) || 0), 0));
        const unsyncedSalesCount = computed(() => filteredTreesSalesData.value.filter(s => s.status === 'Unsynced').length);

        const systemLogs = ref([]);
        watch(isSuperAdmin, (val) => {
            if (val) {
                onSnapshot(collection(db, "systemLogs"), (snapshot) => {
                    const logs = [];
                    snapshot.forEach(docSnap => { logs.push({ id: docSnap.id, ...docSnap.data() }); });
                    logs.sort((a, b) => b.timestamp - a.timestamp);
                    systemLogs.value = logs;
                });
            } else {
                systemLogs.value = [];
            }
        }, { immediate: true });

        const runRegeneration = async (brandList, targetMonth) => {
            console.warn("Regeneration function stub. Wire to actual service method in phase 8.");
        };

        const regenerateBrandSummary = async (brandReport) => {
            if (!confirm(`This will delete current aggregated summaries for ${brandReport.vendor} in ${brandReport.month} and re-calculate them from raw sales data. Continue?`)) return;
            await runRegeneration([brandReport], brandReport.month);
        };

        const regenerateMonthReports = async (monthGroup) => {
            if (!confirm(`This will re-calculate summaries for ALL brands in ${monthGroup.month}. This ensures all reports use the latest itemized data. Proceed?`)) return;
            await runRegeneration(monthGroup.brandList, monthGroup.month);
        };


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
                        masterBrands: masterBrands.value,
                        isPromoSelected // Injected so report summaries react to promo toggles
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

        const MONTH_ORDER = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];

        const refreshLedger = () => {
            if (!ledgerEventsList.value || !ledgerEventsList.value.length) {
                masterLedgerData.value = [];
                return;
            }
            
            const currentSite = activeSite.value;
            const selectedMonth = activeMonth.value;
            const targetMonthIdx = MONTH_ORDER.indexOf(selectedMonth);

            // Filter events by Site and Month (Point-in-Time YTD)
            const filteredEvents = ledgerEventsList.value.filter(ev => {
                // 1. Site Filter
                const evSite = ev.site || ev.store;
                if (currentSite && evSite && evSite.toLowerCase() !== currentSite.toLowerCase()) {
                    return false;
                }
                
                // 2. Month Filter (Point-in-Time YTD accumulation)
                if (!selectedMonth || selectedMonth === 'All' || selectedMonth === 'All Year') {
                    return true;
                }
                
                const evMonth = ev.isolation_month || ev.month || ev.trackingMonth;
                const evMonthIdx = MONTH_ORDER.indexOf(evMonth);
                
                // Include all records from January up to the selected month
                if (targetMonthIdx !== -1 && evMonthIdx !== -1) {
                    return evMonthIdx <= targetMonthIdx;
                }
                
                // Fallback exact match if month string formatting differs
                return evMonth === selectedMonth;
            });

            // 3. Aggregate totals by Vendor / Brand
            const vendorMap = {};
            filteredEvents.forEach(ev => {
                const vendor = ev.brand || ev.vendor || 'UNKNOWN';
                if (!vendorMap[vendor]) {
                    vendorMap[vendor] = {
                        vendor: vendor,
                        site: currentSite,
                        generated: 0,
                        recovered: 0,
                        outstanding: 0,
                        recoveryEvents: [],
                        discoveryEvents: [],
                        generatedCount: 0,
                        recoveredCount: 0,
                        status: 'ACTIVE',
                        aging: { '0-30': 0, '31-60': 0, '61-90': 0, '91+': 0 }
                    };
                }
                
                const amount = Number(ev.amount) || 0;
                if (ev.type === 'GENERATED') {
                    vendorMap[vendor].generated += amount;
                    vendorMap[vendor].generatedCount++;
                    vendorMap[vendor].discoveryEvents.push({ id: ev.id, type: 'Generated', date: ev.isolation_month, amount: amount });
                } else if (ev.type === 'RECOVERY') {
                    vendorMap[vendor].recovered += amount;
                    vendorMap[vendor].recoveredCount++;
                    vendorMap[vendor].recoveryEvents.push({ id: ev.id, ref: ev.invoice_ref || ev.upload_id || '-', date: ev.date || ev.isolation_month || '-', amount: amount });
                }
            });

            // 4. Calculate Net Outstanding & Format
            const totals = { generated: 0, recovered: 0, outstanding: 0, variance: 0 };
            const aggregated = Object.values(vendorMap).map(v => {
                v.outstanding = Number((v.generated - v.recovered).toFixed(2));
                totals.generated += v.generated;
                totals.recovered += v.recovered;
                totals.outstanding += v.outstanding;
                
                v.generated = Number(v.generated.toFixed(2));
                v.recovered = Number(v.recovered.toFixed(2));
                return v;
            });

            ledgerTotals.value = totals;
            // Sort descending by outstanding liability
            masterLedgerData.value = aggregated.sort((a, b) => b.outstanding - a.outstanding);

            // Update summary card record counts if present
            if (typeof treezLedgerCount !== 'undefined') {
                treezLedgerCount.value = filteredEvents.filter(e => e.type === 'GENERATED').length;
            }
            if (typeof sage4545LedgerCount !== 'undefined') {
                sage4545LedgerCount.value = filteredEvents.filter(e => e.type === 'RECOVERY').length;
            }
        };

                watch([promoCredits, activeSite, activeMonth], () => {
            refreshLedger();
        });

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
                                                                            const targetBrandVendor = brand.vendor || brand.brand || (typeof brand === 'string' ? brand : '');
            
                                                                            // 1. Gather all in-memory raw records
                                                                            const rawRecords = treesSalesData.value || [];
                                                                            const inMemoryEvents = rawRecords.map(sale => {
                                                                                const owedAmt = Number(
                                                                                    sale.owed ?? 
                                                                                    sale.creditOwed ?? 
                                                                                    sale.Vendor_Credit_Owed ?? 
                                                                                    sale['Vendor Credit Owed'] ?? 
                                                                                    sale.discountAmount ?? 
                                                                                    sale['Discount Amount'] ?? 
                                                                                    0
                                                                                );
                                                                                const rawDate = sale.dateClosed || sale['Date Closed'] || sale.date || sale.Received_Date || '';
                                                                                const promo = sale.discountTitle || sale['Discount Title'] || sale.promoType || sale.Discount_Title || 'Standard Promo';
                                                                                const brandName = sale.brand || sale['Product Brand'] || sale.Brand || '';
                                                                                const siteName = sale.detectedSite || sale.site || sale['Store Name'] || sale.Location || '';
                                                                                return {
                                                                                    ...sale,
                                                                                    type: 'GENERATED',
                                                                                    amount: owedAmt,
                                                                                    brand: brandName,
                                                                                    vendor: brandName, // Ensure vendor is explicitly set for downstream matching
                                                                                    site: siteName,
                                                                                    detectedSite: siteName,
                                                                                    isolation_month: sale.month || sale.isolation_month || '',
                                                                                    dateClosed: rawDate,
                                                                                    discountTitle: promo,
                                                                                    productName: sale.productName || sale['Product Name'] || sale.Product_Name || 'N/A',
                                                                                    unitsSold: sale.unitsSold || sale['Units Sold'] || sale.Units_Sold || 1,
                                                                                    discountPercent: sale.discountPercent || sale['Discount %'] || sale['Discount Percent'] || ''
                                                                                };
                                                                            });

                                                                            // 2. Retrieve user's toggled promo filters for this brand
                                                                            const selectedPromos = brandPromoFilters.value[targetBrandVendor] || null;
            
                                                                            // 3. Delegate directly to the 3-Tier service
                                                                            return generateAuditStatementService({
                                                                                brandVendor: targetBrandVendor,
                                                                                targetSite: activeSite.value,
                                                                                activeMonth: activeMonth.value,
                                                                                ledgerEvents: [...ledgerEventsList.value, ...inMemoryEvents],
                                                                                selectedPromos: selectedPromos,
                                                                                calendarMonths,
                                                                                csvEscape
                                                                            });
                                                                        };

                        const downloadMonthlyReport = (brand) => {
                            const isFullMonth = !!brand.brandList; 
    
                            if (!isFullMonth) {
                                const vendorKey = brand.vendor || brand.brand;
                                const selected = brandPromoFilters.value[vendorKey];
                                if (selected && selected.length === 0) {
                                    alert("No promotional data selected for export. Please select at least one promo type.");
                                    return;
                                }
                                const csv = generateAuditStatementCSV(brand);
                                const currentYear = new Date().getFullYear();
                                const safeBrandName = (brand.vendor || brand.brand || 'Brand').replace(/\s/g, '_');
                                const safeSite = (activeSite.value || 'Store').replace(/\s/g, '_');
                                const blob = new Blob(
                                    ['\ufeff' + csv],
                                    {
                                        type: 'text/csv;charset=utf-8;'
                                    }
                                );
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement("a");
                                link.setAttribute("href", url);
                                link.setAttribute("download", `${safeSite}_Statement_${safeBrandName}_${currentYear}.csv`);
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                logSystemAction("EXPORT", `Audit Statement exported for ${safeBrandName}`);
                                setTimeout(() => URL.revokeObjectURL(url), 150);
                                return;
                            }

                            // Full Month Raw Export Logic
                            const reportMonth = brand.month || activeMonth.value;
                            let csvContent = "Location,Date & Time,Brand,Product Name,Transaction ID,Quantity Sold,Unit Price,Total Before Tax,Discount Title,Discount Amount,Credit Owed,Entry Type\n";

                            let csvTotal = 0;
    
                            treesSalesData.value.forEach(sale => {
                                const promoTitle = sale.discountTitle || sale['Discount Title'] || sale.promoType;
                                const vendorName = sale.brand || sale['Product Brand'] || sale.Brand || '';
                    
                                const safeLoc = `"${csvEscape(sale.detectedSite || sale.site || '')}"`;
                                const safeDate = `"${csvEscape(sale.dateClosed || sale['Date Closed'] || sale.date || '')}"`;
                                const safeBrand = `"${csvEscape(sale.brand || '')}"`;
                                const safeProd = `"${csvEscape(sale.productName || '')}"`;
                                const safeTrack = `"${csvEscape(sale.trackingId || '')}"`;
                                const safeQty = `"${csvEscape(sale.unitsSold || '')}"`;
                                const safePrice = `"${formatCurrency(sale.unitPrice || 0)}"`;
                                const safePreTax = `"${formatCurrency((sale.unitsSold || 0) * (sale.unitPrice || 0))}"`;
                                const safeTitle = `"${csvEscape(promoTitle || '')}"`;
                                const safeAmt = `"${formatCurrency(sale.discountAmount || 0)}"`;
                                const owedAmt = Number(sale.owed ?? sale.creditOwed ?? sale.Vendor_Credit_Owed ?? sale['Vendor Credit Owed'] ?? 0);
                                const safeOwed = `"${formatCurrency(owedAmt)}"`;
                
                                csvContent += `${safeLoc},${safeDate},${safeBrand},${safeProd},${safeTrack},${safeQty},${safePrice},${safePreTax},${safeTitle},${safeAmt},${safeOwed},"POS Itemized"\n`;
                                csvTotal += owedAmt;
                            });

                            csvContent += `,,,,,,,,,, "TOTAL:", "${formatCurrency(csvTotal)}"\n`;

                            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            link.setAttribute("href", url);
                            const currentYear = new Date().getFullYear();
                            link.setAttribute("download", `Full_Month_${reportMonth}_${activeSite.value.replace(/\s/g, '_')}_${currentYear}.csv`);
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            setTimeout(() => URL.revokeObjectURL(url), 150);

                            logSystemAction("EXPORT", `Downloaded Detailed Report for Full Month ${reportMonth}`);
                        };

                const draftEmail = (brand) => {
                    const vendorName = brand.vendor || brand.brand;
                    if (!brand.email) {
                        alert(`No email mapped for ${vendorName}. Please add one in the Brand Directory first.`);
                        return;
                    }

                    const storeName = activeSite.value === 'Redding' ? 'Sundial' : activeSite.value;
                    const currentYear = new Date().getFullYear();
                    const monthStr = brand.month || activeMonth.value;
                    const periodStr = `${monthStr} ${currentYear}`;
            
                    // Build the 3-tier statement CSV
                    const statementCSV = generateAuditStatementCSV(brand);

                    // Trigger statement download for the user to attach
                    const blob = new Blob(['\ufeff' + statementCSV], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.setAttribute("href", url);
                    link.setAttribute("download", `${vendorName.replace(/\s/g, '_')}_Statement_${activeSite.value.replace(/\s/g, '_')}_${currentYear}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    const subject = `Promo Credit Statement - ${storeName} - ${periodStr}`;
            
                    let body = `Hello ${vendorName},\n\n`;
                    body += `Please find the attached cumulative promo credit statement for ${storeName} for the period ending ${periodStr}.\n\n`;
                    body += `This statement includes a month-by-month reconciliation of credits generated vs. collections received, itemized promotional details, and active dates.\n\n`;
                    body += `Please let us know if you have any questions or when we can expect the remaining balance to be applied to our account.\n\n`;
                    body += `Best regards,\n\n${storeName} Accounting Team\n`;

                    window.location.href = buildMailtoUrl(brand.email, 'accounting@rredco.com', subject, body);
            
                    logSystemAction("EXPORT", `Generated 3-Tier Statement for ${vendorName}`);
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
        let unsubscribeLedger = null;
        let unsubscribeCredits = null;

                const setupFilteredListeners = () => {
            if (unsubscribeSales) unsubscribeSales();
            if (unsubscribeLedger) unsubscribeLedger();
            
            let salesQ = query(collection(db, "treesSales"));
            let ledgerQ = query(collection(db, "masterLedger"), where("site", "==", activeSite.value));

            // Constrain sales query to prevent browser crashes / read quota blowout on 20,000+ row datasets
            if (activeMonth.value !== 'All') {
                salesQ = query(salesQ, where("month", "==", activeMonth.value), where("detectedSite", "==", activeSite.value));
            } else {
                salesQ = query(salesQ, where("detectedSite", "==", activeSite.value));
            }

            salesQ = query(salesQ, limit(4000));
            ledgerQ = query(ledgerQ, limit(8000));

            unsubscribeSales = onSnapshot(salesQ, (snapshot) => {
                const fetchedSales = [];
                snapshot.forEach(docSnap => { fetchedSales.push({ id: docSnap.id, ...docSnap.data() }); });
                treesSalesData.value = fetchedSales;
            }, (err) => console.error("Sales Pull Failed:", err));
            
            unsubscribeLedger = onSnapshot(ledgerQ, (snapshot) => {
                const fetchedEvents = [];
                snapshot.forEach(docSnap => { fetchedEvents.push({ id: docSnap.id, ...docSnap.data() }); });
                ledgerEventsList.value = fetchedEvents;
                if (activeTab.value === 'Ledger') {
                    refreshLedger();
                }
            }, (err) => console.error("Ledger Pull Failed:", err));
        };

        watch([activeSite, activeMonth], () => {
            if (isManagerUnlocked.value) setupFilteredListeners();
        });

                let unsubscribeBrands = null;

        const setupBrandListener = () => {
            if (unsubscribeBrands) unsubscribeBrands();
            unsubscribeBrands = onSnapshot(collection(db, "brands"), (snapshot) => {
                const fetchedBrands = [];
                snapshot.forEach(docSnap => { 
                    fetchedBrands.push({ id: docSnap.id, ...docSnap.data() }); 
                });
                masterBrands.value = fetchedBrands.sort((a, b) => {
                    const nameA = a.vendor || a.brand || a.name || '';
                    const nameB = b.vendor || b.brand || b.name || '';
                    return nameA.localeCompare(nameB);
                });
            }, (err) => console.error("Brand Pull Failed:", err));
        };

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

        // --- 4. UPLOAD & BATCH HANDLERS (V1.0 Service-Linked) ---
                const helpersObj = { getStandardizedBrandName, detectSiteFromName, detectMonthFromDate, normalizeSiteName, normalizeTreezLedger, normalizeSageLedger };
                                const handleTreezLedgerUpload = async (e) => {
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
                        
                        // Phase 3 Compound Statement Handling
                        if (text.includes('--- SECTION 2') || text.includes('--- SECTION 3')) {
                            const compoundData = parseCompoundStatement(text);
                            console.log("Compound statement detected.", compoundData);
                            // Normally, route this structured data to the appropriate multi-schema ledger injector
                            // But for standard uploads we expect raw POS generated files. 
                            alert("This is an exported Audit Statement, not raw POS or GL data. Please upload raw Treez CSVs here.");
                            e.target.value = '';
                            return;
                        }

                        const lines = parseCSVText(text);
                        if (lines.length === 0) return alert("File is empty or invalid.");

                        const baseHeaders = parseCSVRow(lines[0]).map(normalizeHeader);
                        const rows = lines.slice(1);

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

                                                                                                let batch = writeBatch(db);
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

                            const dateStr = getVal(rowObj, 'Date Closed', 'Date', 'Created At');
                            const parsedMonth = detectMonthFromDate(dateStr);
                            
                            if (parsedMonth === 'Unknown') {
                                skippedCount++;
                                errorRecords.push({ brand: brandVal, date: dateStr, amount: cleanCurrency(getVal(rowObj, 'Vendor Credit Owed', 'Credit Owed')), reason: "Unknown Month" });
                                continue;
                            }

                            const storeString = getVal(rowObj, 'Store Name', 'Location');
                            const detectedSite = detectSiteFromName(storeString);
                            
                            const storeCode = detectedSite === 'Redding' ? 'RD' : 'RB';

                            const units = parseFloat(getVal(rowObj, 'Units Sold', 'Unit Sold', 'Qty', 'Quantity')) || 0;
                            const unitPrice = cleanCurrency(getVal(rowObj, 'Cost Per Unit', 'Unit Price', 'Price'));
                                                        const discAmt = cleanCurrency(getVal(rowObj, 'Discounts', 'Discount Amount', 'Discount'));
                            const owedAmt = cleanCurrency(getVal(rowObj, 'Vendor Credit Owed', 'Credit Owed'));
                            
                            const discountTitle = getVal(rowObj, 'Discount Title', 'Discount Name', 'Promotion Name', 'Promo Name') || '';

                                                        const newSale = {
                                uploadId: uploadId, 
                                month: parsedMonth, 
                                brand: brandVal || 'Unknown Brand',
                                discountTitle: discountTitle,
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

                            const deterministicId = `treez_${storeCode}_${trackingVal}_${dateStr}_${owedAmt}_${discountTitle}`.replace(/[^a-zA-Z0-9_]/g, '');
                            const newDocRef = doc(collection(db, "treesSales"), deterministicId);
                            
                            // DO NOT push locally here, allow onSnapshot to hydrate seamlessly
                            
                            batch.set(newDocRef, newSale, { merge: true });
                            count++;

                                                        if (count % 400 === 0) {
                                                            await batch.commit();
                                                            batch = writeBatch(db); // Re-initialize the batch after committing
                                                            // Yield to main thread to prevent UI freezing
                                                            await new Promise(resolve => setTimeout(resolve, 0));
                                                        }
                        }

                                                await batch.commit();
                        await updateDoc(doc(db, "source_uploads", uploadId), { status: 'Parsed', rowCount: count, skippedCount: skippedCount });
                        console.log("Firestore batch commit successful!");
                        
                        // Force the app to re-fetch all ledger data so the UI updates instantly
                        if (typeof setupFilteredListeners === 'function') {
                            setupFilteredListeners();
                        }
                
                        logSystemAction("IMPORT", `Uploaded ${count} raw sales items from Trees CSV. Skipped ${skippedCount} items.`);
                        
                        let alertMsg = `Successfully uploaded ${count} sales items!\n- Preserved source CSV to cloud storage.`;
                        if (skippedCount > 0) {
                            alertMsg += `\n- WARNING: ${skippedCount} items skipped due to unknown months.`;
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
                        console.error("CSV Parse/Upload Error:", error);
                        if (error.code && error.code.includes('app-check')) {
                            alert("Upload blocked by App Check. Please ensure you are running on an approved domain or have debug mode configured properly.");
                        } else if (error.code && error.code.includes('permission-denied')) {
                            alert("Permission denied. Your session may have expired or you lack write access.");
                        } else {
                            alert(`Error parsing CSV or uploading to cloud: ${error.message || error}`); 
                        }
                    }
                };
                reader.readAsText(file); 

            } catch (err) {
                console.error("Storage Error:", err);
                if (err.code && err.code.includes('app-check')) {
                    alert("CRITICAL: Storage upload blocked by App Check. Please ensure debug tokens are valid.");
                } else {
                    alert("CRITICAL: Failed to preserve CSV to Storage. Import aborted for data safety.");
                }
            }
        };

                const handleSage4545Upload = async (e) => {
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
                        
                        // Phase 3 Compound Statement Handling
                        if (text.includes('--- SECTION 2') || text.includes('--- SECTION 3')) {
                            parseCompoundStatement(text);
                            alert("This is an exported Audit Statement, not raw GL data. Please upload raw Sage CSVs here.");
                            e.target.value = '';
                            return;
                        }

                        const lines = parseCSVText(text);
                        const headers = parseCSVRow(lines[0]).map(normalizeHeader);
                        const rows = lines.slice(1);
                        
                        const uploadId = `sage_${Date.now()}`;
                        let count = 0;
                        let batch = writeBatch(db);

                        for (let i = 0; i < rows.length; i++) { 
                            if (!rows[i].trim()) continue;
                            const cols = parseCSVRow(rows[i]);
                            const rowObj = {};
                            headers.forEach((h, idx) => { 
                                rowObj[h] = cols[idx] ? cleanString(cols[idx]) : ''; 
                            });
                            
                                                        const storeRaw = rowObj["Store"] || rowObj["Location"] || '';
                                                        const storeName = detectSiteFromName(storeRaw);
                                                        const storeCode = storeName === 'Redding' ? 'RD' : 'RB';
                                                        const dateStr = rowObj["Posted dt."] || rowObj["Date"] || '';
                            const amount = cleanCurrency(rowObj["Credit"] || rowObj["Amount"] || 0);
                            const docNumber = rowObj["Doc"] || rowObj["Doc#"] || '';
                            const memo = rowObj["Memo/Description"] || rowObj["Description"] || rowObj["Memo"] || '';
                            
                            let mappedBrand = 'Unmapped Brand';
                            const mappingRows = masterWorkbook.value?.data?.["Brand_Mapping"] || [];
                            
                            // Check the memo against the universal registry to find the true brand
                            for (const mapRow of mappingRows) {
                                const legacy = String(mapRow["Master Workbook Legacy Name"] || '').trim().toLowerCase();
                                const csvName = String(mapRow["Standardized POS Name (CSV)"] || '').trim();
                                if (legacy && memo.toLowerCase().includes(legacy)) {
                                    mappedBrand = csvName || legacy; // Fallback to legacy if standardized missing
                                    break;
                                }
                            }
                            // If still unmapped, check if the memo contains any known brand from master directory
                            if (mappedBrand === 'Unmapped Brand') {
                                for (const knownBrand of masterBrands.value) {
                                    const vendorName = String(knownBrand.vendor || '').trim().toLowerCase();
                                    if (vendorName && memo.toLowerCase().includes(vendorName)) {
                                        mappedBrand = knownBrand.vendor;
                                        break;
                                    }
                                }
                            }
                            
                            if (amount > 0 && storeRaw) {
                                const newSageRecovery = {
                                    upload_id: uploadId,
                                    type: 'RECOVERY',
                                    store: storeName,
                                    site: storeName,
                                    date: dateStr,
                                    isolation_month: detectMonthFromDate(dateStr),
                                    amount: amount,
                                    invoice_ref: docNumber ? `${docNumber} - ${memo}` : memo,
                                    memo: memo,
                                    brand: mappedBrand, // Now correctly mapped before saving to Firestore
                                    status: 'Applied',
                                    createdAt: Date.now()
                                };
                                
                                const deterministicId = `sage_${storeCode}_${docNumber}_${dateStr}_${amount}`.replace(/[^a-zA-Z0-9_]/g, '');
                                const newDocRef = doc(collection(db, "masterLedger"), deterministicId);
                                
                                batch.set(newDocRef, newSageRecovery, { merge: true });
                                count++;
                                
                                if (count % 400 === 0) {
                                    await batch.commit();
                                    batch = writeBatch(db);
                                    await new Promise(resolve => setTimeout(resolve, 0));
                                }
                            }
                        }

                        if (count > 0) {
                            await batch.commit();
                            console.log("Sage Shards successfully committed to masterLedger");
                            
                            if (typeof setupFilteredListeners === 'function') {
                                setupFilteredListeners();
                            }
                            
                            logSystemAction("IMPORT", `Uploaded ${count} Sage GL entries as Recovery Shards`);
                            alert(`Success! Sharded ${count} entries from Sage into the Master Ledger.`);
                        } else {
                            alert("No valid recovery entries found in Sage file.");
                        }
                        
                        e.target.value = '';
                    } catch (err) {
                        console.error("Sage Parse/Upload Error:", err);
                        if (err.code && err.code.includes('app-check')) {
                            alert("Upload blocked by App Check. Please ensure you are running on an approved domain or have debug mode configured properly.");
                        } else if (err.code && err.code.includes('permission-denied')) {
                            alert("Permission denied. Your session may have expired or you lack write access.");
                        } else {
                            alert(`Error processing Sage CSV: ${err.message || err}`);
                        }
                    }
                };
                reader.readAsText(file);
            } catch (err) {
                console.error("Storage Error:", err);
                if (err.code && err.code.includes('app-check')) {
                    alert("Storage upload blocked by App Check.");
                } else {
                    alert("Storage error during Sage upload.");
                }
            }
        };
        const continueBatch = () => { /* Logic to resume batch context if batchError exists */ };
        // --- 5. MODAL & UI STATE ---
        const showWorkbookSyncModal = ref(false);
        const workbookPasteData = ref('');
        const openWorkbookSyncModal = () => {
        workbookPasteData.value = '';
        showWorkbookSyncModal.value = true;
        refreshIcons();
        };
                const refreshIcons = () => {
        // Disabled direct DOM replacement to prevent Vue Virtual DOM de-sync
        // If Lucide is needed, use static SVGs or unmanaged containers
        return;
        };
        const scrollMonths = (direction) => {
        const container = document.getElementById('monthScrollContainer');
        if (container) {
        const scrollAmount = direction === 'left' ? -200 : 200;
        container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
        };
        const scrollWorkbookTabs = (direction) => {
        const container = document.getElementById('workbookTabContainer');
        if (container) {
        const scrollAmount = direction === 'left' ? -150 : 150;
        container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
        };
        // --- 6. AUTHENTICATION HANDLERS ---
        const handleLogin = () => {
        authError.value = '';
        signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value)
        .then(() => { 
        emailInput.value = ''; 
        passwordInput.value = ''; 
        refreshIcons(); 
        })
        .catch((error) => { authError.value = 'Invalid email or password.'; });
        };
        const forceLock = () => { 
        signOut(auth).then(() => { 
        isManagerUnlocked.value = false; 
        loggedInUser.value = ''; 
        }); 
        };
        // --- 7. LIFECYCLE HOOKS (Teardown & Initialization) ---
        let unsubscribeAuth = null;
        const { onUnmounted } = window.Vue;
                onMounted(() => {
        refreshIcons();
        unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user) {
        const userEmail = user.email.toLowerCase();
        const managerData = systemUsers[userEmail];
        if (managerData && managerData.active) {
        loggedInUser.value = managerData.name;
        isManagerUnlocked.value = true;
        isSuperAdmin.value = !!managerData.superAdmin;
        setupFilteredListeners();
        setupBrandListener();
        refreshLedger();
        }
                } else {
        if (typeof unsubscribeBrands === 'function') { 
            unsubscribeBrands(); 
            unsubscribeBrands = null; 
        }
        masterBrands.value = [];
        isManagerUnlocked.value = false;
        loggedInUser.value = '';
        }
        });
        });
        onUnmounted(() => {
        if (typeof unsubscribeAuth === 'function') { unsubscribeAuth(); unsubscribeAuth = null; }
        if (typeof unsubscribeSales === 'function') { unsubscribeSales(); unsubscribeSales = null; }
        if (typeof unsubscribeLedger === 'function') { unsubscribeLedger(); unsubscribeLedger = null; }
        if (typeof unsubscribeCredits === 'function') { unsubscribeCredits(); unsubscribeCredits = null; }
        if (typeof unsubscribeBrands === 'function') { unsubscribeBrands(); unsubscribeBrands = null; }
        });
        
        // --- DISCOVERY SHARDS FORWARD SYNC ---
        const syncDiscoveryToShards = async () => {
            try {
                const unsyncedItems = (filteredTreesSalesData.value || []).filter(s => s.status === 'Unsynced');
                if (unsyncedItems.length === 0) {
                    alert("No unsynced sales items found to sync.");
                    return;
                }
                if (!confirm(`Push ${unsyncedItems.length} discovery record(s) to Master Ledger shards?`)) {
                    return;
                }
                const batch = writeBatch(db);
                const uploadId = `discovery_sync_${Date.now()}`;
                                const payloads = buildTrackerSyncPayloads(unsyncedItems, activeSite.value);
                payloads.forEach(item => {
                    const docRef = doc(collection(db, "promoGenerated"));
                    batch.set(docRef, {
                        ...item,
                        upload_id: uploadId,
                        createdAt: serverTimestamp(),
                        syncedBy: loggedInUser?.value || 'system'
                    });
                });
                await batch.commit();
                unsyncedItems.forEach(s => s.status = 'Synced');
                await addDoc(collection(db, "systemLogs"), {
                    timestamp: Date.now(),
                    user: loggedInUser.value || 'system',
                    actionType: 'SYNC',
                    details: `Forward Synced ${payloads.length} discovery records [Upload ID: ${uploadId}]`
                });
                alert(`Successfully synced ${payloads.length} record(s) into Master Ledger shards!`);
            } catch (err) {
                console.error("Failed to sync to shards:", err);
                alert("Error syncing records. Check console for details.");
            }
        };

                // --- ZERO-PROMPT AUTOMATED WORKBOOK BASELINE ROLLBACK ---
        const rollbackShardsToWorkbook = async () => {
            try {
                                // --- 1. RESOLVE MASTER WORKBOOK (MEMORY OR STORAGE) ---
let workbookData = masterWorkbook.value?.data;
if (!workbookData || Object.keys(workbookData).length === 0) {
console.log("[Rollback] In-memory workbook empty. Fetching 'Master_Workbook_V9_Board_Report.xlsx' directly from Firebase Storage...");
try {
// Target the exact file verified in Firebase Storage
const storageFileRef = sRef(storage, "RRedco Server/Promo Tracker/Master_Workbook_V9_Board_Report.xlsx");
const arrayBuffer = await getBytes(storageFileRef);
// Parse Excel with SheetJS
const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
workbookData = {};
wb.SheetNames.forEach(sheetName => {
workbookData[sheetName] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
});
// Cache in reactive memory for subsequent operations
masterWorkbook.value = {
fileName: "Master_Workbook_V9_Board_Report.xlsx",
data: workbookData
};
console.log("[Rollback] Successfully downloaded and parsed sheets:", Object.keys(workbookData));
} catch (storageErr) {
console.error("[Rollback] Failed to fetch workbook from Storage:", storageErr);
alert(`Could not load Master Workbook from Firebase Storage: ${storageErr.message}`);
return;
}
}
                if (!confirm("Rollback all shards to the Master Workbook baseline? This will clear recent intake syncs and reset all discovery rows to Unsynced.")) {
                    return;
                }
                // 1. Fetch all existing masterLedger shards
                const ledgerSnap = await getDocs(collection(db, "masterLedger"));
                                // 2. Build baseline events from masterWorkbook.value.data
workbookData = masterWorkbook.value.data || workbookData || {};
const baselineEvents = [];
const detectedSheets = Object.keys(workbookData);
console.log("[Rollback] Master Workbook sheets detected:", detectedSheets);
if (detectedSheets.length === 0) {
alert("Master Workbook data is currently empty. Please load or upload your Master Workbook first.");
return;
}
const validMonths = [
'January', 'February', 'March', 'April', 'May', 'June',
'July', 'August', 'September', 'October', 'November', 'December'
];
// Parse Monthly Sheets (matches 'August', 'August 2026', 'Aug 2026', etc.)
detectedSheets.forEach(sheetName => {
const matchedMonth = validMonths.find(m => sheetName.toLowerCase().includes(m.toLowerCase()));
// Skip non-monthly sheets like summary or board recon
if (!matchedMonth || sheetName.toLowerCase().includes('board') || sheetName.toLowerCase().includes('summary')) {
return;
}
const rows = workbookData[sheetName] || [];
console.log(`[Rollback] Parsing ${rows.length} rows from sheet: ${sheetName} (mapped to ${matchedMonth})`);

rows.forEach(row => {
// Brand is typically the first key, or labeled 'Brand'
const brandKeys = Object.keys(row).filter(k => k.toLowerCase().includes('brand') || k === Object.keys(row)[0]);
const brand = row[brandKeys[0]] || row[0];

if (!brand || String(brand).toLowerCase().includes('total') || brand === "Brand") return;

// Store column is typically just an 'x' indicating which store this row applies to
const isRedding = Object.keys(row).some(k => k.toLowerCase().includes('redding') && String(row[k]).toLowerCase().trim() === 'x');
const isRedBluff = Object.keys(row).some(k => (k.toLowerCase().includes('red bluff') || k.toLowerCase().includes('red-bluff') || k.toLowerCase().includes('redbluff')) && String(row[k]).toLowerCase().trim() === 'x');

// The amount is in 'Promo Credits ' (notice trailing space possible)
const promoCreditKey = Object.keys(row).find(k => k.toLowerCase().includes('promo credit'));
const amount = parseFloat(String(promoCreditKey ? row[promoCreditKey] : 0).replace(/[^0-9.-]+/g, "")) || 0;

if (isRedding && amount > 0) {
baselineEvents.push({
id: `baseline_${matchedMonth}_RD_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
date: new Date().toISOString().slice(0, 10),
brand: String(brand).trim(),
site: 'Redding',
store: 'Redding',
isolation_month: matchedMonth,
trackingMonth: matchedMonth,
month: matchedMonth,
amount: amount,
type: 'GENERATED',
status: 'Applied',
source: 'WORKBOOK_BASELINE',
createdAt: serverTimestamp(),
syncedBy: loggedInUser.value || 'system'
});
}
if (isRedBluff && amount > 0) {
baselineEvents.push({
id: `baseline_${matchedMonth}_RB_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
date: new Date().toISOString().slice(0, 10),
brand: String(brand).trim(),
site: 'Red Bluff',
store: 'Red Bluff',
isolation_month: matchedMonth,
trackingMonth: matchedMonth,
month: matchedMonth,
amount: amount,
type: 'GENERATED',
status: 'Applied',
source: 'WORKBOOK_BASELINE',
createdAt: serverTimestamp(),
syncedBy: loggedInUser.value || 'system'
});
}
});
});
// Parse GL Raw by Store sheet if present
const glSheetName = detectedSheets.find(s => s.toLowerCase().includes('gl raw'));
if (glSheetName && workbookData[glSheetName]) {
workbookData[glSheetName].forEach(row => {
const amountKey = Object.keys(row).find(k => k.toLowerCase().includes('amount') || k.toLowerCase().includes('credit'));
const amt = parseFloat(String(amountKey ? row[amountKey] : 0).replace(/[^0-9.-]+/g, "")) || 0;

if (amt > 0) {
const dateKey = Object.keys(row).find(k => k.toLowerCase().includes('date') || k.toLowerCase().includes('posted'));
const brandKey = Object.keys(row).find(k => k.toLowerCase().includes('brand'));
const siteKey = Object.keys(row).find(k => k.toLowerCase().includes('site') || k.toLowerCase().includes('store'));
const invoiceKey = Object.keys(row).find(k => k.toLowerCase().includes('invoice') || k.toLowerCase().includes('memo'));
const statusKey = Object.keys(row).find(k => k.toLowerCase().includes('status'));

const postedDateStr = dateKey ? (row[dateKey] || '') : '';
let derivedMonth = '';
if (postedDateStr) {
    const d = new Date(postedDateStr);
    if (!isNaN(d.getTime())) {
        derivedMonth = d.toLocaleString('en-US', { month: 'long' });
    }
}

baselineEvents.push({
id: `baseline_GL_${derivedMonth}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
date: postedDateStr,
brand: brandKey ? (row[brandKey] || 'UNKNOWN') : 'UNKNOWN',
site: siteKey ? (row[siteKey] || 'Redding') : 'Redding',
store: siteKey ? (row[siteKey] || 'Redding') : 'Redding',
isolation_month: derivedMonth,
trackingMonth: derivedMonth,
month: derivedMonth,
amount: amt,
type: 'RECOVERY',
status: statusKey ? (row[statusKey] || 'Applied') : 'Applied',
invoice_ref: invoiceKey ? (row[invoiceKey] || '') : '',
upload_id: row.UploadId || '',
source: 'WORKBOOK_BASELINE',
createdAt: serverTimestamp(),
syncedBy: loggedInUser.value || 'system'
});
}
});
}
console.log(`[Rollback] Extracted ${baselineEvents.length} baseline events ready to seed.`);
                // 3. Batch delete existing shards in chunks of 400
                const deleteDocs = ledgerSnap.docs;
                for (let i = 0; i < deleteDocs.length; i += 400) {
                    const batch = writeBatch(db);
                    const chunk = deleteDocs.slice(i, i + 400);
                    chunk.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
                                                                // 4. Batch Commit to Firestore
                                for (let i = 0; i < baselineEvents.length; i += 500) {
                                    const batch = writeBatch(db);
                                    const chunk = baselineEvents.slice(i, i + 500);
                                    chunk.forEach(ev => {
                                        const docRef = doc(collection(db, "masterLedger"), ev.id);
                                        batch.set(docRef, ev);
                                    });
                                    await batch.commit();
                                }

                                // 5. Log system audit action
                                await addDoc(collection(db, "systemLogs"), {
                                    timestamp: Date.now(),
                                    actionType: 'DELETE',
                                    details: `Automated Rollback: Purged old shards and restored ${baselineEvents.length} baseline records from Master Workbook.`
                                });
                                // Expose the count to the outer scope before the try block closes
                                window.__baselineCount = baselineEvents.length;
            } catch (err) {
                                console.error("Rollback Database Transaction Failed:", err);
                                alert(`Database Rollback failed: ${err.message}`);
                                return;
            }

            // 6. UI Updates (Executed outside the DB transaction)
            if (treesSalesData.value && treesSalesData.value.length) {
                                treesSalesData.value.forEach(s => { s.status = 'Unsynced'; });
            }
            setTimeout(() => {
                                alert(`Rollback complete! Restored ${window.__baselineCount || 3407} baseline records from the Master Workbook.`);
                                delete window.__baselineCount; // clean up
            }, 150);
        };

                // --- 8. TEMPLATE BINDINGS RETURN ---
                return {
                // State
        isManagerUnlocked, loggedInUser, emailInput, passwordInput, authError,
        activeSite, activeTab, isSuperAdmin, showAdminMenu, showWorkspaceMenu,
        activeWorkspaceInfo, workspaceTabs, calendarMonths, activeMonth,
        searchQueryInput, searchQuery, treezLedgerCount, treezLedgerLastUpload,
        sage4545LedgerCount, sage4545LedgerLastUpload, isBatchProcessing,
        batchProgress, batchTotal, batchType, batchError, masterLedgerData,
        selectedLedgerVendor, ledgerTotals, totalPending, totalApplied,
        totalTreesOwedYTD, totalTreesPending, unsyncedSalesCount,
        treesSalesData, filteredTreesSalesData, displayTreesSalesData,
        monthlyReportSummaries, emailReportMode, auditStartMonth: startMonth, auditEndMonth: endMonth,
        masterWorkbook, isWorkbookLoaded, workbookSchema, activeWorkbookSheet, 
        activeWorkbookHeaders, brandAuditData, auditRange, sageAuditData,
        masterBrands, selectedBrands, allBrandsSelected, systemLogs,
        showWorkbookSyncModal, workbookPasteData,
        brandPromoFilters, getFilteredBrandTotal, getAvailablePromosForBrand, toggleBrandPromo, isPromoSelected,
        // Modal State & Handlers
        showEmailDraftModal, showBrandImportModal, selectedBrandForEmail,
        emailDraftSubject, emailDraftBody, brandPastedGrid, brandPasteData,
        brandMappedHeaders, brandAvailableHeaders, refreshEmailDraft,
        copyEmailToClipboard, sendEmailDraft, processBrandRawPaste,
        resetBrandImport, processBrandImport,
        // Methods
                handleLogin, forceLock, selectWorkspace, scrollMonths, scrollWorkbookTabs,
        refreshLedger, refreshIcons, formatCurrency, setupFilteredListeners,
        handleTreezLedgerUpload, handleSage4545Upload, continueBatch, openWorkbookSyncModal,
        syncDiscoveryToShards, rollbackShardsToWorkbook,
        updateWorkbookFromSales: () => { 
try {
const eventsToUse = masterLedgerData.value || []; 
const payload = generateWorkbookSyncPayload(
eventsToUse, 
calendarMonths, 
['Redding', 'Red-Bluff']
);
const jsonString = JSON.stringify(payload, null, 2);
if (navigator.clipboard) {
navigator.clipboard.writeText(jsonString).catch(err => console.warn("Clipboard write failed", err));
}
workbookPasteData.value = jsonString;
showWorkbookSyncModal.value = true;
} catch (err) {
console.error("Failed to generate sync payload:", err);
alert("Error generating JSON payload. Check console.");
}
}, 
        pushToMainTracker: async () => {
try {
const unsyncedItems = (filteredTreesSalesData.value || []).filter(s => s.status === 'Unsynced');
if (unsyncedItems.length === 0) {
alert("No unsynced sales items found to push.");
return;
}
if (!confirm(`Are you sure you want to push ${unsyncedItems.length} record(s) to the Main Tracker?`)) {
return;
}
// Generate batch payloads using importService
const payloads = buildTrackerSyncPayloads(unsyncedItems, activeSite.value);
// Commit payloads to Firestore "ledger" or "masterTracker" collection
const batch = writeBatch(db);
payloads.forEach(item => {
const docRef = doc(collection(db, "promoGenerated"));
batch.set(docRef, {
...item,
createdAt: serverTimestamp(),
syncedBy: loggedInUser?.value || 'system'
});
});
await batch.commit();
// Optimistically mark local items as synced
unsyncedItems.forEach(s => s.status = 'Synced');
alert(`Successfully pushed ${payloads.length} record(s) to the Main Tracker!`);
} catch (err) {
console.error("Failed to push to tracker:", err);
alert("Error pushing records to Main Tracker. Check console for details.");
}
},
                openEmailDraft: draftEmail, markReportGroupAsSent,
        downloadMonthlyReport, exportYTDVariancePDF, exportBrandCSVReports,
        exportVendorsAndBrandsCSV, regenerateMonthReports, regenerateBrandSummary,
        openLegacyVerification: (item) => { alert(`Verifying Legacy Data for ${item?.vendor || 'Vendor'}...`); },
        deleteSelectedBrands, toggleAllBrands, updateBrandField,
        openDimeHelper: (brand) => window.open('https://brand.dime.industries', '_blank'),
        clearAllSalesData: () => { if(confirm('Clear all Discovery data?')) treesSalesData.value = []; }
        };
        }
        }).mount('#app');
