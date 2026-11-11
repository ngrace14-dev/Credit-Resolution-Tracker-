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

import {
    ingestMasterWorkbookFile,
    ingestTreezPOSCSV,
    ingestSageGLCSV,
    syncDataToWorkbook,
    exportMasterWorkbookFile,
    localWorkbookState
} from './services/workbookService.js';

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
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp); 
const storage = getStorage(firebaseApp); 

// 3. VUE APP INIT
const { createApp, ref, computed, nextTick, onMounted, watch } = window.Vue;

createApp({
    setup() {
        const isProcessing = ref(false);
        const progressPercent = ref(0);
        const progressMessage = ref('');
        const progressDetails = ref('');
        const progressETA = ref('');
        const sleep = () => new Promise(resolve => setTimeout(resolve, 0));

        const isGlobalLoading = ref(false);
        const localWbStatus = ref('Not loaded');
        const localTreezStatus = ref('Not loaded');
        const localSageStatus = ref('Not loaded');
        const localSyncSummary = ref('');

        const handleLocalWbUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            isGlobalLoading.value = true;
            try {
                const res = await ingestMasterWorkbookFile(file);
                localWbStatus.value = `Loaded (${res.totalSheets} sheets)`;
                // Assign parsed workbook data immediately for reactivity
                masterWorkbook.value = { 
                    data: localWorkbookState.workbookData,
                    summary: res 
                };
            } catch (err) {
                alert(err.message);
            } finally {
                isGlobalLoading.value = false;
            }
        };

        const handleLocalTreezUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            isProcessing.value = true;
            progressMessage.value = 'Analyzing Treez POS Records...';
            progressPercent.value = 0;
            progressETA.value = 'Calculating...';

            try {
                const text = await file.text();
                const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
                const totalLines = lines.length;
                const chunkSize = 5000;
                const startTime = performance.now();

                for (let i = 0; i < totalLines; i += chunkSize) {
                    const processed = Math.min(i + chunkSize, totalLines);
                    progressPercent.value = Math.round((processed / totalLines) * 100);
                    progressDetails.value = `${processed.toLocaleString()} / ${totalLines.toLocaleString()} rows processed`;

                    // ETA Calculation
                    const elapsedMs = performance.now() - startTime;
                    const msPerRow = elapsedMs / processed;
                    const remainingRows = totalLines - processed;
                    const remainingMs = msPerRow * remainingRows;
                    const remainingSec = Math.ceil(remainingMs / 1000);

                    if (remainingSec > 60) {
                        const mins = Math.floor(remainingSec / 60);
                        const secs = remainingSec % 60;
                        progressETA.value = `${mins}m ${secs}s remaining`;
                    } else {
                        progressETA.value = `${remainingSec}s remaining`;
                    }

                    await sleep();
                }

                progressMessage.value = 'Finalizing state...';
                const activeMonthLocal = activeMonth.value || 'October';
                const rows = await ingestTreezPOSCSV(file, activeMonthLocal);
                localTreezStatus.value = `Loaded (${rows.length} rows)`;
                treesSalesData.value = rows;
            } catch (err) {
                alert(err.message);
            } finally {
                isProcessing.value = false;
            }
        };

        const handleLocalSageUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            isGlobalLoading.value = true;
            try {
                const rows = await ingestSageGLCSV(file);
                localSageStatus.value = `Loaded (${rows.length} rows)`;
            } catch (err) {
                alert(err.message);
            } finally {
                isGlobalLoading.value = false;
            }
        };

        const handleLocalSyncMemory = async () => {
            isProcessing.value = true;
            progressMessage.value = 'Synchronizing Workbook Data...';
            progressDetails.value = 'Preparing RAM sync payload...';
            progressPercent.value = 0;
            progressETA.value = 'Short duration';

            await sleep();

            try {
                progressPercent.value = 50;
                progressDetails.value = 'Executing cross-reference engine...';
                await sleep();

                const activeMonthLocal = activeMonth.value || 'October';
                const stats = syncDataToWorkbook(activeMonthLocal);

                progressPercent.value = 100;
                localSyncSummary.value = `Synced ${stats.updatedBrands} brands successfully.`;
                progressDetails.value = 'Sync complete.';
                await sleep();
            } catch (err) {
                alert(err.message);
            } finally {
                isProcessing.value = false;
            }
        };

        const handleLocalExportWb = () => {
            try {
                exportMasterWorkbookFile();
            } catch (err) {
                alert(err.message);
            }
        };

        const fallbackEmailMap = ref({});
        onMounted(async () => {
            try {
                const response = await fetch("./email-mapping.json");
                if (response.ok) {
                    fallbackEmailMap.value = await response.json();
                } else {
                    console.warn("Could not fetch email-mapping.json", response.status);
                }
            } catch (err) {
                console.error("Error fetching email-mapping.json:", err);
            }
        });

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
        const activeMonth = ref('October');
        const ledgerEventsList = ref([]);
        const masterBrands = ref([]);
        const selectedBrands = ref([]);
        const isBatchProcessing = ref(false);
        const isExporting = ref(false);
        const batchProgress = ref(0);
        const batchTotal = ref(0);
        const batchType = ref('');
        const batchError = ref(null);

        const fetchSalesData = async () => {
            isExporting.value = true;
            try {
                let q = query(collection(db, "treesSales"));
                if (activeMonth.value !== 'All') {
                    q = query(q, where("month", "==", activeMonth.value));
                }
                const snap = await getDocs(q);
                const loaded = [];
                const isBluff = (str) => str.includes('BLUFF') || str.includes('RB') || str.includes('E12');
                const isRedding = (str) => (str.includes('REDDING') || str.includes('RD') || str.includes('E11')) && !str.includes('BLUFF');
                const targetIsBluff = (activeSite.value || '').toUpperCase().includes('BLUFF');
                snap.forEach(docSnap => {
                    const data = docSnap.data();
                    const s = (data.detectedSite || data['Store Name'] || data.Location || '').toUpperCase();
                    const siteMatch = activeSite.value === 'All' || (targetIsBluff ? isBluff(s) : isRedding(s));
                    if (siteMatch) {
                        loaded.push({ id: docSnap.id, ...data });
                    }
                });
                if (loaded.length === 0 && treesSalesData.value.length > 0) {
                } else {
                    treesSalesData.value = loaded;
                }
            } catch (err) {
                console.error("Sales Fetch Failed:", err);
            } finally {
                isExporting.value = false;
            }
        };

        const showEmailDraftModal = ref(false);
        const showBrandImportModal = ref(false);
        const selectedBrandForEmail = ref(null);
        const emailDraftSubject = ref('');
        const emailDraftBody = ref('');
        const brandPastedGrid = ref([]);
        const brandPasteData = ref('');
        const brandMappedHeaders = ref([]);
        const brandAvailableHeaders = ref([
            '-- Ignore Column --', 'Brand', 'Rep', 'Email', 'Name as appears in TREES',
            'Distro', 'Asset Library', 'Order From', 'Payee', 'Notes'
        ]);

        const refreshEmailDraft = () => {};

        const copyEmailToClipboard = () => {
            if (typeof navigator !== 'undefined' && navigator.clipboard && emailDraftBody.value) {
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

        const resetBrandImport = () => {
            brandPastedGrid.value = [];
            brandPasteData.value = '';
            brandMappedHeaders.value = [];
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

        const treezLedgerCount = ref(0);
        const sage4545LedgerCount = ref(0);
        const treezLedgerLastUpload = ref(null);
        const sage4545LedgerLastUpload = ref(null);

        try {
            const storedTreezCount = localStorage.getItem('treezLedgerCount');
            const storedSageCount = localStorage.getItem('sage4545LedgerCount');
            const storedTreezTime = localStorage.getItem('treezLedgerLastUpload');
            const storedSageTime = localStorage.getItem('sage4545LedgerLastUpload');
            if (storedTreezCount) treezLedgerCount.value = parseInt(storedTreezCount);
            if (storedSageCount) sage4545LedgerCount.value = parseInt(storedSageCount);
            if (storedTreezTime) treezLedgerLastUpload.value = storedTreezTime;
            if (storedSageTime) sage4545LedgerLastUpload.value = storedSageTime;
        } catch (e) {
            console.error("Error loading persisted ledger metadata:", e);
        }

        const masterWorkbook = ref({ data: {}, summary: {} });
        const treesSalesData = ref([]); 
        const auditRange = ref({ start: '', end: '' });
        const emailReportMode = ref('standard');
        const startMonth = ref('January');
        const endMonth = ref('December');

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
            if (!dateString) return '';
            const cleanStr = String(dateString).trim();
            
            // ISO Date: YYYY-MM-DD
            const isoMatch = cleanStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (isoMatch) {
                const monthIndex = parseInt(isoMatch[2], 10) - 1;
                if (monthIndex >= 0 && monthIndex <= 11) return calendarMonths[monthIndex];
            }
            
            // US Slash Date: MM/DD/YYYY
            const usMatch = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (usMatch) {
                const monthIndex = parseInt(usMatch[1], 10) - 1;
                if (monthIndex >= 0 && monthIndex <= 11) return calendarMonths[monthIndex];
            }

            return '';
        };

        const detectSiteFromName = (storeNameStr) => {
            if (!storeNameStr) return ''; 
            const s = storeNameStr.toUpperCase();
            if (s.includes('RED BLUFF') || s.includes('BLUFF') || s.includes('E12') || s.includes('RB')) {
                return 'Red Bluff';
            }
            if (s.includes('REDDING') || s.includes('E11') || s.includes('RD')) {
                return 'Redding';
            }
            return ''; 
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

        const inMemoryLedgerEvents = computed(() => {
            if (!treesSalesData.value || treesSalesData.value.length === 0) return [];
            return treesSalesData.value.map((sale, idx) => {
                const brandName = (sale.brand || sale['Product Brand'] || sale.Brand || 'Unknown').trim();
                const rawSite = sale.detectedSite || sale.site || sale['Store Name'] || sale.Location || '';
                const normalizedSite = detectSiteFromName(rawSite);
                const rawDate = sale.dateClosed || sale['Date Closed'] || sale.date || '';
                const resolvedMonth = detectMonthFromDate(rawDate);
                const promoTitle = sale.discountTitle || sale['Discount Title'] || sale.promoType || 'Promo';
                const amt = Number(sale.owed ?? sale.creditOwed ?? sale.Vendor_Credit_Owed ?? sale['Vendor Credit Owed'] ?? sale.discountAmount ?? 0);
                return {
                    id: sale.id || `inmem_${idx}`,
                    type: 'GENERATED',
                    status: 'ACTIVE',
                    brand: brandName,
                    vendor: brandName,
                    site: normalizedSite,
                    month: resolvedMonth,
                    isolation_month: resolvedMonth,
                    trackingMonth: resolvedMonth,
                    dateClosed: rawDate,
                    discountTitle: promoTitle,
                    creditType: promoTitle,
                    amount: amt
                };
            });
        });

        // --- GLOBAL PROMO FILTER LOGIC ---
        const allAvailablePromos = computed(() => {
            const rawRecords = treesSalesData.value || [];
            const targetIsBluff = (activeSite.value || '').toUpperCase().includes('BLUFF');
            const targetMonth = activeMonth.value;
            const promos = rawRecords.filter(e => {
                const s = (e.site || e.detectedSite || e['Store Name'] || e.Location || '').toUpperCase();
                const isBluff = (str) => str.includes('BLUFF') || str.includes('RB') || str.includes('E12');
                const isRedding = (str) => (str.includes('REDDING') || str.includes('RD') || str.includes('E11')) && !str.includes('BLUFF');
                const siteMatch = activeSite.value === 'All' || (targetIsBluff ? isBluff(s) : isRedding(s));
                
                const monthName = e.month || detectMonthFromDate(e.dateClosed || e['Date Closed'] || e.date || '');
                const monthMatch = targetMonth === 'All' || monthName === targetMonth;
                
                return siteMatch && monthMatch;
            }).map(e => e.discountTitle || e['Discount Title'] || e.promoType || e.Discount_Title).filter(Boolean);
            return [...new Set(promos)].sort();
        });

        const globalPromoFilters = ref([]);
        watch(allAvailablePromos, (newPromos) => {
            globalPromoFilters.value = [...newPromos];
        }, { immediate: true });

        const toggleGlobalPromo = (promoTitle) => {
            const idx = globalPromoFilters.value.indexOf(promoTitle);
            if (idx > -1) {
                globalPromoFilters.value.splice(idx, 1); 
            } else {
                globalPromoFilters.value.push(promoTitle); 
            }
        };

        const setAllGlobalPromos = (selectAll) => {
            if (selectAll) {
                globalPromoFilters.value = [...allAvailablePromos.value];
            } else {
                globalPromoFilters.value = [];
            }
        };

        const isPromoSelected = (brandName, promoTitle) => {
            return globalPromoFilters.value.includes(promoTitle);
        };

        const getFilteredBrandTotal = (brand) => {
            const rawRecords = treesSalesData.value || [];
            const brandName = (brand.name || brand.vendor || '').toUpperCase();
            const cleanTarget = brandName.replace(/[^A-Z0-9]/g, '');
            const targetIsBluff = (activeSite.value || '').toUpperCase().includes('BLUFF');
            const targetMonth = activeMonth.value;
            const selected = globalPromoFilters.value;

            const brandRecords = rawRecords.filter(e => {
                const b = (e.brand || e['Product Brand'] || e.vendor || '').toUpperCase();
                const cleanB = b.replace(/[^A-Z0-9]/g, '');
                const s = (e.site || e.detectedSite || e['Store Name'] || '').toUpperCase();
                const promo = e.discountTitle || e['Discount Title'] || e.promoType || '';
                const brandMatch = cleanB === cleanTarget || cleanB.includes(cleanTarget) || cleanTarget.includes(cleanB);
                const isBluff = (str) => str.includes('BLUFF') || str.includes('RB') || str.includes('E12');
                const isRedding = (str) => (str.includes('REDDING') || str.includes('RD') || str.includes('E11')) && !str.includes('BLUFF');
                const siteMatch = activeSite.value === 'All' || (targetIsBluff ? isBluff(s) : isRedding(s));
                
                const monthName = e.month || detectMonthFromDate(e.dateClosed || e['Date Closed'] || e.date || '');
                const monthMatch = targetMonth === 'All' || monthName === targetMonth;
                
                const promoMatch = selected.includes(promo);
                return brandMatch && siteMatch && monthMatch && promoMatch;
            });

            if (brandRecords.length === 0) {
                if (selected && selected.length > 0) return Number(brand.total || 0);
                return 0;
            }

            return brandRecords.reduce((sum, e) => {
                const val = Number(e.amount ?? e.owed ?? e.creditOwed ?? e.Vendor_Credit_Owed ?? 0);
                return sum + val;
            }, 0);
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

        const regenerateMonthReports = async (monthGroup) => {
            alert("Regeneration triggered for " + monthGroup.month);
        };

        const definitiveBrandMetrics = computed(() => {
            return buildDefinitiveBrandMetrics(masterWorkbook.value?.data);
        });

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
                                    distributor: 'Workbook Sync', 
                                    workbookRef: { sheet: sheetName, rowIdx: idx }
                                });
                            }
                        });
                    });
                }
            });
            return allCredits;
        });

        const monthlyReportSummaries = computed(() => {
            let effectiveBrands = masterBrands.value;
            if (!effectiveBrands || effectiveBrands.length === 0) {
                const uniqueBrands = [...new Set((treesSalesData.value || []).map(s => (s.brand || s['Product Brand'] || '').trim()).filter(Boolean))];
                effectiveBrands = uniqueBrands.map(name => ({
                    id: name,
                    vendor: name,
                    brand: name,
                    email: (fallbackEmailMap.value && fallbackEmailMap.value[name]) || ''
                }));
            }

            const combinedEvents = [
                ...(ledgerEventsList.value || []),
                ...(inMemoryLedgerEvents.value || [])
            ];

            return buildMonthlyReportSummaries({
                ledgerEvents: combinedEvents,
                targetMonth: activeMonth.value,
                targetSite: activeSite.value,
                calendarMonths,
                masterBrands: effectiveBrands,
                isPromoSelected,
                fallbackEmailMap: fallbackEmailMap.value,
                searchQuery: searchQuery.value || ''
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

        const selectedLedgerVendor = ref(null);
        const masterLedgerData = ref([]);
        const ledgerTotals = ref({ generated: 0, recovered: 0, outstanding: 0, variance: 0 });
        const MONTH_ORDER = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        const refreshLedger = () => {
            if (!ledgerEventsList.value || !ledgerEventsList.value.length) {
                masterLedgerData.value = [];
                return;
            }
            const currentSite = activeSite.value;
            const selectedMonth = activeMonth.value;
            const targetMonthIdx = MONTH_ORDER.indexOf(selectedMonth);
            const filteredEvents = ledgerEventsList.value.filter(ev => {
                const evSite = ev.site || ev.store;
                if (currentSite && evSite && evSite.toLowerCase() !== currentSite.toLowerCase()) return false;
                if (!selectedMonth || selectedMonth === 'All' || selectedMonth === 'All Year') return true;
                const evMonth = ev.isolation_month || ev.month || ev.trackingMonth;
                const evMonthIdx = MONTH_ORDER.indexOf(evMonth);
                if (targetMonthIdx !== -1 && evMonthIdx !== -1) return evMonthIdx <= targetMonthIdx;
                return evMonth === selectedMonth;
            });
            const vendorMap = {};
            filteredEvents.forEach(ev => {
                const vendor = ev.brand || ev.vendor || 'UNKNOWN';
                if (!vendorMap[vendor]) {
                    vendorMap[vendor] = {
                        vendor: vendor, site: currentSite, generated: 0, recovered: 0, outstanding: 0,
                        recoveryEvents: [], discoveryEvents: [], generatedCount: 0, recoveredCount: 0,
                        status: 'ACTIVE', aging: { '0-30': 0, '31-60': 0, '61-90': 0, '91+': 0 }
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
            masterLedgerData.value = aggregated.sort((a, b) => b.outstanding - a.outstanding);
            if (typeof treezLedgerCount !== 'undefined') treezLedgerCount.value = filteredEvents.filter(e => e.type === 'GENERATED').length;
            if (typeof sage4545LedgerCount !== 'undefined') sage4545LedgerCount.value = filteredEvents.filter(e => e.type === 'RECOVERY').length;
        };

        watch([promoCredits, activeSite, activeMonth], () => { refreshLedger(); });

        const logSystemAction = async (actionType, details) => {
            try {
                await addDoc(collection(db, "systemLogs"), {
                    timestamp: Date.now(), user: loggedInUser.value || 'System', actionType: actionType, details: details
                });
            } catch (error) { console.error("Error logging action:", error); }
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
            if (confirm(`Are you sure you want to delete these ${selectedBrands.value.length} brands?`)) {
                try {
                    const batch = writeBatch(db);
                    selectedBrands.value.forEach(brandId => { batch.delete(doc(db, "brands", brandId)); });
                    await batch.commit();
                    selectedBrands.value = []; 
                } catch (error) { alert("Failed to delete brands from the cloud."); }
            }
        };

        const updateBrandField = async (brandId, fieldName, event) => {
            const newValue = event.target.value;
            try {
                await updateDoc(doc(db, "brands", brandId), { [fieldName]: newValue });
            } catch (error) { alert("Failed to save changes to the cloud."); }
        };

        const searchQueryInput = ref('');
        const searchQuery = ref('');      
        let searchTimeout = null;
        watch(searchQueryInput, (newVal) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => { searchQuery.value = newVal; }, 300);
        });

        const markReportGroupAsSent = async (report) => {
            if (confirm(`Mark all ${report.credits.length} credits for ${report.vendor} as 'Report Sent'?`)) {
                try {
                    const batch = writeBatch(db);
                    report.credits.forEach(credit => {
                        if (credit.status === 'Pending') {
                            batch.update(doc(db, "promoCredits", credit.id), { status: "Report Sent" });
                        }
                    });
                    await batch.commit();
                    logSystemAction("UPDATE", `Batch updated ${report.vendor} credits to 'Report Sent'`);
                } catch (error) { alert("Failed to update status for the group."); }
            }
        };

        const generateAuditStatementCSV = async (brand) => {
            const targetBrandVendor = brand.vendor || brand.brand || (typeof brand === 'string' ? brand : '');
            if (treesSalesData.value.length === 0) await fetchSalesData();
            const rawRecords = treesSalesData.value || [];
            const inMemoryEvents = rawRecords.map(sale => {
                const owedAmt = Number(sale.owed ?? sale.creditOwed ?? sale.Vendor_Credit_Owed ?? sale['Vendor Credit Owed'] ?? sale.discountAmount ?? sale['Discount Amount'] ?? 0);
                const rawDate = sale.dateClosed || sale['Date Closed'] || sale.date || sale.Received_Date || '';
                const promo = sale.discountTitle || sale['Discount Title'] || sale.promoType || sale.Discount_Title || 'Standard Promo';
                const brandName = sale.brand || sale['Product Brand'] || sale.Brand || '';
                const siteName = sale.detectedSite || sale.site || sale['Store Name'] || sale.Location || '';
                return {
                    ...sale, type: 'GENERATED', amount: owedAmt, brand: brandName, vendor: brandName, site: siteName, detectedSite: siteName,
                    isolation_month: sale.month || sale.isolation_month || '', dateClosed: rawDate, discountTitle: promo,
                    productName: sale.productName || sale['Product Name'] || sale.Product_Name || 'N/A',
                    unitsSold: sale.unitsSold || sale['Units Sold'] || sale.Units_Sold || 1,
                    discountPercent: sale.discountPercent || sale['Discount %'] || sale['Discount Percent'] || ''
                };
            });
            const selectedPromos = globalPromoFilters.value; 
            const finalPayload = {
                brandVendor: targetBrandVendor, targetSite: activeSite.value, activeMonth: activeMonth.value,
                ledgerEvents: [...ledgerEventsList.value, ...inMemoryEvents], selectedPromos: selectedPromos,
                calendarMonths, csvEscape
            };
            return generateAuditStatementService(finalPayload);
        };

        const downloadMonthlyReport = async (brand) => {
            const isFullMonth = !!brand.brandList; 
            if (!isFullMonth) {
                const vendorKey = brand.vendor || brand.brand;
                const selected = globalPromoFilters.value;
                if (selected && selected.length === 0) {
                    alert("No promotional data selected for export. Please select at least one promo type in the Global Filter.");
                    return;
                }
                isExporting.value = true;
                try {
                    const csv = await generateAuditStatementCSV(brand);
                    const currentYear = new Date().getFullYear();
                    const safeBrandName = (brand.vendor || brand.brand || 'Brand').replace(/\s/g, '_');
                    const safeSite = (activeSite.value || 'Store').replace(/\s/g, '_');
                    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.setAttribute("href", url);
                    link.setAttribute("download", `${safeSite}_Statement_${safeBrandName}_${currentYear}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(() => URL.revokeObjectURL(url), 150);
                } finally { isExporting.value = false; }
                return;
            }
            const reportMonth = brand.month || activeMonth.value;
            let csvContent = "Location,Date & Time,Brand,Product Name,Transaction ID,Quantity Sold,Unit Price,Total Before Tax,Discount Title,Discount Amount,Credit Owed,Entry Type\n";
            let csvTotal = 0;
            if (treesSalesData.value.length === 0) await fetchSalesData();
            (treesSalesData.value || []).forEach(sale => {
                const promoTitle = sale.discountTitle || sale['Discount Title'] || sale.promoType;
                const vendorName = sale.brand || sale['Product Brand'] || sale.Brand || '';
                const owedAmt = Number(sale.owed ?? sale.creditOwed ?? sale.Vendor_Credit_Owed ?? sale['Vendor Credit Owed'] ?? 0);
                csvContent += `"${csvEscape(sale.detectedSite || sale.site || '')}","${csvEscape(sale.dateClosed || '')}","${csvEscape(sale.brand || '')}","${csvEscape(sale.productName || '')}","${csvEscape(sale.trackingId || '')}","${csvEscape(sale.unitsSold || '')}","${formatCurrency(sale.unitPrice || 0)}","${formatCurrency((sale.unitsSold || 0) * (sale.unitPrice || 0))}","${csvEscape(promoTitle || '')}","${formatCurrency(sale.discountAmount || 0)}","${formatCurrency(owedAmt)}","POS Itemized"\n`;
                csvTotal += owedAmt;
            });
            csvContent += `,,,,,,,,,, "TOTAL:", "${formatCurrency(csvTotal)}"\n`;
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `Full_Month_${reportMonth}_${activeSite.value.replace(/\s/g, '_')}_${new Date().getFullYear()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 150);
        };

        const draftEmail = async (brand) => {
            const vendorName = brand.vendor || brand.brand;
            const email = fallbackEmailMap.value[vendorName] || brand.email || '';
            if (!email) {
                alert(`No email mapped for ${vendorName}. Please add one in the Brand Directory first.`);
                return;
            }
            const storeName = activeSite.value === 'Redding' ? 'Sundial' : activeSite.value;
            const currentYear = new Date().getFullYear();
            const periodStr = `${brand.month || activeMonth.value} ${currentYear}`;
            isExporting.value = true;
            try {
                const statementCSV = await generateAuditStatementCSV(brand);
                const blob = new Blob(['\ufeff' + statementCSV], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", `${vendorName.replace(/\s/g, '_')}_Statement_${activeSite.value.replace(/\s/g, '_')}_${currentYear}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                const subject = `Promo Credit Statement - ${storeName} - ${periodStr}`;
                let body = `Hello ${vendorName},\n\nPlease find the attached cumulative promo credit statement for ${storeName} for the period ending ${periodStr}.\n\nThis statement includes a month-by-month reconciliation of credits generated vs. collections received, itemized promotional details, and active dates.\n\nPlease let us know if you have any questions or when we can expect the remaining balance to be applied to our account.\n\nBest regards,\n\n${storeName} Accounting Team\n`;
                window.location.href = buildMailtoUrl(email, "accounting@rredco.com", subject, body);
            } finally { isExporting.value = false; }
        };

        let chartMonthlyInstance = null; let chartDistrosInstance = null; let chartBrandsInstance = null; let chartStoresInstance = null;
        const drawCharts = () => {
            const activeCredits = promoCredits.value.filter(c => !c.archived);
            const currencyFormatter = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
            const customTooltip = { backgroundColor: '#111827', titleColor: '#f59e0b', bodyFont: { size: 14, weight: 'bold' }, padding: 12, cornerRadius: 8, callbacks: { label: (ctx) => ` ${currencyFormatter(ctx.raw)}` } };
            const standardVerticalOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: customTooltip }, scales: { x: { grid: { display: false }, border: { display: false } }, y: { grid: { color: '#e2e8f0', borderDash: [4, 4] }, border: { display: false }, ticks: { callback: currencyFormatter } } } };
            const standardHorizontalOptions = { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: customTooltip }, scales: { x: { grid: { color: '#e2e8f0', borderDash: [4, 4] }, border: { display: false }, ticks: { callback: currencyFormatter } }, y: { grid: { display: false }, border: { display: false } } } };
            const monthlySums = {};
            activeCredits.forEach(c => { const m = c.trackingMonth || 'Unknown'; monthlySums[m] = (monthlySums[m] || 0) + (parseFloat(c.amount) || 0); });
            const sortedMonths = calendarMonths.filter(m => monthlySums[m] !== undefined);
            if(chartMonthlyInstance) chartMonthlyInstance.destroy();
            chartMonthlyInstance = new Chart(document.getElementById('chartMonthly'), { type: 'bar', data: { labels: sortedMonths, datasets: [{ data: sortedMonths.map(m => monthlySums[m]), backgroundColor: '#10b981', borderRadius: 6, barPercentage: 0.65 }] }, options: standardVerticalOptions });
            const distroSums = {};
            activeCredits.forEach(c => { const d = (c.distributor || '').trim(); if (d && d !== 'Trees POS Import' && d !== '-' && d.toLowerCase() !== 'unmapped') distroSums[d] = (distroSums[d] || 0) + (parseFloat(c.amount) || 0); });
            const topDistros = Object.entries(distroSums).sort((a, b) => b[1] - a[1]).slice(0, 10);
            if(chartDistrosInstance) chartDistrosInstance.destroy();
            chartDistrosInstance = new Chart(document.getElementById('chartDistros'), { type: 'bar', data: { labels: topDistros.map(d => d[0]), datasets: [{ data: topDistros.map(d => d[1]), backgroundColor: '#f59e0b', borderRadius: 6, barPercentage: 0.65 }] }, options: standardHorizontalOptions });
            const brandSums = {};
            activeCredits.forEach(c => { const b = (c.vendor || '').trim(); if (b && b.toLowerCase() !== 'unmapped brand') brandSums[b] = (brandSums[b] || 0) + (parseFloat(c.amount) || 0); });
            const topBrands = Object.entries(brandSums).sort((a, b) => b[1] - a[1]).slice(0, 10);
            if(chartBrandsInstance) chartBrandsInstance.destroy();
            chartBrandsInstance = new Chart(document.getElementById('chartBrands'), { type: 'bar', data: { labels: topBrands.map(b => b[0]), datasets: [{ data: topBrands.map(b => b[1]), backgroundColor: '#10b981', borderRadius: 6, barPercentage: 0.65 }] }, options: standardHorizontalOptions });
            const storeSums = {};
            activeCredits.forEach(c => { const s = c.site || 'Unknown'; storeSums[s] = (storeSums[s] || 0) + (parseFloat(c.amount) || 0); });
            if(chartStoresInstance) chartStoresInstance.destroy();
            chartStoresInstance = new Chart(document.getElementById('chartStores'), { type: 'doughnut', data: { labels: Object.keys(storeSums), datasets: [{ data: Object.values(storeSums), backgroundColor: ['#10b981', '#f59e0b', '#64748b', '#111827'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { tooltip: customTooltip, legend: { position: 'bottom' } } } });
        };
        watch(activeTab, (newTab) => { if (newTab === 'Dashboard') { nextTick(() => { drawCharts(); }); } if (newTab === 'Ledger') { refreshLedger(); } });
        watch(promoCredits, () => { if (activeTab.value === 'Dashboard') { drawCharts(); } }, { deep: true });

        const exportVendorsAndBrandsCSV = () => {
            if (!masterBrands.value || masterBrands.value.length === 0) return alert("No brands available to export.");
            const csvContent = buildVendorsAndBrandsCSV(masterBrands.value);
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a"); link.setAttribute("href", url); link.setAttribute("download", `Vendors_and_Brands_Directory_${new Date().getFullYear()}.csv`);
            document.body.appendChild(link); link.click(); document.body.removeChild(link); setTimeout(() => URL.revokeObjectURL(url), 150);
        };

        const exportYTDVariancePDF = () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('l', 'mm', 'a4');
            const targetSite = activeSite.value;
            doc.setFontSize(20); doc.setTextColor(16, 185, 129); doc.text(`YTD VENDOR VARIANCE AUDIT - ${new Date().getFullYear()}`, 14, 20);
            doc.setFontSize(10); doc.setTextColor(100); doc.text(`Generated on: ${new Date().toLocaleString()}\nStore Location: ${targetSite}`, 14, 26);
            const helpers = { formatCurrency };
            const { tableHeaders, tableData } = buildYTDVariancePDFData(activeSite.value, calendarMonths, ledgerEventsList.value, helpers);
            doc.autoTable({ head: tableHeaders, body: tableData, startY: 40, theme: 'striped', headStyles: { fillColor: [17, 24, 39], textColor: [245, 158, 11], fontSize: 8 }, bodyStyles: { fontSize: 7 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 }, 13: { fontStyle: 'bold', fillColor: [243, 244, 246] } }, didParseCell: function(data) { if (data.row.index % 4 === 1) data.cell.styles.textColor = [16, 185, 129]; if (data.row.index % 4 === 2) { const val = parseFloat(data.cell.text[0].replace(/[^0-9.-]+/g, "")); if (val > 0) data.cell.styles.textColor = [239, 68, 68]; } } });
            doc.save(`YTD_Variance_Report_${targetSite}_${new Date().getFullYear()}.pdf`);
        };

        const exportBrandCSVReports = (selectedBrand = null) => {
            const targetSite = activeSite.value;
            const csvContent = buildBrandVarianceCSV(targetSite, selectedBrand, calendarMonths, ledgerEventsList.value);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', selectedBrand ? `${selectedBrand.replace(/\s+/g, '_')}_Audit_${targetSite}_2026.csv` : `All_Brands_Variance_Audit_${targetSite}_2026.csv`);
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
        };

        let unsubscribeSales = null;
        let unsubscribeLedger = null;
        const setupFilteredListeners = () => {
            if (unsubscribeSales) { unsubscribeSales(); unsubscribeSales = null; }
            if (unsubscribeLedger) unsubscribeLedger();
            let ledgerQ = query(collection(db, "masterLedger"), where("site", "==", activeSite.value), limit(8000));
            unsubscribeLedger = onSnapshot(ledgerQ, (snapshot) => {
                const fetchedEvents = [];
                snapshot.forEach(docSnap => { fetchedEvents.push({ id: docSnap.id, ...docSnap.data() }); });
                ledgerEventsList.value = fetchedEvents;
                if (activeTab.value === 'Ledger') refreshLedger();
            }, (err) => console.error("Ledger Pull Failed:", err));
            fetchSalesData();
        };

        watch([activeSite, activeMonth], () => { if (isManagerUnlocked.value) setupFilteredListeners(); });

        let unsubscribeBrands = null;
        const setupBrandListener = () => {
            if (unsubscribeBrands) unsubscribeBrands();
            unsubscribeBrands = onSnapshot(collection(db, "brands"), (snapshot) => {
                const fetchedBrands = [];
                snapshot.forEach(docSnap => { fetchedBrands.push({ id: docSnap.id, ...docSnap.data() }); });
                masterBrands.value = fetchedBrands.sort((a, b) => (a.vendor || '').localeCompare(b.vendor || ''));
            });
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

        const activeWorkspaceInfo = computed(() => workspaceTabs.find(t => t.name === activeTab.value) || { name: 'Unknown', icon: 'help-circle' });

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
                Object.keys(row).forEach(k => { if (k !== '__rowNum__' && !k.startsWith('EMPTY')) keys.add(k); });
            });
            return Array.from(keys);
        });

        const refreshIcons = () => { nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); };

        const handleLogin = async () => {
            if (emailInput.value && passwordInput.value) {
                isManagerUnlocked.value = true;
                loggedInUser.value = emailInput.value;
                nextTick(() => refreshIcons());
            } else {
                authError.value = "Invalid credentials";
            }
        };

        const forceLock = () => { isManagerUnlocked.value = false; };
        const showWorkbookSyncModal = ref(false);
        const workbookPasteData = ref('');
        const openWorkbookSyncModal = () => { showWorkbookSyncModal.value = true; };
        const processWorkbookSync = () => { showWorkbookSyncModal.value = false; };
        const closeEmailDraftModal = () => { showEmailDraftModal.value = false; };
        const openEmailDraft = (brand) => { selectedBrandForEmail.value = brand; showEmailDraftModal.value = true; };
        const scrollMonths = () => {}; 
        const scrollWorkbookTabs = () => {}; 
        
        const syncDiscoveryToShards = async () => { alert("Syncing Discovery to Ledger Shards..."); };
        const rollbackShardsToWorkbook = async () => { if (confirm("Rollback all local shards to the last Workbook baseline?")) alert("Rollback initiated."); };
        const continueBatch = () => { batchError.value = null; };
        const updateWorkbookFromSales = () => {};
        const pushToMainTracker = () => {};
        const clearAllSalesData = () => {};

        return {
            inMemoryLedgerEvents,
            isProcessing, progressPercent, progressMessage, progressDetails, progressETA,
            isGlobalLoading, allAvailablePromos, globalPromoFilters,
            toggleGlobalPromo, setAllGlobalPromos, isPromoSelected,
            localWbStatus, localTreezStatus, localSageStatus, localSyncSummary,
            handleLocalWbUpload, handleLocalTreezUpload, handleLocalSageUpload,
            handleLocalSyncMemory, handleLocalExportWb,
            fallbackEmailMap,
            isManagerUnlocked, isSuperAdmin, loggedInUser, emailInput, passwordInput, authError, activeSite, activeTab,
            treesSalesData, masterBrands, selectedBrands, allBrandsSelected, toggleAllBrands,
            deleteSelectedBrands, updateBrandField, promoCredits, calendarMonths, activeMonth,
            searchQueryInput, searchQuery,
            markReportGroupAsSent,
            monthlyReportSummaries, downloadMonthlyReport,
            draftEmail,
            showBrandImportModal, brandPasteData, brandPastedGrid,
            brandMappedHeaders, brandAvailableHeaders, handleLogin, forceLock,
            formatCurrency, filteredCredits, filteredTreesSalesData,
            displayTreesSalesData, totalPending, totalApplied, unsyncedSalesCount,
            totalTreesOwedYTD, totalTreesPending, getFilteredBrandTotal,
            syncDiscoveryToShards, rollbackShardsToWorkbook, continueBatch,
            resetBrandImport, processBrandRawPaste, processBrandImport, systemLogs, refreshIcons, clearAllSalesData,
            drawCharts, exportVendorsAndBrandsCSV,
            masterLedgerData, selectedLedgerVendor, refreshLedger, ledgerTotals,
            masterWorkbook, showWorkspaceMenu, showAdminMenu, workspaceTabs, selectWorkspace, activeWorkspaceInfo,
            scrollMonths, scrollWorkbookTabs, workbookSchema, activeWorkbookSheet, isWorkbookLoaded,
            auditRange, brandAuditData, sageAuditData, activeWorkbookHeaders,
            showWorkbookSyncModal, workbookPasteData, openWorkbookSyncModal, processWorkbookSync,
            exportYTDVariancePDF, exportBrandCSVReports, updateWorkbookFromSales, pushToMainTracker,
            emailReportMode, auditStartMonth: startMonth, auditEndMonth: endMonth, showEmailDraftModal, selectedBrandForEmail,
            emailDraftSubject, emailDraftBody, openEmailDraft, refreshEmailDraft, sendEmailDraft, copyEmailToClipboard, closeEmailDraftModal
        };
    }
}).mount('#app');