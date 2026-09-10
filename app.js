// app.js

// 1. FIREBASE IMPORTS
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, onSnapshot } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
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
    const appCheck = initializeAppCheck(firebaseApp, {
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
        
        const treesSalesData = ref(JSON.parse(localStorage.getItem('treesSalesData')) || []);
        watch(treesSalesData, (newVal) => localStorage.setItem('treesSalesData', JSON.stringify(newVal)), { deep: true });

        const systemUsers = {
            'lenay@rredco.com': { name: 'Lenay A.', access: ['Red Bluff', 'Redding'] },
            'tricia@rredco.com': { name: 'Tricia K.', access: ['Red Bluff', 'Redding'] },
            'whitney@rredco.com': { name: 'Whitney M.', access: ['Red Bluff', 'Redding'] },
            'nicholas.grace@rredco.com': { name: 'Nicholas G.', access: ['Red Bluff', 'Redding'] } 
        };

        const promoCredits = ref([]);
        const calendarMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const activeMonth = ref('August');
        const searchQuery = ref('');

        const defaultBrands = [
            { vendor: "3 Bros", distributor: "Hash Tag Distribution" },
            { vendor: "710 LABS", distributor: "Fluids Manufacturing Inc" }
        ];

        const masterBrands = ref(JSON.parse(localStorage.getItem('masterBrands')) || defaultBrands);
        watch(masterBrands, (newVal) => localStorage.setItem('masterBrands', JSON.stringify(newVal)), { deep: true });

        const showPromoModal = ref(false);
        const showBrandDropdown = ref(false);
        const editingId = ref(null);
        
        const showImportModal = ref(false);
        const rawPasteData = ref('');
        const pastedGrid = ref([]);
        const mappedHeaders = ref([]);
        
        const showBrandImportModal = ref(false);
        const brandPasteData = ref('');
        
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
                } else {
                    isManagerUnlocked.value = false;
                    promoCredits.value = [];
                    if (unsubscribeSnapshot) unsubscribeSnapshot();
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
            return masterBrands.value.filter(b => b.vendor.toLowerCase().includes(query));
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
            let base = promoCredits.value.filter(c => c.site === activeSite.value);
            if (activeMonth.value !== 'All') base = base.filter(c => c.trackingMonth === activeMonth.value);
            if (searchQuery.value.trim() !== '') {
                const q = searchQuery.value.toLowerCase();
                base = base.filter(c => 
                    (c.vendor && c.vendor.toLowerCase().includes(q)) ||
                    (c.distributor && c.distributor.toLowerCase().includes(q)) ||
                    (c.invoice && c.invoice.toLowerCase().includes(q)) ||
                    (c.creditType && c.creditType.toLowerCase().includes(q))
                );
            }
            return base.map(c => {
                const isMapped = masterBrands.value.some(b => b.vendor.toLowerCase() === c.vendor.toLowerCase());
                return { ...c, needsMapping: !isMapped };
            });
        });

        const filteredTreesSalesData = computed(() => {
            let base = treesSalesData.value; 
            if (activeMonth.value !== 'All') base = base.filter(sale => sale.month === activeMonth.value);
            if (searchQuery.value.trim() !== '') {
                const q = searchQuery.value.toLowerCase();
                base = base.filter(sale => 
                    (sale.brand && sale.brand.toLowerCase().includes(q)) ||
                    (sale.productName && sale.productName.toLowerCase().includes(q)) ||
                    (sale.discountTitle && sale.discountTitle.toLowerCase().includes(q)) ||
                    (sale.trackingId && sale.trackingId.toLowerCase().includes(q)) ||
                    (sale.detectedSite && sale.detectedSite.toLowerCase().includes(q))
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
                            if (!masterBrands.value.find(b => b.vendor.toLowerCase() === val.toLowerCase())) {
                                masterBrands.value.push({ vendor: val, distributor: 'Auto-Imported' });
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
                    const masterRecord = masterBrands.value.find(b => b.vendor.toLowerCase() === data.brand.toLowerCase());
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
        
        const processBrandPaste = () => {
            const text = brandPasteData.value;
            if (!text.trim()) return;
            
            const rows = text.split(/\r?\n/).filter(r => r.trim() !== '');
            if (rows.length === 0) return;

            let updatedCount = 0;
            let newCount = 0;

            const firstRowRaw = rows[0].toLowerCase();
            const dataRows = firstRowRaw.includes('brand') ? rows.slice(1) : rows;

            dataRows.forEach(row => {
                const cols = row.split('\t').map(c => c.trim());
                if (cols.length < 2) return; 

                // Map exactly to your spreadsheet columns (A=0, B=1, C=2, etc.)
                const vendorName = cols[0] || '';
                const repName = cols[1] || '';
                const email = cols[2] || '';
                const treesName = cols[3] || '';
                const assetLibrary = cols[4] || '';
                const distributor = cols[5] || ''; 
                const orderFrom = cols[6] || '';
                const payee = cols[7] || '';
                const notes = cols[8] || '';

                if (!vendorName || vendorName.length === 1) return; 

                const existingBrand = masterBrands.value.find(b => b.vendor.toLowerCase() === vendorName.toLowerCase());
                
                if (existingBrand) {
                    if (repName) existingBrand.rep = repName;
                    if (email) existingBrand.email = email;
                    if (treesName) existingBrand.treesName = treesName;
                    if (assetLibrary) existingBrand.assetLibrary = assetLibrary;
                    if (distributor) existingBrand.distributor = distributor;
                    if (orderFrom) existingBrand.orderFrom = orderFrom;
                    if (payee) existingBrand.payee = payee;
                    if (notes) existingBrand.notes = notes;
                    updatedCount++;
                } else {
                    masterBrands.value.push({ 
                        vendor: vendorName, 
                        rep: repName,
                        email: email,
                        treesName: treesName,
                        assetLibrary: assetLibrary,
                        distributor: distributor,
                        orderFrom: orderFrom,
                        payee: payee,
                        notes: notes
                    });
                    newCount++;
                }
            });

            masterBrands.value.sort((a, b) => a.vendor.localeCompare(b.vendor));

            alert(`Success! Added ${newCount} new brands and updated ${updatedCount} existing entries.`);
            brandPasteData.value = '';
            showBrandImportModal.value = false;
        };

        const refreshIcons = () => { nextTick(() => { if(window.lucide) window.lucide.createIcons(); }); };

        return {
            isManagerUnlocked, loggedInUser, emailInput, passwordInput, authError, handleLogin, forceLock, activeSite, 
            activeTab, treesSalesData, filteredTreesSalesData, displayTreesSalesData, unsyncedSalesCount, handleTreesCsvUpload, pushToMainTracker,
            promoCredits, filteredCredits, showPromoModal, form, editingId, 
            openPromoModal, closePromoModal, saveCredit, editCredit, deleteCredit, handleFileUpload,
            formatCurrency, totalPending, totalApplied,
            masterBrands, filteredBrands, showBrandDropdown, selectBrand,
            showImportModal, openImportModal, closeImportModal, resetImport, 
            rawPasteData, pastedGrid, displayGrid, mappedHeaders, availableHeaders, processRawPaste, processImport,
            showBrandImportModal, brandPasteData, processBrandPaste,
            calendarMonths, activeMonth, detectMonthInString, searchQuery
        };
    }
}).mount('#app');
