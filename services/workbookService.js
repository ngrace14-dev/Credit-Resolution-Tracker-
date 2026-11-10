/**
services/workbookService.js
In-browser local ETL engine replacing sync_workbook.py and Firestore pipelines.
*/

// Global in-memory workbook state
export const localWorkbookState = {
rawWorkbook: null, // SheetJS binary workbook object
workbookData: null, // Parsed sheet JSON maps
treezData: [], // Parsed Treez POS line items
sageData: [], // Parsed Sage 4545 GL rows
lastSyncStats: null
};

/**
Read uploaded Master Workbook (.xlsx) into RAM
*/
export async function ingestMasterWorkbookFile(file) {
const buffer = await file.arrayBuffer();
const workbook = XLSX.read(buffer, { type: 'array' });
localWorkbookState.rawWorkbook = workbook;
const parsed = {};
workbook.SheetNames.forEach(sheetName => {
parsed[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
});
localWorkbookState.workbookData = parsed;
return {
sheets: workbook.SheetNames,
totalSheets: workbook.SheetNames.length
};
}

/**
2. Ingest Treez POS CSV into RAM
*/
export async function ingestTreezPOSCSV(file, activeMonth) {
const text = await file.text();
return new Promise((resolve, reject) => {
Papa.parse(text, {
header: true,
skipEmptyLines: true,
complete: (results) => {
const cleaned = results.data.map((row, idx) => {
const cleanOwed = Number(String(row['Vendor Credit Owed'] || row.owed || 0).replace(/[^0-9.-]+/g, '')) || 0;
return {
id: `treez_${idx}_${Date.now()}`,
brand: row['Product Brand'] || row.Brand || row.brand || '',
site: row['Store Name'] || row.site || row.Location || '',
discountTitle: row['Discount Title'] || row.discountTitle || row.promoType || '',
owed: cleanOwed,
owedAmt: cleanOwed,
date: row['Date Closed'] || row.date || '',
month: activeMonth,
isolation_month: activeMonth,
raw: row
};
});
localWorkbookState.treezData = cleaned;
resolve(cleaned);
},
error: (err) => reject(err)
});
});
}

/**
3. Ingest Sage 4545 GL CSV into RAM
*/
export async function ingestSageGLCSV(file) {
const text = await file.text();
return new Promise((resolve, reject) => {
Papa.parse(text, {
header: true,
skipEmptyLines: true,
complete: (results) => {
localWorkbookState.sageData = results.data;
resolve(results.data);
},
error: (err) => reject(err)
});
});
}

/**
4. In-Memory Sync Engine (Ported directly from sync_workbook.py)
Cross-references Treez POS and Sage GL data against workbook month sheets.
*/
export function syncDataToWorkbook(monthName) {
if (!localWorkbookState.rawWorkbook || !localWorkbookState.workbookData) {
throw new Error("Master Workbook not loaded in memory.");
}
const sheetName = monthName; // e.g., "October"
const sheetData = localWorkbookState.workbookData[sheetName];
if (!sheetData) {
throw new Error(`Sheet '${sheetName}' not found in the loaded Master Workbook.`);
}
// Aggregate Treez sales by brand for Redding and Red Bluff
const posTotals = {};
localWorkbookState.treezData.forEach(row => {
const brandKey = (row.brand || '').trim().toUpperCase();
if (!brandKey) return;
if (!posTotals[brandKey]) {
posTotals[brandKey] = { redding: 0, redBluff: 0, rawName: row.brand };
}
const siteStr = (row.site || '').toUpperCase();
const isBluff = siteStr.includes('BLUFF') || siteStr.includes('RB') || siteStr.includes('E12');
const isRedding = (siteStr.includes('REDDING') || siteStr.includes('RD') || siteStr.includes('E11')) && !isBluff;
if (isBluff) {
posTotals[brandKey].redBluff += row.owedAmt;
} else if (isRedding) {
posTotals[brandKey].redding += row.owedAmt;
}
});
// Locate header row in sheet (Brand, Redding, Red-Bluff)
let headerRowIdx = -1;
let brandColIdx = -1;
let reddingColIdx = -1;
let bluffColIdx = -1;
for (let i = 0; i < sheetData.length; i++) {
const row = sheetData[i] || [];
for (let j = 0; j < row.length; j++) {
const val = String(row[j] || '').trim().toLowerCase();
if (val === 'brand' || val === 'vendor') brandColIdx = j;
if (val === 'redding') reddingColIdx = j;
if (val === 'red bluff' || val === 'red-bluff') bluffColIdx = j;
}
if (brandColIdx !== -1 && reddingColIdx !== -1) {
headerRowIdx = i;
break;
}
}
let updatedCount = 0;
const matchedBrands = new Set();
if (headerRowIdx !== -1) {
for (let r = headerRowIdx + 1; r < sheetData.length; r++) {
const row = sheetData[r];
if (!row || !row[brandColIdx]) continue;
const sheetBrand = String(row[brandColIdx]).trim().toUpperCase();
if (sheetBrand === 'TOTAL' || sheetBrand === 'TOTALS') break;
if (posTotals[sheetBrand]) {
if (reddingColIdx !== -1) row[reddingColIdx] = posTotals[sheetBrand].redding;
if (bluffColIdx !== -1) row[bluffColIdx] = posTotals[sheetBrand].redBluff;
matchedBrands.add(sheetBrand);
updatedCount++;
}
}
}
// Refresh GL Raw by Store sheet if Sage data is present
if (localWorkbookState.sageData.length > 0 && localWorkbookState.workbookData['GL Raw by Store']) {
const glSheet = localWorkbookState.workbookData['GL Raw by Store'];
glSheet.length = 1; // Preserve headers
localWorkbookState.sageData.forEach(row => {
glSheet.push(Object.values(row));
});
}
// Write back into the SheetJS workbook object
const updatedWorksheet = XLSX.utils.aoa_to_sheet(sheetData);
localWorkbookState.rawWorkbook.Sheets[sheetName] = updatedWorksheet;
localWorkbookState.lastSyncStats = {
updatedBrands: updatedCount,
totalPosBrands: Object.keys(posTotals).length
};
return localWorkbookState.lastSyncStats;
}

/**
5. Re-Export the Updated Master Workbook (.xlsx)
*/
export function exportMasterWorkbookFile() {
    if (!localWorkbookState.rawWorkbook) {
        throw new Error("No workbook available to export.");
    }
    const filename = `Master_Workbook_Updated_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(localWorkbookState.rawWorkbook, filename);
}

