import os
import json
import shutil
import argparse
import datetime
import openpyxl

def get_clipboard_data():
    """Attempt to safely get data from clipboard using tkinter or pyperclip."""
    try:
        import tkinter as tk
        root = tk.Tk()
        root.withdraw()
        data = root.clipboard_get()
        root.update()
        root.destroy()
        return data
    except ImportError:
        try:
            import pyperclip
            return pyperclip.paste()
        except ImportError:
            print("Error: Could not read clipboard. Please install pyperclip or use tkinter, or provide a --file argument.")
            return None
    except Exception as e:
        print(f"Error accessing clipboard: {e}")
        try:
            import pyperclip
            return pyperclip.paste()
        except Exception:
            return None

def main():
    parser = argparse.ArgumentParser(description="Sync Excel Master Workbook from JSON payload")
    parser.add_argument("--file", help="Path to the JSON payload file (if not using clipboard)")
    parser.add_argument("--workbook", default="./Master_Workbook.xlsx", help="Path to the target Excel workbook")
    
    args = parser.parse_args()
    
    print("=" * 50)
    print("WORKBOOK JSON SYNC UTILITY")
    print("=" * 50)
    
    # 1. Get Payload
    json_str = None
    if args.file:
        print(f"[*] Reading payload from file: {args.file}")
        try:
            with open(args.file, 'r') as f:
                json_str = f.read()
        except Exception as e:
            print(f"[!] Failed to read file: {e}")
            return
    else:
        print("[*] Reading payload from clipboard...")
        json_str = get_clipboard_data()
        
    if not json_str:
        print("[!] Failed to obtain JSON payload. Exiting.")
        return
        
    try:
        payload = json.loads(json_str)
        print("[*] Successfully parsed JSON payload.")
    except json.JSONDecodeError as e:
        print(f"[!] Error decoding JSON payload: {e}")
        return

    # 2. Check target workbook
    wb_path = args.workbook
    if not os.path.exists(wb_path):
        print(f"[!] Error: Target workbook '{wb_path}' not found.")
        return
        
    # 3. Create Backup
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    base, ext = os.path.splitext(wb_path)
    backup_path = f"{base}_backup_{timestamp}{ext}"
    try:
        shutil.copy2(wb_path, backup_path)
        print(f"[*] Backup successfully created: {backup_path}")
    except Exception as e:
        print(f"[!] Failed to create backup: {e}")
        return
    
    # 4. Load Workbook
    print(f"[*] Loading workbook: {wb_path} (data_only=False to preserve formulas/styles)...")
    try:
        wb = openpyxl.load_workbook(wb_path, data_only=False)
    except Exception as e:
        print(f"[!] Failed to load workbook: {e}")
        return
    
    op_sheets = payload.get("operational_sheets", {})
    if not op_sheets:
        print("[!] No 'operational_sheets' found in the payload.")
        
    for sheet_name, data in op_sheets.items():
        if sheet_name not in wb.sheetnames:
            print(f"[-] Warning: Sheet '{sheet_name}' not found in workbook. Skipping.")
            continue
            
        ws = wb[sheet_name]
        print(f"\n[*] Processing sheet: {sheet_name}")
        
        if sheet_name == "GL Raw by Store":
            process_gl_raw(ws, data)
        else:
            process_monthly_sheet(ws, data)
            
    # 5. Save Workbook
    print(f"\n[*] Saving updated workbook to {wb_path}...")
    try:
        wb.save(wb_path)
        print("[*] Sync complete! Safe to close.")
    except Exception as e:
        print(f"[!] Failed to save workbook: {e}")

def process_monthly_sheet(ws, payload_data):
    header_row_idx = None
    col_map = {}
    
    # Find Header Row
    for row_idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
        if row and any(isinstance(cell, str) and "Brand" in cell for cell in row):
            header_row_idx = row_idx
            for col_idx, cell_val in enumerate(row, start=1):
                if isinstance(cell_val, str):
                    clean_val = cell_val.strip()
                    if clean_val == "Brand":
                        col_map["Brand"] = col_idx
                    elif clean_val == "Redding":
                        col_map["Redding"] = col_idx
                    elif clean_val == "Red-Bluff":
                        col_map["Red-Bluff"] = col_idx
            break
            
    if not header_row_idx or "Brand" not in col_map:
        print("    -> Could not find 'Brand' header. Skipping sheet.")
        return
        
    if "Redding" not in col_map or "Red-Bluff" not in col_map:
        print("    -> Could not find 'Redding' or 'Red-Bluff' columns. Skipping sheet.")
        return
        
    # Map existing brands to rows
    existing_brands = {}
    last_data_row = header_row_idx
    totals_row = None
    
    brand_col = col_map["Brand"]
    for row_idx in range(header_row_idx + 1, ws.max_row + 1):
        cell_val = ws.cell(row=row_idx, column=brand_col).value
        if isinstance(cell_val, str):
            val_strip = cell_val.strip()
            if "total" in val_strip.lower():
                totals_row = row_idx
                break
            elif val_strip:
                existing_brands[val_strip] = row_idx
                last_data_row = row_idx
        elif cell_val:
            existing_brands[str(cell_val).strip()] = row_idx
            last_data_row = row_idx
            
    # If a totals row exists, we insert new rows right above it.
    insert_target_row = totals_row if totals_row else (last_data_row + 1)
    
    updates = 0
    inserts = 0
    
    for item in payload_data:
        brand = item.get("Brand")
        if not brand:
            continue
            
        r_val = item.get("Redding", 0)
        rb_val = item.get("Red-Bluff", 0)
        
        if brand in existing_brands:
            # Update existing row
            row_idx = existing_brands[brand]
            ws.cell(row=row_idx, column=col_map["Redding"]).value = r_val
            ws.cell(row=row_idx, column=col_map["Red-Bluff"]).value = rb_val
            updates += 1
        else:
            # Insert new row
            ws.insert_rows(insert_target_row)
            ws.cell(row=insert_target_row, column=col_map["Brand"]).value = brand
            ws.cell(row=insert_target_row, column=col_map["Redding"]).value = r_val
            ws.cell(row=insert_target_row, column=col_map["Red-Bluff"]).value = rb_val
            # Advance insertion point
            insert_target_row += 1
            # We also need to update existing_brands if we have duplicates in payload (unlikely but safe)
            existing_brands[brand] = insert_target_row - 1
            inserts += 1
            
    print(f"    -> Updated {updates} existing brands.")
    print(f"    -> Inserted {inserts} new brands.")

def process_gl_raw(ws, payload_data):
    header_row_idx = None
    col_map = {}
    expected_headers = ["Date", "Brand", "Site", "Month", "Amount", "Type", "Status", "Invoice", "UploadId"]
    
    # Find Header Row
    for row_idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
        if row and any(isinstance(cell, str) and ("Brand" in cell or "Date" in cell) for cell in row):
            header_row_idx = row_idx
            for col_idx, cell_val in enumerate(row, start=1):
                if isinstance(cell_val, str):
                    clean_val = cell_val.strip().lower()
                    for eh in expected_headers:
                        # Match headers safely
                        if eh.lower() == clean_val or eh.lower() in clean_val:
                            if eh not in col_map: 
                                col_map[eh] = col_idx
            # If we found at least 3 matching headers, we assume this is the header row
            if len(col_map) >= 3:
                break
            
    if not header_row_idx:
        print("    -> Could not confidently find header row in GL Raw sheet. Skipping.")
        return
        
    print(f"    -> Identified headers mapped: {list(col_map.keys())}")
    
    # Clear existing values cleanly (preserves styling, borders, and column widths)
    cleared = 0
    for r in range(header_row_idx + 1, ws.max_row + 1):
        has_data = False
        for c in range(1, ws.max_column + 1):
            if ws.cell(row=r, column=c).value is not None:
                has_data = True
            ws.cell(row=r, column=c).value = None
        if has_data:
            cleared += 1
            
    print(f"    -> Cleared {cleared} old data rows.")
            
    # Repopulate from payload
    current_row = header_row_idx + 1
    for item in payload_data:
        for key, col_idx in col_map.items():
            if key in item:
                ws.cell(row=current_row, column=col_idx).value = item[key]
        current_row += 1
        
    print(f"    -> Repopulated {len(payload_data)} records cleanly.")

if __name__ == "__main__":
    main()