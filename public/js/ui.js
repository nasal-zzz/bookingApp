/* ============================================================
   UI.JS — Global UI utilities
   Toast notifications, admin form validation, helpers
   Auto-loaded on every page.
   ============================================================ */

// ── TOAST SYSTEM ──
(function() {
  function ensureContainer() {
    var c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  window.showToast = function(title, msg, type, duration) {
    var container = ensureContainer();
    var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    var t = type || 'info';
    var d = duration || 5000;

    var el = document.createElement('div');
    el.className = 'toast-msg toast-' + t;
    el.innerHTML =
      '<span class="toast-icon">' + (icons[t] || 'ℹ️') + '</span>' +
      '<div class="toast-body">' +
        (title ? '<div class="toast-title">' + title + '</div>' : '') +
        (msg   ? '<div class="toast-sub">'   + msg   + '</div>' : '') +
      '</div>';

    container.appendChild(el);

    var timer = setTimeout(function() {
      el.classList.add('toast-out');
      setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, d);

    el.addEventListener('click', function() {
      clearTimeout(timer);
      el.classList.add('toast-out');
      setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    });
  };
})();

// ── ADMIN FORM VALIDATOR ──
// Usage: AdminValidator.init('#myForm', rules, onSuccess)
window.AdminValidator = (function() {

  var rules_store = {};

  function getVal(field) {
    if (field.type === 'checkbox') return field.checked ? 'checked' : '';
    return (field.value || '').trim();
  }

  function showError(field, msg) {
    field.classList.remove('admin-success');
    field.classList.add('admin-error');
    var fb = field.parentNode.querySelector('.admin-form-feedback');
    if (fb) { fb.className = 'admin-form-feedback error'; fb.innerHTML = '<i class="bi bi-exclamation-circle"></i> ' + msg; }
  }

  function showSuccess(field) {
    field.classList.remove('admin-error');
    field.classList.add('admin-success');
    var fb = field.parentNode.querySelector('.admin-form-feedback');
    if (fb) { fb.className = 'admin-form-feedback'; fb.textContent = ''; }
  }

  function clearState(field) {
    field.classList.remove('admin-error', 'admin-success');
    var fb = field.parentNode.querySelector('.admin-form-feedback');
    if (fb) { fb.className = 'admin-form-feedback'; fb.textContent = ''; }
  }

  function validateField(field, rule) {
    var val = getVal(field);

    if (rule.required && !val) { showError(field, rule.required === true ? 'This field is required.' : rule.required); return false; }
    if (val && rule.minLen && val.length < rule.minLen) { showError(field, 'Minimum ' + rule.minLen + ' characters required.'); return false; }
    if (val && rule.maxLen && val.length > rule.maxLen) { showError(field, 'Maximum ' + rule.maxLen + ' characters allowed.'); return false; }
    if (val && rule.min !== undefined && parseFloat(val) < rule.min) { showError(field, 'Must be at least ' + rule.min + '.'); return false; }
    if (val && rule.max !== undefined && parseFloat(val) > rule.max) { showError(field, 'Must be at most ' + rule.max + '.'); return false; }
    if (val && rule.pattern && !rule.pattern.test(val)) { showError(field, rule.patternMsg || 'Invalid format.'); return false; }
    if (val && rule.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { showError(field, 'Enter a valid email address.'); return false; }
    if (val && rule.type === 'phone' && !/^\d{10}$/.test(val.replace(/\D/g,''))) { showError(field, 'Enter a valid 10-digit phone number.'); return false; }
    if (val && rule.type === 'url' && !/^https?:\/\/.+/.test(val)) { showError(field, 'Enter a valid URL starting with http:// or https://'); return false; }
    if (val && rule.type === 'date') {
      var d = new Date(val);
      if (isNaN(d.getTime())) { showError(field, 'Enter a valid date.'); return false; }
      if (rule.futureOnly && d < new Date()) { showError(field, 'Date must be in the future.'); return false; }
      if (rule.pastAllowed === false && d < new Date()) { showError(field, 'Date cannot be in the past.'); return false; }
      if (rule.afterField) {
        var other = document.querySelector('[name="' + rule.afterField + '"]');
        if (other && other.value && d <= new Date(other.value)) { showError(field, 'Must be after ' + (rule.afterLabel || rule.afterField) + '.'); return false; }
      }
    }
    if (val && rule.type === 'time' && !/^\d{2}:\d{2}$/.test(val)) { showError(field, 'Enter a valid time (HH:MM).'); return false; }
    if (val && rule.type === 'number' && isNaN(parseFloat(val))) { showError(field, 'Enter a valid number.'); return false; }
    if (rule.custom) { var err = rule.custom(val, field); if (err) { showError(field, err); return false; } }

    if (val || rule.required) showSuccess(field);
    else clearState(field);
    return true;
  }

  return {
    init: function(formSelector, fieldRules, onSuccess) {
      var form = document.querySelector(formSelector);
      if (!form) return;

      rules_store[formSelector] = fieldRules;

      // Live validation on blur and input
      Object.keys(fieldRules).forEach(function(name) {
        var fields = form.querySelectorAll('[name="' + name + '"]');
        fields.forEach(function(field) {
          field.addEventListener('blur', function() { validateField(field, fieldRules[name]); });
          field.addEventListener('input', function() {
            // Only clear error on input, show success on blur
            if (field.classList.contains('admin-error')) {
              var val = getVal(field);
              if (val) clearState(field);
            }
          });
        });
      });

      // Submit validation
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var valid = true;
        Object.keys(fieldRules).forEach(function(name) {
          var field = form.querySelector('[name="' + name + '"]');
          if (field && !validateField(field, fieldRules[name])) valid = false;
        });
        if (valid && typeof onSuccess === 'function') onSuccess(form);
        else if (!valid) {
          var firstErr = form.querySelector('.admin-error');
          if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
          showToast('Check the form', 'Please fix the highlighted errors before saving.', 'error', 4000);
        }
      });
    },

    // Validate single field externally
    validateField: validateField,

    // Check if form is fully valid without submitting
    isValid: function(formSelector) {
      var form = document.querySelector(formSelector);
      var rules = rules_store[formSelector] || {};
      if (!form) return false;
      var valid = true;
      Object.keys(rules).forEach(function(name) {
        var field = form.querySelector('[name="' + name + '"]');
        if (field && !validateField(field, rules[name])) valid = false;
      });
      return valid;
    }
  };
})();

// ── DATE/TIME INPUT HELPERS ──
// Ensure datetime-local inputs can't go in the past
window.setMinDateTime = function(inputEl, offsetHours) {
  var d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  if (offsetHours) d.setHours(d.getHours() + offsetHours);
  inputEl.min = d.toISOString().slice(0, 16);
};

window.setMinDate = function(inputEl, offsetDays) {
  var d = new Date();
  d.setDate(d.getDate() + (offsetDays || 0));
  inputEl.min = d.toISOString().split('T')[0];
};