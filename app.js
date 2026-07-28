(function () {
  'use strict';

  var SUPABASE_URL = 'https://sfiflidnsrdotoidvcmh.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_F9QbR2X9iJp62lf3aJnh8w_NXlYl3aD';
  var VALID_AMOUNTS = ['10萬-20萬', '20萬-30萬', '30萬-50萬', '50萬-100萬'];
  var STORAGE_KEY = 'd_project_c_selected_amount';
  var ENTERPRISE_LINE_ID = '';
  var ENTERPRISE_LINE_URL = 'https://lin.ee/591VM3X';
  var FALLBACK_PIXEL_IDS = ['975921495153095', '1738086803985039'];
  var initializedPixelIds = {};
  var pageViewTracked = false;

  function safeSessionGet(key) {
    try { return sessionStorage.getItem(key) || ''; } catch (error) { return ''; }
  }

  function safeSessionSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch (error) { /* session storage is optional */ }
  }

  function getTrackingParams() {
    var source = new URLSearchParams(window.location.search);
    var allowed = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'source', 'fbclid', 'ttclid'];
    var target = new URLSearchParams();
    allowed.forEach(function (key) {
      var value = source.get(key);
      if (value) target.set(key, value);
    });
    return target;
  }

  function getTrafficSource() {
    var params = new URLSearchParams(window.location.search);
    var explicit = (params.get('utm_source') || params.get('source') || '').trim();
    if (explicit) return explicit.slice(0, 80);
    if (params.get('fbclid')) return 'FB';
    if (params.get('ttclid')) return 'TikTok';
    return '';
  }

  function createLeadId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (char) {
      var random = Math.random() * 16 | 0;
      var value = char === 'x' ? random : (random & 3 | 8);
      return value.toString(16);
    });
  }

  function installFbPixelBase() {
    if (window.fbq) return;
    var fbq = function () {
      fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
    };
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    var firstScript = document.getElementsByTagName('script')[0];
    firstScript.parentNode.insertBefore(script, firstScript);
  }

  function initializeFbPixels(pixelIds) {
    installFbPixelBase();
    var newlyInitializedIds = [];
    pixelIds.forEach(function (pixelId) {
      var normalized = String(pixelId || '').trim();
      if (!/^\d{8,20}$/.test(normalized) || initializedPixelIds[normalized]) return;
      window.fbq('init', normalized);
      initializedPixelIds[normalized] = true;
      newlyInitializedIds.push(normalized);
    });
    if (!pageViewTracked && newlyInitializedIds.length) {
      newlyInitializedIds.forEach(function (pixelId) {
        window.fbq('trackSingle', pixelId, 'PageView');
      });
      pageViewTracked = true;
      return;
    }
    if (pageViewTracked) {
      newlyInitializedIds.forEach(function (pixelId) {
        window.fbq('trackSingle', pixelId, 'PageView');
      });
    }
  }

  function trackFbEvent(eventName, parameters) {
    if (typeof window.fbq !== 'function') return;
    Object.keys(initializedPixelIds).forEach(function (pixelId) {
      window.fbq('trackSingle', pixelId, eventName, parameters || {});
    });
  }

  function extractFbPixelIds(pixelSettings) {
    if (!Array.isArray(pixelSettings)) return [];
    return pixelSettings.map(function (item) {
      if (typeof item === 'string' || typeof item === 'number') return String(item);
      if (!item || item.enabled === false) return '';
      var platform = String(item.platform || item.type || '').toLowerCase();
      if (platform.includes('tiktok')) return '';
      return String(item.id || item.pixel_id || item.pixelId || '');
    }).filter(function (id) { return /^\d{8,20}$/.test(id.trim()); });
  }

  function applyLineConfig() {
    var lineButton = document.getElementById('line-add-button');
    var lineIdText = document.getElementById('line-id-text');
    var lineIdLabel = lineIdText ? lineIdText.closest('.line-id-label') : null;
    if (lineButton) lineButton.href = ENTERPRISE_LINE_URL;
    if (lineIdText) lineIdText.textContent = ENTERPRISE_LINE_ID;
    if (lineIdLabel) lineIdLabel.hidden = !ENTERPRISE_LINE_ID;
  }

  async function loadSiteConfig() {
    try {
      var response = await fetch(SUPABASE_URL + '/rest/v1/site_settings?id=eq.1&select=line_url,line_id,pixel_ids', {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: 'Bearer ' + SUPABASE_PUBLISHABLE_KEY
        }
      });
      if (!response.ok) throw new Error('Settings unavailable');
      var rows = await response.json();
      var settings = rows && rows[0] ? rows[0] : {};
      if (settings.line_url) {
        ENTERPRISE_LINE_URL = String(settings.line_url).trim();
        ENTERPRISE_LINE_ID = /^https:\/\/lin\.ee\//i.test(ENTERPRISE_LINE_URL)
          ? ''
          : String(settings.line_id || '').trim();
      }
      var configuredPixelIds = extractFbPixelIds(settings.pixel_ids);
      initializeFbPixels(configuredPixelIds.length ? configuredPixelIds : FALLBACK_PIXEL_IDS);
    } catch (error) {
      initializeFbPixels(FALLBACK_PIXEL_IDS);
    }
    applyLineConfig();
  }

  initializeFbPixels(FALLBACK_PIXEL_IDS);
  var siteConfigPromise = loadSiteConfig();

  function initAmountPage() {
    var optionButtons = Array.prototype.slice.call(document.querySelectorAll('.amount-option'));
    var continueButton = document.getElementById('amount-continue');
    var message = document.getElementById('selection-message');
    var selectedAmount = '';

    function renderSelection() {
      optionButtons.forEach(function (button) {
        var isSelected = button.getAttribute('data-amount') === selectedAmount;
        button.classList.toggle('selected', isSelected);
        button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });

      if (selectedAmount) {
        continueButton.disabled = false;
        continueButton.textContent = '選擇 ' + selectedAmount + '，繼續';
        message.innerHTML = '<span>已選擇金額</span><strong>' + selectedAmount + '</strong>';
        message.classList.add('ready');
      } else {
        continueButton.disabled = true;
        continueButton.textContent = '選好金額後繼續';
        message.innerHTML = '<span>尚未選擇金額</span><strong>選一個額度開始</strong>';
        message.classList.remove('ready');
      }
    }

    optionButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        selectedAmount = button.getAttribute('data-amount') || '';
        safeSessionSet(STORAGE_KEY, selectedAmount);
        renderSelection();
      });
    });

    continueButton.addEventListener('click', function () {
      if (!VALID_AMOUNTS.includes(selectedAmount)) return;
      var params = getTrackingParams();
      params.set('amount', selectedAmount);
      params.set('v', '2026072703');
      window.location.href = 'apply.html?' + params.toString();
    });

    var restored = safeSessionGet(STORAGE_KEY);
    if (VALID_AMOUNTS.includes(restored)) selectedAmount = restored;
    renderSelection();
  }

  function initApplyPage() {
    var params = new URLSearchParams(window.location.search);
    var selectedAmount = params.get('amount') || safeSessionGet(STORAGE_KEY);
    var amountDisplay = document.getElementById('selected-amount');
    var successAmount = document.getElementById('success-amount');
    var form = document.getElementById('lead-form');
    var layout = document.getElementById('application-layout');
    var successPanel = document.getElementById('success-panel');
    var submitButton = document.getElementById('submit-button');
    var formStatus = document.getElementById('form-status');
    var lineButton = document.getElementById('line-add-button');
    var lineNameToSend = document.getElementById('line-name-to-send');
    var copyLineNameButton = document.getElementById('copy-line-name-button');
    var copyLineNameStatus = document.getElementById('copy-line-name-status');
    var ageInput = document.getElementById('age');
    var warningInputs = form.querySelectorAll('input[name="warning_account"]');
    var warningHelp = document.getElementById('warning-help');
    var editLinks = [document.getElementById('edit-amount-link'), document.getElementById('change-amount-link')];
    var submittedApplicantName = '';

    var backParams = getTrackingParams();
    var backUrl = 'index.html' + (backParams.toString() ? '?' + backParams.toString() : '');
    editLinks.forEach(function (link) { if (link) link.href = backUrl; });

    ageInput.addEventListener('input', function () {
      ageInput.value = ageInput.value.replace(/\D/g, '').slice(0, 3);
    });

    warningInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        var isWarningAccount = input.value === '警示戶' && input.checked;
        warningHelp.textContent = isWarningAccount
          ? '警示戶目前不符合辦理條件，無法送出申請。'
          : '本服務僅受理非警示戶申請。';
        warningHelp.classList.toggle('is-rejected', isWarningAccount);
        submitButton.disabled = isWarningAccount || !VALID_AMOUNTS.includes(selectedAmount);
        if (isWarningAccount) {
          showFieldError('warning_account', '警示戶目前無法辦理。');
        } else {
          var warningError = form.querySelector('[data-error-for="warning_account"]');
          if (warningError) warningError.textContent = '';
        }
      });
    });

    if (!VALID_AMOUNTS.includes(selectedAmount)) {
      amountDisplay.textContent = '請重新選擇';
      submitButton.disabled = true;
      formStatus.textContent = '尚未選擇需求金額，請返回上一頁選擇。';
    } else {
      safeSessionSet(STORAGE_KEY, selectedAmount);
      amountDisplay.textContent = selectedAmount;
      successAmount.textContent = selectedAmount;
    }

    function clearErrors() {
      Array.prototype.forEach.call(form.querySelectorAll('.field-error'), function (element) { element.textContent = ''; });
      Array.prototype.forEach.call(form.querySelectorAll('input.invalid'), function (element) { element.classList.remove('invalid'); });
      formStatus.textContent = '';
    }

    function showFieldError(name, text) {
      var errorElement = form.querySelector('[data-error-for="' + name + '"]');
      var inputElement = form.elements[name];
      if (errorElement) errorElement.textContent = text;
      if (inputElement && inputElement.classList) inputElement.classList.add('invalid');
    }

    function readAndValidate() {
      clearErrors();
      var data = new FormData(form);
      var values = {
        name: String(data.get('name') || '').trim(),
        age: String(data.get('age') || '').trim(),
        warningAccount: String(data.get('warning_account') || '')
      };
      var valid = true;
      var ageNumber = Number(values.age);

      if (!values.name) { showFieldError('name', '請填寫姓名。'); valid = false; }
      if (!/^\d{1,3}$/.test(values.age) || ageNumber < 1 || ageNumber > 120) {
        showFieldError('age', '請填寫正確年齡。');
        valid = false;
      }
      if (!values.warningAccount) { showFieldError('warning_account', '請選擇是否為警示戶。'); valid = false; }
      if (values.warningAccount === '警示戶') {
        showFieldError('warning_account', '警示戶目前無法辦理。');
        formStatus.textContent = '此服務僅受理非警示戶，資料不會送出。';
        valid = false;
      }
      if (!VALID_AMOUNTS.includes(selectedAmount)) { formStatus.textContent = '請先返回上一頁選擇需求金額。'; valid = false; }

      return valid ? values : null;
    }

    function detectClientDevice(userAgent) {
      var ua = String(userAgent || '');
      if (/iPad|Tablet/i.test(ua)) return '平板';
      if (/iPhone|iPod/i.test(ua)) return '手機（iPhone）';
      if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? '手機（Android）' : '平板（Android）';
      if (/Windows/i.test(ua)) return '桌機（Windows）';
      if (/Macintosh|Mac OS X/i.test(ua)) return '桌機（macOS）';
      if (/Linux/i.test(ua)) return '桌機（Linux）';
      return '其他設備';
    }

    function detectClientBrowser(userAgent) {
      var ua = String(userAgent || '');
      if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook 內建瀏覽器';
      if (/Instagram/i.test(ua)) return 'Instagram 內建瀏覽器';
      if (/Line\//i.test(ua)) return 'LINE 內建瀏覽器';
      if (/Edg\//i.test(ua)) return 'Microsoft Edge';
      if (/CriOS\//i.test(ua)) return 'Google Chrome（iOS）';
      if (/Chrome\//i.test(ua)) return 'Google Chrome';
      if (/FxiOS\//i.test(ua)) return 'Firefox（iOS）';
      if (/Firefox\//i.test(ua)) return 'Firefox';
      if (/Safari\//i.test(ua)) return 'Safari';
      return '其他瀏覽器';
    }

    async function collectClientMetadata() {
      var userAgent = navigator.userAgent || '';
      var metadata = {
        ip_address: '',
        device_type: detectClientDevice(userAgent),
        browser_name: detectClientBrowser(userAgent)
      };
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 2500) : null;
      try {
        var response = await fetch('https://api64.ipify.org?format=json', {
          cache: 'no-store',
          signal: controller ? controller.signal : undefined
        });
        if (response.ok) {
          var result = await response.json();
          metadata.ip_address = String(result.ip || '').trim();
        }
      } catch (error) {
        console.warn('IP lookup unavailable', error);
      } finally {
        if (timer) clearTimeout(timer);
      }
      return metadata;
    }

    var clientMetadataPromise = collectClientMetadata();

    async function submitLeadPayload(payload) {
      var options = {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: 'Bearer ' + SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(payload)
      };

      var optionalFields = ['traffic_source', 'ip_address', 'device_type', 'browser_name'];
      var response;
      for (var attempt = 0; attempt <= optionalFields.length; attempt += 1) {
        response = await fetch(SUPABASE_URL + '/rest/v1/leads', options);
        if (response.ok) return response;
        var errorText = await response.clone().text();
        var fallback = JSON.parse(options.body);
        var removedField = false;
        optionalFields.forEach(function (field) {
          if (Object.prototype.hasOwnProperty.call(fallback, field) && errorText.includes(field)) {
            delete fallback[field];
            removedField = true;
          }
        });
        if (!removedField) return response;
        options.body = JSON.stringify(fallback);
      }
      return response;
    }

    async function markLineClicked() {
      if (!window.__lastLeadId) return;
      try {
        await fetch(SUPABASE_URL + '/rest/v1/rpc/mark_line_clicked', {
          method: 'POST',
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: 'Bearer ' + SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ lead_id: window.__lastLeadId })
        });
      } catch (error) { /* LINE still opens if click tracking is unavailable */ }
    }

    async function copyApplicantName() {
      var name = submittedApplicantName || String(form.elements.name.value || '').trim();
      if (!name) {
        if (copyLineNameStatus) copyLineNameStatus.textContent = '請先確認姓名後再加入 LINE。';
        return false;
      }

      var copied = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(name);
          copied = true;
        }
      } catch (error) { /* use the fallback below */ }

      if (!copied) {
        try {
          var textarea = document.createElement('textarea');
          textarea.value = name;
          textarea.setAttribute('readonly', '');
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          copied = document.execCommand('copy');
          textarea.remove();
        } catch (error) { copied = false; }
      }

      if (copyLineNameStatus) {
        copyLineNameStatus.textContent = copied
          ? '姓名已複製，進入 LINE 後貼上並發送。'
          : '請進入 LINE 後手動輸入並發送上方姓名。';
      }
      return copied;
    }

    if (copyLineNameButton) {
      copyLineNameButton.addEventListener('click', copyApplicantName);
    }

    if (lineButton) {
      lineButton.addEventListener('click', function () {
        copyApplicantName();
        markLineClicked();
      });
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (submitButton.disabled) return;
      var values = readAndValidate();
      if (!values) return;

      submitButton.disabled = true;
      submitButton.textContent = '資料送出中，請稍候';
      formStatus.textContent = '';

      var clientMetadata = await clientMetadataPromise;
      var payload = {
        id: createLeadId(),
        name: values.name,
        age: values.age,
        city: '',
        id_number: '',
        phone: '',
        line_id: '',
        q1_existing_loan: '',
        q2_bank_status: values.warningAccount,
        q3_amount_needed: selectedAmount,
        q4_foreign_currency_account: '',
        source_url: window.location.href,
        traffic_source: getTrafficSource() || null,
        user_agent: navigator.userAgent,
        ip_address: clientMetadata.ip_address,
        device_type: clientMetadata.device_type,
        browser_name: clientMetadata.browser_name
      };

      try {
        var response = await submitLeadPayload(payload);
        if (!response.ok) throw new Error('Submission failed: ' + response.status);
        window.__lastLeadId = payload.id;
        submittedApplicantName = values.name;
        if (lineNameToSend) lineNameToSend.textContent = submittedApplicantName;
        if (copyLineNameStatus) copyLineNameStatus.textContent = '點擊下方按鈕會先複製姓名，再開啟 LINE。';
        if (Object.keys(initializedPixelIds).length) {
          trackFbEvent('CompleteRegistration', {
            content_name: 'D項目C版本',
            status: 'submitted'
          });
          trackFbEvent('Lead', {
            content_name: 'D項目C版本',
            content_category: '貸款申請',
            value: 0,
            currency: 'TWD'
          });
        }
        layout.hidden = true;
        successPanel.hidden = false;
        successPanel.focus({ preventScroll: true });
        successPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        console.warn('Lead submission failed', error);
        formStatus.textContent = '資料暫時無法送出，請稍後再試。你已填寫的內容仍保留在頁面中。';
        submitButton.disabled = false;
        submitButton.textContent = '重新送出資料';
      }
    });
  }

  var page = document.body.getAttribute('data-page');
  if (page === 'amount') initAmountPage();
  if (page === 'apply') initApplyPage();
})();
