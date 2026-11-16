/**
 * ============================================================================
 * HIGHVERZ — GOOGLE SHEET WEBHOOK SYNC SCRIPT (Google Apps Script)
 * ============================================================================
 * 
 * Features included:
 *  1. Auto-sanitizes phone numbers and contacts (prevents #ERROR! formula parse issues).
 *  2. Visual Color Highlighting:
 *     - Brand Enquiry: Vibrant Cyan Badge (#D1F4F9, text #087A87) + Soft Cyan Row Tint (#F4FCFD)
 *     - Join Us Application: Vibrant Purple Badge (#EDE9FE, text #6B21A8) + Soft Purple Row Tint (#FAF7FD)
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
 * Styles a specific row based on Enquiry Category
 *  - Brand Enquiry: Highverz Ice Cyan (#D1F4F9 badge, #087A87 text, #F4FCFD row tint)
 *  - Join Us Application: Soft Purple (#EDE9FE badge, #6B21A8 text, #FAF7FD row tint)
 */
function styleRowByCategory_(sheet, rowNum, headers, categoryVal) {
  var cat = String(categoryVal || "").toLowerCase();
  var categoryCol = headers.indexOf("Enquiry Category") + 1;
  var totalCols = headers.length;

  var isBrand = cat.indexOf("brand") !== -1;
  var isJoin = cat.indexOf("join") !== -1 || cat.indexOf("editor") !== -1;

  if (isBrand) {
    // Subtle row tint + bold badge
    sheet.getRange(rowNum, 1, 1, totalCols).setBackground("#F4FCFD");
    if (categoryCol > 0) {
      sheet.getRange(rowNum, categoryCol)
        .setBackground("#D1F4F9")
        .setFontColor("#087A87")
        .setFontWeight("bold");
    }
  } else if (isJoin) {
    // Subtle row tint + bold badge
    sheet.getRange(rowNum, 1, 1, totalCols).setBackground("#FAF7FD");
    if (categoryCol > 0) {
      sheet.getRange(rowNum, categoryCol)
        .setBackground("#EDE9FE")
        .setFontColor("#6B21A8")
        .setFontWeight("bold");
    }
  }
}

/**
 * Automatically creates the Highverz Tools menu inside Google Sheets UI
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🚀 Highverz Tools")
    .addItem("Fix #ERROR! & Format Colors", "fixExistingSheetErrors")
    .addToUi();
}

/**
 * One-click healing tool:
 *  1. Scans all rows in the sheet for #ERROR! or unintended formulas (+91...).
 *  2. Recovers the phone / email text and safely re-writes it as Plain Text.
 *  3. Color-highlights all rows (Brand = Cyan, Join Us = Purple).
 *  4. Formats contact columns as Plain Text (@).
 *  5. Installs permanent conditional formatting.
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

    // Color code row according to category
    var catVal = categoryCol > 0 ? (values[r][categoryCol - 1] || displayValues[r][categoryCol - 1] || "") : "";
    styleRowByCategory_(sheet, rowNum, headers, catVal);
  }

  // Format entire contact columns as plain text to protect all future manual entries
  if (phoneCol > 0) sheet.getRange(2, phoneCol, lastRow - 1, 1).setNumberFormat("@");
  if (contactCol > 0) sheet.getRange(2, contactCol, lastRow - 1, 1).setNumberFormat("@");

  // Apply conditional formatting rules
  applyConditionalFormatting_(sheet, headers);

  doc.toast("✅ Repaired " + fixedCount + " error cells & applied Brand (Cyan) / Join Us (Purple) colors!", "Highverz Leads Hub", 6);
}

/**
 * Adds permanent conditional formatting rules to Google Sheets
 */
function applyConditionalFormatting_(sheet, headers) {
  var categoryCol = headers.indexOf("Enquiry Category") + 1;
  if (categoryCol === 0) return;

  var maxRows = Math.max(sheet.getMaxRows(), 200);
  var range = sheet.getRange(2, categoryCol, maxRows - 1, 1);

  var rules = sheet.getConditionalFormatRules();
  var hasBrandRule = false;
  var hasJoinRule = false;

  for (var i = 0; i < rules.length; i++) {
    var criteria = rules[i].getBooleanCondition();
    if (criteria) {
      var args = criteria.getCriteriaValues();
      var joined = (args || []).join("");
      if (joined.indexOf("Brand") !== -1) hasBrandRule = true;
      if (joined.indexOf("Join") !== -1) hasJoinRule = true;
    }
  }

  var newRules = rules.slice();

  if (!hasBrandRule) {
    var ruleBrand = SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains("Brand")
      .setBackground("#D1F4F9")
      .setFontColor("#087A87")
      .setBold(true)
      .setRanges([range])
      .build();
    newRules.push(ruleBrand);
  }

  if (!hasJoinRule) {
    var ruleJoin = SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains("Join")
      .setBackground("#EDE9FE")
      .setFontColor("#6B21A8")
      .setBold(true)
      .setRanges([range])
      .build();
    newRules.push(ruleJoin);
  }

  if (!hasBrandRule || !hasJoinRule) {
    sheet.setConditionalFormatRules(newRules);
  }
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
