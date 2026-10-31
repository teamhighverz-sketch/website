/**
 * ============================================================================
 * HIGHVERZ — GOOGLE SHEET WEBHOOK SYNC SCRIPT (Google Apps Script)
 * ============================================================================
 * 
 * Instructions to connect your Google Sheet in 60 seconds:
 * 
 * 1. Open your Google Sheet where you want leads to be stored.
 * 2. In Google Sheets, click "Extensions" -> "Apps Script".
 * 3. Delete any code in the editor and paste THIS ENTIRE FILE.
 * 4. Click "Deploy" (top right) -> "New deployment".
 * 5. Select type: "Web app".
 * 6. Set Description: "Highverz Leads Webhook".
 * 7. Set "Execute as": "Me (your email)".
 * 8. Set "Who has access": "Anyone" (IMPORTANT so your website can send leads).
 * 9. Click "Deploy", authorize permissions, and COPY the Web App URL.
 * 10. Paste that Web App URL into the Highverz Admin Leads Portal
 *     (Press Shift + L on the site, or click "🔒 Leads Portal" in the footer)
 *     and click "Save URL".
 * 
 * All submissions from the website will now appear in your Google Sheet in real-time!
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

    var valuesByHeader = {
      "Lead Reference ID": data.id || "HV-" + Math.floor(100000 + Math.random() * 900000),
      "Submission Date & Time": data.timestamp || new Date().toLocaleString(),
      "Enquiry Category": data.type || "Creator / Personal Brand",
      "Client Name": data.name || "",
      "Email Address": data.email || (data.contact && data.contact.includes("@") ? data.contact : ""),
      "Phone / WhatsApp": data.phone || (data.contact && !data.contact.includes("@") ? data.contact : ""),
      "Email or WhatsApp": data.contact || [data.email, data.phone].filter(Boolean).join(" / "),
      "Instagram / YouTube / Company": data.handle || "",
      "Project Message / Goals": data.message || "",
      "Source Page": data.source || "",
      "Position Applied For": data.position || "",
      "Other Position": data.otherPosition || ""
    };

    sheet.appendRow(headers.map(function(header) {
      return valuesByHeader[header] || "";
    }));

    return ContentService
      .createTextOutput(JSON.stringify({ result: "success" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock();
  }
}

function ensureHeaders_(sheet) {
  var requiredHeaders = [
    "Lead Reference ID",
    "Submission Date & Time",
    "Enquiry Category",
    "Client Name",
    "Email Address",
    "Phone / WhatsApp",
    "Instagram / YouTube / Company",
    "Project Message / Goals",
    "Source Page",
    "Position Applied For",
    "Other Position"
  ];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(requiredHeaders);
    sheet.getRange(1, 1, 1, requiredHeaders.length)
      .setFontWeight("bold")
      .setBackground("#00e5ff")
      .setFontColor("#000000");
    return requiredHeaders;
  }

  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var missingHeaders = requiredHeaders.filter(function(header) {
    return existingHeaders.indexOf(header) === -1;
  });

  if (missingHeaders.length) {
    var startColumn = existingHeaders.length + 1;
    sheet.getRange(1, startColumn, 1, missingHeaders.length)
      .setValues([missingHeaders])
      .setFontWeight("bold")
      .setBackground("#00e5ff")
      .setFontColor("#000000");
    existingHeaders = existingHeaders.concat(missingHeaders);
  }

  return existingHeaders;
}
