/* АЛАУ ТЕРМ — лёгкий JS для прогрессивного улучшения.
   Все формы и ссылки работают без JS; скрипт добавляет удобство. */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const chatMessages = $('#chat-messages');
  if (chatMessages) {
    let polling = false;
    setInterval(async () => {
      if (document.hidden || polling) return;
      polling = true;
      try {
        const response = await fetch(location.pathname + '?messages=1');
        if (response.ok) {
          const html = await response.text();
          if (chatMessages.innerHTML !== html) chatMessages.innerHTML = html;
        }
      } catch (_) {} finally { polling = false; }
    }, 8000);
  }
  const maxMb = Number(document.body.dataset.uploadMaxMb || 10);
  const maxFiles = Number(document.body.dataset.uploadMaxFiles || 5);

  const searchInput = $('#site-search');
  const suggestions = $('#search-suggestions');
  if (searchInput && suggestions) {
    let timer, controller, generation = 0;
    const close = () => { suggestions.hidden = true; searchInput.setAttribute('aria-expanded', 'false'); };
    searchInput.addEventListener('input', () => {
      clearTimeout(timer); controller?.abort(); const current = ++generation; close();
      const query = searchInput.value.trim();
      if (query.length < 2) { suggestions.replaceChildren(); return; }
      timer = setTimeout(async () => {
        controller = new AbortController();
        try {
          const response = await fetch(searchInput.dataset.suggestionsUrl + '?q=' + encodeURIComponent(query), {signal: controller.signal});
          if (!response.ok) return;
          const html = await response.text();
          if (current !== generation) return;
          suggestions.innerHTML = html;
          if (document.activeElement === searchInput) {
            suggestions.hidden = false; searchInput.setAttribute('aria-expanded', 'true');
          }
        } catch (_) { if (current === generation) close(); }
      }, 220);
    });
    searchInput.form.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { ++generation; controller?.abort(); close(); searchInput.focus(); }
      if (event.key === 'ArrowDown' && event.target === searchInput && !suggestions.hidden) {
        event.preventDefault(); $('a', suggestions)?.focus();
      }
    });
    searchInput.form.addEventListener('focusout', (event) => { if (!searchInput.form.contains(event.relatedTarget)) close(); });
    document.addEventListener('click', (event) => { if (!searchInput.form.contains(event.target)) close(); });
  }

  // --- Модальное окно обратного звонка (<dialog>) ---
  $$('[data-open-dialog]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const dialog = document.getElementById(btn.dataset.openDialog);
      if (!dialog || typeof dialog.showModal !== 'function') return; // без поддержки — переход по href
      e.preventDefault();
      if (btn.dataset.context) {
        const ctx = dialog.querySelector('[name=context]');
        if (ctx) ctx.value = btn.dataset.context;
      }
      if (btn.dataset.product) {
        const p = dialog.querySelector('[name=product]');
        if (p) p.value = btn.dataset.product;
      }
      dialog.showModal();
    });
  });
  // Закрытие по клику на подложку (fallback для closedby="any")
  $$('dialog.modal').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  });

  // --- Мобильное меню / фильтры / сайдбар кабинета ---
  $$('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.toggle);
      if (!target) return;
      const open = target.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });


  // Mobile filters reuse the desktop form; native dialog supplies focus trapping and Escape.
  const filterDialog = $('#filters-dialog');
  const filterPanel = $('#filters');
  const filterOpener = $('[data-open-filters]');
  if (filterDialog && filterPanel && filterOpener) {
    const home = document.createComment('filters home');
    filterPanel.before(home);
    const mobileFilters = window.matchMedia('(max-width: 900px)');
    filterOpener.addEventListener('click', () => {
      if (typeof filterDialog.showModal !== 'function') {
        filterPanel.classList.toggle('open');
        return;
      }
      $('[data-filters-slot]', filterDialog).append(filterPanel);
      filterDialog.showModal();
      document.body.classList.add('filters-modal-open');
    });
    $('[data-close-filters]', filterDialog).addEventListener('click', () => filterDialog.close());
    filterDialog.addEventListener('click', (event) => {
      if (event.target !== filterDialog) return;
      const bounds = filterDialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) filterDialog.close();
    });
    filterDialog.addEventListener('close', () => {
      home.parentNode.insertBefore(filterPanel, home.nextSibling);
      document.body.classList.remove('filters-modal-open');
    });
    mobileFilters.addEventListener('change', () => { if (filterDialog.open) filterDialog.close(); });
  }
  const buyForm = $('#product-buy-form');
  if (buyForm) {
    const quantity = $('[name=quantity]', buyForm);
    const mirror = $('[data-buy-quantity]');
    const syncQuantity = () => { if (mirror) mirror.textContent = quantity.value || '1'; };
    quantity.addEventListener('input', syncQuantity);
    quantity.addEventListener('change', syncQuantity);
    syncQuantity();
  }

  // --- Автоотправка (сортировка, город) ---
  $$('[data-autosubmit]').forEach((el) => el.addEventListener('change', () => el.form && el.form.submit()));

  // --- Кол-во (+/−) ---
  $$('.qty').forEach((box) => {
    const input = $('input', box);
    $$('button[data-step]', box).forEach((b) => b.addEventListener('click', () => {
      const v = Math.max(1, (parseInt(input.value, 10) || 1) + Number(b.dataset.step));
      input.value = v;
      input.dispatchEvent(new Event('change'));
    }));
  });

  // --- Зоны загрузки файлов: список выбранных файлов и проверка лимитов ---
  $$('.dropzone').forEach((zone) => {
    const input = $('input[type=file]', zone);
    const list = zone.parentElement.querySelector('.file-list');
    const err = zone.parentElement.querySelector('.field-error[data-js]');
    if (!input) return;
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.add('is-dragover')));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('is-dragover')));
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      const limit = Number(input.dataset.maxFiles || maxFiles);
      const problems = [];
      if (files.length > limit) problems.push(`Не более ${limit} файлов.`);
      files.forEach((f) => { if (f.size > maxMb * 1024 * 1024) problems.push(`«${f.name}» больше ${maxMb} МБ.`); });
      if (list) {
        list.innerHTML = '';
        files.forEach((f) => {
          const li = document.createElement('li');
          li.textContent = `📎 ${f.name} · ${(f.size / 1024 / 1024).toFixed(1)} МБ`;
          list.appendChild(li);
        });
      }
      if (err) err.textContent = problems.join(' ');
      input.setCustomValidity(problems.join(' '));
    });
  });

  // --- Пошаговый опросник сервиса ---
  $$('[data-steps]').forEach((form) => {
    const steps = $$('.step', form);
    const nav = $$('.steps-nav span', form);
    if (steps.length < 2) return;
    let current = 0;
    const show = (i) => {
      steps.forEach((s, n) => { s.hidden = n !== i; });
      nav.forEach((s, n) => s.classList.toggle('active', n <= i));
      current = i;
    };
    $$('[data-next]', form).forEach((b) => b.addEventListener('click', () => {
      const fields = $$('input, select, textarea', steps[current]);
      const invalid = fields.find((f) => !f.checkValidity());
      if (invalid) { invalid.reportValidity(); return; }
      show(Math.min(current + 1, steps.length - 1));
    }));
    $$('[data-prev]', form).forEach((b) => b.addEventListener('click', () => show(Math.max(current - 1, 0))));
    // при серверной ошибке показываем шаг с первой ошибкой
    const errStep = steps.findIndex((s) => s.querySelector('.errorlist, .field-error:not(:empty)'));
    show(errStep >= 0 ? errStep : 0);
  });

  // --- «Не знаю модель» блокирует поле модели ---
  $$('[data-disable-target]').forEach((cb) => {
    const target = document.getElementById(cb.dataset.disableTarget);
    const sync = () => { if (target) { target.disabled = cb.checked; if (cb.checked) target.value = ''; } };
    cb.addEventListener('change', sync); sync();
  });

  // --- Материалы в мобильном отчёте ---
  const matList = $('#materials');
  const addMat = $('#add-material');
  if (matList && addMat) {
    const tpl = $('#material-template');
    addMat.addEventListener('click', () => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      matList.appendChild(node);
      $('input', node).focus();
    });
    matList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-row]');
      if (btn) btn.closest('.material-row').remove();
    });
  }

  // --- Счётчики символов ---
  $$('textarea[maxlength]').forEach((t) => {
    const counter = t.parentElement.querySelector('[data-counter]');
    if (!counter) return;
    const upd = () => { counter.textContent = `${t.value.length}/${t.maxLength}`; };
    t.addEventListener('input', upd); upd();
  });

  // --- Поле «причина»: обязательно для отдельных статусов ---
  $$('[data-reason-for]').forEach((select) => {
    const needs = select.dataset.reasonFor.split(',');
    const reason = document.getElementById(select.dataset.reasonInput);
    const sync = () => { if (reason) { const req = needs.includes(select.value); reason.required = req; reason.closest('.field, .reason-wrap').hidden = !req; } };
    select.addEventListener('change', sync); sync();
  });

  // --- Подтверждение необратимых действий ---
  $$('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => {
    if (!window.confirm(f.dataset.confirm)) e.preventDefault();
  }));

  // --- Поиск товара для менеджера (datalist) ---
  $$('[data-product-search]').forEach((input) => {
    const list = document.getElementById(input.getAttribute('list'));
    const selected = input.form.querySelector('[name=product_id]');
    let timer;
    let generation = 0;
    const syncSelection = () => {
      if (!selected) return;
      const match = Array.from(list.options).find((o) => o.value === input.value);
      selected.value = match ? match.dataset.productId : '';
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const current = ++generation;
      syncSelection();
      if (selected && selected.value) return;
      const q = input.value.trim();
      if (q.length < 2) { list.innerHTML = ''; return; }
      timer = setTimeout(async () => {
        try {
          const res = await fetch(`${input.dataset.productSearch}?q=${encodeURIComponent(q)}`, { credentials: 'same-origin' });
          const data = await res.json();
          if (current !== generation) return;
          list.innerHTML = '';
          data.results.forEach((r) => {
            const opt = document.createElement('option');
            opt.value = `${r.sku} — ${r.name} [${r.id}]`;
            opt.dataset.productId = String(r.id);
            opt.label = `${r.name}${r.price ? ' · ' + Number(r.price).toLocaleString('ru-RU') + ' ₸' : ' · по запросу'}`;
            list.appendChild(opt);
          });
        } catch (_) { /* поиск — только подсказка */ }
      }, 250);
    });
  });

  // --- aria-invalid синхронно с :user-invalid ---
  const syncAria = (el) => {
    if (!el.matches || !el.matches('input, select, textarea')) return;
    let invalid = false;
    try { invalid = el.matches(':user-invalid'); } catch (_) { invalid = el.dataset.touched === '1' && !el.checkValidity(); }
    el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  };
  document.addEventListener('blur', (e) => { if (e.target.dataset) { e.target.dataset.touched = '1'; syncAria(e.target); } }, true);
  document.addEventListener('input', (e) => syncAria(e.target), true);
  document.addEventListener('invalid', (e) => { if (e.target.dataset) { e.target.dataset.touched = '1'; e.target.setAttribute('aria-invalid', 'true'); } }, true);

  // --- Двойная отправка форм ---
  $$('form[method=post]').forEach((f) => f.addEventListener('submit', (e) => {
    if (e.defaultPrevented) return;
    const btn = e.submitter;
    if (btn && btn.name !== 'action') { setTimeout(() => { btn.disabled = true; }, 0); }
  }));
})();
