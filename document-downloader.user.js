// ==UserScript==
// @name         Document Downloader (ChromeXt)
// @namespace    https://github.com/nguoiquanli/document-downloader
// @version      2.1.8
// @description  Save accessible Studocu, Scribd and SlideShare documents as PDF.
// @match        https://*.studocu.com/*
// @match        https://*.studeersnel.nl/*
// @match        https://*.studocu.vn/*
// @match        https://*.studocu.id/*
// @match        https://*.scribd.com/*
// @match        https://*.slideshare.net/*
// @run-at       document-start
// @grant        GM_cookie
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        frames
// @connect      doc-assets.studocu.com
// @connect      image.slidesharecdn.com
// ==/UserScript==

/* Generated from sites/*.js and styles/*.css. Edit those sources and rebuild. */
(() => {
  'use strict';

  const host = location.hostname;
  const studocuHosts = ['studocu.com', 'studeersnel.nl', 'studocu.vn', 'studocu.id'];
  const isSite = domain => host === domain || host.endsWith(`.${domain}`);
  const isStudocu = studocuHosts.some(isSite);
  const isScribd = isSite('scribd.com');
  const isSlideShare = isSite('slideshare.net');

  function installCss(css) {
    if (typeof GM_addStyle === 'function') {
      try { GM_addStyle(css); return; } catch (error) {
        console.warn('Document Downloader: GM_addStyle failed', error);
      }
    }
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  // Only run on explicit request. Automatically deleting cookies on every URL
  // update made ChromeXt reload repeatedly (and could invalidate signed URLs
  // while the document was being assembled for printing).
  function cookieOperation(promise, action) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${action} quá thời gian chờ. ChromeXt không phản hồi; hãy xóa cookie thủ công.`)), 8000); })
    ]).finally(() => clearTimeout(timer));
  }

  async function clearStudocuCookies(button) {
    if (button?.disabled) return;
    if (button) { button.disabled = true; button.textContent = 'Đang xóa…'; }
    try {
      const api = typeof GM_cookie !== 'undefined' && typeof GM_cookie.list === 'function'
        && typeof GM_cookie.delete === 'function';
      if (!api) throw new Error('ChromeXt không cung cấp GM_cookie. Hãy xóa cookie trong cài đặt trình duyệt.');
      const cookies = await cookieOperation(GM_cookie.list({ url: location.href }), 'Liệt kê cookie');
      if (!Array.isArray(cookies)) throw new Error('ChromeXt không trả về danh sách cookie. Hãy xóa thủ công.');
      if (!cookies.length) {
        if (document.cookie.trim()) throw new Error('ChromeXt không liệt kê được cookie đang hiện trên trang. Hãy xóa bằng cài đặt trình duyệt.');
        if (button) button.textContent = 'Không có cookie';
        alert('Không tìm thấy cookie của trang đang mở.');
        return;
      }
      for (const cookie of cookies) {
        // CDP matches an exact domain/path OR a URL. Passing both can leave
        // cookies untouched when the current URL and the cookie domain differ.
        const details = { name: cookie.name, domain: cookie.domain, path: cookie.path || '/' };
        if (cookie.partitionKey) details.partitionKey = cookie.partitionKey;
        try { await cookieOperation(GM_cookie.delete(details), 'Xóa cookie'); }
        catch (error) { console.warn('Document Downloader: cookie domain/path deletion failed', error); }
      }
      const remaining = await cookieOperation(GM_cookie.list({ url: location.href }), 'Kiểm tra cookie');
      if (remaining.length) {
        for (const cookie of remaining) {
          const details = { name: cookie.name, url: location.href };
          if (cookie.partitionKey) details.partitionKey = cookie.partitionKey;
          try { await cookieOperation(GM_cookie.delete(details), 'Xóa cookie'); }
          catch (error) { console.warn('Document Downloader: cookie URL deletion failed', error); }
        }
      }
      const stillPresent = await cookieOperation(GM_cookie.list({ url: location.href }), 'Xác nhận xóa cookie');
      if (stillPresent.length) {
        throw new Error(`Còn ${stillPresent.length} cookie; hãy xóa bằng cài đặt trình duyệt.`);
      }
      if (button) button.textContent = 'Đã xóa';
      location.reload();
    } catch (error) {
      console.warn('Document Downloader: cookie cleanup failed', error);
      if (button) { button.textContent = 'Xóa thủ công'; button.title = error.message || String(error); }
      alert('Không xóa được cookie: ' + (error.message || error));
    } finally {
      if (button) button.disabled = false;
    }
  }

  function installStudocuCookieButton() {
    const selector = '[data-test-selector="document-viewer-download-button-topbar"], [data-dd-studocu-download="true"], [class*="TopbarActions-module"][class*="secondaryActionsWrapper"] button';
    const downloadWords = /^(download|downloaden|scarica|descargar|t[eé]l[eé]charger|herunterladen|pobierz|baixar|indir|скачать|ladda ner|last ned|lataa|tải xuống|tải về)$/i;
    let button;
    let anchor;
    const position = () => {
      if (!button) return;
      if (!anchor?.isConnected) { button.hidden = true; return; }
      const rect = anchor.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
      button.hidden = !visible;
      if (!visible) return;
      const width = button.offsetWidth || 102;
      const left = rect.left >= width + 12 ? rect.left - width - 6 : rect.right + 6;
      button.style.left = `${Math.max(6, Math.min(innerWidth - width - 6, left))}px`;
      button.style.top = `${Math.max(6, Math.min(innerHeight - rect.height, rect.top))}px`;
    };
    const mount = () => {
      const candidates = [...document.querySelectorAll(selector)].filter(download =>
        !download.closest('#sh-dl-overlay') &&
        (download.matches('[data-test-selector="document-viewer-download-button-topbar"], [data-dd-studocu-download="true"]')
          || downloadWords.test((download.textContent || '').trim()))
      );
      anchor = candidates.find(download => download.getBoundingClientRect().width > 0) || candidates[0];
      if (!anchor || !document.body) { if (button) button.hidden = true; return; }
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.dataset.ddCookieClear = 'true';
        button.textContent = 'Xóa cookie';
        button.setAttribute('aria-label', 'Xóa cookie Studocu');
        for (const type of ['pointerdown', 'mousedown', 'touchstart', 'touchend'])
          button.addEventListener(type, event => event.stopPropagation());
        button.addEventListener('click', event => {
          event.preventDefault(); event.stopImmediatePropagation();
          clearStudocuCookies(button);
        });
        document.body.appendChild(button);
      }
      position();
    };
    mount();
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => { scheduled = false; mount(); }, 100);
    })
      .observe(document.documentElement, { childList: true, subtree: true,
        attributes: true, attributeFilter: ['data-dd-studocu-download', 'data-test-selector'] });
    window.addEventListener('scroll', position, { passive: true, capture: true });
    window.addEventListener('resize', position, { passive: true });
    window.visualViewport?.addEventListener('resize', position, { passive: true });
  }

  // Fetch-like response used by Studocu's original .text() and .blob() calls.
  async function fetchDocumentAsset(url) {
    // Most assets already load correctly in the page. Prefer its native fetch;
    // use ChromeXt only if the browser blocks access to the cross-origin body.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      return await fetch(url, { credentials: 'omit', signal: controller.signal });
    } catch (_) {
      // A CORS failure or a stalled response needs ChromeXt's network bridge.
    } finally {
      clearTimeout(timer);
    }
    return new Promise((resolve, reject) => {
      let done = false;
      let request;
      const finish = (fn, value) => {
        if (done) return;
        done = true;
        clearTimeout(deadline);
        fn(value);
      };
      const deadline = setTimeout(() => {
        finish(reject, new Error('Document asset request timed out'));
        request?.abort?.();
      }, 20000);
      if (typeof GM_xmlhttpRequest !== 'function') {
        finish(reject, new Error('ChromeXt GM_xmlhttpRequest is unavailable'));
        return;
      }
      try { request = GM_xmlhttpRequest({
        method: 'GET', url, responseType: 'blob', anonymous: true,
        forceCORS: true, timeout: 18000,
        onload(response) {
          const blob = response.response instanceof Blob ? response.response : new Blob([response.response || '']);
          finish(resolve, { ok: response.status >= 200 && response.status < 300,
            status: response.status, blob: () => Promise.resolve(blob), text: () => blob.text() });
        },
        onerror: () => finish(reject, new Error('Document asset request failed')),
        ontimeout: () => finish(reject, new Error('Document asset request timed out')),
      }); } catch (error) { finish(reject, error); }
      request?.catch?.(() => {});
      if (!request) finish(reject, new Error('ChromeXt refused the document request.'));
    });
  }

  // Replaces the extension service worker's SlideShare image request. The
  // existing PDF builder accepts {buffer, contentType} from fetchImage().
  function fetchSlideshareImage(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'image.slidesharecdn.com')
      return Promise.reject(new Error('Địa chỉ ảnh không hợp lệ.'));
    let pendingRequest;
    let rejectPending;
    const operation = new Promise((resolve, reject) => {
      rejectPending = reject;
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('ChromeXt GM_xmlhttpRequest is unavailable'));
        return;
      }
      pendingRequest = GM_xmlhttpRequest({
        method: 'GET', url: parsed.href, responseType: 'arraybuffer',
        anonymous: true, forceCORS: true, timeout: 60000,
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`Không tải được ảnh: HTTP ${response.status}`));
            return;
          }
          const buffer = response.response;
          if (!(buffer instanceof ArrayBuffer)) {
            reject(new Error('Không nhận được dữ liệu ảnh.'));
            return;
          }
          const type = /(?:^|\r?\n)content-type:\s*([^\r\n]+)/i.exec(response.responseHeaders || '')?.[1];
          resolve({ buffer, contentType: type || 'application/octet-stream' });
        },
        onerror: () => reject(new Error('Không tải được ảnh.')),
        ontimeout: () => reject(new Error('Quá thời gian tải ảnh.')),
        onabort: () => reject(new Error('Đã hủy')),
      });
      pendingRequest?.catch?.(() => {});
      if (!pendingRequest) reject(new Error('ChromeXt refused the image request.'));
    });
    operation.abort = () => {
      pendingRequest?.abort?.();
      rejectPending?.(new Error('Đã hủy'));
    };
    return operation;
  }

  async function start() {
    // ChromeXt can evaluate @run-at document-start before <html> exists.
    if (!document.documentElement) {
      document.addEventListener('readystatechange', start, { once: true });
      return;
    }
    installCss(USERSCRIPT_CSS);
    if (isStudocu) {
      if (window !== window.top) return;
      if (typeof GM_registerMenuCommand === 'function') {
        try { GM_registerMenuCommand('Xóa cookie Studocu và tải lại', () => clearStudocuCookies()); }
        catch (error) { console.warn('Document Downloader: menu command failed', error); }
      }
      installCss(STUDOCU_CSS);
      installStudocuCookieButton();
      runStudocu();
    } else if (isScribd) {
      if (window !== window.top) return;
      installCss(SCRIBD_CSS);
      runScribd();
    } else if (isSlideShare && /\/slideshow\//.test(location.pathname)) {
      if (window === window.top || /\/slideshow\/embed_code\/key\//.test(location.pathname)) {
        if (window === window.top) installCss(SLIDESHARE_CSS);
        if (window !== window.top || document.readyState !== 'loading') runSlideShare();
        else document.addEventListener('DOMContentLoaded', runSlideShare, { once: true });
      }
    }
  }

  // Allow the module constants below to initialize before start() reads them.
  Promise.resolve().then(start).catch(error => console.error('Document Downloader failed to start', error));

  const STUDOCU_CSS = "/* ========== Core blur removal ========== */\n\n/* Universal nofilter override */\nbody .nofilter {\n    filter: none !important;\n    -webkit-filter: none !important;\n    opacity: 1 !important;\n}\n\n/* Force remove blur from blurred page wrappers (CSS modules with dynamic hashes) */\n.page-content[class*=\"blurred\"],\n.page-content[class*=\"Blurred\"],\n.pf[class*=\"blurred\"],\n.pf[class*=\"Blurred\"] {\n    filter: none !important;\n    -webkit-filter: none !important;\n    opacity: 1 !important;\n    user-select: auto !important;\n    -webkit-user-select: auto !important;\n    pointer-events: auto !important;\n    visibility: visible !important;\n    clip-path: none !important;\n    -webkit-clip-path: none !important;\n}\n\n/* Force remove blur from all page wrapper elements */\n.pf.nofilter,\n.pf {\n    filter: none !important;\n    -webkit-filter: none !important;\n    opacity: 1 !important;\n    clip-path: none !important;\n    -webkit-clip-path: none !important;\n    mask-image: none !important;\n    -webkit-mask-image: none !important;\n}\n\n/* Force all page content visible and unblurred */\n.page-content,\n.page-content.nofilter {\n    filter: none !important;\n    -webkit-filter: none !important;\n    opacity: 1 !important;\n    visibility: visible !important;\n    user-select: auto !important;\n    -webkit-user-select: auto !important;\n    pointer-events: auto !important;\n    clip-path: none !important;\n    -webkit-clip-path: none !important;\n    mask-image: none !important;\n    -webkit-mask-image: none !important;\n    color: inherit !important;\n}\n\n/* Force images inside pages to be fully visible */\n.pf img,\n.page-content img {\n    filter: none !important;\n    -webkit-filter: none !important;\n    opacity: 1 !important;\n    visibility: visible !important;\n    clip-path: none !important;\n    -webkit-clip-path: none !important;\n    mask-image: none !important;\n    -webkit-mask-image: none !important;\n}\n\n/* Remove blur from blurred image wrapper (Studocu's component) */\n[class*=\"blurred-image-wrapper\"],\n[class*=\"BlurredImage\"],\n[class*=\"blurred-page\"],\n[class*=\"BlurredPage\"] {\n    filter: none !important;\n    -webkit-filter: none !important;\n    opacity: 1 !important;\n    visibility: visible !important;\n}\n\n/* Remove backdrop-filter from any overlay in the document viewer */\n[class*=\"Viewer_document\"] [class*=\"overlay\"],\n[class*=\"Viewer_document\"] [class*=\"Overlay\"],\n#viewer-wrapper [class*=\"overlay\"],\n#viewer-wrapper [class*=\"Overlay\"] {\n    backdrop-filter: none !important;\n    -webkit-backdrop-filter: none !important;\n    background: transparent !important;\n    display: none !important;\n}\n\n/* Prevent any pseudo-element overlays on page elements */\n.pf::before,\n.pf::after,\n.page-content::before,\n.page-content::after,\n[class*=\"blurred\"]::before,\n[class*=\"blurred\"]::after,\n[class*=\"Blurred\"]::before,\n[class*=\"Blurred\"]::after {\n    display: none !important;\n    content: none !important;\n    opacity: 0 !important;\n    visibility: hidden !important;\n}\n\n/* ========== Sign-in wall for readers flagged as bots ========== */\n/* Studocu can mount a non-dismissible AuthWall over a document and lock\n   scrolling. Only hide the open AuthWall dialog without the `hideable`\n   class, so sign-in dialogs opened by the reader remain usable. */\ndiv:has(> dialog[open][class*=\"AuthWall\"]:not([class*=\"hideable\"])) {\n    display: none !important;\n}\n\nhtml:has(dialog[open][class*=\"AuthWall\"]:not([class*=\"hideable\"])) {\n    overflow: visible !important;\n    padding-right: 0 !important;\n    height: auto !important;\n}\n\nhtml:has(dialog[open][class*=\"AuthWall\"]:not([class*=\"hideable\"])) body {\n    position: static !important;\n    top: auto !important;\n    overflow: visible !important;\n}\n\n/* ========== Download button styles ========== */\n.download-button-2, .github-button {\n    background: inherit;\n    border-radius: 3px;\n    color: white;\n    display: inline-flex;\n    line-height: normal;\n    vertical-align: middle;\n    transition: .3s;\n}\n\n.download-button-2 {\n    height: 30px;\n    margin: 0 5px;\n    min-width: 30px;\n}\n\n.github-button {\n    background-color: #333;\n    border: solid 1px #333;\n    display: block;\n    line-height: 1.4286;\n    margin-right: 20px;\n    padding: 8px 20px;\n    border-radius: 100%;\n}\n\n.tooltip-bottom {\n    position: relative;\n    display: inline-flex;\n    border-bottom: solid 1px black;\n}\n\n.tooltip-bottom .tooltiptext-bottom {\n    visibility: hidden;\n    width: 200px;\n    background-color: #555;\n    color: white;\n    text-align: center;\n    border-radius: 6px;\n    padding: 5px;\n    position: absolute;\n    z-index: 1;\n    top: 120%;\n    left: 50%;\n    margin-left: -100px;\n    opacity: 0;\n    transition: opacity .3s;\n}\n\n.tooltip-bottom .tooltiptext-bottom::after {\n    content: \"\";\n    position: absolute;\n    bottom: 100%;\n    left: 50%;\n    margin-left: -5px;\n    border-width: 5px;\n    border-style: solid;\n    border-color: transparent transparent #555 transparent;\n}\n\n.tooltip-bottom:hover .tooltiptext-bottom {\n    visibility: visible;\n    opacity: 1;\n}\n\n/* Style for the custom StudocuHack logo replacement */\n.studocuhack-logo-replaced {\n    cursor: pointer;\n    display: inline-flex;\n    align-items: center;\n}\n\n.studocuhack-logo-replaced svg {\n    flex-shrink: 0;\n}\n\n@media (max-width: 600px) {\n    /* Hide the full text logo on small screens, keep only the icon */\n    .studocuhack-logo-replaced > span {\n        display: none !important;\n    }\n\n}\n\n@media print {\n    .p2hv .stopoverlappingourstyleplease {\n        display: block;\n    }\n}\n\n/* ========== Hide premium banners and preview restrictions ========== */\n[class*=\"PremiumBannerBlobWrapper\"],\n[class*=\"PremiumBannerHeader\"],\n[class*=\"PremiumBannerSubHeader\"],\n[class*=\"PremiumBannerBenefitsList\"],\n[class*=\"PremiumBannerButtons\"],\n[class*=\"InlineBanner_inline-banner\"],\n[class*=\"PremiumPageClarificationBanner\"],\n[class*=\"premium-banner-wrapper\"],\n[class*=\"premiumBannerWrapper\"],\n[class*=\"ViewerContainer_premium\"],\n[data-test-selector=\"modal-document-viewer-preview-message\"],\n[data-test-selector=\"preview-banner-upgrade-first-cta\"],\n[data-test-selector=\"preview-banner-upload-second-cta\"] {\n    display: none !important;\n    visibility: hidden !important;\n    opacity: 0 !important;\n    height: 0 !important;\n    width: 0 !important;\n    overflow: hidden !important;\n    pointer-events: none !important;\n}\n\n/* Style native desktop/mobile Download buttons directly. React may replace the\n   nodes while scrolling, so this must not depend on a class injected by JS. */\n[data-test-selector=\"document-viewer-download-button-topbar\"],\n[data-dd-studocu-download=\"true\"] {\n    display: inline-flex !important;\n    visibility: visible !important;\n    background: #4D8BF5 !important;\n    border-color: #4D8BF5 !important;\n    color: #fff !important;\n    cursor: pointer !important;\n}\n\n[data-test-selector=\"document-viewer-download-button-topbar\"]:hover,\n[data-dd-studocu-download=\"true\"]:hover {\n    background: #3a7be0 !important;\n    border-color: #3a7be0 !important;\n}\n\n/* Legacy selectors for older versions */\n._95f5f1767857,\n._3273140306b6 {\n    display: none !important;\n}\n\n/* Banner wrapper */\n.banner-wrapper {\n    display: none !important;\n}\n\n/* ========== Hide premium badge/tag/label elements ========== */\n[class*=\"PremiumBadge\"],\n[class*=\"premium-badge\"],\n[class*=\"PremiumLabel\"],\n[class*=\"PremiumTag\"],\n[class*=\"premium_tag\"],\n[class*=\"premium_badge\"],\n[class*=\"premiumBadge\"],\n[class*=\"premiumLabel\"],\n[class*=\"premiumTag\"],\n[class*=\"premium-label\"],\n[class*=\"premium-tag\"],\n[class*=\"PremiumIcon\"],\n[class*=\"premiumIcon\"],\n[class*=\"premium-icon\"],\n[data-test-selector*=\"premium-badge\"],\n[data-test-selector*=\"premium-tag\"],\n[data-test-selector*=\"premium-label\"] {\n    display: none !important;\n    visibility: hidden !important;\n    opacity: 0 !important;\n    height: 0 !important;\n    width: 0 !important;\n    overflow: hidden !important;\n    margin: 0 !important;\n    padding: 0 !important;\n    pointer-events: none !important;\n}\n\n/* ========== Modal overlay hiding ========== */\n#modal-overlay {\n    display: none !important;\n}\n\n/* ========== Hide ads (Refinery89 / Google Publisher Tag / Adagio) ========== */\n[class*=\"AdsContainer\"],\nr89-standalone,\n[id^=\"r89-\"],\n[id*=\"r89-\"],\niframe[id^=\"google_ads_iframe\"],\ndiv[id^=\"google_ads_iframe\"],\n[id^=\"div-gpt-ad\"],\n[id*=\"gpt-ad\"],\n[id*=\"adagio\"],\n[class*=\"adagio\"],\n[class*=\"Advertisement\"],\n[class*=\"advertisement\"] {\n    display: none !important;\n    visibility: hidden !important;\n    height: 0 !important;\n    width: 0 !important;\n    overflow: hidden !important;\n    pointer-events: none !important;\n}\n\n/* ========== Hide the AI \"Ask a question about this document\" toolbar ========== */\n/* (includes the Mock exam / Summary / Quiz pills, which live in the same wrapper) */\n[class*=\"AIToolbar\"] {\n    display: none !important;\n    visibility: hidden !important;\n    pointer-events: none !important;\n}\n\n/* ========== Premium-locked page notice (issue #58) ========== */\n/* Studocu splits each pdf2htmlEX page into a figure layer (bg{hex}.png) and a\n   separately signed text layer ({objectKey}{hex}.page). For premium pages it\n   signs no text layer, so their words are never sent to the browser. Those pages\n   keep Studocu's blurred preview and carry this label, rather than being replaced\n   by the figure layer, which would render as a clean but completely empty sheet. */\n.sh-gated-note {\n    /* Top of the page, not the bottom: the reader scrolls down into the page and\n       should learn why it is blurred before scrolling past it. It covers content,\n       but the covered content is unreadable anyway. */\n    position: absolute !important;\n    left: 0 !important;\n    right: 0 !important;\n    top: 0 !important;\n    z-index: 30 !important;\n    box-sizing: border-box !important;\n    margin: 0 !important;\n    padding: 10px 16px !important;\n    background: rgba(26, 26, 46, 0.92) !important;\n    color: #fff !important;\n    font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif !important;\n    font-size: 13px !important;\n    line-height: 1.45 !important;\n    text-align: center !important;\n    border-bottom: 2px solid #4D8BF5 !important;\n    filter: none !important;\n    opacity: 1 !important;\n    pointer-events: none !important;\n}\n\n/* Keep the label legible on paper without flooding the page with ink. */\n@media print {\n    .sh-gated-note {\n        background: #fff !important;\n        color: #000 !important;\n        border-bottom: 1px solid #000 !important;\n        border-top: 0 !important;\n        font-size: 11px !important;\n        padding: 6px 12px !important;\n    }\n}\n\n#sh-dl-overlay .sh-dl-meta {\n    flex-shrink: 0;\n    font-size: 12px;\n    opacity: .75;\n}\n#sh-dl-overlay .sh-dl-hint {\n    align-self: center;\n    font-size: 12px;\n    opacity: .75;\n}\n";
  const SCRIBD_CSS = "[data-e2e=\"megamenu-top-bar-read-free-button\"] {\n  display: none !important;\n  visibility: hidden !important;\n  width: 0 !important;\n  min-width: 0 !important;\n  height: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  overflow: hidden !important;\n  pointer-events: none !important;\n}\n\n[data-e2e^=\"doc-actions-download-button\"],\n[data-e2e^=\"doc-actions-print-button\"] {\n  display: none !important;\n}\n";
  const SLIDESHARE_CSS = "button[data-cy=\"subscribe-button\"],\nbutton[data-testid=\"subscribe-button\"] {\n  display: none !important;\n  visibility: hidden !important;\n  width: 0 !important;\n  min-width: 0 !important;\n  height: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  overflow: hidden !important;\n  pointer-events: none !important;\n}\n";
  const USERSCRIPT_CSS = "/* ChromeXt's narrow viewport overlays; extension styles stay unchanged. */\n[data-dd-cookie-clear] {\n  position: fixed !important;\n  z-index: 2147480000;\n  border: 1px solid #1969b2;\n  border-radius: 6px;\n  background: #fff;\n  color: #1969b2;\n  padding: 7px 10px;\n  margin: 0;\n  cursor: pointer;\n  max-width: 100%;\n  white-space: nowrap;\n  touch-action: manipulation;\n}\n[data-dd-cookie-clear][hidden] { display: none !important; }\n#ss-download-pdf.ss-floating-download {\n  position: fixed !important;\n  right: 16px;\n  bottom: calc(18px + env(safe-area-inset-bottom));\n  z-index: 2147483646;\n  width: auto !important;\n  min-width: 0 !important;\n  padding: 12px 16px !important;\n  border: 0;\n  border-radius: 50px;\n  background: #0a66c2;\n  color: #fff;\n  font: 600 14px system-ui;\n  cursor: pointer;\n  box-shadow: 0 4px 18px #0005;\n}\n@media screen and (max-width: 700px) {\n  #sh-dl-overlay { width: 100vw; max-width: 100vw; overflow-x: hidden; box-sizing: border-box; }\n  #sh-dl-overlay .sh-dl-bar { box-sizing: border-box; width: 100%; padding: 8px; gap: 6px; flex-wrap: wrap; }\n  #sh-dl-overlay .sh-dl-bar .t { min-width: 0; flex: 1 1 50%; }\n  #sh-dl-overlay .sh-dl-bar .actions { width: 100%; min-width: 0; display: flex; gap: 6px; flex-wrap: wrap; }\n  #sh-dl-overlay .sh-dl-bar .sh-dl-hint { width: 100%; text-align: center; }\n  #sh-dl-overlay .sh-dl-bar button { min-width: 0; flex: 1 1 120px; padding: 8px; }\n  #sh-dl-overlay .sh-dl-loading .bar { max-width: calc(100vw - 32px); }\n  #sh-dl-overlay .sh-dl-pages { max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }\n  #sh-dl-overlay .sh-dl-pages .p2hv { width: max-content; max-width: none; margin: 0 auto; }\n  #scribd-fast-download-overlay { padding: 6px !important; max-width: 100vw !important; overflow-x: hidden !important; }\n  #scribd-fast-download-overlay > div:first-child { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; padding: 8px !important; min-width: 0 !important; }\n  #scribd-fast-download-overlay > div:first-child > strong,\n  #scribd-fast-download-overlay [data-status] { min-width: 0 !important; flex: 1 1 100% !important; }\n  #scribd-fast-download-overlay > div:first-child > div { min-width: 0 !important; flex: 1 1 100% !important; }\n  #scribd-fast-download-overlay [data-bar] { min-width: 0 !important; }\n  #scribd-fast-download-overlay [data-print],\n  #scribd-fast-download-overlay [data-close] { min-width: 0 !important; flex: 1 1 120px !important; }\n  #scribd-fast-download-overlay [data-reader] { min-height: 0 !important; }\n  #ss-download-overlay { padding: 6px !important; }\n  #ss-download-overlay .toolbar { gap: 6px !important; padding: 8px !important; flex-wrap: wrap !important; }\n  #ss-download-overlay .status { min-width: 0 !important; flex: 1 !important; }\n  #ss-download-overlay .title, #ss-download-overlay .detail { display: none !important; }\n}\n";

  function runStudocu() {
(function() {
    'use strict';

    // ========== Banner & Premium Element Selectors ==========
    const BANNER_SELECTORS = [
        '.banner-wrapper',
        '[class*="InlineBanner_inline-banner"]',
        '[class*="PremiumBannerBlobWrapper"]',
        '[class*="PremiumPageClarificationBanner"]',
        '[class*="PremiumBannerHeader"]',
        '[class*="PremiumBannerBenefitsList"]',
        '[class*="PremiumBannerButtons"]',
        '[data-test-selector="modal-document-viewer-preview-message"]',
        '[data-test-selector="preview-banner-upgrade-first-cta"]',
        '[data-test-selector="preview-banner-upload-second-cta"]',
        '._95f5f1767857',
        '._3273140306b6',
        '._8690b6fc16a3',
        '._4d5ecd011027',
        '[class*="premium-banner-wrapper"]',
        '[class*="ViewerContainer_premium"]',
    ];

    // ========== Premium Badge Selectors ==========
    const PREMIUM_BADGE_SELECTORS = [
        '[class*="PremiumBadge"]',
        '[class*="premium-badge"]',
        '[class*="premiumBadge"]',
        '[class*="PremiumLabel"]',
        '[class*="premiumLabel"]',
        '[class*="premium-label"]',
        '[class*="PremiumTag"]',
        '[class*="premiumTag"]',
        '[class*="premium-tag"]',
        '[class*="premium_tag"]',
        '[class*="premium_badge"]',
        '[class*="PremiumIcon"]',
        '[class*="premiumIcon"]',
        '[class*="premium-icon"]',
        '[data-test-selector*="premium-badge"]',
        '[data-test-selector*="premium-tag"]',
        '[data-test-selector*="premium-label"]',
    ];

    // ========== Ad & AI-Toolbar Selectors ==========
    // Ads on Studeersnel/Studocu are served via Refinery89 (r89) wrappers,
    // Google Publisher Tag (GPT) iframes, and Adagio. The "Ask a question
    // about this document" box + Mock exam/Summary/Quiz pills are the AIToolbar.
    const AD_SELECTORS = [
        '[class*="AdsContainer"]',
        'r89-standalone',
        '[id^="r89-"]',
        '[id*="r89-"]',
        'iframe[id^="google_ads_iframe"]',
        'div[id^="google_ads_iframe"]',
        '[id^="div-gpt-ad"]',
        '[id*="gpt-ad"]',
        '[id*="adagio"]',
        '[class*="adagio"]',
        '[class*="Advertisement"]',
        '[class*="advertisement"]',
    ];

    const AI_TOOLBAR_SELECTORS = [
        '[class*="AIToolbar"]',
    ];

    function removeAdsAndAI() {
        AD_SELECTORS.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(el => {
                    el.style.setProperty('display', 'none', 'important');
                    el.style.setProperty('visibility', 'hidden', 'important');
                });
            } catch(e) {}
        });
        AI_TOOLBAR_SELECTORS.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(el => {
                    el.style.setProperty('display', 'none', 'important');
                    el.style.setProperty('visibility', 'hidden', 'important');
                });
            } catch(e) {}
        });
    }

    // ========== Document Access Data (cached) ==========
    let _docAccessData = null;

    const DOC_ASSETS = 'https://doc-assets.studocu.com/';

    // Studocu signs asset URLs with a query string held in
    // documentAccess.signedQueryParams. The KEY it lives under varies per
    // document, and the value is not always a plain string:
    //   - scanned/image docs:    { global }                         (one wildcard string)
    //   - native pdf2htmlEX docs: { html, css, png, blurredPage, pages }
    // `png`/`global` are wildcard strings authorizing /html/bg{hex}.png. `pages`
    // is an ARRAY of { pageNumber, signedQueryParams } (one signed param per
    // text-bearing page), so it must never be concatenated into a URL as-is - that
    // is what produced the "bg8.png[object Object]" 403s. pickParam therefore only
    // ever returns a string.
    //
    // HOW A PAGE IS BUILT (this is the crux of issue #58). Studocu renders native
    // PDFs with pdf2htmlEX in split-page mode, so every page is TWO layers:
    //   - /html/bg{hex}.png            the FIGURE layer: rules, table borders,
    //                                  bullet glyphs, coloured boxes. No text.
    //   - /html/{objectKey}{hex}.page  the TEXT layer: positioned <span>s.
    // The `png` param is a wildcard over *.png, so the figure layer of EVERY page
    // is fetchable. The text layer is signed per page, and `pages` only ever
    // contains entries for the non-premium pages.
    //
    // Verified live against a 19-page premium doc (2026-08). For a gated page:
    //   /html/{objectKey}{hex}.page   403 with every param the client holds
    //                                 (its own key is simply absent from `pages`)
    //   /html/pages/page{n}.webp      403 (clear raster)
    //   /html/pages/page{n}.png       404
    //   /html/{objectKey}.html        200 but an empty 1 KB skeleton of <div class="pf">
    //   previewTextData.text          covers only the non-premium pages
    //   /html/pages/blurred/page{n}.webp  200, but a 140x198 thumbnail
    //   /html/bg{hex}.png             200, ~9 KB of figure art and zero text
    // So a gated page's text is not served to the client in any form. Falling back
    // to bg{hex}.png therefore does NOT "recover" the page: it replaces Studocu's
    // blurred preview with a crisp but completely empty one, which is exactly the
    // "rebuilt without text" report. isTextGated() below detects those pages so we
    // present them honestly instead of blanking them.
    function pickParam(sp, keys) {
        if (!sp) return '';
        for (const k of keys) { if (typeof sp[k] === 'string' && sp[k]) return sp[k]; }
        return '';
    }

    function getDocumentAccessData() {
        if (_docAccessData) return _docAccessData;
        try {
            const nextDataEl = document.querySelector('#__NEXT_DATA__');
            if (!nextDataEl) return null;
            const data = JSON.parse(nextDataEl.textContent);
            const da = data.props?.pageProps?.documentAccess;
            if (da && da.objectKey && da.signedQueryParams) {
                const doc = data.props?.pageProps?.document;
                const sp = da.signedQueryParams;

                // Map each text-bearing page number to its own signed param.
                const pageParams = {};
                if (Array.isArray(sp.pages)) {
                    sp.pages.forEach(p => {
                        if (p && p.pageNumber && typeof p.signedQueryParams === 'string') {
                            pageParams[p.pageNumber] = p.signedQueryParams;
                        }
                    });
                }

                _docAccessData = {
                    objectKey: da.objectKey,
                    bgParams: pickParam(sp, ['png', 'global']),
                    pageParams: pageParams,
                    blurredParams: pickParam(sp, ['blurredPage', 'global']),
                    hasBlurredPages: da.hasBlurredPages || false,
                    pageCount: doc ? (doc.numberOfPages || doc.pageCount || 0) : 0,
                    // True when this document keeps its text in separate .page
                    // fragments, i.e. it is native pdf2htmlEX output and bg{hex}.png
                    // is only a figure layer. Keyed off the PRESENCE of the `pages`
                    // key, not its length: a document with every page gated ships
                    // `pages: []`, and treating that as a scanned document would
                    // blank the whole thing. Scanned/image documents sign with a
                    // single `global` wildcard and have no `pages` key at all, and
                    // there the background image IS the page content.
                    hasTextLayer: Array.isArray(sp.pages),
                };
                return _docAccessData;
            }
        } catch(e) {}
        return null;
    }

    // pdf2htmlEX figure-layer background. HEX page number, png/global param.
    function bgImageUrl(a, pageNum) {
        if (!a.bgParams) return '';
        return DOC_ASSETS + a.objectKey + '/html/bg' + pageNum.toString(16) + '.png' + a.bgParams;
    }

    // pdf2htmlEX per-page text fragments use DECIMAL page numbers, while only
    // figure backgrounds use hexadecimal names (page 10 => objectKey10.page,
    // but its background is bga.png).
    function pageTextUrl(a, pageNum) {
        const param = a.pageParams[pageNum];
        if (!param) return '';
        return DOC_ASSETS + a.objectKey + '/html/' + a.objectKey + pageNum + '.page' + param;
    }

    // Studocu's own blurred preview raster. NOTE the numbering: backgrounds are
    // HEX (bg12.png is page 18) but these are DECIMAL (page18.webp).
    function blurredPageUrl(a, pageNum) {
        if (!a.blurredParams) return '';
        return DOC_ASSETS + a.objectKey + '/html/pages/blurred/page' + pageNum + '.webp' + a.blurredParams;
    }

    // A page is "text-gated" when the document has text layers but this page has no
    // signed entry for its own. Studocu serves no text for such a page in any form
    // (see the asset table above), so the figure-only bg{hex}.png must never be
    // presented as if it were the recovered page.
    //
    // Deliberately NOT keyed off hasBlurredPages: patchNextData() rewrites that
    // flag to false in #__NEXT_DATA__ to stop React re-blurring, which would leave
    // this predicate depending on whichever of the two ran first. `pages` is never
    // rewritten, so it is the stable signal.
    function isTextGated(a, pageNum) {
        return !!(a.hasTextLayer && !a.pageParams[pageNum]);
    }

    // Render a gated page honestly: keep Studocu's blurred preview as the page
    // image (it is the only rendering of the actual text that exists client-side)
    // and label the page, so a reader is never shown a blank sheet and left
    // guessing whether the extension failed. Idempotent.
    function markGatedPage(a, pf, pageNum) {
        if (pf.querySelector('[data-sh-gated-note]')) return;
        const blurUrl = blurredPageUrl(a, pageNum);
        let img = pf.querySelector('img');
        // The virtual scroller unmounts far-off pages, so a gated page may have no
        // image at all. Give it Studocu's preview rather than leaving a blank sheet.
        if (!img && blurUrl) {
            img = document.createElement('img');
            img.className = 'bi x0 y0 w1 h1';
            img.alt = '';
            img.dataset.shInjectedImg = '1';
            img.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
            pf.appendChild(img);
        }
        // Restore the blurred raster if an earlier pass swapped it for a gated
        // (403) or textless URL.
        if (img && blurUrl) {
            const cur = img.getAttribute('src') || '';
            if (cur.indexOf('/pages/blurred/') === -1) {
                img.removeAttribute('srcset');
                img.setAttribute('src', blurUrl);
            }
            img.loading = 'eager';
            img.style.filter = 'none';
            img.style.opacity = '1';
            img.style.visibility = 'visible';
        }
        const note = document.createElement('div');
        note.setAttribute('data-sh-gated-note', String(pageNum));
        note.className = 'sh-gated-note';
        note.textContent = 'Page ' + pageNum + ' is premium-locked. Studocu does not send ' +
            'the text of this page to non-subscribers, so it cannot be unblurred.';
        pf.appendChild(note);
    }

    let _gatedReported = false;
    function reportGatedPages(gated, total) {
        if (_gatedReported || !gated.length) return;
        _gatedReported = true;
    }

    // ========== Lazy Load & Image Fix ==========
    // Studocu's React viewer lazy-loads page backgrounds and UNMOUNTS pages that
    // scroll far out of view. So a premium page usually sits in the DOM either as
    // an empty `.pf` (no <img> at all) or as an <img loading="lazy"> that never
    // fetched because it is offscreen. Both render as the "blank page" users
    // report (issues #56/#57). We repair every page by pointing it at the
    // reconstructed full-resolution hex URL and forcing an eager fetch. Pages the
    // server refuses (403) are left untouched and retried later.

    // Convert a blurred asset URL to its clear sibling, keeping the same signed
    // param (already authorized for /html/pages/*). Returns null if not blurred.
    function deblurUrl(url) {
        if (!url || url.indexOf('/blurred/') === -1) return null;
        return url.replace('/pages/blurred/', '/pages/').replace('/blurred/', '/');
    }

    // Point an <img> at the first candidate URL that successfully loads.
    function setSrcFromCandidates(img, candidates) {
        let i = 0;
        (function tryNext() {
            if (i >= candidates.length) return;
            const url = candidates[i++];
            if (!url) return tryNext();
            img.onerror = tryNext;
            img.onload = function() { img.onerror = null; };
            img.src = url;
        })();
    }

    // Make an existing background <img> show clear, full content now.
    function forceEagerImg(img, candidates) {
        img.loading = 'eager';
        img.style.filter = 'none';
        img.style.opacity = '1';
        img.style.visibility = 'visible';
        // Case 1: a baked-in-blur raster -> swap to its clear sibling first,
        // then fall back to reconstructed candidates. A blurred image loads fine
        // (naturalWidth > 0), so this must run regardless of load state. The
        // original blurred URL is kept as the LAST candidate: when the clear
        // sibling is access-gated (403) we must land back on Studocu's preview
        // rather than on a broken or textless image.
        const cur = img.getAttribute('src') || '';
        const clear = deblurUrl(cur);
        if (clear && !img.dataset.shUnblurred) {
            img.dataset.shUnblurred = '1';
            img.removeAttribute('srcset');
            setSrcFromCandidates(img, [clear].concat(candidates).concat([cur]));
            return;
        }
        // Case 2: already showing a real image -> nothing to do.
        if (img.complete && img.naturalWidth > 0) return;
        // Case 3: a lazy/placeholder image that hasn't fetched (naturalWidth 0).
        // Force a fresh, high-priority load - clearing src first guarantees a
        // refetch even when the URL is unchanged. Prefer the img's own page asset,
        // else our reconstructed canonical URL. Bounded so the periodic re-runs
        // can't thrash a genuinely gated page (which 403s every time).
        const attempts = +(img.dataset.shForced || 0);
        if (attempts >= 3) return;
        img.dataset.shForced = attempts + 1;
        const target = (cur && cur.indexOf('/html/bg') !== -1) ? cur : (candidates[0] || cur);
        if (target) {
            img.removeAttribute('srcset');
            img.removeAttribute('data-src');
            img.src = '';
            img.src = target;
        }
    }

    // Inject a background into a `.pf` the virtual scroller has not mounted. We
    // test-load candidates via a detached Image so access-gated pages never
    // leave a broken <img> behind; we give up after a few misses.
    function injectPageImage(pf, candidates) {
        if (pf.querySelector('img')) return;               // already has an image
        if (pf.dataset.shInjecting) return;                // fetch already in flight
        if ((+(pf.dataset.shFail || 0)) >= 3) return;      // repeatedly gated - stop
        pf.dataset.shInjecting = '1';
        let i = 0;
        (function tryNext() {
            if (i >= candidates.length) {
                pf.dataset.shInjecting = '';
                pf.dataset.shFail = (+(pf.dataset.shFail || 0)) + 1;
                return;
            }
            const url = candidates[i++];
            const img = new Image();
            img.loading = 'eager';
            img.onload = function() {
                pf.dataset.shInjecting = '';
                if (!pf.querySelector('img')) {
                    img.className = 'bi x0 y0 w1 h1';
                    img.alt = '';
                    img.dataset.shInjectedImg = '1';
                    img.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;' +
                        'opacity:1;filter:none;visibility:visible;';
                    pf.style.filter = 'none';
                    pf.style.opacity = '1';
                    pf.appendChild(img);
                }
            };
            img.onerror = tryNext;
            img.src = url;
        })();
    }

    // A pdf2htmlEX .page fragment is positioned text with inline styles only. Strip
    // active content (scripts, frames, event handlers, javascript: URLs) before we
    // insert it, so a tampered CDN response can't run code in the studocu.com origin.
    function sanitizePageHtml(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script, iframe, object, embed, link, style').forEach(el => el.remove());
        doc.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                const name = attr.name.toLowerCase();
                if (name.startsWith('on')) el.removeAttribute(attr.name);
                else if ((name === 'src' || name === 'href') && /^\s*javascript:/i.test(attr.value)) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return doc.body;
    }

    // Recover the real text layer for a blank page by fetching its .page fragment
    // and rendering it in place (the pdf2htmlEX stylesheet is already on the page,
    // so fonts/positioning apply automatically). Only accessible pages return 200;
    // gated premium pages 403 and are left for the background-image fallback.
    function injectPageText(a, pf, pageNum) {
        const url = pageTextUrl(a, pageNum);
        if (!url) return;
        if (pf.dataset.shTextTried) return;
        pf.dataset.shTextTried = '1';
        fetchDocumentAsset(url)
            .then(r => (r.ok ? r.text() : null))
            .then(html => {
                if (html && html.indexOf('<span') !== -1 && pf.querySelectorAll('span').length <= 3) {
                    const body = sanitizePageHtml(html);
                    const bg = bgImageUrl(a, pageNum);
                    body.querySelectorAll('img').forEach(img => {
                        const src = img.getAttribute('src') || '';
                        if (bg && /^bg[0-9a-f]+\.png$/i.test(src)) {
                            img.setAttribute('src', bg);
                            img.loading = 'eager';
                        }
                    });
                    pf.replaceChildren(...Array.from(body.childNodes));
                    pf.style.filter = 'none';
                    pf.style.opacity = '1';
                    pf.classList.add('nofilter');
                }
            })
            .catch(() => {});
    }

    // The pages of the live viewer, excluding the clones our own download overlay
    // renders (it reuses the `.p2hv` class so the pdf2htmlEX CSS applies). Without
    // this the page numbering would shift while the overlay is open.
    function viewerPages() {
        const all = document.querySelectorAll('.pf');
        return Array.prototype.filter.call(all, function(pf) {
            return !pf.closest('#sh-dl-overlay');
        });
    }

    // Repair every page on the live site. Mounted pages get their background
    // force-loaded/unblurred; pages the virtual scroller left blank get their real
    // text layer fetched (when the server serves it) plus the reconstructed
    // background image (full content on scanned docs, harmless blank on text docs).
    // Premium-locked pages are exempt: nothing we can fetch contains their text, so
    // they are labelled rather than overwritten with an empty figure layer.
    function ensureAllPagesLoaded() {
        const a = getDocumentAccessData();
        if (!a) return;
        const pages = viewerPages();
        const gated = [];
        pages.forEach(function(pf, idx) {
            const pageNum = idx + 1;
            const bgUrl = bgImageUrl(a, pageNum);
            const candidates = bgUrl ? [bgUrl] : [];

            // Reconcile duplicates: if the viewer has since mounted its own loaded
            // image beside the fallback we injected earlier, drop ours. This runs
            // before the gated branch below, which injects a fallback of its own.
            const imgs = pf.querySelectorAll('img');
            if (imgs.length > 1) {
                const ours = pf.querySelector('img[data-sh-injected-img]');
                const real = Array.prototype.find.call(imgs, function(im) {
                    return !im.dataset.shInjectedImg && im.complete && im.naturalWidth > 0;
                });
                if (ours && real) ours.remove();
            }

            // Premium-locked page: its text layer does not exist client-side, so
            // swapping in the figure-only background would blank the page (#58).
            // Keep Studocu's blurred preview and label it instead.
            if (isTextGated(a, pageNum)) {
                gated.push(pageNum);
                markGatedPage(a, pf, pageNum);
                return;
            }
            const img = pf.querySelector('img');
            if (img) { forceEagerImg(img, candidates); return; }
            // No image mounted. If the page already shows real text, leave it.
            if (pf.querySelectorAll('span').length > 3) return;
            injectPageText(a, pf, pageNum);
            if (candidates.length) injectPageImage(pf, candidates);
        });
        reportGatedPages(gated, pages.length);
    }

    // ========== Core Functions ==========

    function removeBanners() {
        BANNER_SELECTORS.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(el => el.remove());
            } catch(e) {}
        });

        // Hide modal overlay
        const modal = document.querySelector('#modal-overlay');
        if (modal) modal.style.display = 'none';
    }

    function unblurImages() {
        // Swap every baked-in-blur raster for its clear sibling, reusing the
        // signed param already on the blurred URL. On some documents that param
        // authorizes /html/pages/* and the swap simply works; on premium documents
        // it only covers /html/pages/blurred/*, so the clear sibling 403s. We
        // therefore probe the swap through setSrcFromCandidates with the ORIGINAL
        // blurred URL as the final fallback, instead of assigning the clear URL
        // outright and leaving a broken image behind (#58).
        document.querySelectorAll('.pf img').forEach(img => {
            if (img.dataset.shUnblurred) return;
            const curSrc = img.getAttribute('src');
            const clearSrc = deblurUrl(curSrc);
            if (clearSrc) {
                img.dataset.shUnblurred = '1';
                img.removeAttribute('srcset');
                img.loading = 'eager';
                img.style.filter = 'none';
                img.style.opacity = '1';
                img.style.visibility = 'visible';
                setSrcFromCandidates(img, [clearSrc, curSrc]);
            }
            const clearData = deblurUrl(img.getAttribute('data-src'));
            if (clearData) {
                img.setAttribute('data-src', clearData);
                img.dataset.shUnblurred = '1';
            }
            // A srcset can also carry the blurred URL.
            const ss = img.getAttribute('srcset');
            if (ss && ss.indexOf('/blurred/') !== -1) {
                img.setAttribute('srcset', ss.replace(/\/pages\/blurred\//g, '/pages/').replace(/\/blurred\//g, '/'));
                img.dataset.shUnblurred = '1';
            }
        });
    }

    function removeBlur() {
        // Remove blur from page wrapper elements (.pf) which may carry the filter
        document.querySelectorAll('.pf').forEach(pf => {
            pf.style.filter = 'none';
            pf.style.webkitFilter = 'none';
            pf.style.opacity = '1';
            pf.style.userSelect = 'auto';
            pf.style.pointerEvents = 'auto';
            pf.style.clipPath = 'none';
            pf.style.webkitClipPath = 'none';
            pf.classList.add('nofilter');
            Array.from(pf.classList).forEach(cls => {
                if (cls.includes('blurred') || cls.includes('Blurred')) {
                    pf.classList.remove(cls);
                }
            });
        });

        document.querySelectorAll('.page-content').forEach(page => {
            // Remove inline filter unconditionally
            page.style.filter = 'none';
            page.style.webkitFilter = 'none';
            page.style.opacity = '1';
            page.style.userSelect = 'auto';
            page.style.pointerEvents = 'auto';
            page.style.visibility = 'visible';
            page.style.clipPath = 'none';
            page.style.webkitClipPath = 'none';
            page.style.maskImage = 'none';
            page.style.webkitMaskImage = 'none';
            page.style.color = '';

            // Add nofilter class for CSS override
            page.classList.add('nofilter');

            // Remove any blurred-related CSS module classes
            Array.from(page.classList).forEach(cls => {
                if (cls.includes('blurred') || cls.includes('Blurred')) {
                    page.classList.remove(cls);
                }
            });

            // Also remove blur from ancestor elements up to #page-container
            let ancestor = page.parentElement;
            let depth = 0;
            while (ancestor && ancestor.id !== 'page-container' && ancestor !== document.body && depth < 10) {
                const cs = getComputedStyle(ancestor);
                if (cs.filter !== 'none' || cs.opacity !== '1') {
                    ancestor.style.filter = 'none';
                    ancestor.style.webkitFilter = 'none';
                    ancestor.style.opacity = '1';
                }
                Array.from(ancestor.classList).forEach(cls => {
                    if (cls.includes('blurred') || cls.includes('Blurred')) {
                        ancestor.classList.remove(cls);
                    }
                });
                ancestor = ancestor.parentElement;
                depth++;
            }

            // Make blurred images fill the page container properly
            page.querySelectorAll('img').forEach(img => {
                img.style.width = '100%';
                img.style.height = 'auto';
                img.style.opacity = '1';
                img.style.filter = 'none';
                img.style.visibility = 'visible';
            });

            // Remove premium clarification banner siblings
            if (page.parentNode) {
                Array.from(page.parentNode.children).forEach(sibling => {
                    if (sibling !== page && sibling.className) {
                        const cn = typeof sibling.className === 'string' ? sibling.className : '';
                        if (cn.includes('PremiumPageClarification') ||
                            cn.includes('blurred') ||
                            cn.includes('Blurred') ||
                            cn.includes('premium-banner') ||
                            cn.includes('BlurredPage')) {
                            sibling.remove();
                        }
                    }
                });
            }
        });

        // Remove blurred-image-wrapper class effects (Studocu uses this for blurred pages)
        document.querySelectorAll('[class*="blurred-image-wrapper"], [class*="BlurredImage"], [class*="blurred-page"]').forEach(el => {
            el.style.filter = 'none';
            el.style.opacity = '1';
            el.style.visibility = 'visible';
            Array.from(el.classList).forEach(cls => {
                if (cls.includes('blurred') || cls.includes('Blurred')) {
                    el.classList.remove(cls);
                }
            });
        });

        // Legacy: handle old blurred-container elements
        document.querySelectorAll('.blurred-container').forEach(container => {
            container.classList.remove('blurred-container');
        });

        // Remove premium overlay divs (but NOT page content)
        document.querySelectorAll('#modal-overlay, [class*="PremiumOverlay"], [class*="premium-overlay"]').forEach(el => {
            el.style.display = 'none';
        });

        // Swap blurred images for clear versions
        unblurImages();
    }

    function removeStudocuDownloadButtons() {
        // Nút gốc được tái sử dụng bởi module tải PDF ở cuối tệp.
    }

    function removePremiumButton() {
        try {
            const premiumButton = document.querySelector('#header-position-handle')?.childNodes[0]?.childNodes[1]?.childNodes[0]?.childNodes[1];
            if (premiumButton) premiumButton.remove();
        } catch(e) {}

        // Also try removing upgrade buttons by text content
        document.querySelectorAll('a, button').forEach(el => {
            const text = el.textContent.trim().toLowerCase();
            if (text === 'upgrade' || text === 'get premium' || text === 'go premium') {
                const parent = el.closest('[class*="header"], [class*="Header"], #header-position-handle');
                if (parent) el.remove();
            }
        });
    }

    function removeRecommendations() {
        try {
            const recommendations = document.querySelector('#viewer-recommendations');
            if (recommendations && recommendations.parentNode) {
                recommendations.parentNode.remove();
            }
        } catch(e) {}
    }

    function removePremiumBadges() {
        // Remove elements matching premium badge selectors
        PREMIUM_BADGE_SELECTORS.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(el => el.remove());
            } catch(e) {}
        });

        // Remove small badge/pill elements near h1/title that contain the text "Premium"
        document.querySelectorAll('h1, [class*="Title"], [class*="title"], [class*="DocumentTitle"], [class*="documentTitle"]').forEach(titleEl => {
            const parent = titleEl.parentElement;
            if (!parent) return;
            parent.querySelectorAll('span, div, a, badge, label').forEach(el => {
                const text = el.textContent.trim();
                if (text === 'Premium' || text === 'PREMIUM') {
                    // Only remove small badge-like elements, not large containers
                    if (el.offsetHeight < 60 || el.getBoundingClientRect().width < 200) {
                        el.remove();
                    }
                }
            });
        });

        // Also find any standalone small elements with exact "Premium" text across the page
        document.querySelectorAll('span, div').forEach(el => {
            if (el.children.length <= 1 && el.textContent.trim() === 'Premium') {
                // Check if this looks like a badge (small element, not a large section)
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.width < 200 && rect.height > 0 && rect.height < 50) {
                    // Avoid removing elements that are part of the already-handled banner selectors
                    const isInBanner = el.closest('[class*="PremiumBanner"], [class*="PremiumPageClarification"], [class*="InlineBanner"]');
                    if (!isInBanner) {
                        el.remove();
                    }
                }
            }
        });
    }

    // ========== React State Patching ==========

    function patchReactBlurState() {
        // Patch React component props to mark all pages as not blurred
        // This prevents React from re-rendering pages with blur on updates
        document.querySelectorAll('.pf').forEach(pf => {
            try {
                const fiberKey = Object.keys(pf).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance'));
                if (!fiberKey) return;
                let fiber = pf[fiberKey];
                let depth = 0;
                while (fiber && depth < 10) {
                    if (fiber.memoizedProps && 'isBlurred' in fiber.memoizedProps) {
                        // Patch the props to mark as not blurred
                        fiber.memoizedProps.isBlurred = false;
                        fiber.memoizedProps.hasBlurredImage = false;
                        break;
                    }
                    fiber = fiber.return;
                    depth++;
                }
            } catch(e) {}
        });
    }

    function patchNextData() {
        // Patch __NEXT_DATA__ to remove blur flags so any client-side
        // navigation or hydration doesn't re-apply blur.
        try {
            const nextDataEl = document.querySelector('#__NEXT_DATA__');
            if (!nextDataEl) return;
            // Read (and cache) the access data from the PRISTINE JSON first: the
            // patch below clears hasBlurredPages, and reading it back afterwards
            // would report a premium document as a free one.
            getDocumentAccessData();
            const data = JSON.parse(nextDataEl.textContent);
            if (data.props?.pageProps?.documentAccess) {
                data.props.pageProps.documentAccess.hasBlurredPages = false;
            }
            nextDataEl.textContent = JSON.stringify(data);
        } catch(e) {}
    }

    // ========== Logo & Branding ==========

    function updateLogos() {
        const logoSelectors = [
            '[aria-label="StudeerSnel Logo"]',
            '[aria-label="StuDocu Logo"]',
            '[aria-label="Studocu Logo"]',
        ];

        logoSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(logo => {
                if (logo.closest('.studocuhack-logo-replaced')) return;
                const wrapper = document.createElement('div');
                wrapper.classList.add('studocuhack-logo-replaced');
                wrapper.style.cssText = 'display:inline-flex;align-items:center;gap:0;cursor:pointer;';
                wrapper.innerHTML = '<svg width="24" height="24" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0"><rect width="32" height="32" rx="6" fill="#4D8BF5"/><text x="16" y="23" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="20" fill="white">S</text></svg>'
                    + '<span style="margin-left:6px;font-weight:800;font-size:15px;white-space:nowrap;"><span style="color:inherit">STUDOCU</span><span style="color:#4D8BF5">HACK</span></span>';
                wrapper.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open('https://github.com/danieltyukov/studocuhack', '_blank');
                });
                const parent = logo.parentElement;
                if (parent) parent.replaceChild(wrapper, logo);
            });
        });
    }

    function addVersionButton() {
        if (document.querySelector('.github-button')) return;

        const browser = window.msBrowser || window.browser || window.chrome;
        if (!browser || !browser.runtime || !browser.runtime.getManifest) return;

        const version = browser.runtime.getManifest().version;
        const btn = document.createElement('button');
        btn.classList.add('github-button', 'tooltip-bottom');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 60" aria-labelledby="title" class="svg-inline--fa"><path data-name="layer" d="M32 0a32.021 32.021 0 0 0-10.1 62.4c1.6.3 2.2-.7 2.2-1.5v-6c-8.9 1.9-10.8-3.8-10.8-3.8-1.5-3.7-3.6-4.7-3.6-4.7-2.9-2 .2-1.9 .2-1.9 3.2.2 4.9 3.3 4.9 3.3 2.9 4.9 7.5 3.5 9.3 2.7a6.93 6.93 0 0 1 2-4.3c-7.1-.8-14.6-3.6-14.6-15.8a12.27 12.27 0 0 1 3.3-8.6 11.965 11.965 0 0 1 .3-8.5s2.7-.9 8.8 3.3a30.873 30.873 0 0 1 8-1.1 30.292 30.292 0 0 1 8 1.1c6.1-4.1 8.8-3.3 8.8-3.3a11.965 11.965 0 0 1 .3 8.5 12.1 12.1 0 0 1 3.3 8.6c0 12.3-7.5 15-14.6 15.8a7.746 7.746 0 0 1 2.2 5.9v8.8c0 .9.6 1.8 2.2 1.5A32.021 32.021 0 0 0 32 0z" fill="#fff"></path></svg><span>v.${version}</span><span class="tooltiptext-bottom">Check for newer releases</span>`;
        btn.addEventListener('click', () => {
            window.location.href = "https://github.com/danieltyukov/studocuhack/releases/";
        });

        const upButtons = document.querySelectorAll('.fa-cloud-arrow-up');
        if (upButtons.length > 0 && upButtons[0].parentNode && upButtons[0].parentNode.parentElement) {
            try {
                upButtons[0].parentNode.parentNode.insertBefore(btn, upButtons[0].parentNode.parentElement.children[3]);
            } catch(e) {}
        }
    }

    // ========== Main Execution ==========

    let debounceTimer = null;
    function debouncedCleanup() {
        if (debounceTimer) return;
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            patchNextData();
            removeBanners();
            removeBlur();
            ensureAllPagesLoaded();
            removePremiumBadges();
            removeStudocuDownloadButtons();
            removeAdsAndAI();
        }, 50);
    }

    function runAll() {
        patchNextData();
        removeBanners();
        removeBlur();
        ensureAllPagesLoaded();
        removePremiumButton();
        removePremiumBadges();
        removeStudocuDownloadButtons();
        removeRecommendations();
        removeAdsAndAI();
        updateLogos();
        addVersionButton();
        patchReactBlurState();
    }

    // Run immediately
    runAll();

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            patchNextData();
            runAll();
        });
    } else {
        patchNextData();
    }

    // Run on load
    window.addEventListener('load', runAll);

    // Observe DOM changes for dynamically loaded content
    const observer = new MutationObserver(mutations => {
        // Check if any new images with blurred URLs were added
        let hasNewBlurredContent = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check for blurred images in added nodes
                        if (node.tagName === 'IMG' && (node.src || '').includes('blurred')) {
                            hasNewBlurredContent = true;
                            break;
                        }
                        if (node.querySelector && node.querySelector('img[src*="blurred"]')) {
                            hasNewBlurredContent = true;
                            break;
                        }
                        // Check for blurred class names
                        const cn = node.className?.toString?.() || '';
                        if (cn.includes('blurred') || cn.includes('Blurred') || cn.includes('PremiumBanner') || cn.includes('premium-banner')) {
                            hasNewBlurredContent = true;
                            break;
                        }
                    }
                }
            }
            // Also watch for attribute changes (e.g., src attribute being set to blurred URL)
            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                const target = mutation.target;
                if (target.tagName === 'IMG' && (target.src || '').includes('blurred')) {
                    hasNewBlurredContent = true;
                }
            }
            if (hasNewBlurredContent) break;
        }

        if (hasNewBlurredContent) {
            // Run immediately for blurred content, then debounce the rest
            removeBlur();
            patchReactBlurState();
        }
        debouncedCleanup();
    });

    const observeTarget = document.body || document.documentElement;
    if (observeTarget) {
        observer.observe(observeTarget, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'class', 'style'],
        });
    }

    // Handle scroll events for lazy-loaded pages
    let scrollDebounce = null;
    const scrollHandler = () => {
        if (scrollDebounce) return;
        scrollDebounce = setTimeout(() => {
            scrollDebounce = null;
            removeBlur();
            ensureAllPagesLoaded();
            patchReactBlurState();
        }, 100);
    };

    const viewerWrapper = document.getElementById('viewer-wrapper');
    const documentWrapper = document.getElementById('document-wrapper');

    if (viewerWrapper) viewerWrapper.addEventListener('scroll', scrollHandler, { passive: true });
    if (documentWrapper) documentWrapper.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('scroll', scrollHandler, { passive: true });

    // Re-attach scroll listeners after DOM is ready (elements may not exist yet)
    document.addEventListener('DOMContentLoaded', () => {
        const vw = document.getElementById('viewer-wrapper');
        const dw = document.getElementById('document-wrapper');
        if (vw) vw.addEventListener('scroll', scrollHandler, { passive: true });
        if (dw) dw.addEventListener('scroll', scrollHandler, { passive: true });
    });

    // Sidebar toggle - re-apply logos
    const toggleButton = document.querySelector('[data-test-selector="content-sidebar-toggle"]');
    if (toggleButton) {
        toggleButton.addEventListener('click', updateLogos);
    }

    // Periodic check for React re-renders that might re-blur content
    // Runs every 2 seconds for the first 30 seconds, then every 5 seconds
    let periodicCount = 0;
    const periodicCheck = setInterval(() => {
        if (document.hidden) return;
        removeBlur();
        ensureAllPagesLoaded();
        patchReactBlurState();
        periodicCount++;
        if (periodicCount >= 15) {
            clearInterval(periodicCheck);
            // Switch to slower interval
            setInterval(() => {
                if (document.hidden) return;
                removeBlur();
                ensureAllPagesLoaded();
                patchReactBlurState();
            }, 5000);
        }
    }, 2000);
})();
// StudocuHack - Document Download
// Studocu/Studeersnel renders documents as pdf2htmlEX pages:
// a `.p2hv` container holds one `.pf` per page, each combining
// a background image (figures) with a positioned HTML text layer
// (real selectable text + embedded @font-face fonts).
//
// To download a faithful copy we:
//   1. Force every page to lazy-load (scroll through the viewer).
//   2. Clone the `.p2hv` container (keeps the CSS scope).
//   3. Inline the document's pdf2htmlEX stylesheet (fonts + layout).
//   4. Embed every background image as a data URI.
// The result is a fully self-contained HTML document that prints
// to a complete PDF (all pages, text + figures, no blank pages).
// ============================================================

(function() {
    'use strict';

    function escapeHtml(s) {
        return String(s).replace(/[&<>"]/g, function(c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    function getTitle() {
        return document.querySelector('h1')
            ? document.querySelector('h1').textContent.trim()
            : (document.title || 'document');
    }

    // Convert a baked-in-blur raster URL to its clear sibling (keeps its param).
    function deblurUrl(url) {
        if (!url || url.indexOf('/blurred/') === -1) return null;
        return url.replace('/pages/blurred/', '/pages/').replace('/blurred/', '/');
    }

    // Resolve the full-resolution page-image URL pattern. Page images are
    // HEX-numbered: .../html/bg{hexPageNum}.png{signedParams}. We reconstruct
    // these ourselves so we never depend on the low-res thumbnail the viewer
    // may have lazy-loaded for a given page.
    // Resolve the background-image URL pattern. The signing key varies per document
    // ({ html, css, png, blurredPage, pages } or just { global }); `png`/`global`
    // are wildcard strings for /html/bg{HEX}.png. `pages` is an array (per-page
    // signed params), so it must never be treated as a bg param string. Verified
    // live: the clear full-page raster /html/pages/page{n}.webp is 403 for premium
    // pages, so we don't reconstruct it - the download clones what the live page
    // already rendered (real text spans + loaded images) and only upgrades the bg
    // figure layer to full resolution.
    function getImagePattern() {
        try {
            var nd = JSON.parse(document.querySelector('#__NEXT_DATA__').textContent);
            var da = nd.props.pageProps.documentAccess;
            var sp = (da && da.signedQueryParams) || {};
            var base = da && da.objectKey ? 'https://doc-assets.studocu.com/' + da.objectKey : null;
            var bgParam = (typeof sp.png === 'string' && sp.png) ||
                          (typeof sp.global === 'string' && sp.global) || '';
            // Which pages ship a signed text layer. A page missing from this map on a
            // document that has one is premium-locked: its text is never sent to the
            // browser, so its background must NOT be swapped for the figure-only
            // bg{hex}.png, which would print a blank sheet (issue #58).
            var pageParams = {};
            if (Array.isArray(sp.pages)) {
                sp.pages.forEach(function (pg) {
                    if (pg && pg.pageNumber && typeof pg.signedQueryParams === 'string') {
                        pageParams[pg.pageNumber] = pg.signedQueryParams;
                    }
                });
            }
            var blurParam = (typeof sp.blurredPage === 'string' && sp.blurredPage) ||
                            (typeof sp.global === 'string' && sp.global) || '';
            if (base && bgParam) {
                return {
                    bgPrefix: base + '/html/bg', bgSuffix: '.png' + bgParam,
                    blurPrefix: blurParam ? base + '/html/pages/blurred/page' : '',
                    blurSuffix: '.webp' + blurParam,
                    pageParams: pageParams,
                    // Presence of the key, not its length: `pages: []` means every
                    // page is gated, not that the document is a scanned one.
                    hasTextLayer: Array.isArray(sp.pages),
                };
            }
        } catch (e) {}
        // Fallback: derive the bg pattern from a full-resolution image in the DOM.
        var imgs = document.querySelectorAll('.pf img');
        for (var i = 0; i < imgs.length; i++) {
            var s = imgs[i].src || '';
            if (s.indexOf('/bg') !== -1 && s.indexOf('doc-assets') !== -1 && imgs[i].naturalWidth > 600) {
                var m = s.match(/(.*?\/bg)[0-9a-f]+(\.png\?.*)/i);
                if (m) return { bgPrefix: m[1], bgSuffix: m[2] };
            }
        }
        return null;
    }

    // A page is "rendered" once it leaves the empty lazy placeholder state:
    // it gains its background image and/or text spans. Empty placeholders are
    // tiny (~200 chars); a loaded image-only page is ~1k; a text page is many k.
    function pageRendered(pf) {
        var hasSpans = pf.querySelectorAll('span').length > 3;
        var img = pf.querySelector('img');
        var imgLoaded = img && img.complete && img.naturalWidth > 0;
        return pf.innerHTML.length > 500 && (hasSpans || imgLoaded);
    }

    // Wait until a single page has finished rendering and its content size has
    // stabilised (so we don't clone a half-rendered text layer).
    function waitForPageReady(pf) {
        return new Promise(function(resolve) {
            var lastLen = -1, stable = 0, tries = 0;
            function check() {
                var len = pf.innerHTML.length;
                if (pageRendered(pf)) {
                    if (len === lastLen) { stable++; } else { stable = 0; lastLen = len; }
                    if (stable >= 2) { resolve(); return; }
                }
                if (tries++ > 32) { resolve(); return; } // ~2.5s safety cap per page
                setTimeout(check, 75);
            }
            check();
        });
    }

    function getDownloadScroller() {
        var candidates = [
            document.getElementById('viewer-wrapper'),
            document.getElementById('document-wrapper')
        ];
        for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i];
            if (!el || el.scrollHeight <= el.clientHeight + 1) continue;
            var overflowY = getComputedStyle(el).overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') return el;
        }
        return document.scrollingElement || document.documentElement;
    }

    function saveDownloadScroll() {
        var el = getDownloadScroller();
        return { el: el, top: el ? el.scrollTop : 0, y: window.scrollY || 0 };
    }

    function restoreDownloadScroll(saved) {
        if (!saved) return;
        try { if (saved.el) saved.el.scrollTop = saved.top; } catch (e) {}
        try { window.scrollTo(0, saved.y); } catch (e) {}
    }

    // Studocu's React viewer lazy-loads page text AND unmounts pages that
    // scroll out of view. So we capture each page incrementally: scroll to it,
    // wait until it is fully rendered, then clone it immediately (before it can
    // unmount). Returns an array of cloned `.pf` elements in page order.
    function captureAllPages(onProgress) {
        var pfs = Array.prototype.filter.call(document.querySelectorAll('.pf'), function(pf) {
            return !pf.closest('#sh-dl-overlay');
        });
        var savedScroll = saveDownloadScroll();
        var captured = [];

        return new Promise(function(resolve) {
            var i = 0;
            function next() {
                if (i >= pfs.length) {
                    restoreDownloadScroll(savedScroll);
                    resolve(captured);
                    return;
                }
                var pf = pfs[i];
                pf.scrollIntoView({ behavior: 'instant', block: 'center' });
                waitForPageReady(pf).then(function() {
                    captured.push(pf.cloneNode(true));
                    i++;
                    if (onProgress) onProgress(i, pfs.length);
                    next();
                });
            }
            next();
        });
    }

    // Fetch one image URL and return a data URI (or null on failure).
    function fetchDataUri(url) {
        return fetchDocumentAsset(url)
            .then(function(r) { return r.ok ? r.blob() : null; })
            .then(function(blob) {
                if (!blob || blob.size === 0) return null;
                return new Promise(function(resolve) {
                    var fr = new FileReader();
                    fr.onload = function() { resolve(fr.result); };
                    fr.onerror = function() { resolve(null); };
                    fr.readAsDataURL(blob);
                });
            })
            .catch(function() { return null; });
    }

    // Replace every doc-assets image src inside `root` with an embedded data URI.
    function embedImages(root, onProgress) {
        var imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
        var targets = imgs.filter(function(img) {
            var s = img.getAttribute('src') || '';
            return s.indexOf('doc-assets') !== -1 || s.indexOf('/bg') !== -1;
        });
        // De-duplicate identical srcs so each image is fetched only once.
        var unique = {};
        targets.forEach(function(img) { unique[img.getAttribute('src')] = true; });
        var urls = Object.keys(unique);
        var map = {};
        var next = 0, done = 0;
        var CONCURRENCY = 6;

        return new Promise(function(resolve) {
            function worker() {
                if (next >= urls.length) return Promise.resolve();
                var url = urls[next++];
                return fetchDataUri(url).then(function(dataUri) {
                    if (dataUri) map[url] = dataUri;
                    done++;
                    if (onProgress) onProgress(done, urls.length);
                    return worker();
                });
            }
            if (urls.length === 0) { resolve(); return; }
            var starters = [];
            for (var c = 0; c < Math.min(CONCURRENCY, urls.length); c++) starters.push(worker());
            Promise.all(starters).then(function() {
                targets.forEach(function(img) {
                    var s = img.getAttribute('src');
                    if (map[s]) {
                        img.setAttribute('src', map[s]);
                        img.removeAttribute('srcset');
                    }
                });
                resolve();
            });
        });
    }

    // Assemble the captured page clones into a fresh `.p2hv` container. The
    // pdf2htmlEX stylesheet scopes its rules under `.p2hv`, so the wrapper must
    // keep that class for fonts/positioning to apply. We also point each page's
    // background image at its full-resolution URL (by page number) so low-res
    // lazy thumbnails are replaced with the real page image.
    function assembleContainer(capturedPages, pattern) {
        var container = document.createElement('div');
        // Keep ONLY the `p2hv` class: the pdf2htmlEX stylesheet scopes its
        // font/positioning rules under `.p2hv`, but the live viewer's other
        // classes (e.g. Viewer_page-container) carry virtual-scroller layout
        // that breaks the pages when cloned out of the viewer.
        container.className = 'p2hv';

        capturedPages.forEach(function(pf, idx) {
            // Drop any of our injected helpers and force-hidden content visible.
            pf.removeAttribute('style');
            pf.querySelectorAll('.download-button-1, .github-button, [data-studocuhack]').forEach(function(e) { e.remove(); });
            pf.querySelectorAll('[style]').forEach(function(e) {
                var st = e.getAttribute('style') || '';
                if (/display:\s*none/i.test(st)) {
                    e.setAttribute('style', st.replace(/display:\s*none/ig, 'display:block'));
                }
            });
            // Upgrade the page background to its full-resolution figure layer
            // (/html/bg{HEX}.png). The text layer, when present, comes from the
            // cloned spans, so this only needs to fix the raster.
            var pageNum = idx + 1;
            var gated = !!(pattern && pattern.hasTextLayer && !pattern.pageParams[pageNum]);
            if (pattern && pattern.bgSuffix) {
                var img = pf.querySelector('img.bi') || pf.querySelector('img');
                var cur = img ? (img.getAttribute('src') || '') : '';
                if (!img) {
                    img = document.createElement('img');
                    img.className = 'bi x0 y0 w1 h1';
                    (pf.querySelector('.pc') || pf).appendChild(img);
                }
                if (gated) {
                    // Premium-locked: the clear raster and the text layer both 403,
                    // and bg{hex}.png holds only figure art. Print Studocu's blurred
                    // preview, which is the sole rendering of this page that exists,
                    // and label it. Blurred rasters are DECIMAL-numbered.
                    if (cur.indexOf('/pages/blurred/') === -1 && pattern.blurPrefix) {
                        img.setAttribute('src', pattern.blurPrefix + pageNum + pattern.blurSuffix);
                    }
                    if (!pf.querySelector('[data-sh-gated-note]')) {
                        var note = document.createElement('div');
                        note.setAttribute('data-sh-gated-note', String(pageNum));
                        note.className = 'sh-gated-note';
                        note.textContent = 'Page ' + pageNum + ' is premium-locked. Studocu does ' +
                            'not send the text of this page to non-subscribers, so it cannot be unblurred.';
                        pf.appendChild(note);
                    }
                } else {
                    // Any leftover baked-in-blur URL is de-blurred to its clear
                    // sibling first; otherwise use the reconstructed figure layer.
                    var clear = deblurUrl(cur);
                    img.setAttribute('src', clear || (pattern.bgPrefix + pageNum.toString(16) + pattern.bgSuffix));
                }
                img.removeAttribute('srcset');
                img.removeAttribute('data-src');
            }
            // The viewer hides a page's `.page-content` while it is scrolled out of
            // view. The clone must be visible in the printed copy regardless.
            pf.querySelectorAll('.page-content').forEach(function (pc) {
                pc.style.setProperty('display', 'block', 'important');
                pc.style.setProperty('filter', 'none', 'important');
                pc.style.setProperty('visibility', 'visible', 'important');
                pc.style.setProperty('opacity', '1', 'important');
            });
            container.appendChild(pf);
        });
        return container;
    }

    function applyPageSizes(container) {
        var pages = container.querySelectorAll('.pf');
        var rules = [];
        var names = {};
        pages.forEach(function(pf) {
            var rect = pf.getBoundingClientRect();
            var width = Math.round(rect.width);
            var height = Math.round(rect.height);
            if (!(width > 0 && height > 0)) return;
            var key = width + 'x' + height;
            if (!names[key]) {
                names[key] = 'dd-page-' + (rules.length + 1);
                rules.push('@page ' + names[key] + '{size:' + width + 'px ' + height + 'px;margin:0;}');
            }
            pf.style.setProperty('page', names[key]);
        });
        var style = document.getElementById('sh-dl-page-size');
        if (!style) {
            style = document.createElement('style');
            style.id = 'sh-dl-page-size';
            document.head.appendChild(style);
        }
        style.textContent = rules.join('');
        return style.textContent;
    }

    // Inject the styles for the in-page download overlay + print isolation.
    // The pdf2htmlEX document stylesheet is already loaded on the live page
    // (it lives in <head>), so the cloned `.p2hv` pages are styled automatically;
    // we only add layout for the overlay and the print rules.
    function injectOverlayStyles() {
        if (document.getElementById('sh-dl-style')) return;
        var style = document.createElement('style');
        style.id = 'sh-dl-style';
        style.textContent =
            '#sh-dl-overlay{position:fixed;inset:0;z-index:2147483647;background:#525659;overflow:auto;}' +
            '#sh-dl-overlay .sh-dl-bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;' +
            'justify-content:space-between;gap:12px;background:#1a1a2e;color:#fff;padding:10px 20px;' +
            "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}" +
            '#sh-dl-overlay .sh-dl-bar .t{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
            '#sh-dl-overlay .sh-dl-bar .actions{display:flex;gap:8px;flex-shrink:0;}' +
            '#sh-dl-overlay .sh-dl-bar button{border:0;border-radius:6px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;}' +
            '#sh-dl-overlay .sh-dl-print{background:#4D8BF5;color:#fff;}' +
            '#sh-dl-overlay .sh-dl-close{background:#444;color:#fff;}' +
            '#sh-dl-overlay .sh-dl-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;' +
            'gap:16px;height:78vh;color:#fff;font-family:sans-serif;}' +
            '#sh-dl-overlay .sh-dl-loading .bar{width:320px;height:10px;background:#33334d;border-radius:6px;overflow:hidden;}' +
            '#sh-dl-overlay .sh-dl-loading .fill{height:100%;width:0;background:#4D8BF5;transition:width .2s;}' +
            '#sh-dl-overlay .sh-dl-pages .p2hv{margin:0 auto;}' +
            '#sh-dl-overlay .sh-dl-pages .pf{margin:12px auto !important;background:#fff !important;' +
            'box-shadow:0 2px 8px rgba(0,0,0,.4);display:block !important;filter:none !important;opacity:1 !important;}' +
            '#sh-dl-overlay .sh-dl-pages .page-content,#sh-dl-overlay .sh-dl-pages .pc{' +
            'display:block !important;visibility:visible !important;filter:none !important;opacity:1 !important;}' +
            '#sh-dl-overlay .sh-dl-pages .pf img{filter:none !important;opacity:1 !important;visibility:visible !important;}' +
            '@media print{' +
            'body > *:not(#sh-dl-overlay){display:none !important;}' +
            'html,body{background:#fff !important;height:auto !important;overflow:visible !important;}' +
            '#sh-dl-overlay{position:static !important;inset:auto !important;overflow:visible !important;background:#fff !important;height:auto !important;}' +
            '#sh-dl-overlay .sh-dl-bar{display:none !important;}' +
            '#sh-dl-overlay .sh-dl-pages .pf{margin:0 !important;box-shadow:none !important;page-break-after:always;break-after:page;}' +
            '#sh-dl-overlay .sh-dl-pages .pf:last-child{page-break-after:auto;}' +
            '@page{margin:0;}' +
            '}';
        document.head.appendChild(style);
    }

    // Build the overlay DOM (loading state). Returns handles for updating it.
    function createOverlay(title) {
        var overlay = document.createElement('div');
        overlay.id = 'sh-dl-overlay';

        var bar = document.createElement('div');
        bar.className = 'sh-dl-bar';
        var titleEl = document.createElement('div');
        titleEl.className = 't';
        titleEl.textContent = title;
        var meta = document.createElement('span');
        meta.className = 'sh-dl-meta';
        meta.textContent = document.querySelectorAll('.pf').length + ' trang';
        var actions = document.createElement('div');
        actions.className = 'actions';
        var printBtn = document.createElement('button');
        printBtn.className = 'sh-dl-print';
        printBtn.textContent = 'Lưu thành PDF';
        printBtn.disabled = true;
        printBtn.style.opacity = '0.5';
        printBtn.addEventListener('click', function() { window.print(); });
        var hint = document.createElement('span');
        hint.className = 'sh-dl-hint';
        hint.textContent = 'Chọn “Save as PDF” trong hộp thoại in';
        var closeBtn = document.createElement('button');
        closeBtn.className = 'sh-dl-close';
        closeBtn.textContent = 'Đóng';
        closeBtn.title = 'Đóng (Esc)';
        function closeOverlay() {
            overlay.remove();
            var sizeStyle = document.getElementById('sh-dl-page-size');
            if (sizeStyle) sizeStyle.remove();
            document.removeEventListener('keydown', onOverlayKey, true);
        }
        function onOverlayKey(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeOverlay();
            }
        }
        closeBtn.addEventListener('click', closeOverlay);
        document.addEventListener('keydown', onOverlayKey, true);
        actions.appendChild(hint);
        actions.appendChild(printBtn);
        actions.appendChild(closeBtn);
        bar.appendChild(titleEl);
        bar.appendChild(meta);
        bar.appendChild(actions);

        var loading = document.createElement('div');
        loading.className = 'sh-dl-loading';
        var msg = document.createElement('div');
        msg.textContent = 'Loading all pages…';
        var barWrap = document.createElement('div');
        barWrap.className = 'bar';
        var fill = document.createElement('div');
        fill.className = 'fill';
        barWrap.appendChild(fill);
        var sub = document.createElement('div');
        sub.style.cssText = 'font-size:13px;opacity:.7;';
        loading.appendChild(msg);
        loading.appendChild(barWrap);
        loading.appendChild(sub);

        var pages = document.createElement('div');
        pages.className = 'sh-dl-pages';

        overlay.appendChild(bar);
        overlay.appendChild(loading);
        overlay.appendChild(pages);

        return { overlay: overlay, fill: fill, sub: sub, loading: loading, pages: pages, printBtn: printBtn };
    }

    function generatePDF() {
        var title = getTitle();
        if (!document.querySelector('.p2hv') || document.querySelectorAll('.pf').length === 0) {
            alert('StudocuHack: Could not find the document pages. Try scrolling the document, then click Download again.');
            return;
        }

        injectOverlayStyles();
        var ui = createOverlay(title);
        document.body.appendChild(ui.overlay);

        var pattern = getImagePattern();

        // The capture must run while THIS tab is focused (a backgrounded tab
        // throttles timers and pauses lazy-loading), so we render the result in
        // the same tab rather than opening a new one.
        captureAllPages(function(done, total) {
            ui.fill.style.width = Math.round(done / total * 70) + '%';
            ui.sub.textContent = 'Capturing pages ' + done + ' / ' + total;
        }).then(function(capturedPages) {
            if (!capturedPages.length) { throw new Error('no pages'); }
            var container = assembleContainer(capturedPages, pattern);
            return embedImages(container, function(done, total) {
                ui.fill.style.width = (70 + Math.round((total ? done / total : 1) * 30)) + '%';
                ui.sub.textContent = 'Embedding images ' + done + ' / ' + total;
            }).then(function() { return container; });
        }).then(function(container) {
            ui.loading.remove();
            ui.pages.appendChild(container);
            applyPageSizes(container);
            ui.printBtn.disabled = false;
            ui.printBtn.style.opacity = '1';
            setTimeout(function() {
                window.print();
            }, 250);
        }).catch(function() {
            ui.sub.textContent = 'Could not build the document. Please refresh and try again.';
        });
    }

    // ---- Native Download button click handling ----

    var NATIVE_DOWNLOAD_SELECTOR =
        '[data-test-selector="document-viewer-download-button-topbar"], ' +
        '[data-dd-studocu-download="true"], ' +
        '[class*="TopbarActions-module"][class*="secondaryActionsWrapper"] button, ' +
        'button[class*="Button"], a[class*="Button"], ' +
        '.hidden-on-mobile button, .hidden-on-mobile a, ' +
        '.hidden-from-tablet button, .hidden-from-tablet a';
    var NATIVE_DOWNLOAD_WORDS =
        /^(download|downloaden|scarica|descargar|t[eé]l[eé]charger|herunterladen|pobierz|baixar|indir|скачать|ladda ner|last ned|lataa|tải xuống|tải về)$/i;

    function isNativeDownloadButton(button) {
        if (!button || button.closest('#sh-dl-overlay')) return false;
        if (button.matches('[data-test-selector="document-viewer-download-button-topbar"]')) return true;
        return NATIVE_DOWNLOAD_WORDS.test((button.textContent || '').trim());
    }

    function nativeDownloadButton(target) {
        if (!target || !target.closest) return null;
        var button = target.closest(NATIVE_DOWNLOAD_SELECTOR);
        return isNativeDownloadButton(button) ? button : null;
    }

    function refreshNativeDownloadButtons() {
        document.querySelectorAll(NATIVE_DOWNLOAD_SELECTOR).forEach(function(button) {
            if (isNativeDownloadButton(button)) button.dataset.ddStudocuDownload = 'true';
        });
    }

    refreshNativeDownloadButtons();
    new MutationObserver(function() {
        refreshNativeDownloadButtons();
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Capture-phase delegation - fires before React handlers.
    document.addEventListener('click', function(e) {
        var btn = nativeDownloadButton(e.target);
        if (btn) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); generatePDF(); }
    }, true);
    document.addEventListener('mousedown', function(e) {
        if (nativeDownloadButton(e.target)) e.stopPropagation();
    }, true);
    document.addEventListener('pointerdown', function(e) {
        if (nativeDownloadButton(e.target)) e.stopPropagation();
    }, true);
})();
(function() {
    'use strict';

    const SELECTORS = [
        '[class*="PremiumBannerBlobWrapper"]',
        '[class*="InlineBanner_inline-banner"]',
        '[class*="PremiumPageClarificationBanner"]',
        '[class*="PremiumBannerHeader"]',
        '[class*="PremiumBannerBenefitsList"]',
        '[class*="PremiumBannerButtons"]',
        '[data-test-selector="modal-document-viewer-preview-message"]',
        '[data-test-selector="preview-banner-upgrade-first-cta"]',
        '[data-test-selector="preview-banner-upload-second-cta"]',
        '.banner-wrapper',
        '._95f5f1767857',
        '._3273140306b6',
        // Premium badge/tag/label selectors
        '[class*="PremiumBadge"]',
        '[class*="premium-badge"]',
        '[class*="premiumBadge"]',
        '[class*="PremiumLabel"]',
        '[class*="premiumLabel"]',
        '[class*="premium-label"]',
        '[class*="PremiumTag"]',
        '[class*="premiumTag"]',
        '[class*="premium-tag"]',
        '[class*="premium_tag"]',
        '[class*="premium_badge"]',
        '[class*="PremiumIcon"]',
        '[class*="premiumIcon"]',
        '[class*="premium-icon"]',
    ];

    function removeAll() {
        SELECTORS.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(el => el.remove());
            } catch(e) {}
        });
    }

    // Run immediately
    removeAll();

    // Poll every 500ms for 10 seconds to catch late-loading banners
    let attempts = 0;
    const interval = setInterval(() => {
        removeAll();
        if (++attempts >= 20) clearInterval(interval);
    }, 500);

    // Run on page load events
    window.addEventListener('load', removeAll);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', removeAll);
    } else {
        removeAll();
    }

    // Watch for dynamically added banners
    const observer = new MutationObserver(mutations => {
        let shouldRemove = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const isRelevant = SELECTORS.some(sel => {
                            try {
                                return node.matches(sel) || node.querySelector(sel);
                            } catch(e) { return false; }
                        });
                        if (isRelevant) {
                            shouldRemove = true;
                            break;
                        }
                    }
                }
            }
            if (shouldRemove) break;
        }
        if (shouldRemove) {
            setTimeout(removeAll, 50);
        }
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    }
})();

  }
  function runScribd() {
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
    return location.pathname.match(/(?:^|\/)(?:document|doc)\/(\d+)(?:\/|$)/)?.[1] || null;
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

  function isMobileDownload(button) {
    return button.matches('[data-e2e="mobile-toolbar-download-button"]') ||
      (button.matches('button[class*="button__with-danger__root"]') &&
       !!button.querySelector('[class*="iconLeft"] svg path[d*="7.586"]'));
  }

  function makeDownloadButtonSingleAction() {
    hideTrialCta();
    removeSecondaryActions();
    const nativeButtons = [...document.querySelectorAll(
      'button[data-e2e*="download"],button[class*="button__with-danger__root"]'
    )].filter(button =>
      button.dataset.documentDownloaderAction !== 'true' &&
      !button.closest('[data-e2e="doc-actions-container"]') &&
      (button.matches('[data-e2e*="multi-format"]') ||
       button.closest('[class*="DropdownMenu-module_wrapper"]') ||
       isMobileDownload(button))
    );

    // Desktop and mobile toolbars may coexist in the DOM. Replace each visible
    // action in place so a hidden desktop button cannot remove the mobile one.
    for (const button of nativeButtons) {
      const clone = button.cloneNode(true);
      clone.dataset.documentDownloaderAction = 'true';
      clone.removeAttribute('id');
      clone.removeAttribute('aria-haspopup');
      clone.removeAttribute('aria-expanded');
      clone.removeAttribute('data-state');
      clone.querySelector('[class*="ButtonCore-module_rightIcon"], .dZ26XU, [class*="splitdropdownbutton__menuIndicator"]')?.remove();

      const wrapper = button.closest('[class*="DropdownMenu-module_wrapper"]');
      const replacement = document.createElement('div');
      replacement.dataset.documentDownloaderWrapper = 'true';
      replacement.appendChild(clone);
      if (wrapper) wrapper.replaceWith(replacement);
      else button.replaceWith(clone);
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.(
      'button[data-document-downloader-action="true"],' +
      'button[data-e2e*="download"],button[class*="button__with-danger__root"]'
    );
    if (!button ||
        button.closest('[data-e2e="doc-actions-container"]') ||
        (!button.matches('[data-document-downloader-action="true"],[data-e2e*="multi-format"]') &&
         !isMobileDownload(button) &&
         !button.closest('[class*="DropdownMenu-module_wrapper"]'))) return;
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

  }
  function runSlideShare() {
(() => {
  'use strict';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  if (window !== window.top && /\/slideshow\/embed_code\/key\//.test(location.pathname)) {
    const activeScans = new Set();
    window.addEventListener('message', async event => {
      if (event.data?.type !== 'document-downloader-scan-embed') return;
      const token = event.data.token;
      if (!token || activeScans.has(token)) return;
      activeScans.add(token);
      try {
        await sleep(350);
        const elements = [...document.querySelectorAll('[id^="slidePreview"][data-index]')];
        for (const element of elements) {
          element.scrollIntoView({ block: 'center', behavior: 'auto' });
          await sleep(45);
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
        await sleep(200);
        const slides = [...document.querySelectorAll('[id^="slidePreview"][data-index]')].map(slide => ({
          number: Number(slide.dataset.index) + 1,
          urls: [...slide.querySelectorAll('img')].flatMap(img => [
            img.currentSrc,
            img.src,
            img.getAttribute('src'),
            img.dataset.src
          ]).filter(Boolean)
        })).filter(slide => slide.number > 0 && slide.urls.length);
        window.parent.postMessage({ type: 'document-downloader-embed-result', token, slides }, '*');
      } catch (error) {
        window.parent.postMessage({ type: 'document-downloader-embed-result', token, error: error.message || String(error) }, '*');
      } finally {
        activeScans.delete(token);
      }
    });
    return;
  }

  const ID = { button: 'ss-download-pdf', overlay: 'ss-download-overlay', style: 'ss-download-style' };
  const job = { running: false, cancelled: false, request: null };

  function removeTrialCta() {
    document.querySelectorAll('button[data-cy="subscribe-button"],button[data-testid="subscribe-button"]').forEach(button => {
      const item = button.closest('li');
      (item || button).remove();
    });
    document.querySelectorAll('header a,header button,nav a,nav button').forEach(node => {
      if (node.textContent.trim().toLowerCase() === 'download free for 30 days') (node.closest('li') || node).remove();
    });
  }

  function installStyle() {
    if (document.getElementById(ID.style)) return;
    const style = document.createElement('style');
    style.id = ID.style;
    style.textContent = `
      button[data-cy="subscribe-button"],button[data-testid="subscribe-button"]{display:none!important;visibility:hidden!important;width:0!important;min-width:0!important;margin:0!important;padding:0!important;pointer-events:none!important}
      #${ID.button}{min-width:142px;justify-content:center}
      #${ID.button}:disabled{opacity:.6;cursor:wait}
      #${ID.button} .ss-download-label{display:inline-block;margin-left:8px;white-space:nowrap}
      #${ID.overlay}{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;padding:18px;background:#0f172acc;box-sizing:border-box;font:14px/1.4 Arial,sans-serif}
      #${ID.overlay} .toolbar{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:12px 12px 0 0;background:#fff;color:#172033}
      #${ID.overlay} .title{font-weight:700;white-space:nowrap}#${ID.overlay} .status{min-width:210px;color:#334155}
      #${ID.overlay} .track{flex:1;height:8px;overflow:hidden;border-radius:99px;background:#e2e8f0}#${ID.overlay} .bar{width:0;height:100%;background:#0a66c2;transition:width .2s}
      #${ID.overlay} .detail{white-space:nowrap;color:#667085;font-size:12px}#${ID.overlay} .save,#${ID.overlay} .cancel{padding:7px 12px;border-radius:7px;cursor:pointer;font-weight:600}
      #${ID.overlay} .save{border:0;background:#0a66c2;color:#fff}#${ID.overlay} .cancel{border:1px solid #cbd5e1;background:#fff}
      #${ID.overlay} iframe{flex:1;width:100%;min-height:0;border:0;background:#fff}
      @media(max-width:767px){#${ID.button}{width:48px;min-width:48px;padding-left:0;padding-right:0}#${ID.button} .ss-download-label{display:none}}
    `;
    document.head.appendChild(style);
    removeTrialCta();
  }

  function showOverlay() {
    document.getElementById(ID.overlay)?.remove();
    const el = document.createElement('div');
    el.id = ID.overlay;
    el.innerHTML = `<div class="toolbar" role="dialog" aria-modal="true"><span class="title">SlideShare PDF</span><div class="track"><div class="bar"></div></div><span class="status">Đang lấy liên kết embed…</span><span class="detail"><span class="count">0 / 0 trang</span> · <span class="percent">0%</span></span><button class="save" type="button" hidden>Lưu thành PDF</button><button class="cancel" type="button">Hủy</button></div><iframe data-reader title="SlideShare embed"></iframe>`;
    el.querySelector('.cancel').onclick = () => { job.cancelled = true; job.request?.abort?.(); update('Đang hủy…'); };
    document.body.appendChild(el);
    return el;
  }

  function update(message, current = 0, total = 0) {
    const el = document.getElementById(ID.overlay);
    if (!el) return;
    const percent = total ? Math.round(current * 100 / total) : 0;
    el.querySelector('.status').textContent = message;
    el.querySelector('.count').textContent = `${current} / ${total} trang`;
    el.querySelector('.percent').textContent = `${percent}%`;
    el.querySelector('.bar').style.width = `${percent}%`;
  }

  const closeOverlay = (delay = 0) => setTimeout(() => document.getElementById(ID.overlay)?.remove(), delay);
  const slideNo = value => Number(String(value).match(/(?:^slide|[-])(\d+)(?:-(?:2048|1024|638|320)\.)?/i)?.[1] || Number.MAX_SAFE_INTEGER);

  function cleanUrl(raw) {
    if (!raw) return null;
    try {
      const url = new URL(raw.replace(/&amp;/g, '&'), location.href);
      if (url.hostname !== 'image.slidesharecdn.com' || !/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return null;
      url.search = ''; url.hash = '';
      return url.href;
    } catch { return null; }
  }

  function imageCandidates(raw) {
    const url = cleanUrl(raw);
    if (!url) return [];
    const candidates = [];
    const add = value => {
      if (value && !candidates.includes(value)) candidates.push(value);
    };
    const sized = url.match(/^(.*)-(?:320|638|1024|2048)(\.(?:jpe?g))$/i);
    if (sized) {
      add(`${sized[1]}-2048${sized[2]}`);
      add(`${sized[1]}-1024${sized[2]}`);
    } else {
      const plain = url.match(/^(.*?)(\.(?:jpe?g))$/i);
      if (plain) add(`${plain[1]}-2048${plain[2]}`);
    }
    add(url);
    return candidates;
  }

  function bestImage(img) {
    if (!img) return null;
    const list = [];
    const add = (raw, width = 0) => { const url = cleanUrl(raw); if (url) list.push({ url, width }); };
    add(img.currentSrc || img.src, img.naturalWidth || 0); add(img.getAttribute('src')); add(img.dataset.src);
    for (const item of (img.getAttribute('srcset') || '').split(',')) {
      const match = item.trim().match(/^(\S+)(?:\s+(\d+)w)?$/); if (match) add(match[1], Number(match[2] || 0));
    }
    list.sort((a, b) => Number(/-2048\./i.test(b.url)) - Number(/-2048\./i.test(a.url)) || b.width - a.width);
    const urls = [];
    for (const item of list) {
      for (const candidate of imageCandidates(item.url)) {
        if (!urls.includes(candidate)) urls.push(candidate);
      }
    }
    return urls;
  }

  function collectSlides(doc) {
    const map = new Map();
    const elements = [...doc.querySelectorAll('[id^="slidePreview"][data-index]')];
    for (const slide of elements) {
      const number = Number(slide.dataset.index) + 1;
      const preferred = slide.querySelector('img');
      const images = [...slide.querySelectorAll('img')];
      const urls = bestImage(preferred || images.at(-1) || images[0]);
      if (number && urls?.length) map.set(number, urls);
    }
    return [...map].sort((a, b) => a[0] - b[0]).map(([number, urls]) => ({ number, urls }));
  }

  async function loadSlideElements(doc, frameWindow) {
    let slides = collectSlides(doc);
    if (!slides.length) {
      await sleep(500);
      slides = collectSlides(doc);
    }
    const elements = [...doc.querySelectorAll('[id^="slidePreview"][data-index]')];
    for (let i = 0; i < elements.length && !job.cancelled; i++) {
      elements[i].scrollIntoView({ block: 'center', behavior: 'auto' });
      update(`Đang nhận diện trang ${i + 1}/${elements.length}…`, i, elements.length);
      await sleep(45);
    }
    frameWindow.scrollTo({ top: 0, behavior: 'auto' });
    await sleep(150);
    return collectSlides(doc);
  }

  function secretUrlFromPage() {
    const scripts = [
      document.querySelector('script#__NEXT_DATA__'),
      ...document.querySelectorAll('script[type="application/json"]'),
      ...document.scripts
    ].filter(Boolean);
    const visited = new Set();
    for (const script of scripts) {
      if (visited.has(script)) continue;
      visited.add(script);
      const match = (script.textContent || '').match(/["']secretUrl["']\s*:\s*["']([A-Za-z0-9_-]+)["']/);
      if (match) return match[1];
    }
    return null;
  }

  async function getEmbedUrl() {
    const secret = secretUrlFromPage();
    if (!secret) throw new Error('Không tìm thấy mã secretUrl của tài liệu.');
    return `https://www.slideshare.net/slideshow/embed_code/key/${encodeURIComponent(secret)}`;
  }

  function loadFrame(frame, url) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Iframe Embed không phát sự kiện load sau 20 giây.')), 20000);
      frame.addEventListener('load', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      frame.src = url;
    });
  }

  function requestEmbedSlides(frame) {
    // ChromeXt can omit iframe injection. Read the same-origin Embed directly.
    const direct = async () => {
      let doc;
      try { doc = frame.contentDocument; } catch (_) { return null; }
      if (!doc) return null;
      for (let attempt = 0; attempt < 25; attempt++) {
        if (job.cancelled) throw new Error('Đã hủy');
        if (collectSlides(doc).length) {
          const slides = await loadSlideElements(doc, frame.contentWindow);
          if (slides.length) return slides;
        }
        await sleep(300);
      }
      return null;
    };
    return direct().then(slides => slides || requestEmbedSlidesByBridge(frame));
  }

  function requestEmbedSlidesByBridge(frame) {
    return new Promise((resolve, reject) => {
      const token = crypto.randomUUID();
      const timer = setTimeout(() => {
        clearInterval(retry);
        window.removeEventListener('message', receive);
        const slides = collectSlides(document);
        if (slides.length) resolve(slides);
        else reject(new Error('Không đọc được ảnh trong bản Embed.'));
      }, 15000);
      function receive(event) {
        if (event.source !== frame.contentWindow || event.data?.type !== 'document-downloader-embed-result' || event.data.token !== token) return;
        clearTimeout(timer);
        clearInterval(retry);
        window.removeEventListener('message', receive);
        if (event.data.error) {
          reject(new Error(`Bridge Embed: ${event.data.error}`));
          return;
        }
        const slides = (event.data.slides || []).map(slide => {
          const urls = [];
          for (const raw of slide.urls || []) {
            for (const candidate of imageCandidates(raw)) {
              if (!urls.includes(candidate)) urls.push(candidate);
            }
          }
          return { number: slide.number, urls };
        }).filter(slide => slide.urls.length);
        resolve(slides);
      }
      window.addEventListener('message', receive);
      const send = () => frame.contentWindow.postMessage({ type: 'document-downloader-scan-embed', token }, '*');
      const retry = setInterval(send, 500);
      send();
    });
  }

  function fetchImage(url) {
    const operation = fetchSlideshareImage(url);
    job.request = operation;
    operation.finally(() => {
      if (job.request === operation) job.request = null;
    }).catch(() => {});
    return operation;
  }

  function normalizeImage(download, url) {
    return new Promise((resolve, reject) => {
      const source = new Uint8Array(download.buffer);
      const jpeg = source.length > 3 && source[0] === 0xff && source[1] === 0xd8;
      const blob = new Blob([source], { type: download.contentType });
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        if (jpeg) {
          URL.revokeObjectURL(objectUrl);
          resolve({ bytes: source, width, height, url });
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = '#fff';
        context.fillRect(0, 0, width, height);
        context.drawImage(img, 0, 0);
        URL.revokeObjectURL(objectUrl);
        canvas.toBlob(async output => {
          if (!output) {
            reject(new Error('Không chuyển được ảnh sang JPEG.'));
            return;
          }
          const bytes = new Uint8Array(await output.arrayBuffer());
          resolve({ bytes, width, height, url });
        }, 'image/jpeg', 0.90);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`Trình duyệt không giải mã được ${download.contentType || 'ảnh'}.`));
      };
      img.src = objectUrl;
    });
  }

  async function fetchBestImage(urls) {
    let lastError;
    for (const url of urls) {
      try {
        const download = await fetchImage(url);
        return await normalizeImage(download, url);
      } catch (error) {
        if (job.cancelled) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('Không tải được ảnh');
  }

  function dimensions(bytes, type) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type })); const img = new Image();
      img.onload = () => { const size = { width: img.naturalWidth, height: img.naturalHeight }; URL.revokeObjectURL(objectUrl); resolve(size); };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Ảnh không hợp lệ')); }; img.src = objectUrl;
    });
  }

  const ascii = text => new TextEncoder().encode(text);

  function joinBytes(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(length); let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  }

  function createPdf(pages) {
    const objectCount = 2 + pages.length * 3;
    const objects = new Array(objectCount + 1);
    const pageIds = pages.map((_, index) => 3 + index * 3);
    objects[1] = ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    objects[2] = ascii(`2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>\nendobj\n`);

    pages.forEach((page, index) => {
      const pageId = 3 + index * 3, imageId = pageId + 1, contentId = pageId + 2;
      const width = page.width, height = page.height;
      const commands = ascii(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`);
      objects[pageId] = ascii(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
      objects[imageId] = joinBytes([
        ascii(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`),
        page.bytes,
        ascii('\nendstream\nendobj\n')
      ]);
      objects[contentId] = joinBytes([
        ascii(`${contentId} 0 obj\n<< /Length ${commands.length} >>\nstream\n`), commands,
        ascii('endstream\nendobj\n')
      ]);
    });

    const header = ascii('%PDF-1.4\n');
    const offsets = new Array(objectCount + 1).fill(0); let position = header.length;
    for (let id = 1; id <= objectCount; id++) { offsets[id] = position; position += objects[id].length; }
    const xrefAt = position;
    let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= objectCount; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    const trailer = ascii(`${xref}trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
    return joinBytes([header, ...objects.slice(1), trailer]);
  }

  function saveBytes(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function outputName() {
    const text = document.querySelector('h1')?.textContent?.trim() || location.pathname.split('/').filter(Boolean).at(-2) || 'slideshare';
    return `${text.normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 150)}.pdf`;
  }

  async function downloadPdf() {
    if (job.running) return; job.running = true; job.cancelled = false;
    const button = document.getElementById(ID.button);
    if (button) button.disabled = true;
    const overlay = showOverlay();
    try {
      const embedUrl = await getEmbedUrl();
      const frame = overlay.querySelector('[data-reader]');
      update('Đang mở bản Embed…');
      await loadFrame(frame, embedUrl);
      const slides = await requestEmbedSlides(frame);
      if (job.cancelled) throw new Error('Đã hủy');
      if (!slides.length) throw new Error('Không tìm thấy ảnh trong trang Embed.');
      const results = new Array(slides.length);
      const failed = [];
      let next = 0, completed = 0;
      const worker = async () => {
        while (next < slides.length) {
          if (job.cancelled) throw new Error('Đã hủy');
          const index = next++;
          const slide = slides[index];
          try {
            const image = await fetchBestImage(slide.urls);
            results[index] = { bytes: image.bytes, width: image.width, height: image.height };
          } catch (error) {
            if (job.cancelled) throw error;
            failed.push(slide.number);
          }
          completed++;
          update(`Đã xử lý ${completed}/${slides.length} trang`, completed, slides.length);
        }
      };
      await Promise.all(Array.from({ length: Math.min(10, slides.length) }, worker));
      const pages = results.filter(Boolean);
      if (!pages.length) throw new Error('Không tải thành công trang nào.');
      update('Đang hoàn thiện PDF…', slides.length, slides.length);
      const pdf = createPdf(pages);
      const save = overlay.querySelector('.save');
      const close = overlay.querySelector('.cancel');
      save.hidden = false;
      save.onclick = () => saveBytes(pdf, outputName());
      close.textContent = 'Đóng';
      close.onclick = () => closeOverlay();
      update(failed.length ? `Sẵn sàng lưu, lỗi ${failed.length} trang` : `Sẵn sàng lưu ${slides.length} trang`, slides.length, slides.length);
    } catch (error) {
      update(job.cancelled ? 'Đã hủy tải tài liệu.' : `Lỗi: ${error.message || error}`);
      const cancel = document.querySelector(`#${ID.overlay} .cancel`); if (cancel) { cancel.textContent = 'Đóng'; cancel.onclick = () => closeOverlay(); }
    } finally { job.request = null; job.running = false; if (button) button.disabled = false; }
  }

  function toolbarTarget() {
    const toolbar = document.querySelector('[data-cy="slideshow-toolbar"]');
    const groups = [...(toolbar?.querySelectorAll('.actions') || [])];
    if (groups.length) return groups.find(group => group.getClientRects().length) || groups[0];
    const wrapper = document.querySelector('[class*="metadata-toolbar"]');
    if (wrapper) return wrapper.querySelector('.actions') || wrapper;
    return document.querySelector('button[data-cy="embed-button"]')?.closest('.actions') || null;
  }

  function mount() {
    installStyle();
    removeTrialCta();
    const nativeButtons = [...document.querySelectorAll('button[data-testid="download-button"],button[data-cy^="download-button"]')]
      .filter(button => button.id !== ID.button);
    const template = nativeButtons[0] || null;
    const nativeWrapper = template?.closest('.download-button') || null;

    if (document.getElementById(ID.button)) {
      const current = document.getElementById(ID.button);
      if (nativeButtons.length && current.classList.contains('ss-floating-download')) {
        (current.closest('[data-script-download="true"]') || current).remove();
      } else {
        const target = toolbarTarget();
        if (target && !current.getClientRects().length && !target.contains(current))
          target.appendChild(current.closest('[data-script-download="true"]') || current);
        for (const button of nativeButtons) (button.closest('.download-button') || button).remove();
        return;
      }
    }

    const target = nativeButtons.length ? (nativeWrapper?.parentElement || toolbarTarget()) : document.body;
    if (!target) return;
    const neighboringButton = target.querySelector('button[data-cy="embed-button"],button[data-cy="share-button"]');
    const desktopToolbar = !nativeWrapper && !!neighboringButton;
    const wrapper = desktopToolbar ? null : document.createElement('div');
    if (wrapper) {
      wrapper.className = target === document.body ? 'ss-floating-holder' : (nativeWrapper?.className || 'download-button download-button-guest Lil-cW_root');
      wrapper.dataset.scriptDownload = 'true';
    }

    const button = document.createElement('button');
    button.id = ID.button;
    button.type = 'button';
    button.setAttribute('aria-label', template?.getAttribute('aria-label') || 'Download');
    button.className = template?.className || (desktopToolbar
      ? neighboringButton.className
      : 'button _4HgN-q_root _4HgN-q_accent _4HgN-q_filled _4HgN-q_large');
    button.innerHTML = template?.innerHTML || `<span><span class="_4HgN-q_iconSlot"><span class="_4HgN-q_iconEl"><span role="img" aria-label="download icon" class="icon J9mFQG_icon J9mFQG_mask" style="--icon:url(/images/next/svg/download.svg)"></span></span><span class="_4HgN-q_spinnerEl"><svg class="spinner" viewBox="0 0 50 50" width="24" height="24" fill="currentColor"><path d="M43.935 25.145c0-10.318-8.364-18.683-18.683-18.683-10.318 0-18.683 8.365-18.683 18.683h4.068c0-8.071 6.543-14.615 14.615-14.615s14.615 6.543 14.615 14.615h4.068Z"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur=".6s" repeatCount="indefinite"/></path></svg></span></span></span>`;
    const label = button.querySelector('.ellipsis, [class*="ellipsis"]');
    if (label) label.classList.add('ss-download-label');
    if (desktopToolbar) {
      button.style.minWidth = '0';
      button.innerHTML = neighboringButton.innerHTML;
      const icon = button.querySelector('[role="img"]');
      if (icon) {
        icon.setAttribute('aria-label', 'download icon');
        icon.style.setProperty('--icon', 'url(/images/next/svg/download.svg)');
      }
      const text = button.querySelector('.ellipsis');
      if (text) { text.textContent = 'Download'; text.classList.add('ss-download-label'); }
      else button.insertAdjacentHTML('beforeend', '<span class="ss-download-label">Download</span>');
    }
    if (target === document.body && !nativeButtons.length) { button.className = 'ss-floating-download'; button.textContent = 'Tải PDF'; }
    button.onclick = downloadPdf;
    if (wrapper) wrapper.appendChild(button);
    if (nativeWrapper) nativeWrapper.replaceWith(wrapper);
    else if (template) template.replaceWith(wrapper || button);
    else target.appendChild(wrapper || button);
    for (const extra of nativeButtons.slice(1)) (extra.closest('.download-button') || extra).remove();
  }

  mount(); let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; mount(); }, 150);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();

  }
})();
