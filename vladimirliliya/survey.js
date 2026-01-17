/* Отправка "Опросника для гостей" в backend (/api/rsvp).
 * Дизайн не трогаем — работаем только с данными и сообщениями.
 */
(function () {
  'use strict';

  function qs(id) { return document.getElementById(id); }

  async function postJSON(url, payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!res.ok) {
      const msg = (data && (data.detail || data.message)) || ('Ошибка отправки: HTTP ' + res.status);
      throw new Error(msg);
    }
    return data;
  }

  document.addEventListener('DOMContentLoaded', function () {
    const form = qs('rsvp-form');
    if (!form) return;

    const successBox = qs('rsvp-success');
    const errorBox = qs('rsvp-error');
    const btn = form.querySelector('button[type="submit"]');

    function showSuccess(msg) {
      if (errorBox) { errorBox.style.display = 'none'; errorBox.textContent = ''; }
      if (successBox) { successBox.style.display = 'block'; if (msg) successBox.textContent = msg; }
    }
    function showError(msg) {
      if (successBox) { successBox.style.display = 'none'; }
      if (errorBox) { errorBox.style.display = 'block'; errorBox.textContent = msg || 'Ошибка'; }
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const fullNameEl = form.querySelector('input[name="full_name"]');
      const attendingEl = form.querySelector('input[name="attending"]:checked');

      const full_name = (fullNameEl && fullNameEl.value || '').trim();
      const attending_val = (attendingEl && attendingEl.value) ? String(attendingEl.value) : '';
      const attending = attending_val === 'yes';

      if (!full_name) {
        showError('Пожалуйста, укажите имя и фамилию.');
        if (fullNameEl) fullNameEl.focus();
        return;
      }

      if (!attending_val) {
        showError('Пожалуйста, выберите вариант ответа.');
        return;
      }

      if (btn) { btn.disabled = true; btn.style.opacity = '0.75'; }

      try {
        const resp = await postJSON('/api/rsvp', { full_name: full_name, attending: attending });
        const msg = (resp && resp.message) ? resp.message : null;
        showSuccess(msg);
        form.reset();
      } catch (err) {
        showError(err && err.message ? err.message : 'Ошибка отправки.');
      } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = ''; }
      }
    });
  });
})();
