/* Автокалендарь: рисует сетку календаря по дате свадьбы из content.json
 * и автоматически переставляет сердечко.
 *
 * Настройки в content.json:
 * {
 *   "wedding": { "date": "YYYY-MM-DD" },
 *   "calendar": {
 *     "enabled": true,
 *     "weddingDate": "YYYY-MM-DD", // если нет wedding.date
 *     "monthTitleElemId": "...",   // текст с названием месяца (например, АПРЕЛЬ)
 *     "yearElemId": "...",         // текст с годом
 *     "calligraphyElemId": "...",  // элемент с каллиграфической датой (был картинкой)
 *     "heartElemId": "...",        // картинка-сердечко
 *     "bucket": 1,
 *     "weekStartsOn": "monday",
 *
 *     // НОВОЕ:
 *     // calligraphyMode:
 *     //   "canvas_image" (по умолчанию) — рисуем дату в canvas и подставляем PNG
 *     //   "static_image"              — НЕ генерируем, оставляем обычную картинку
 *     // calligraphyStaticUrl:
 *     //   "/img/mydate.png" — если задано и включен static_image, подставим этот src
 *     "calligraphyMode": "canvas_image",
 *     "calligraphyStaticUrl": ""
 *   }
 * }
 */

(function () {
  'use strict';

  var MS_DAY = 24 * 60 * 60 * 1000;

  function byElemId(id) {
    return document.querySelector('.tn-elem[data-elem-id="' + id + '"]');
  }

  function findHeartElem(cfg) {
    // 1) по явному elemId из content.json
    var heartId = cfg && cfg.heartElemId ? String(cfg.heartElemId) : '';
    var el = heartId ? byElemId(heartId) : null;
    if (el) return el;

    // 2) fallback: ищем картинку сердечка по имени файла (s.png).
    // Важно: на странице может быть несколько одинаковых "s.png" (например, иконка сверху).
    // Поэтому выбираем НАИБОЛЬШЕЕ по площади — это и будет большое сердечко в календаре.
    var candidates = Array.prototype.slice.call(
      document.querySelectorAll('img[src*="s.png"], img[data-original*="s.png"], img[data-lazy*="s.png"]')
    );
    var bestWrap = null;
    var bestArea = -1;
    candidates.forEach(function (img) {
      var wrap = img.closest('.tn-elem');
      if (!wrap) return;
      // offsetWidth/Height — в координатах макета, без влияния transform-scale
      var area = (wrap.offsetWidth || 0) * (wrap.offsetHeight || 0);
      if (area > bestArea) {
        bestArea = area;
        bestWrap = wrap;
      }
    });
    if (bestWrap) return bestWrap;

    return null;
  }

  function getAtom(el) {
    if (!el) return null;
    return el.querySelector('.tn-atom');
  }

  function setAtomHtml(elemId, html) {
    var el = byElemId(elemId);
    var atom = getAtom(el);
    if (!atom) return;
    // Не трогаем ссылки
    if (atom.tagName && atom.tagName.toLowerCase() === 'a') return;
    atom.innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseISODate(s) {
    if (!s) return null;
    var m = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(String(s));
    if (!m) return null;
    var y = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10) - 1;
    var d = parseInt(m[3], 10);
    return new Date(Date.UTC(y, mo, d));
  }

  var MONTH_NOM_UP = [
    'ЯНВАРЬ','ФЕВРАЛЬ','МАРТ','АПРЕЛЬ','МАЙ','ИЮНЬ',
    'ИЮЛЬ','АВГУСТ','СЕНТЯБРЬ','ОКТЯБРЬ','НОЯБРЬ','ДЕКАБРЬ'
  ];

  var MONTH_GEN = [
    'января','февраля','марта','апреля','мая','июня',
    'июля','августа','сентября','октября','ноября','декабря'
  ];

  function formatMonthTitle(date) {
    return MONTH_NOM_UP[date.getUTCMonth()];
  }

  function formatCalligraphy(date) {
    return date.getUTCDate() + ' ' + MONTH_GEN[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
  }

  function getMondayIndex(date) {
    // JS: 0=воскресенье ... 6=суббота
    // Нужно: 0=понедельник ... 6=воскресенье
    return (date.getUTCDay() + 6) % 7;
  }

  function parseWhere(whereStr) {
    // "top=1209.0, left=431.0"
    var res = { top: 0, left: 0 };
    if (!whereStr) return res;
    var mt = /top=([\-\d.]+)/.exec(whereStr);
    var ml = /left=([\-\d.]+)/.exec(whereStr);
    if (mt) res.top = parseFloat(mt[1]);
    if (ml) res.left = parseFloat(ml[1]);
    return res;
  }

  function pickSectionByBucket(data, bucket) {
    if (!data || !data.sections) return null;
    for (var i = 0; i < data.sections.length; i++) {
      if (String(data.sections[i].bucket) === String(bucket)) return data.sections[i];
    }
    return null;
  }

  function collectDayCellDefs(data, bucket) {
    var sec = pickSectionByBucket(data, bucket);
    if (!sec || !sec.texts) return [];

    var cells = [];
    for (var i = 0; i < sec.texts.length; i++) {
      var t = sec.texts[i];
      var prev = (t.preview || '').toString().trim();
      if (!/^\d{1,2}$/.test(prev)) continue;

      var elemId = String(t.elemId);

      // Берём реальные координаты из DOM (так надёжнее, чем сохранённые "where" из json)
      var el = byElemId(elemId);
      if (el) {
        var r = el.getBoundingClientRect();
        cells.push({
          elemId: elemId,
          top: r.top + (window.pageYOffset || document.documentElement.scrollTop || 0),
          left: r.left + (window.pageXOffset || document.documentElement.scrollLeft || 0)
        });
      } else {
        var pos = parseWhere(t.where);
        cells.push({ elemId: elemId, top: pos.top, left: pos.left });
      }
    }

    // Сортируем: сверху вниз, слева направо
    cells.sort(function (a, b) {
      if (a.top !== b.top) return a.top - b.top;
      return a.left - b.left;
    });

    // Группируем по "рядам" с допуском по top (в исходной вёрстке у ПН часто top на 1-3px отличается)
    function clusterByRows(tol) {
      var rows = [];
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j];
        var last = rows.length ? rows[rows.length - 1] : null;
        if (!last || Math.abs(c.top - last.top) > tol) {
          rows.push({ top: c.top, cells: [c] });
        } else {
          last.cells.push(c);
          // уточняем "средний top" ряда
          last.top = (last.top * (last.cells.length - 1) + c.top) / last.cells.length;
        }
      }
      // внутри ряда — слева направо
      for (var k = 0; k < rows.length; k++) {
        rows[k].cells.sort(function (a, b) { return a.left - b.left; });
      }
      // ряды — сверху вниз
      rows.sort(function (a, b) { return a.top - b.top; });
      return rows;
    }

    var expectedRows = Math.max(1, Math.round(cells.length / 7));
    var tolerances = [3, 5, 8, 12, 20];
    var bestRows = null;

    for (var ti = 0; ti < tolerances.length; ti++) {
      var rowsTry = clusterByRows(tolerances[ti]);
      var ok = (rowsTry.length === expectedRows);
      if (ok) {
        for (var ri = 0; ri < rowsTry.length; ri++) {
          if (rowsTry[ri].cells.length !== 7) { ok = false; break; }
        }
      }
      bestRows = rowsTry;
      if (ok) break;
    }

    // Разворачиваем обратно в список ячеек в порядке "строка за строкой"
    var flat = [];
    for (var rj = 0; rj < bestRows.length; rj++) {
      for (var cj = 0; cj < bestRows[rj].cells.length; cj++) {
        flat.push(bestRows[rj].cells[cj]);
      }
    }

    return flat;
  }

  function ensureCalligraphyFontInjected() {
    if (document.getElementById('wedding-calligraphy-font')) return;

    var style = document.createElement('style');
    style.id = 'wedding-calligraphy-font';
    style.type = 'text/css';
    style.textContent = [
      "/* Шрифт для каллиграфической даты (рисуем картинкой через canvas) */",
      "@font-face{font-family:'WeddingCalligraphy';src:url('/assets/fonts/wedding-calligraphy.woff2') format('woff2');font-display:swap;}"
    ].join('\n');

    document.head.appendChild(style);
  }

  function getCalligraphyImg(elemId) {
    var el = byElemId(elemId);
    if (!el) return null;
    var atom = getAtom(el);
    if (!atom) return null;

    var img = atom.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = '';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.display = 'block';
      atom.innerHTML = '';
      atom.appendChild(img);
    }
    return img;
  }

  // НОВОЕ: в static_image режиме мы НЕ генерируем дату, а оставляем обычную картинку.
  // Если передан url — подставляем его, иначе вообще ничего не трогаем.
  function setStaticCalligraphyImage(elemId, url) {
    if (!elemId) return;
    var el = byElemId(elemId);
    if (!el) return;
    var atom = getAtom(el);
    if (!atom) return;
    if (atom.tagName && atom.tagName.toLowerCase() === 'a') return;

    var img = atom.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = '';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.display = 'block';
      atom.innerHTML = '';
      atom.appendChild(img);
    }

    // Важно: отключаем ключ генерации, чтобы не оставалось кеша от canvas-режима
    try { delete img.dataset.weddingKey; } catch (e) {}

    if (url) {
      var current = img.getAttribute('data-original') || img.getAttribute('src') || '';
      if (current !== url) {
        img.src = url;
        img.setAttribute('data-original', url);
      }
    }
  }

  function parseRgbColor(str) {
    // rgb(255, 255, 218) / rgba(255, 255, 218, 1)
    var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(str || '');
    if (!m) return null;
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  }

  function hexToRgb(hex) {
    if (!hex) return null;
    var h = hex.replace('#', '').trim();
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    if (h.length !== 6) return null;
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ];
  }

  function colorsClose(a, b, tol) {
    if (!a || !b) return false;
    return (
      Math.abs(a[0] - b[0]) <= tol &&
      Math.abs(a[1] - b[1]) <= tol &&
      Math.abs(a[2] - b[2]) <= tol
    );
  }

  function drawCalligraphyPng(text, width, height) {
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(width));
    var h = Math.max(1, Math.round(height));

    var canvas = document.createElement('canvas');
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Подбираем размер шрифта под блок (делаем тоньше и ближе к оригиналу)
    var fontSize = Math.max(10, Math.round(h * 0.72));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    function setFont(fs) {
      // 'Saint' уже используется на сайте (Tilda), он ближе к оригинальному "прописному" стилю.
      ctx.font = fs + "px 'Saint', 'WeddingCalligraphy', 'Lobster', cursive";
    }

    setFont(fontSize);
    // Уменьшаем, пока текст не влезет
    for (var k = 0; k < 12; k++) {
      var tw = ctx.measureText(text).width;
      if (tw <= w * 0.96) break;
      fontSize = Math.max(10, Math.round(fontSize * 0.93));
      setFont(fontSize);
    }

    // Лёгкая "рукописность": небольшой наклон + едва заметная дрожь,
    // но без двойного контура/обводки.
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.02); // ~ -1.1 градуса
    ctx.translate(-w / 2, -h / 2);

    ctx.fillStyle = 'rgba(61, 61, 61, 0.92)';

    var x = w / 2;
    var y = h / 2;

    ctx.globalAlpha = 0.95;
    ctx.fillText(text, x, y);

    // Очень лёгкий второй проход (полупрозрачный), чтобы линия выглядела "живой"
    var jitter = Math.max(0.12, fontSize * 0.004);
    ctx.globalAlpha = 0.25;
    ctx.fillText(text, x + jitter, y - jitter * 0.35);

    ctx.globalAlpha = 1;
    ctx.restore();

    return canvas.toDataURL('image/png');
  }

  function setCalligraphyImage(elemId, date) {
    var img = getCalligraphyImg(elemId);
    if (!img) return;

    ensureCalligraphyFontInjected();

    var text = formatCalligraphy(date);

    // Размер берём из блока (так как это было "картинкой" фиксированного размера)
    var boxEl = byElemId(elemId) || img;
    var r = boxEl.getBoundingClientRect();
    var w = r && r.width ? r.width : 420;
    var h = r && r.height ? r.height : 70;

    var key = text + '|' + Math.round(w) + 'x' + Math.round(h) + '|' + (window.devicePixelRatio || 1);
    if (img.dataset.weddingKey === key) return;
    img.dataset.weddingKey = key;

    // Дожидаемся загрузки webfont, чтобы PNG был в "прописном" стиле
    if (document.fonts && document.fonts.load) {
      document.fonts.load(Math.max(10, Math.round(h * 0.72)) + "px Saint", text).then(function () {
        var dataUrl = drawCalligraphyPng(text, w, h);
        img.src = dataUrl;
        img.setAttribute('data-original', dataUrl);
      }).catch(function () {
        var dataUrl = drawCalligraphyPng(text, w, h);
        img.src = dataUrl;
        img.setAttribute('data-original', dataUrl);
      });
    } else {
      var dataUrl = drawCalligraphyPng(text, w, h);
      img.src = dataUrl;
      img.setAttribute('data-original', dataUrl);
    }
  }

  function getOffsetRect(el, relativeTo) {
    // Координаты в СИСТЕМЕ МАКЕТА (offset), чтобы корректно работать с tilda transform:scale
    if (!el) return null;
    if (!relativeTo) {
      return {
        left: el.offsetLeft || 0,
        top: el.offsetTop || 0,
        width: el.offsetWidth || 0,
        height: el.offsetHeight || 0
      };
    }

    var x = 0;
    var y = 0;
    var cur = el;
    // суммируем offsetLeft/Top до нужного контейнера
    while (cur && cur !== relativeTo) {
      x += cur.offsetLeft || 0;
      y += cur.offsetTop || 0;
      cur = cur.offsetParent;
    }

    if (cur !== relativeTo) {
      // fallback: если offsetParent цепочка не дошла (редко), используем boundingClientRect
      var r = el.getBoundingClientRect();
      var pr = relativeTo.getBoundingClientRect();
      return {
        left: r.left - pr.left,
        top: r.top - pr.top,
        width: r.width,
        height: r.height
      };
    }

    return {
      left: x,
      top: y,
      width: el.offsetWidth || 0,
      height: el.offsetHeight || 0
    };
  }

  function findClosestDayCellToHeart(dayElemIds, heartEl) {
    if (!heartEl || !dayElemIds || !dayElemIds.length) return null;
    var parent = heartEl.offsetParent || heartEl.parentElement;
    if (!parent) return null;

    var heartR = getOffsetRect(heartEl, parent);
    if (!heartR) return null;

    var hx = heartR.left + heartR.width / 2;
    var hy = heartR.top + heartR.height / 2;

    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < dayElemIds.length; i++) {
      var dayEl = byElemId(dayElemIds[i]);
      if (!dayEl) continue;
      var dayR = getOffsetRect(dayEl, parent);
      if (!dayR) continue;
      var dx = (dayR.left + dayR.width / 2) - hx;
      var dy = (dayR.top + dayR.height / 2) - hy;
      var dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = dayEl;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Сердечко для даты свадьбы (НОВАЯ реализация)
  // ---------------------------------------------------------------------------

  function removeLegacyHeartArtifacts() {
    try {
      var nodes = document.querySelectorAll('.wedding-heart-overlay, .wedding-heart-header, .wedding-heart-float');
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i] && nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
      }
      var st = document.getElementById('wedding-heart-overlay-style');
      if (st && st.parentNode) st.parentNode.removeChild(st);
    } catch (e) {}
  }

  function ensureWeddingHeartStyles() {
    if (document.getElementById("wedding-heart-css")) return;

    var style = document.createElement("style");
    style.id = "wedding-heart-css";
    style.type = "text/css";

    style.textContent = [
      ".wedding-day-cell{overflow:visible!important;}",
      ".wedding-day-cell .tn-atom{position:relative!important;overflow:visible!important;display:flex!important;align-items:center!important;justify-content:center!important;}",
      ".wedding-day-cell .wedding-heart-wrap{position:absolute;left:50%;top:50%;width:var(--wedding-heart-size,18px);height:var(--wedding-heart-size,18px);transform:translate(-50%,-55%);pointer-events:none;z-index:1;}",
      ".wedding-day-cell .wedding-heart-svg{width:100%;height:100%;display:block;shape-rendering:geometricPrecision;}",
      ".wedding-day-cell .wedding-heart-svg path{fill:var(--wedding-heart-color,#ff6f8a);}",
      ".wedding-day-cell .wedding-heart-num{position:relative;z-index:2;color:var(--wedding-heart-text,#ffffda)!important;line-height:1!important;font-weight:400!important;}",
      ".wedding-day-cell .tn-atom, .wedding-day-cell .tn-atom *{font-weight:400!important;}",
    ].join("\n");

    document.head.appendChild(style);
  }

  function applyCalendar(data) {
    if (!data) return;

    var cfg = data.calendar || {};
    if (cfg.enabled === false) return;

    var weddingDate = parseISODate((data.wedding && data.wedding.date) || cfg.weddingDate);
    if (!weddingDate) return;

    var monthId = String(cfg.monthTitleElemId || '1750147052249');
    var yearId = String(cfg.yearElemId || '1750147052255');
    var calligraphyId = String(cfg.calligraphyElemId || '1750146986794');
    var bucket = (cfg.bucket != null ? cfg.bucket : 1);

    // 1) Заголовки
    setAtomHtml(monthId, escapeHtml(formatMonthTitle(weddingDate)));
    setAtomHtml(yearId, escapeHtml(String(weddingDate.getUTCFullYear())));

    // 1.1) Каллиграфия: либо генерим PNG, либо оставляем обычную картинку
    var calligraphyMode = String(cfg.calligraphyMode || 'canvas_image').toLowerCase();
    var staticUrl = cfg.calligraphyStaticUrl ? String(cfg.calligraphyStaticUrl) : '';

    if (calligraphyMode === 'static_image' || calligraphyMode === 'static' || calligraphyMode === 'image') {
      // В статическом режиме НЕ генерируем вообще.
      // Если задан url — подставим, иначе оставим исходное изображение в HTML.
      setStaticCalligraphyImage(calligraphyId, staticUrl);
    } else {
      setCalligraphyImage(calligraphyId, weddingDate);
    }

    // 2) Сетка дней
    var cellDefs = collectDayCellDefs(data, bucket);
    if (!cellDefs.length) return;

    // Определяем стартовую дату сетки (понедельник недели, в которой 1-е число месяца)
    var y = weddingDate.getUTCFullYear();
    var m = weddingDate.getUTCMonth();
    var firstOfMonth = new Date(Date.UTC(y, m, 1));
    var mondayIndex = getMondayIndex(firstOfMonth);
    var gridStart = new Date(firstOfMonth.getTime() - mondayIndex * MS_DAY);

    // Вычисляем стили-эталоны по текущей верстке (чтобы не гадать с цветами)
    var normalSampleEl = null;
    var greySampleEl = null;

    for (var si = 0; si < cellDefs.length; si++) {
      var sampleWrap = byElemId(cellDefs[si].elemId);
      if (!sampleWrap) continue;
      var sampleEl = getAtom(sampleWrap) || sampleWrap;
      var cs = window.getComputedStyle(sampleEl);
      if (!greySampleEl && parseFloat(cs.opacity || '1') < 0.8) {
        greySampleEl = sampleEl;
      }
      if (!normalSampleEl && parseFloat(cs.opacity || '1') >= 0.8) {
        normalSampleEl = sampleEl;
      }
      if (greySampleEl && normalSampleEl) break;
    }

    var normalStyle = normalSampleEl ? window.getComputedStyle(normalSampleEl) : null;
    var greyStyle = greySampleEl ? window.getComputedStyle(greySampleEl) : null;

    var normalColor = normalStyle ? normalStyle.color : '#3d3d3d';
    var normalOpacity = normalStyle ? (normalStyle.opacity || '1') : '1';
    var greyColor = greyStyle ? greyStyle.color : '#3d3d3d';
    var greyOpacity = greyStyle ? (greyStyle.opacity || '0.25') : '0.25';

    // Подсветка: берём цвет из текста месяца (он бело-кремовый)
    var monthWrap = byElemId(monthId);
    var monthEl = (monthWrap ? (getAtom(monthWrap) || monthWrap) : null);
    var monthCs = monthEl ? window.getComputedStyle(monthEl) : null;
    var highlightColor = monthCs ? monthCs.color : '#ffffda';

    // Сердечко привязано к ячейке — удаляем артефакты старых патчей и подготавливаем CSS
    removeLegacyHeartArtifacts();
    ensureWeddingHeartStyles();

    // Скрываем старое сердечко (картинкой), чтобы оно не оставалось на 18 апреля.
    try {
      var legacyId = (cfg.heartElemId || '').trim();
      if (legacyId) {
        var stLegacy = document.getElementById('legacy-heart-hide-style');
        if (!stLegacy) {
          stLegacy = document.createElement('style');
          stLegacy.id = 'legacy-heart-hide-style';
          stLegacy.type = 'text/css';
          document.head.appendChild(stLegacy);
        }
        stLegacy.textContent = '.tn-elem[data-elem-id="' + legacyId + '"]{display:none !important;}';
      }
    } catch (e) {}

    // Заполняем клетки
    for (var i = 0; i < cellDefs.length; i++) {
      var cellDate = new Date(gridStart.getTime() + i * MS_DAY);
      var dayNum = cellDate.getUTCDate();
      var elemId = cellDefs[i].elemId;
      setAtomHtml(elemId, escapeHtml(String(dayNum)));

      var wrap = byElemId(elemId);
      if (!wrap) continue;

      var textEl = getAtom(wrap) || wrap;

      // На каждом прогоне снимаем маркер с прошлой отрисовки
      try {
        wrap.classList.remove('wedding-day-cell');
        wrap.style.removeProperty('--wedding-heart-size');
        wrap.style.removeProperty('--wedding-heart-text');
      } catch (e) {}

      // Стили
      var inMonth = (cellDate.getUTCMonth() === m);
      var isWedding = (
        cellDate.getUTCFullYear() === weddingDate.getUTCFullYear() &&
        cellDate.getUTCMonth() === weddingDate.getUTCMonth() &&
        cellDate.getUTCDate() === weddingDate.getUTCDate()
      );

      // Сбрасываем на базовое
      textEl.style.opacity = '';
      textEl.style.color = '';
      textEl.style.fontWeight = '400';

      if (!inMonth) {
        textEl.style.color = greyColor;
        textEl.style.opacity = greyOpacity;
      } else {
        textEl.style.color = normalColor;
        textEl.style.opacity = normalOpacity;
      }

      if (isWedding) {
        try {
          wrap.classList.add('wedding-day-cell');
          var fsz = parseFloat(window.getComputedStyle(textEl).fontSize || '32');
          var cellW = wrap.offsetWidth || 0;
          var cellH = wrap.offsetHeight || 0;
          if (!cellW || !cellH) {
            var wcs = window.getComputedStyle(wrap);
            cellW = parseFloat(wcs.width || '0') || (fsz * 1.8);
            cellH = parseFloat(wcs.height || '0') || (fsz * 1.8);
          }
          var base = Math.min(cellW, cellH);
          var heartSize = Math.round(Math.max(45, Math.min(50, fsz * 1.5, base * 0.5)));
          wrap.style.setProperty('--wedding-heart-size', heartSize + 'px');
          wrap.style.setProperty('--wedding-heart-text', highlightColor);

          setAtomHtml(
            elemId,
            '<span class="wedding-heart-wrap" aria-hidden="true">'
              + '<svg class="wedding-heart-svg" viewBox="0 0 24 24" focusable="false" aria-hidden="true">'
              +   '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />'
              + '</svg>'
            + '</span>'
            + '<span class="wedding-heart-num">' + escapeHtml(String(dayNum)) + '</span>'
          );
        } catch (e) {}

        textEl.style.opacity = '1';
        textEl.style.color = highlightColor;
      }
    }
  }

  function getContentPromise() {
    if (window.__weddingContentPromise && typeof window.__weddingContentPromise.then === 'function') {
      return window.__weddingContentPromise;
    }
    return fetch('content.json', { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () {
      return null;
    });
  }

  // Перерисовка при ресайзе (позиции элементов меняются из-за адаптива)
  var resizeTimer = null;
  function scheduleRerun(data) {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      applyCalendar(data);
    }, 150);
  }

  function run() {
    getContentPromise().then(function (data) {
      if (!data) return;

      function safeApply() {
        try {
          applyCalendar(data);
        } catch (e) {
          console.warn('[calendar-auto] error:', e);
        }
      }

      // 1) Сразу после DOMContentLoaded
      safeApply();

      // 2) Ещё раз после загрузки/инициализации (Tilda может пересчитать координаты)
      window.addEventListener('load', function () {
        setTimeout(safeApply, 60);
        setTimeout(safeApply, 250);
        setTimeout(safeApply, 800);
      });

      // 3) И при ресайзе
      window.addEventListener('resize', function () {
        scheduleRerun(data);
      });

      // 4) Если есть tilda-хелпер — попробуем после t396_init
      if (typeof window.t_onFuncLoad === 'function') {
        window.t_onFuncLoad('t396_init', function () {
          setTimeout(safeApply, 80);
          setTimeout(safeApply, 250);
          setTimeout(safeApply, 800);
        }, 50);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
