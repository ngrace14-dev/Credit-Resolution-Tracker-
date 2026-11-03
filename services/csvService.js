// csvService.js
export const parseCSVText = (text) => {
    return text.split(/\r?\n/).filter(r => r.trim() !== '');
};

export const parseCSVRow = (str) => {
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

export const cleanString = (str) => {
    return String(str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
};

export const cleanCurrency = (val) => {
    return parseFloat(String(val || 0).replace(/[^0-9.-]+/g, "")) || 0;
};

export const csvEscape = (value) => {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
};

export const normalizeHeader = (header) => {
    return header.replace(/["']/g, '').trim().toLowerCase();
};

export const validateHeaders = (cols, requiredMatchers) => {
    return requiredMatchers.some(matcher => 
        cols.some(c => c.toLowerCase().includes(matcher.toLowerCase()))
    );
};
