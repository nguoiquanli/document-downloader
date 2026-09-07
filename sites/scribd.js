(() => {
  'use strict';

  const OVERLAY_ID = 'scribd-fast-download-overlay';
  const ROOT_ID = 'scribd-fast-a4-root';
  const STYLE_ID = 'scribd-fast-a4-style';
  const A4_W = 210 * 96 / 25.4;
  const A4_H = 297 * 96 / 25.4;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const CTA_STYLE_ID = 'document-downloader-hide-scribd-trial';
  function hideTrialCta() {
    if (!document.getElementById(CTA_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = CTA_STYLE_ID;
      style.textContent = '[data-e2e="megamenu-top-bar-read-free-button"]{display:none!important;visibility:hidden!important;width:0!important;min-width:0!important;margin:0!important;padding:0!important;pointer-events:none!important}';
      (document.head || document.documentElement).appendChild(style);
    }
    document.querySelectorAll('[data-e2e="megamenu-top-bar-read-free-button"]').forEach(node => node.remove());
    document.querySelectorAll('header a,header button,nav a,nav button').forEach(node => {
      if (node.textContent.trim().toLowerCase() === 'download free for 30 days') node.remove();
    });
  }

  hideTrialCta();

  function documentId() {
    return location.pathname.match(/(?:^|\/)document\/(\d+)(?:\/|$)/)?.[1] || null;
  }

  function getPages(doc) {
    return [...doc.querySelectorAll('.outer_page[id^="outer_page_"]')]
      .sort((a, b) => Number(a.id.match(/\d+/)?.[0]) - Number(b.id.match(/\d+/)?.[0]));
  }

  function hasContent(page) {
    const content = page?.querySelector('.newpage');
    if (!content) return false;
    return (content.textContent || '').trim().length > 0
      || content.querySelectorAll('img[src], svg, canvas').length > 0
      || content.querySelectorAll('*').length > 3;
  }

  async function waitForContent(doc, pageId, timeout, state) {
    const started = performance.now();
    while (performance.now() - started < timeout) {
      if (state.cancelled) throw new Error('Đã hủy.');
      const page = doc.getElementById(pageId);
      if (hasContent(page)) {
        await sleep(180);
        return doc.getElementById(pageId);
      }
      await sleep(200);
    }
    return doc.getElementById(pageId);
  }

  function snapshot(page) {
    const rect = page.getBoundingClientRect();
    const clone = page.cloneNode(true);
    clone.classList.remove('not_visible');
    clone.querySelectorAll('.toolbar_drop, .mobile_overlay, [class*="between_page"]')
      .forEach(node => node.remove());
    return { width: rect.width, height: rect.height, clone };
  }

  async function loadAndSnapshot(doc, frameWindow, update, state) {
    let list = getPages(doc);
    if (!list.length) throw new Error('Không tìm thấy các trang trong bản đọc Scribd.');

    const result = new Array(list.length);
    const missing = [];
    frameWindow.scrollTo({ top: 0, behavior: 'auto' });
    await sleep(300);

    for (let index = 0; index < list.length; index += 1) {
      if (state.cancelled) throw new Error('Đã hủy.');
      list = getPages(doc);
      const page = list[index];
      update(`Đang tải trang ${index + 1}/${list.length}…`, (index / list.length) * 85);
      page.scrollIntoView({ block: 'center', behavior: 'auto' });
      await sleep(90);
      const loaded = await waitForContent(doc, page.id, 2800, state);
      if (loaded && hasContent(loaded)) result[index] = snapshot(loaded);
      else missing.push(index);
    }

    for (const index of missing) {
      if (state.cancelled) throw new Error('Đã hủy.');
      list = getPages(doc);
      const page = list[index];
      if (!page) continue;
      update(`Đang tải lại trang ${index + 1}…`, 88);
      page.scrollIntoView({ block: 'center', behavior: 'auto' });
      const loaded = await waitForContent(doc, page.id, 6500, state);
      if (loaded && hasContent(loaded)) result[index] = snapshot(loaded);
    }

    await doc.fonts?.ready;
    const stillMissing = result.map((item, i) => item ? null : i + 1).filter(Boolean);
    if (stillMissing.length) throw new Error(`Không tải được trang: ${stillMissing.join(', ')}.`);
    return result;
  }

  function buildPrintRoot(doc, snapshots) {
    doc.getElementById(ROOT_ID)?.remove();
    doc.getElementById(STYLE_ID)?.remove();
    const root = doc.createElement('main');
    root.id = ROOT_ID;

    for (const item of snapshots) {
      const scale = Math.min(A4_W / item.width, A4_H / item.height);
      const clone = item.clone;
      const sheet = doc.createElement('section');
      sheet.className = 'sfa-sheet';
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      clone.classList.add('sfa-page');
      Object.assign(clone.style, {
        width: `${item.width}px`, height: `${item.height}px`,
        left: `${(A4_W - item.width * scale) / 2}px`,
        top: `${(A4_H - item.height * scale) / 2}px`,
        transform: `scale(${scale})`, transformOrigin: '0 0'
      });
      sheet.append(clone);
      root.append(sheet);
    }

    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} { display: none; }
      @media print {
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        body > *:not(#${ROOT_ID}) { display: none !important; }
        #${ROOT_ID} { display: block !important; width: 210mm !important; margin: 0 !important; }
        #${ROOT_ID} .sfa-sheet {
          display: block !important; position: relative !important;
          box-sizing: border-box !important; width: 210mm !important; height: 297mm !important;
          margin: 0 !important; padding: 0 !important; overflow: hidden !important;
          break-after: page !important; page-break-after: always !important; background: #fff !important;
        }
        #${ROOT_ID} .sfa-sheet:last-child { break-after: auto !important; page-break-after: auto !important; }
        #${ROOT_ID} .sfa-page {
          display: block !important; position: absolute !important; margin: 0 !important;
          overflow: hidden !important; opacity: 1 !important;
        }
        #${ROOT_ID} [class*="between_page"],
        #${ROOT_ID} a[href*="oauth/signup"] { display: none !important; }
      }
    `;
    doc.head.append(style);
    doc.body.append(root);
    return root;
  }

  async function waitForImages(root) {
    await Promise.all([...root.querySelectorAll('img')].map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 3000);
      });
    }));
  }

  function createOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647', background: '#0f172acc',
      display: 'flex', flexDirection: 'column', padding: '18px', boxSizing: 'border-box',
      font: '14px/1.4 system-ui, sans-serif'
    });
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;padding:12px 16px;background:#fff;border-radius:12px 12px 0 0">
        <strong style="color:#0f172a;white-space:nowrap">Scribd PDF</strong>
        <div style="flex:1;height:8px;border-radius:999px;background:#e2e8f0;overflow:hidden">
          <div data-bar style="width:0;height:100%;background:#2563eb;transition:width .2s"></div>
        </div>
        <span data-status style="min-width:190px;color:#334155">Đang mở bản đọc…</span>
        <button data-print hidden style="padding:7px 12px;border:0;border-radius:7px;background:#2563eb;color:#fff;cursor:pointer">Lưu thành PDF</button>
        <button data-close style="padding:7px 12px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;cursor:pointer">Đóng</button>
      </div>
      <iframe data-reader style="flex:1;width:100%;border:0;border-radius:0 0 12px 12px;background:#fff"></iframe>
    `;
    document.body.append(overlay);
    return overlay;
  }

  async function openDownloader() {
    if (document.getElementById(OVERLAY_ID)) return;
    const id = documentId();
    if (!id) return;
    const overlay = createOverlay();
    const frame = overlay.querySelector('[data-reader]');
    const state = { cancelled: false };
    const close = overlay.querySelector('[data-close]');
    const printAgain = overlay.querySelector('[data-print]');
    const update = (message, percent = 0, error = false) => {
      overlay.querySelector('[data-status]').textContent = message;
      overlay.querySelector('[data-status]').style.color = error ? '#b91c1c' : '#334155';
      overlay.querySelector('[data-bar]').style.width = `${Math.max(0, Math.min(100, percent))}%`;
    };

    close.addEventListener('click', () => {
      state.cancelled = true;
      overlay.remove();
    });

    frame.addEventListener('load', async () => {
      try {
        update('Đang nhận diện tài liệu…', 3);
        const doc = frame.contentDocument;
        const win = frame.contentWindow;
        const snapshots = await loadAndSnapshot(doc, win, update, state);
        update('Đang dựng bản in A4…', 92);
        const root = buildPrintRoot(doc, snapshots);
        await waitForImages(root);
        if (state.cancelled) return;
        update(`Đã hoàn tất ${snapshots.length} trang.`, 100);
        printAgain.hidden = false;
        printAgain.onclick = () => win.print();
        await sleep(250);
        win.focus();
        win.print();
      } catch (error) {
        if (!state.cancelled) update(error.message || String(error), 100, true);
      }
    }, { once: true });

    frame.src = `${location.origin}/embeds/${id}/content`;
  }

  function removeSecondaryActions() {
    document.querySelectorAll(
      '[data-e2e^="doc-actions-download-button"],[data-e2e^="doc-actions-print-button"]'
    ).forEach(button => (button.closest('li') || button).remove());
  }

  function makeDownloadButtonSingleAction() {
    hideTrialCta();
    removeSecondaryActions();

    const custom = document.querySelector('[data-document-downloader-action="true"]');
    const nativeButtons = [...document.querySelectorAll(
      'button[data-e2e="multi-format-download-button"]:not([data-document-downloader-action]),' +
      'button[data-e2e$="multi-format-download-button"]:not([data-document-downloader-action])'
    )].filter(button => !button.closest('[data-e2e="doc-actions-container"]'));

    if (custom) {
      for (const button of nativeButtons) {
        const wrapper = button.closest('[class*="DropdownMenu-module_wrapper"]');
        (wrapper || button).remove();
      }
      return;
    }

    const button = nativeButtons[0];
    if (!button) return;
    const clone = button.cloneNode(true);
    clone.dataset.documentDownloaderAction = 'true';
    clone.removeAttribute('id');
    clone.removeAttribute('aria-haspopup');
    clone.removeAttribute('aria-expanded');
    clone.removeAttribute('data-state');
    clone.querySelector('[class*="ButtonCore-module_rightIcon"], .dZ26XU')?.remove();

    const wrapper = button.closest('[class*="DropdownMenu-module_wrapper"]');
    const replacement = document.createElement('div');
    replacement.dataset.documentDownloaderWrapper = 'true';
    replacement.appendChild(clone);
    if (wrapper) wrapper.replaceWith(replacement);
    else button.replaceWith(replacement);

    for (const extra of nativeButtons.slice(1)) {
      const extraWrapper = extra.closest('[class*="DropdownMenu-module_wrapper"]');
      (extraWrapper || extra).remove();
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.(
      'button[data-document-downloader-action="true"],' +
      'button[data-e2e="multi-format-download-button"],' +
      'button[data-e2e$="multi-format-download-button"]'
    );
    if (!button || button.closest('[data-e2e="doc-actions-container"]')) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openDownloader();
  }, true);

  makeDownloadButtonSingleAction();
  let buttonTimer;
  new MutationObserver(() => {
    clearTimeout(buttonTimer);
    buttonTimer = setTimeout(makeDownloadButtonSingleAction, 100);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
