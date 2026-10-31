/**
 * Highverz Simple & Sweet Enquiry Engine + Google Sheet Connector
 * Dual-path enquiry form for editors and brands, outside-click closing, native cursor handling, and live Google Sheets sync
 */

const STORAGE_KEY = 'highverz_leads';
const SHEETS_CONFIG_KEY = 'highverz_sheets_webhook_url';

// Default Google Apps Script URL (can also be configured via Admin HUD or localStorage)
let GOOGLE_SHEETS_URL = localStorage.getItem(SHEETS_CONFIG_KEY) || '';

export const COUNTRIES = [
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { code: 'AE', name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { code: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬' },
  { code: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
  { code: 'SA', name: 'Saudi Arabia', dial: '+966', flag: '🇸🇦' },
  { code: 'QA', name: 'Qatar', dial: '+974', flag: '🇶🇦' },
  { code: 'NL', name: 'Netherlands', dial: '+31', flag: '🇳🇱' },
  { code: 'CH', name: 'Switzerland', dial: '+41', flag: '🇨🇭' },
  { code: 'IT', name: 'Italy', dial: '+39', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', dial: '+34', flag: '🇪🇸' },
  { code: 'JP', name: 'Japan', dial: '+81', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', dial: '+82', flag: '🇰🇷' },
  { code: 'BR', name: 'Brazil', dial: '+55', flag: '🇧🇷' },
  { code: 'MX', name: 'Mexico', dial: '+52', flag: '🇲🇽' },
  { code: 'ZA', name: 'South Africa', dial: '+27', flag: '🇿🇦' },
  { code: 'NZ', name: 'New Zealand', dial: '+64', flag: '🇳🇿' },
  { code: 'ID', name: 'Indonesia', dial: '+62', flag: '🇮🇩' },
  { code: 'MY', name: 'Malaysia', dial: '+60', flag: '🇲🇾' },
  { code: 'TH', name: 'Thailand', dial: '+66', flag: '🇹🇭' },
  { code: 'PH', name: 'Philippines', dial: '+63', flag: '🇵🇭' },
  { code: 'VN', name: 'Vietnam', dial: '+84', flag: '🇻🇳' },
  { code: 'IE', name: 'Ireland', dial: '+353', flag: '🇮🇪' },
  { code: 'SE', name: 'Sweden', dial: '+46', flag: '🇸🇪' },
  { code: 'NO', name: 'Norway', dial: '+47', flag: '🇳🇴' },
  { code: 'DK', name: 'Denmark', dial: '+45', flag: '🇩🇰' },
  { code: 'FI', name: 'Finland', dial: '+358', flag: '🇫🇮' },
  { code: 'PT', name: 'Portugal', dial: '+351', flag: '🇵🇹' },
  { code: 'PL', name: 'Poland', dial: '+48', flag: '🇵🇱' },
  { code: 'TR', name: 'Turkey', dial: '+90', flag: '🇹🇷' },
  { code: 'EG', name: 'Egypt', dial: '+20', flag: '🇪🇬' },
  { code: 'NG', name: 'Nigeria', dial: '+234', flag: '🇳🇬' },
  { code: 'KE', name: 'Kenya', dial: '+254', flag: '🇰🇪' },
  { code: 'AR', name: 'Argentina', dial: '+54', flag: '🇦🇷' },
  { code: 'CL', name: 'Chile', dial: '+56', flag: '🇨🇱' },
  { code: 'CO', name: 'Colombia', dial: '+57', flag: '🇨🇴' },
  { code: 'PK', name: 'Pakistan', dial: '+92', flag: '🇵🇰' },
  { code: 'BD', name: 'Bangladesh', dial: '+880', flag: '🇧🇩' },
  { code: 'LK', name: 'Sri Lanka', dial: '+94', flag: '🇱🇰' },
  { code: 'NP', name: 'Nepal', dial: '+977', flag: '🇳🇵' },
  { code: 'AT', name: 'Austria', dial: '+43', flag: '🇦🇹' },
  { code: 'BE', name: 'Belgium', dial: '+32', flag: '🇧🇪' },
  { code: 'GR', name: 'Greece', dial: '+30', flag: '🇬🇷' },
  { code: 'IL', name: 'Israel', dial: '+972', flag: '🇮🇱' },
  { code: 'KW', name: 'Kuwait', dial: '+965', flag: '🇰🇼' },
  { code: 'OM', name: 'Oman', dial: '+968', flag: '🇴🇲' },
  { code: 'BH', name: 'Bahrain', dial: '+973', flag: '🇧🇭' }
];

export function initEnquirySystem() {
  injectEnquiryModal();
  injectAdminLeadsModal();
  bindTriggerElements();
  bindKeyboardShortcuts();
  bindEnquiryModalPageLifecycle();
}

// Browsers can restore a page from the back/forward cache with its DOM state
// intact. Never let an open enquiry overlay reappear just because that page
// was restored; opening it must always require a fresh user click.
let isEnquiryModalLifecycleBound = false;
let resumeEnquiryScrollOnPageShow = false;
function bindEnquiryModalPageLifecycle() {
  if (isEnquiryModalLifecycleBound) return;
  isEnquiryModalLifecycleBound = true;

  window.addEventListener('pagehide', () => {
    const backdrop = document.getElementById('enquiry-modal-backdrop');
    resumeEnquiryScrollOnPageShow = Boolean(
      backdrop?.classList.contains('is-active') || document.body.classList.contains('enquiry-modal-open')
    );
    if (resumeEnquiryScrollOnPageShow) dismissEnquiryModal(false);
  });

  window.addEventListener('pageshow', () => {
    if (!resumeEnquiryScrollOnPageShow) return;
    dismissEnquiryModal(false);
    if (window.lenis) window.lenis.start();
    resumeEnquiryScrollOnPageShow = false;
  });
}

function dismissEnquiryModal(resumeScroll = true) {
  const backdrop = document.getElementById('enquiry-modal-backdrop');
  if (!backdrop || !backdrop.classList.contains('is-active')) return;

  backdrop.classList.remove('is-active');
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('enquiry-modal-open');
  if (resumeScroll && window.lenis) window.lenis.start();
}

// The router also uses this when navigating without a page reload.
export function closeEnquiryModal() {
  dismissEnquiryModal(true);
}

/**
 * Returns all stored leads from localStorage
 */
export function getStoredLeads() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error reading highverz_leads:', e);
    return [];
  }
}

/**
 * Saves a lead into localStorage and forwards to Google Sheets
 */
export async function saveLead(leadData) {
  try {
    const leads = getStoredLeads();
    const newLead = {
      id: `HV-${Math.floor(100000 + Math.random() * 900000)}`,
      createdAt: new Date().toISOString(),
      formattedDate: new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      sourceUrl: window.location.href,
      ...leadData
    };

    // 1. Local backup so no lead is ever lost
    leads.unshift(newLead);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));

    // 2. Dispatch custom event
    window.dispatchEvent(new CustomEvent('highverz:lead_stored', { detail: newLead }));

    // 3. Forward to backend API to sync with Google Sheet
    try {
      const customSheetUrl = localStorage.getItem(SHEETS_CONFIG_KEY) || '';
      const response = await fetch('/api/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newLead.id,
          timestamp: newLead.formattedDate,
          type: newLead.type || 'General Inquiry',
          name: newLead.name || '',
          contact: newLead.contact || '',
          handle: newLead.handle || '',
          message: newLead.message || '',
          position: newLead.position || '',
          otherPosition: newLead.otherPosition || '',
          source: newLead.sourceUrl || '',
          googleSheetsUrl: customSheetUrl
        })
      });
      
      if (response.ok) {
        console.log('Lead synced to backend successfully');
      } else {
        console.warn('Backend returned an error. Google Sheet sync might have failed.');
      }
    } catch (apiErr) {
      console.warn('Backend sync attempt failed:', apiErr);
    }

    return newLead;
  } catch (e) {
    console.error('Error saving lead:', e);
    return null;
  }
}

/**
 * Injects the simple & sweet Enquiry Modal into the DOM (no tabs)
 */
function injectEnquiryModal() {
  if (document.getElementById('enquiry-modal-backdrop')) return;

  const modalHtml = `
    <div class="enquiry-modal-backdrop" id="enquiry-modal-backdrop" aria-hidden="true" role="dialog" aria-labelledby="enquiry-modal-title">
      <div class="enquiry-modal-window simple-enquiry-window" data-lenis-prevent>
        <button type="button" class="enquiry-modal-close" id="enquiry-modal-close" aria-label="Close Enquiry Modal">✕</button>

        <!-- Form Stage -->
        <div id="enquiry-form-stage">
          <div class="enquiry-header">
            <div class="enquiry-badge">
              <span class="enquiry-badge-dot"></span>
              <span>Let's Connect</span>
            </div>
            <h2 class="enquiry-title" id="enquiry-modal-title">
              Let's Build <span class="highlight-cyan">Together.</span>
            </h2>
            <p class="enquiry-desc" id="enquiry-modal-desc">
              Tell us what you are building. The Highverz team will review your enquiry and get back to you within 12–24 hours.
            </p>
          </div>

          <div class="enquiry-type-switcher" role="tablist" aria-label="Enquiry type">
            <button type="button" class="enquiry-type-option is-active" data-enquiry-type="brand" role="tab" aria-selected="true">
              <span class="enquiry-type-icon">✦</span> Apply as a Brand
            </button>
            <button type="button" class="enquiry-type-option" data-enquiry-type="editor" role="tab" aria-selected="false">
              <span class="enquiry-type-icon">✎</span> Join Us
            </button>
          </div>

          <form class="enquiry-form simple-form" id="global-enquiry-form">
            <div class="enquiry-field">
              <label class="enquiry-label" for="enquiry-name">Your Name <span class="req">*</span></label>
              <input type="text" id="enquiry-name" name="name" class="enquiry-input" placeholder="e.g. Alex Gonzalez" required />
            </div>

            <div class="enquiry-field enquiry-contact-field">
              <label class="enquiry-label" for="enquiry-contact">Phone / WhatsApp or Email <span class="req">*</span></label>
              <div class="enquiry-phone-wrap" id="enquiry-phone-wrap">
                <button type="button" class="enquiry-flag-btn" id="enquiry-flag-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Select Country Code">
                  <span class="enquiry-flag-symbol" id="enquiry-selected-flag">🇮🇳</span>
                  <span class="enquiry-flag-arrow" aria-hidden="true">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </span>
                </button>
                <input type="text" id="enquiry-contact" name="contact" class="enquiry-input enquiry-phone-input" placeholder="081234 56789 or you@domain.com" required autocomplete="tel" />
                <input type="hidden" id="enquiry-country-code" name="countryCode" value="+91" />
                <input type="hidden" id="enquiry-country-name" name="countryName" value="India" />

                <!-- Flag Country Selector Dropdown -->
                <div class="enquiry-flag-dropdown" id="enquiry-flag-dropdown" role="listbox" aria-label="Select Country" style="display: none;">
                  <div class="enquiry-flag-search-box">
                    <svg class="enquiry-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input type="text" class="enquiry-flag-search-input" id="enquiry-flag-search" placeholder="Search country or code..." autocomplete="off" />
                  </div>
                  <ul class="enquiry-flag-list" id="enquiry-flag-list" tabindex="-1">
                    <!-- Populated dynamically via JS -->
                  </ul>
                </div>
              </div>
            </div>

            <div class="enquiry-field" id="enquiry-position-field" hidden>
              <label class="enquiry-label" for="enquiry-position">Position you are applying for <span class="req">*</span></label>
              <select id="enquiry-position" name="position" class="enquiry-select" disabled>
                <option value="">Select a position</option>
                <option value="Short-Form Video Editor">Short-Form Video Editor</option>
                <option value="Motion Designer">Motion Designer</option>
                <option value="Content Strategist">Content Strategist</option>
                <option value="Creator Partnerships">Creator Partnerships</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div class="enquiry-field" id="enquiry-other-position-field" hidden>
              <label class="enquiry-label" for="enquiry-other-position">Tell us the role <span class="req">*</span></label>
              <input type="text" id="enquiry-other-position" name="otherPosition" class="enquiry-input" placeholder="e.g. Graphic Designer" disabled />
            </div>

            <div class="enquiry-field" id="enquiry-handle-field">
              <label class="enquiry-label" id="enquiry-handle-label" for="enquiry-handle">Brand / Company Website <span class="req">*</span></label>
              <input type="text" id="enquiry-handle" name="handle" class="enquiry-input" placeholder="yourbrand.com or @handle" required />
            </div>

            <div class="enquiry-field" id="enquiry-message-field">
              <label class="enquiry-label" id="enquiry-message-label" for="enquiry-message">What are you looking to achieve?</label>
              <textarea id="enquiry-message" name="message" class="enquiry-textarea simple-textarea" placeholder="Tell us about your brand, project, goals, or timeline..."></textarea>
            </div>

            <button type="submit" class="enquiry-submit-btn" id="btn-submit-enquiry">
              <span class="enquiry-submit-label" id="submit-btn-text"><span>Send Inquiry</span><span aria-hidden="true">Send Inquiry</span></span>
              <span class="btn-arrow-icon">↗</span>
            </button>

            <p class="enquiry-privacy-note">
              🔒 Direct to our team. 100% confidential.
            </p>
          </form>
        </div>

        <!-- Success Feedback Stage -->
        <div class="enquiry-success-box" id="enquiry-success-stage">
          <div class="enquiry-success-icon">✓</div>
          <h3 class="enquiry-success-title">Message Received!</h3>
          <p class="enquiry-success-desc">
            Thanks for reaching out! Your details have been sent to our team. We'll be in touch shortly.
          </p>

          <div class="enquiry-success-meta" id="enquiry-success-meta">
            Reference: <strong id="lead-ref-id">HV-00000</strong>
          </div>

          <div class="enquiry-success-actions">
            <button type="button" class="btn-primary-cyan-enquiry" id="btn-success-close">Done</button>
            <button type="button" class="btn-enquiry-reset" id="btn-enquiry-reset">Send Another Note</button>
          </div>
        </div>

      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  bindModalEvents();
}

/**
 * Injects the Admin Leads Dashboard with Google Sheets configuration
 */
function injectAdminLeadsModal() {
  if (document.getElementById('admin-leads-overlay')) return;

  const adminHtml = `
    <div class="admin-leads-overlay" id="admin-leads-overlay" aria-hidden="true" role="dialog">
      <div class="admin-leads-panel">
        <button type="button" class="admin-leads-close" id="admin-leads-close">✕</button>

        <div class="admin-leads-header">
          <div class="admin-leads-title">
            <span>Highverz Leads &amp; Google Sheet Hub</span>
            <span class="admin-leads-count" id="admin-leads-count">0 Leads</span>
          </div>

          <div class="admin-leads-actions">
            <button type="button" class="btn-admin-export" id="btn-export-csv">
              <span>Download CSV</span>
              <span>📥</span>
            </button>
            <button type="button" class="btn-admin-clear" id="btn-clear-leads">
              <span>Clear All</span>
            </button>
          </div>
        </div>

        <!-- Google Sheet URL Configuration Banner -->
        <div class="admin-sheet-config-bar">
          <div class="sheet-config-label">
            <span>📊 Google Sheet Apps Script URL:</span>
          </div>
          <div class="sheet-config-input-row">
            <input type="url" id="admin-sheet-url-input" class="admin-sheet-input" placeholder="Paste your Google Apps Script Web App URL here (https://script.google.com/...)" value="" />
            <button type="button" class="btn-admin-save-sheet" id="btn-save-sheet-url">Save URL</button>
          </div>
          <div class="sheet-config-help">
            Loading configuration...
          </div>
        </div>

        <div class="admin-leads-table-wrap">
          <table class="admin-leads-table">
            <thead>
              <tr>
                <th>Ref ID</th>
                <th>Date &amp; Time</th>
                <th>Name</th>
                <th>Email / WhatsApp</th>
                <th>Position</th>
                <th>Social / Website</th>
                <th>Message</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="admin-leads-tbody">
              <!-- Dynamically populated -->
            </tbody>
          </table>
          <div class="admin-leads-empty" id="admin-leads-empty" style="display: none;">
            <p>No inquiries captured yet.</p>
            <span style="font-size: 0.8rem; color: #64748b;">Submissions through the website will appear here in real-time.</span>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', adminHtml);
  bindAdminEvents();
  fetchConfigAndUpdateUI();
}

async function fetchConfigAndUpdateUI() {
  const urlInput = document.getElementById('admin-sheet-url-input');
  const helpText = document.querySelector('.sheet-config-help');
  
  let currentUrl = localStorage.getItem(SHEETS_CONFIG_KEY) || '';

  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const config = await res.json();
      if (!currentUrl && config.googleSheetsUrl) {
        currentUrl = config.googleSheetsUrl;
      }
    }
  } catch(e) {
    console.warn('Failed to fetch config from backend, using client preference', e);
  }

  if (urlInput && !urlInput.value) {
    urlInput.value = currentUrl;
  }
  if (helpText) {
    helpText.innerHTML = currentUrl 
      ? '🟢 <strong>Active Sheet Connected:</strong> Leads automatically sync live. You can paste any new Apps Script URL here anytime to change sheets.' 
      : '⚠️ <strong>No custom sheet URL set:</strong> Inquiries are saved in browser storage and can be downloaded as CSV. Paste an Apps Script URL above to sync live.';
  }
}

/**
 * Bind modal open/close and click-outside cancellation
 */
function bindModalEvents() {
  const backdrop = document.getElementById('enquiry-modal-backdrop');
  const modalWindow = backdrop.querySelector('.enquiry-modal-window');
  const closeBtn = document.getElementById('enquiry-modal-close');
  const formStage = document.getElementById('enquiry-form-stage');
  const successStage = document.getElementById('enquiry-success-stage');
  const form = document.getElementById('global-enquiry-form');
  const resetBtn = document.getElementById('btn-enquiry-reset');
  const submitBtn = document.getElementById('btn-submit-enquiry');
  const submitBtnText = document.getElementById('submit-btn-text');
  const modalTitle = document.getElementById('enquiry-modal-title');
  const modalDesc = document.getElementById('enquiry-modal-desc');
  const handleLabel = document.getElementById('enquiry-handle-label');
  const handleInput = document.getElementById('enquiry-handle');
  const messageLabel = document.getElementById('enquiry-message-label');
  const messageInput = document.getElementById('enquiry-message');
  const positionField = document.getElementById('enquiry-position-field');
  const positionInput = document.getElementById('enquiry-position');
  const otherPositionField = document.getElementById('enquiry-other-position-field');
  const otherPositionInput = document.getElementById('enquiry-other-position');
  const typeOptions = document.querySelectorAll('.enquiry-type-option');
  let enquiryType = 'brand';

  const setSubmitLabel = (label) => {
    submitBtnText.innerHTML = `<span>${label}</span><span aria-hidden="true">${label}</span>`;
  };

  const updatePositionFields = () => {
    const isJoinUs = enquiryType === 'editor';
    const isOtherPosition = isJoinUs && positionInput.value === 'Other';

    positionField.hidden = !isJoinUs;
    positionInput.disabled = !isJoinUs;
    positionInput.required = isJoinUs;
    otherPositionField.hidden = !isOtherPosition;
    otherPositionInput.disabled = !isOtherPosition;
    otherPositionInput.required = isOtherPosition;

    if (!isOtherPosition) otherPositionInput.value = '';
  };

  const setEnquiryType = (type) => {
    enquiryType = type;
    const isEditor = type === 'editor';
    typeOptions.forEach((option) => {
      const active = option.dataset.enquiryType === type;
      option.classList.toggle('is-active', active);
      option.setAttribute('aria-selected', String(active));
    });

    modalTitle.innerHTML = isEditor
      ? 'Join the <span class="highlight-cyan">Highverz Team.</span>'
      : "Let's Build <span class=\"highlight-cyan\">Together.</span>";
    modalDesc.textContent = isEditor
      ? 'Tell us where you can make the biggest impact. We are always looking for sharp people who know how to make content move.'
      : 'Tell us what you are building. The Highverz team will review your enquiry and get back to you within 12–24 hours.';
    handleLabel.innerHTML = isEditor
      ? 'Portfolio or Social Link <span class="req">*</span>'
      : 'Brand / Company Website <span class="req">*</span>';
    handleInput.placeholder = isEditor ? 'portfolio link or @handle' : 'yourbrand.com or @handle';
    messageLabel.textContent = isEditor ? 'Tell us about your experience' : 'What are you looking to achieve?';
    messageInput.placeholder = isEditor
      ? 'Share your experience, tools, niche, and the kind of work you love...'
      : 'Tell us about your brand, project, goals, or timeline...';
    setSubmitLabel(isEditor ? 'Apply to Join Us' : 'Send Brand Enquiry');
    updatePositionFields();
  };

  typeOptions.forEach((option) => {
    option.addEventListener('click', () => setEnquiryType(option.dataset.enquiryType));
  });
  positionInput.addEventListener('change', updatePositionFields);
  setEnquiryType('brand');

  // Close modal and restore native cursor
  const closeModal = () => {
    dismissEnquiryModal(true);
  };

  closeBtn.addEventListener('click', closeModal);

  // Lenis is stopped while the modal is open, so route wheel input directly
  // to the modal. This keeps the form scrollable across browsers and trackpads.
  modalWindow.addEventListener('wheel', (event) => {
    if (event.target.closest('.enquiry-flag-dropdown')) return;
    if (formStage.scrollHeight <= formStage.clientHeight) return;
    event.preventDefault();
    event.stopPropagation();
    formStage.scrollTop += event.deltaY;
  }, { passive: false });

  // Reliable click-outside cancellation: any click outside .enquiry-modal-window closes it immediately
  backdrop.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.enquiry-modal-window')) {
      closeModal();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdrop.classList.contains('is-active')) {
      closeModal();
    }
  });

  // Initialize Country Flag Selector for Phone/Contact Field
  const resetCountrySelector = initCountrySelector(form);

  // Handle Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    setSubmitLabel('Sending...');

    const formData = new FormData(form);
    const rawData = Object.fromEntries(formData.entries());
    let contactVal = String(rawData.contact || '').trim();
    const countryCode = String(rawData.countryCode || '+91').trim();
    const isEmail = contactVal.includes('@');

    // Prepend dial code if user entered a phone number without +
    if (!isEmail && contactVal && !contactVal.startsWith('+')) {
      contactVal = `${countryCode} ${contactVal}`;
    }

    const data = {
      ...rawData,
      contact: contactVal,
      type: enquiryType === 'editor' ? 'Join Us Application' : 'Brand Enquiry'
    };

    // Save lead into persistent storage & forward to Google Sheets
    const saved = await saveLead(data);

    submitBtn.disabled = false;
    setSubmitLabel(enquiryType === 'editor' ? 'Apply to Join Us' : 'Send Brand Enquiry');

    // Swap views
    formStage.style.display = 'none';
    successStage.classList.add('is-visible');
  });

  // Done button to close modal
  const doneBtn = document.getElementById('btn-success-close');
  if (doneBtn) {
    doneBtn.addEventListener('click', () => {
      closeEnquiryModal();
    });
  }

  // Reset form to submit another
  resetBtn.addEventListener('click', () => {
    form.reset();
    if (resetCountrySelector) resetCountrySelector();
    setEnquiryType(enquiryType);
    successStage.classList.remove('is-visible');
    formStage.style.display = 'block';
  });
}

/**
 * Initializes the Country Flag Selector inside the Contact/Phone field
 */
function initCountrySelector(form) {
  const phoneWrap = form.querySelector('#enquiry-phone-wrap');
  const flagBtn = form.querySelector('#enquiry-flag-btn');
  const flagDropdown = form.querySelector('#enquiry-flag-dropdown');
  const flagSearch = form.querySelector('#enquiry-flag-search');
  const flagList = form.querySelector('#enquiry-flag-list');
  const selectedFlag = form.querySelector('#enquiry-selected-flag');
  const countryCodeInput = form.querySelector('#enquiry-country-code');
  const countryNameInput = form.querySelector('#enquiry-country-name');
  const contactInput = form.querySelector('#enquiry-contact');

  if (!phoneWrap || !flagBtn || !flagDropdown || !flagList) return () => {};

  let currentCountry = 'IN';

  const selectCountryItem = (item) => {
    if (!item) return;
    const code = item.dataset.countryCode;
    const dial = item.dataset.dial;
    const name = item.dataset.name;
    const flag = item.dataset.flag;

    currentCountry = code;
    selectedFlag.textContent = flag;
    countryCodeInput.value = dial;
    countryNameInput.value = name;

    closeDropdown();
    contactInput.focus();
  };

  const renderCountries = (filter = '') => {
    const term = filter.trim().toLowerCase();
    const filtered = COUNTRIES.filter((c) => {
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        c.dial.toLowerCase().includes(term) ||
        c.code.toLowerCase().includes(term)
      );
    });

    if (!filtered.length) {
      flagList.innerHTML = `<li class="enquiry-flag-empty">No countries match "${filter}"</li>`;
      return;
    }

    flagList.innerHTML = filtered.map((c) => `
      <li class="enquiry-flag-item ${c.code === currentCountry ? 'is-active' : ''}" data-country-code="${c.code}" data-dial="${c.dial}" data-name="${c.name}" data-flag="${c.flag}" role="option" tabindex="0" aria-selected="${c.code === currentCountry}">
        <span class="flag-symbol">${c.flag}</span>
        <span class="country-name">${c.name}</span>
        <span class="dial-code">${c.dial}</span>
      </li>
    `).join('');
  };

  renderCountries();

  const openDropdown = () => {
    flagDropdown.style.display = 'flex';
    flagBtn.setAttribute('aria-expanded', 'true');
    phoneWrap.classList.add('is-dropdown-open');
    phoneWrap.closest('.enquiry-contact-field')?.classList.add('has-dropdown-open');
    flagSearch.value = '';
    renderCountries();
    window.setTimeout(() => flagSearch.focus(), 60);
  };

  const closeDropdown = () => {
    flagDropdown.style.display = 'none';
    flagBtn.setAttribute('aria-expanded', 'false');
    phoneWrap.classList.remove('is-dropdown-open');
    phoneWrap.closest('.enquiry-contact-field')?.classList.remove('has-dropdown-open');
  };

  flagBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = flagDropdown.style.display !== 'none';
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  flagSearch.addEventListener('input', (e) => {
    renderCountries(e.target.value);
  });

  flagSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
      contactInput.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault(); // Never submit the enquiry modal form on search enter!
      e.stopPropagation();
      const firstItem = flagList.querySelector('.enquiry-flag-item');
      if (firstItem) {
        selectCountryItem(firstItem);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const firstItem = flagList.querySelector('.enquiry-flag-item');
      if (firstItem) {
        firstItem.focus();
        firstItem.scrollIntoView({ block: 'nearest' });
      }
    }
  });

  flagList.addEventListener('mousedown', (e) => {
    // Prevent search input from blurring prematurely on mouse click
    if (e.target.closest('.enquiry-flag-item')) {
      e.preventDefault();
    }
  });

  flagList.addEventListener('click', (e) => {
    const item = e.target.closest('.enquiry-flag-item');
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    selectCountryItem(item);
  });

  flagList.addEventListener('keydown', (e) => {
    const current = document.activeElement;
    if (!current || !current.classList.contains('enquiry-flag-item')) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      selectCountryItem(current);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = current.nextElementSibling;
      if (next && next.classList.contains('enquiry-flag-item')) {
        next.focus();
        next.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = current.previousElementSibling;
      if (prev && prev.classList.contains('enquiry-flag-item')) {
        prev.focus();
        prev.scrollIntoView({ block: 'nearest' });
      } else {
        flagSearch.focus();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
      contactInput.focus();
    }
  });

  // Highlight wrap on contact input focus
  contactInput.addEventListener('focus', () => {
    phoneWrap.classList.add('is-focused');
  });
  contactInput.addEventListener('blur', () => {
    phoneWrap.classList.remove('is-focused');
  });

  // Close when clicking outside phone wrap
  document.addEventListener('click', (e) => {
    if (!phoneWrap.contains(e.target)) {
      closeDropdown();
    }
  });

  // Close on Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && flagDropdown.style.display !== 'none') {
      closeDropdown();
    }
  });

  return function reset() {
    currentCountry = 'IN';
    selectedFlag.textContent = '🇮🇳';
    countryCodeInput.value = '+91';
    countryNameInput.value = 'India';
    closeDropdown();
  };
}

/**
 * Binds all CTA buttons to open the Enquiry Modal
 */
let isTriggerBound = false;
function bindTriggerElements() {
  if (isTriggerBound) return;
  isTriggerBound = true;
  document.addEventListener('click', (e) => {
    const target = e.target.closest(
      '[data-enquiry-trigger], .btn-nav-talk, #btn-nav-talk, .btn-primary-cyan-large, a[href="#contact"]'
    );

    if (target) {
      if (target.closest('.inline-enquiry-wrapper') || target.closest('.enquiry-form')) {
        return;
      }

      e.preventDefault();
      openEnquiryModal();
    }
  });
}

/**
 * Open the Enquiry Modal globally and manage cursor state
 */
export function openEnquiryModal() {
  const backdrop = document.getElementById('enquiry-modal-backdrop');
  if (!backdrop) return;

  if (window.lenis) window.lenis.stop();
  backdrop.classList.add('is-active');
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.classList.add('enquiry-modal-open');

  // Deactivate any lingering custom cursor hover states
  const cursor = document.getElementById('custom-cursor');
  if (cursor) {
    cursor.classList.remove('hovering');
  }
}

/**
 * Admin Leads Dashboard Logic
 */
function bindAdminEvents() {
  const overlay = document.getElementById('admin-leads-overlay');
  const closeBtn = document.getElementById('admin-leads-close');
  const exportBtn = document.getElementById('btn-export-csv');
  const clearBtn = document.getElementById('btn-clear-leads');
  const saveSheetBtn = document.getElementById('btn-save-sheet-url');
  const sheetInput = document.getElementById('admin-sheet-url-input');

  const closeAdmin = () => {
    overlay.classList.remove('is-active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('enquiry-modal-open');
    if (window.lenis) window.lenis.start();
  };

  closeBtn.addEventListener('click', closeAdmin);
  overlay.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.admin-leads-panel')) {
      closeAdmin();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('is-active')) {
      closeAdmin();
    }
  });

  // Save Google Sheet Webhook URL
  if (saveSheetBtn && sheetInput) {
    saveSheetBtn.addEventListener('click', async () => {
      const url = sheetInput.value.trim();
      if (url) {
        localStorage.setItem(SHEETS_CONFIG_KEY, url);
      } else {
        localStorage.removeItem(SHEETS_CONFIG_KEY);
      }

      try {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ googleSheetsUrl: url })
        });
      } catch (err) {
        console.warn('Backend config update skipped (running static or serverless):', err);
      }

      alert(url ? '✅ Google Sheet updated successfully! All future inquiries will sync to this sheet.' : 'Google Sheet URL reset.');
      fetchConfigAndUpdateUI();
    });
  }

  // Export Leads to CSV
  exportBtn.addEventListener('click', () => {
    exportLeadsToCSV();
  });

  // Clear Leads
  clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to delete all stored leads? This cannot be undone.')) {
      localStorage.removeItem(STORAGE_KEY);
      renderAdminLeads();
    }
  });

  // Footer / direct trigger click
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('#admin-leads-trigger, .admin-leads-trigger');
    if (trigger) {
      e.preventDefault();
      openAdminLeadsDashboard();
    }
  });

  // Listen for new lead stored
  window.addEventListener('highverz:lead_stored', () => {
    renderAdminLeads();
  });
}

/**
 * Render leads into Admin Table
 */
export function renderAdminLeads() {
  const tbody = document.getElementById('admin-leads-tbody');
  const countLabel = document.getElementById('admin-leads-count');
  const emptyBox = document.getElementById('admin-leads-empty');
  if (!tbody || !countLabel) return;

  const leads = getStoredLeads();
  countLabel.textContent = `${leads.length} Lead${leads.length === 1 ? '' : 's'}`;

  if (leads.length === 0) {
    tbody.innerHTML = '';
    emptyBox.style.display = 'flex';
    return;
  }

  emptyBox.style.display = 'none';
  tbody.innerHTML = leads.map((lead) => {
    return `
      <tr>
        <td style="font-family: monospace; font-weight: 700; color: #38bdf8;">${lead.id}</td>
        <td style="font-size: 0.78rem; color: #94a3b8;">${lead.formattedDate || ''}</td>
        <td style="font-weight: 700; color: #ffffff;">${escapeHtml(lead.name || '')}</td>
        <td>
          <div style="font-size: 0.82rem; color: #38bdf8;">${escapeHtml(lead.contact || '')}</div>
        </td>
        <td style="font-size: 0.8rem; color: #cbd5e1;">${escapeHtml(lead.position === 'Other' ? lead.otherPosition || 'Other' : lead.position || '—')}</td>
        <td><span style="color: #00e5ff;">${escapeHtml(lead.handle || '')}</span></td>
        <td style="font-size: 0.8rem; color: #cbd5e1; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(lead.message || '—')}</td>
        <td>
          <button type="button" class="btn-copy-lead" data-id="${lead.id}" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 0.25rem 0.6rem; border-radius: 6px; font-size: 0.72rem; cursor: pointer;">
            Copy
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Bind copy buttons
  tbody.querySelectorAll('.btn-copy-lead').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const lead = leads.find((l) => l.id === id);
      if (lead) {
        const role = lead.position === 'Other' ? lead.otherPosition || 'Other' : lead.position || '—';
        const text = `Highverz Lead [${lead.id}]\nName: ${lead.name}\nContact: ${lead.contact}\nPosition: ${role}\nLink: ${lead.handle}\nMessage: ${lead.message || 'None'}`;
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = 'Copy', 1500);
        });
      }
    });
  });
}

/**
 * Open Admin Leads Dashboard
 */
export function openAdminLeadsDashboard() {
  const overlay = document.getElementById('admin-leads-overlay');
  if (!overlay) return;

  renderAdminLeads();
  if (window.lenis) window.lenis.stop();
  overlay.classList.add('is-active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('enquiry-modal-open');
}

/**
 * Keyboard shortcuts (Shift + L opens Admin Leads Dashboard)
 */
let isKeyboardBound = false;
function bindKeyboardShortcuts() {
  if (isKeyboardBound) return;
  isKeyboardBound = true;
  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'L' || e.key === 'l')) {
      openAdminLeadsDashboard();
    }
  });
}

/**
 * Exports all leads to a formatted CSV file
 */
function exportLeadsToCSV() {
  const leads = getStoredLeads();
  if (leads.length === 0) {
    alert('No leads available to export.');
    return;
  }

  const headers = ['Lead ID', 'Date Submitted', 'Type', 'Position', 'Other Position', 'Client Name', 'Email or WhatsApp', 'Social or Website Link', 'Message', 'Source Page'];

  const rows = leads.map((l) => [
    `"${l.id}"`,
    `"${l.formattedDate || ''}"`,
    `"${(l.type || '').replace(/"/g, '""')}"`,
    `"${(l.position || '').replace(/"/g, '""')}"`,
    `"${(l.otherPosition || '').replace(/"/g, '""')}"`,
    `"${(l.name || '').replace(/"/g, '""')}"`,
    `"${(l.contact || '').replace(/"/g, '""')}"`,
    `"${(l.handle || '').replace(/"/g, '""')}"`,
    `"${(l.message || '').replace(/"/g, '""')}"`,
    `"${(l.sourceUrl || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `highverz-leads-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
