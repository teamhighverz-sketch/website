/**
 * ============================================================================
 * HIGHVERZ — GOOGLE SHEET WEBHOOK SYNC SCRIPT (Google Apps Script)
 * ============================================================================
 * 
 * Features included:
 *  1. Auto-sanitizes phone numbers and contacts (prevents #ERROR! formula parse issues).
 *  2. Visual Full-Row Color Highlighting:
 *     - Brand Enquiry: Vibrant Full-Row Cyan (#D1F4F9, dark text #042F2E)
 *     - Join Us Application: Vibrant Full-Row Purple (#EDE9FE, dark text #3B0764)
 *  3. One-Click Repair Tool:
 *     - Run "fixExistingSheetErrors" or use the "🚀 Highverz Tools" menu in Google Sheets
 *       to automatically heal all existing #ERROR! cells and color all rows.
 *  4. Permanent Conditional Formatting rules so colors stay active even on manual edits.
 * 
 * ----------------------------------------------------------------------------
 * HOW TO UPDATE IN 30 SECONDS:
 * ----------------------------------------------------------------------------
 * 1. Open your Google Sheet ("website-enquiry").
 * 2. Click "Extensions" -> "Apps Script" in the top menu.
 * 3. Select all existing code (Ctrl+A / Cmd+A), DELETE it, and PASTE this ENTIRE file.
 * 4. Click the "Save" disk icon (Ctrl+S / Cmd+S).
 * 5. TO FIX EXISTING #ERROR! CELLS RIGHT NOW:
 *    - In the toolbar dropdown (next to "Debug"), select "fixExistingSheetErrors".
 *    - Click "Run". (Authorize permissions if prompted).
 *    - Switch back to your Sheet: all #ERROR! cells in Row 2-6 are healed,
 *      and Brand vs. Join Us rows are cleanly highlighted in Cyan & Purple!
 * 6. TO DEPLOY FOR FUTURE ENTRIES:
 *    - Click "Deploy" (top-right) -> "Manage deployments".
 *    - Click the Pencil (Edit) icon on your active deployment.
 *    - In the "Version" dropdown, choose "New version".
 *    - Click "Deploy".
 * ============================================================================
 */

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "online", service: "Highverz Leads Webhook" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error("Could not acquire the submission lock. Please retry.");
  }

  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = doc.getActiveSheet();

    var headers = ensureHeaders_(sheet);

    // Parse incoming JSON data
    var raw = e.postData.contents;
    var data = JSON.parse(raw);

    // Build contact field cleanly
    var emailVal = (data.email || "").toString().trim();
    var phoneVal = (data.phone || "").toString().trim();
    var contactVal = (data.contact || "").toString().trim();
    if (!contactVal) {
      contactVal = emailVal && phoneVal ? (emailVal + " / " + phoneVal) : (emailVal || phoneVal);
    }

    var categoryVal = data.type || "Brand Enquiry";

    var valuesByHeader = {
      "Lead Reference ID": data.id || "HV-" + Math.floor(100000 + Math.random() * 900000),
      "Submission Date & Time": data.timestamp || new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      "Enquiry Category": categoryVal,
      "Client Name": data.name || "",
      "Email Address": emailVal,
      "Phone / WhatsApp": phoneVal,
      "Email or WhatsApp": contactVal,
      "Instagram / YouTube / Company": data.handle || "",
      "Project Message / Goals": data.message || "",
      "Source Page": data.source || "",
      "Position Applied For": data.position || "",
      "Other Position": data.otherPosition || ""
    };

    // Sanitize every cell to prevent leading + or = from triggering #ERROR!
    var rowValues = headers.map(function(header) {
      return sanitizeForSheets_(valuesByHeader[header]);
    });

    sheet.appendRow(rowValues);
    var addedRow = sheet.getLastRow();

    // Enforce Plain Text formatting on contact columns
    var phoneCol = headers.indexOf("Phone / WhatsApp") + 1;
    var contactCol = headers.indexOf("Email or WhatsApp") + 1;
    if (phoneCol > 0) sheet.getRange(addedRow, phoneCol).setNumberFormat("@");
    if (contactCol > 0) sheet.getRange(addedRow, contactCol).setNumberFormat("@");

    // Apply color highlighting for Brand Enquiry vs Join Us Application
    styleRowByCategory_(sheet, addedRow, headers, categoryVal);

    // Ensure conditional formatting rules are active
    applyConditionalFormatting_(sheet, headers);

    return ContentService
      .createTextOutput(JSON.stringify({ result: "success", row: addedRow }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock();
  }
}

/**
 * Sanitizes values for Google Sheets.
 * If a string begins with +, =, -, or @, Sheets treats it as a formula.
 * Prepending a single apostrophe (') forces Sheets to treat it as plain text
 * without displaying the apostrophe in the cell.
 */
function sanitizeForSheets_(val) {
  if (val === null || val === undefined) return "";
  var s = String(val).trim();
  if (!s) return "";
  if (/^'/.test(s)) return s;
  if (/^[+=@-]/.test(s)) {
    return "'" + s;
  }
  return s;
}

/**
 * Styles a specific row across ALL columns based on Enquiry Category
 *  - Brand Enquiry: Vibrant Full-Row Cyan (#D1F4F9 background, #042F2E dark text)
 *  - Join Us Application: Vibrant Full-Row Purple (#EDE9FE background, #3B0764 dark text)
 */
function styleRowByCategory_(sheet, rowNum, headers, categoryVal) {
  var cat = String(categoryVal || "").toLowerCase();
  var categoryCol = headers.indexOf("Enquiry Category") + 1;
  var totalCols = Math.max(headers.length, 12);

  var isBrand = cat.indexOf("brand") !== -1;
  var isJoin = cat.indexOf("join") !== -1 || cat.indexOf("editor") !== -1;

  var rowRange = sheet.getRange(rowNum, 1, 1, totalCols);

  if (isBrand) {
    // Full row solid Cyan
    rowRange.setBackground("#D1F4F9").setFontColor("#042F2E");
    if (categoryCol > 0) {
      sheet.getRange(rowNum, categoryCol).setFontWeight("bold");
    }
  } else if (isJoin) {
    // Full row solid Purple
    rowRange.setBackground("#EDE9FE").setFontColor("#3B0764");
    if (categoryCol > 0) {
      sheet.getRange(rowNum, categoryCol).setFontWeight("bold");
    }
  }
}

/**
 * Automatically creates the Highverz Tools menu inside Google Sheets UI
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🚀 Highverz Tools")
    .addItem("Fix #ERROR! & Format Full-Row Colors", "fixExistingSheetErrors")
    .addToUi();
}

/**
 * One-click healing tool:
 *  1. Scans all rows in the sheet for #ERROR! or unintended formulas (+91...).
 *  2. Recovers the phone / email text and safely re-writes it as Plain Text.
 *  3. Full-row color-highlights all rows (Brand = Full Cyan, Join Us = Full Purple).
 *  4. Formats contact columns as Plain Text (@).
 *  5. Installs permanent full-row conditional formatting.
 */
function fixExistingSheetErrors() {
  var doc = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = doc.getActiveSheet();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2) {
    doc.toast("No data rows found to fix.", "Highverz Leads Hub", 4);
    return;
  }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var categoryCol = headers.indexOf("Enquiry Category") + 1;
  var phoneCol = headers.indexOf("Phone / WhatsApp") + 1;
  var contactCol = headers.indexOf("Email or WhatsApp") + 1;

  var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var formulas = range.getFormulas();
  var values = range.getValues();
  var displayValues = range.getDisplayValues();

  var fixedCount = 0;

  for (var r = 0; r < lastRow - 1; r++) {
    var rowNum = r + 2;

    for (var c = 0; c < lastCol; c++) {
      var cell = sheet.getRange(rowNum, c + 1);
      var formula = formulas[r][c];
      var displayVal = displayValues[r][c];
      var val = values[r][c];

      // Detect formula parse error (#ERROR!) or unintended formulas like +91...
      var isError = displayVal === "#ERROR!" || String(val) === "#ERROR!" || String(displayVal).indexOf("#") === 0;
      var hasUnintendedFormula = formula && (formula.indexOf("+") === 0 || formula.indexOf("=") === 0);

      if (isError || hasUnintendedFormula) {
        var rawText = formula || "";

        // If formula is empty or literally starts with # (like #ERROR!), recover from other columns
        if (!rawText || rawText.indexOf("#") === 0) {
          if (c === phoneCol - 1 && contactCol > 0) {
            var contactValStr = String(formulas[r][contactCol - 1] || values[r][contactCol - 1] || "");
            var match = contactValStr.match(/\+?\d[\d\s\-()]{7,}\d/);
            if (match) rawText = match[0];
          } else if (c === contactCol - 1 && phoneCol > 0) {
            var phoneValStr = String(formulas[r][phoneCol - 1] || values[r][phoneCol - 1] || "");
            var matchP = phoneValStr.match(/\+?\d[\d\s\-()]{7,}\d/);
            if (matchP) rawText = matchP[0];
          }
        }

        // Strip leading =+ or =
        if (rawText.indexOf("=+") === 0) {
          rawText = rawText.substring(1);
        } else if (rawText.indexOf("=") === 0) {
          rawText = rawText.substring(1);
        }

        // If it starts with numbers that look like an international code without +, ensure +
        if (rawText && !rawText.startsWith("+") && /^\d{1,4}\s+\d+/.test(rawText)) {
          rawText = "+" + rawText;
        }

        cell.clearContent();
        cell.setNumberFormat("@");
        if (rawText && rawText.indexOf("#") !== 0) {
          cell.setValue("'" + rawText);
          fixedCount++;
        }
      } else if (typeof val === "string" && /^[+=@-]/.test(val)) {
        cell.setNumberFormat("@");
        cell.setValue("'" + val);
      }
    }

    // Full row color code according to category
    var catVal = categoryCol > 0 ? (values[r][categoryCol - 1] || displayValues[r][categoryCol - 1] || "") : "";
    styleRowByCategory_(sheet, rowNum, headers, catVal);
  }

  // Format entire contact columns as plain text to protect all future manual entries
  if (phoneCol > 0) sheet.getRange(2, phoneCol, lastRow - 1, 1).setNumberFormat("@");
  if (contactCol > 0) sheet.getRange(2, contactCol, lastRow - 1, 1).setNumberFormat("@");

  // Apply full-row conditional formatting rules
  applyConditionalFormatting_(sheet, headers);

  doc.toast("✅ Repaired " + fixedCount + " error cells & applied Full-Row Brand (Cyan) / Join Us (Purple) colors!", "Highverz Leads Hub", 6);
}

/**
 * Adds permanent full-row conditional formatting rules to Google Sheets
 */
function applyConditionalFormatting_(sheet, headers) {
  var categoryCol = headers.indexOf("Enquiry Category") + 1;
  if (categoryCol === 0) return;

  var colLetter = getColumnLetter_(categoryCol);
  var maxRows = Math.max(sheet.getMaxRows(), 500);
  var totalCols = Math.max(headers.length, 12);
  var range = sheet.getRange(2, 1, maxRows - 1, totalCols);

  var rules = sheet.getConditionalFormatRules();
  // Filter out any existing category rules to update with full-row formatting
  var newRules = rules.filter(function(r) {
    var cond = r.getBooleanCondition();
    if (!cond) return true;
    var vals = cond.getCriteriaValues();
    var str = vals ? vals.join("") : "";
    return str.indexOf("brand") === -1 && str.indexOf("join") === -1 && str.indexOf("Brand") === -1 && str.indexOf("Join") === -1;
  });

  // Full-row rule for Brand Enquiry (matches any column when Category contains "brand")
  var ruleBrand = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=REGEXMATCH(LOWER($' + colLetter + '2), "brand")')
    .setBackground("#D1F4F9")
    .setFontColor("#042F2E")
    .setRanges([range])
    .build();

  // Full-row rule for Join Us Application (matches any column when Category contains "join")
  var ruleJoin = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=REGEXMATCH(LOWER($' + colLetter + '2), "join")')
    .setBackground("#EDE9FE")
    .setFontColor("#3B0764")
    .setRanges([range])
    .build();

  newRules.push(ruleBrand);
  newRules.push(ruleJoin);
  sheet.setConditionalFormatRules(newRules);
}

function getColumnLetter_(colIndex) {
  var temp = "", letter = "";
  while (colIndex > 0) {
    temp = (colIndex - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    colIndex = Math.floor((colIndex - temp - 1) / 26);
  }
  return letter;
}

/**
 * Ensures header row exists with Highverz branding and Plain Text configuration
 */
function ensureHeaders_(sheet) {
  var defaultHeaders = [
    "Lead Reference ID",
    "Submission Date & Time",
    "Enquiry Category",
    "Client Name",
    "Email Address",
    "Phone / WhatsApp",
    "Email or WhatsApp",
    "Instagram / YouTube / Company",
    "Project Message / Goals",
    "Source Page",
    "Position Applied For",
    "Other Position"
  ];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(defaultHeaders);
    sheet.getRange(1, 1, 1, defaultHeaders.length)
      .setFontWeight("bold")
      .setBackground("#00e5ff")
      .setFontColor("#000000");
    sheet.setFrozenRows(1);
    return defaultHeaders;
  }

  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];

  return existingHeaders;
}
