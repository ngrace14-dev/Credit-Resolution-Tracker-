import { cleanCurrency } from './csvService.js';
export const parseExcelDate = (value) => {
if (!value || value === 'N/A') return null;
if (typeof value === 'number') return new Date(Math.round((value - 25569) * 86400 * 1000));
const d = new Date(value);
return isNaN(d.getTime()) ? null : d;
};
export const generateAuditStatementCSV = ({
brandVendor,
targetSite,
ledgerEvents = [],
startMonthName,
endMonthName,
calendarMonths,
csvEscape
}) => {
const standardizedTarget = String(brandVendor).trim().toUpperCase();
const currentYear = "2026";
const headers = [
"Period", "Location", "Brand", "New_Credits_Generated", "Running_Total_Generated",
"Credits_Applied", "Cumulative_Applied", "Remaining_Unapplied_Balance", "Status", "dates promo ran", "promo type"
];
let csvLines = [headers.join(",")];
let runningTotalGenerated = 0;
let cumulativeApplied = 0;
const startIdx = calendarMonths.indexOf(startMonthName || 'January');
const endIdx = calendarMonths.indexOf(endMonthName || 'December');
calendarMonths.forEach((month, idx) => {
const monthlyEvents = ledgerEvents.filter(e => {
// Match Brand
const eBrand = (e.brand || e['Product Brand'] || e.Brand || '').toUpperCase();
const brandMatch = eBrand === standardizedTarget;
// Match Site
const eSite = (e.detectedSite || e.site || e['Store Name'] || e.Location || '').toUpperCase();
const siteMatch = eSite.includes(targetSite.toUpperCase().split(' ')[0]); // e.g. "RED"
// Match Month by parsing the raw Date Closed if isolation_month is missing
const targetMonth = month.toUpperCase();
let eventMonth = (e.isolation_month || e.month || '').toUpperCase();
const rawDate = e.dateClosed || e['Date Closed'] || e.date;
if (!eventMonth && rawDate) {
const d = new Date(rawDate);
if (!isNaN(d.getTime())) {
eventMonth = d.toLocaleString('en-US', { month: 'long' }).toUpperCase();
}
}
const monthMatch = eventMonth === targetMonth;
return brandMatch && siteMatch && monthMatch;
});
const generatedCredits = monthlyEvents
.filter(e => e.type === 'GENERATED' || e.type === 'ADJUSTMENT')
.reduce((sum, e) => sum + (e.amount || 0), 0);
const appliedCredits = monthlyEvents
.filter(e => e.type === 'RECOVERY')
.reduce((sum, e) => sum + (e.amount || 0), 0);
// Maintain running totals across ALL months
runningTotalGenerated += generatedCredits;
cumulativeApplied += appliedCredits;
const remainingUnappliedBalance = runningTotalGenerated - cumulativeApplied;
if (idx >= startIdx && idx <= endIdx) {
let status = "No Activity";
if (generatedCredits === 0 && appliedCredits === 0) status = "No Activity";
else if (Math.abs(remainingUnappliedBalance) <= 0.01) status = "Reconciled / Settled";
else if (remainingUnappliedBalance < -0.01) status = "Credit Balance / Overpaid";
else if (appliedCredits > 0) status = "Partial Payment";
else status = "Outstanding";

const uniqueDays = [...new Set(monthlyEvents.map(event => {
const rawDate = event.dateClosed || event['Date Closed'] || event.date;
if (!rawDate) return null;
const d = new Date(rawDate);
if (isNaN(d.getTime())) return null;

// Only extract dates if the event actually matches the month we are processing
const monthName = d.toLocaleString('en-US', { month: 'long' });
if (monthName.toLowerCase() !== month.toLowerCase()) return null;

return d.getDate().toString().padStart(2, '0');
}).filter(Boolean))].sort((a, b) => parseInt(a) - parseInt(b)).join(', ');

const uniquePromos = [...new Set(monthlyEvents.map(event => 
event.discountTitle || event['Discount Title'] || event.promoType || event.Discount_Title || event.creditType || ''
).filter(Boolean))].join(' | ');

csvLines.push([
csvEscape(`${month} ${currentYear}`),
csvEscape(targetSite),
csvEscape(brandVendor),
generatedCredits.toFixed(2),
runningTotalGenerated.toFixed(2),
appliedCredits.toFixed(2),
cumulativeApplied.toFixed(2),
remainingUnappliedBalance.toFixed(2),
csvEscape(status),
csvEscape(uniqueDays),
csvEscape(uniquePromos)
].join(","));
}
});
// YTD ROW
const ytdBalance = runningTotalGenerated - cumulativeApplied;
let ytdStatus = "No Activity";
if (runningTotalGenerated === 0 && cumulativeApplied === 0) ytdStatus = "No Activity";
else if (Math.abs(ytdBalance) <= 0.01) ytdStatus = "Reconciled / Settled";
else if (ytdBalance < -0.01) ytdStatus = "Credit Balance / Overpaid";
else if (cumulativeApplied > 0) ytdStatus = "Partial Payment";
else ytdStatus = "Outstanding";
csvLines.push([
csvEscape("YTD Total"),
csvEscape(targetSite),
csvEscape(brandVendor),
runningTotalGenerated.toFixed(2),
runningTotalGenerated.toFixed(2),
cumulativeApplied.toFixed(2),
cumulativeApplied.toFixed(2),
ytdBalance.toFixed(2),
csvEscape(ytdStatus),
csvEscape(""),
csvEscape("")
].join(","));
return csvLines.join("\r\n");
};
