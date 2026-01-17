/* Автозагрузка контента из content.json и подстановка в Tilda Zero-блок.
 * Дизайн/шрифты не меняем — только обновляем текст/ссылки/картинки.
 *
 * Формат поддерживается:
 * 1) Новый: { meta, sections:[{texts,links,images}], survey }
 * 2) Старый: { meta, tilda:{texts,links,images} }
 */
(function() {
  'use strict';

  function byElemId(id) {
    return document.querySelector('.tn-elem[data-elem-id="' + id + '"]');
  }

  function setMeta(nameOrProp, value) {
    if (!value) return;
    var meta = document.querySelector('meta[property="' + nameOrProp + '"]') ||
               document.querySelector('meta[name="' + nameOrProp + '"]');
    if (meta) meta.setAttribute('content', value);
  }

  function applyMeta(meta) {
    if (!meta) return;
    if (meta.title) document.title = meta.title;
    if (meta.description) setMeta('description', meta.description);

    if (meta.og) {
      Object.keys(meta.og).forEach(function(k) { setMeta('og:' + k, meta.og[k]); });
    }
  }

  function setTextByElemId(id, html) {
    var el = byElemId(id);
    if (!el) return;
    var atom = el.querySelector('.tn-atom');
    if (!atom) return;
    if (atom.tagName && atom.tagName.toLowerCase() === 'a') return;
    atom.innerHTML = html;
  }

  function setLinkByElemId(id, href, textHtml) {
    var el = byElemId(id);
    if (!el) return;
    var atom = el.querySelector('.tn-atom');
    if (!atom) return;

    var a = atom;
    if (!(a.tagName && a.tagName.toLowerCase() === 'a')) {
      a = atom.querySelector('a');
    }
    if (!a) return;

    if (href) a.setAttribute('href', href);
    if (typeof textHtml === 'string' && textHtml.length) a.innerHTML = textHtml;
  }

  function setImageByElemId(id, imgObj) {
    var el = byElemId(id);
    if (!el) return;
    var atom = el.querySelector('.tn-atom');
    if (!atom) return;

    var img = atom;
    if (!(img.tagName && img.tagName.toLowerCase() === 'img')) {
      img = atom.querySelector('img');
    }
    if (!img) return;

    if (imgObj.original) {
      img.setAttribute('src', imgObj.original);
      img.setAttribute('data-original', imgObj.original);
    }
    if (imgObj.zoomUrl !== undefined) img.setAttribute('data-zoom-target', imgObj.zoomUrl || '');
    if (imgObj.alt !== undefined) img.setAttribute('alt', imgObj.alt || '');
  }

  function applySurvey(survey) {
    if (!survey) return;

    try {
      if (survey.fields && survey.fields.full_name) {
        var f = survey.fields.full_name;
        var label = document.getElementById('rsvp-label-fullname');
        var input = document.getElementById('rsvp-input-fullname');
        if (label && f.label) label.textContent = f.label;
        if (input && f.placeholder) input.setAttribute('placeholder', f.placeholder);
        if (input && typeof f.required === 'boolean') {
          if (f.required) input.setAttribute('required', 'required');
          else input.removeAttribute('required');
        }
      }

      if (survey.fields && survey.fields.attending) {
        var a = survey.fields.attending;
        var al = document.getElementById('rsvp-label-attending');
        if (al && a.label) al.textContent = a.label;

        if (a.options) {
          var oy = document.getElementById('rsvp-option-yes');
          var on = document.getElementById('rsvp-option-no');
          if (oy && a.options.yes) oy.textContent = a.options.yes;
          if (on && a.options.no) on.textContent = a.options.no;
        }

        if (typeof a.required === 'boolean') {
          var radios = document.querySelectorAll('input[name="attending"]');
          radios.forEach(function (r) {
            if (a.required) r.setAttribute('required', 'required');
            else r.removeAttribute('required');
          });
        }
      }

      if (survey.successMessage) {
        var success = document.getElementById('rsvp-success');
        if (success) success.textContent = survey.successMessage;
      }
    } catch (e) {
      console.warn('survey apply error:', e);
    }
  }

  function applyOldFormat(data) {
    if (!data || !data.tilda) return;

    applyMeta(data.meta);

    var t = data.tilda || {};
    var texts = t.texts || {};
    Object.keys(texts).forEach(function(id) {
      setTextByElemId(id, texts[id]);
    });

    var links = t.links || {};
    Object.keys(links).forEach(function(id) {
      setLinkByElemId(id, links[id].href, links[id].text);
    });

    var images = t.images || {};
    Object.keys(images).forEach(function(id) {
      setImageByElemId(id, images[id]);
    });

    applySurvey(data.survey);
  }

  function applyNewFormat(data) {
    applyMeta(data.meta);

    var sections = data.sections || [];
    sections.forEach(function(sec) {
      (sec.texts || []).forEach(function(t) {
        setTextByElemId(t.elemId, t.value);
      });

      (sec.links || []).forEach(function(l) {
        setLinkByElemId(l.elemId, l.href, l.text);
      });

      (sec.images || []).forEach(function(im) {
        setImageByElemId(im.elemId, im);
      });
    });

    applySurvey(data.survey);
  }

  function load() {
    fetch('content.json', { cache: 'no-store' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data && data.sections) applyNewFormat(data);
        else applyOldFormat(data);
      })
      .catch(function(err) {
        console.warn('content.json load error:', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
