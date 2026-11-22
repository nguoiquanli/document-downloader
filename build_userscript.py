#!/usr/bin/env python3
"""Build the ChromeXt userscript from the extension's site modules and CSS."""

from pathlib import Path
import json

ROOT = Path(__file__).parent
OUT = ROOT / "document-downloader.user.js"

HEADER = """// ==UserScript==
// @name         Document Downloader (ChromeXt)
// @namespace    https://github.com/nguoiquanli/document-downloader
// @version      2.1.6
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
// @updateURL    https://raw.githubusercontent.com/nguoiquanli/document-downloader/main/document-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/nguoiquanli/document-downloader/main/document-downloader.user.js
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
  async function clearStudocuCookies() {
    try {
      const api = typeof GM_cookie !== 'undefined' && typeof GM_cookie.list === 'function'
        && typeof GM_cookie.delete === 'function';
      const cookies = api ? await GM_cookie.list({ url: location.href }) : [];
      for (const cookie of cookies) {
        // CDP matches an exact domain/path OR a URL. Passing both can leave
        // cookies untouched when the current URL and the cookie domain differ.
        const details = { name: cookie.name, domain: cookie.domain, path: cookie.path || '/' };
        if (cookie.partitionKey) details.partitionKey = cookie.partitionKey;
        try { await GM_cookie.delete(details); }
        catch (error) { console.warn('Document Downloader: cookie domain/path deletion failed', error); }
      }
      const remaining = api ? await GM_cookie.list({ url: location.href }) : [];
      if (remaining.length) {
        for (const cookie of remaining) {
          const details = { name: cookie.name, url: location.href };
          if (cookie.partitionKey) details.partitionKey = cookie.partitionKey;
          try { await GM_cookie.delete(details); }
          catch (error) { console.warn('Document Downloader: cookie URL deletion failed', error); }
        }
      }
      // document.cookie can remove non-HttpOnly cookies when ChromeXt's CDP
      // bridge does not support deletion. HttpOnly requires GM_cookie or the
      // browser's site-data settings.
      const visible = document.cookie.split(';').map(part => part.trim().split('=')[0]).filter(Boolean);
      const paths = ['/'];
      const parts = location.pathname.split('/').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) paths.push('/' + parts.slice(0, i).join('/') + '/');
      const domains = [''];
      const hostParts = location.hostname.split('.');
      for (let i = 0; i < hostParts.length - 1; i++) domains.push(hostParts.slice(i).join('.'));
      for (const name of visible) for (const path of paths) for (const domain of domains) {
        document.cookie = `${name}=; Max-Age=0; Path=${path}${domain ? '; Domain=' + domain : ''}`;
      }
      const stillPresent = api ? await GM_cookie.list({ url: location.href }) : [];
      if (stillPresent.length) {
        throw new Error(`Còn ${stillPresent.length} cookie; hãy xóa bằng cài đặt trình duyệt.`);
      }
      if (document.cookie) throw new Error('Vẫn còn cookie của trang; hãy xóa bằng cài đặt trình duyệt.');
      if (!api && !visible.length) throw new Error('ChromeXt GM_cookie không khả dụng để kiểm tra hoặc xóa cookie HttpOnly.');
      if (api && !cookies.length && !visible.length) { alert('Không tìm thấy cookie của trang này.'); return; }
      location.reload();
    } catch (error) {
      console.warn('Document Downloader: cookie cleanup failed', error);
      alert('Không xóa được cookie: ' + (error.message || error));
    }
  }

  function installStudocuCookieButton() {
    const selector = '[data-test-selector="document-viewer-download-button-topbar"], [data-dd-studocu-download="true"], [class*="TopbarActions-module"][class*="secondaryActionsWrapper"] button';
    const downloadWords = /^(download|downloaden|scarica|descargar|t[eé]l[eé]charger|herunterladen|pobierz|baixar|indir|скачать|ladda ner|last ned|lataa|tải xuống|tải về)$/i;
    const mount = () => {
      for (const download of document.querySelectorAll(selector)) {
        if (!download.matches('[data-test-selector="document-viewer-download-button-topbar"], [data-dd-studocu-download="true"]')
            && !downloadWords.test((download.textContent || '').trim())) continue;
        if (download.closest('#sh-dl-overlay') || download.nextElementSibling?.matches('[data-dd-cookie-clear]')) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.ddCookieClear = 'true';
        button.textContent = 'Xóa cookie';
        button.setAttribute('aria-label', 'Xóa cookie Studocu');
        button.addEventListener('click', event => {
          event.preventDefault(); event.stopImmediatePropagation();
          clearStudocuCookies();
        });
        download.after(button);
      }
    };
    mount();
    let pending;
    new MutationObserver(() => { clearTimeout(pending); pending = setTimeout(mount, 100); })
      .observe(document.documentElement, { childList: true, subtree: true,
        attributes: true, attributeFilter: ['data-dd-studocu-download', 'data-test-selector'] });
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
          const type = /(?:^|\\r?\\n)content-type:\\s*([^\\r\\n]+)/i.exec(response.responseHeaders || '')?.[1];
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
        try { GM_registerMenuCommand('Xóa cookie Studocu và tải lại', clearStudocuCookies); }
        catch (error) { console.warn('Document Downloader: menu command failed', error); }
      }
      installCss(STUDOCU_CSS);
      installStudocuCookieButton();
      runStudocu();
    } else if (isScribd) {
      if (window !== window.top) return;
      installCss(SCRIBD_CSS);
      runScribd();
    } else if (isSlideShare && /\\/slideshow\\//.test(location.pathname)) {
      if (window === window.top || /\\/slideshow\\/embed_code\\/key\\//.test(location.pathname)) {
        if (window === window.top) installCss(SLIDESHARE_CSS);
        if (window !== window.top || document.readyState !== 'loading') runSlideShare();
        else document.addEventListener('DOMContentLoaded', runSlideShare, { once: true });
      }
    }
  }

  // Allow the module constants below to initialize before start() reads them.
  Promise.resolve().then(start).catch(error => console.error('Document Downloader failed to start', error));

  const STUDOCU_CSS = __STUDOCU_CSS__;
  const SCRIBD_CSS = __SCRIBD_CSS__;
  const SLIDESHARE_CSS = __SLIDESHARE_CSS__;
  const USERSCRIPT_CSS = __USERSCRIPT_CSS__;

  function runStudocu() {
__STUDOCU_JS__
  }
  function runScribd() {
__SCRIBD_JS__
  }
  function runSlideShare() {
__SLIDESHARE_JS__
  }
})();
"""


def build():
    script = HEADER
    for label, path in [
        ('STUDOCU_CSS', 'styles/studocu.css'),
        ('SCRIBD_CSS', 'styles/scribd.css'),
        ('SLIDESHARE_CSS', 'styles/slideshare.css'),
        ('USERSCRIPT_CSS', 'userscript-mobile.css'),
    ]:
        script = script.replace(f'__{label}__', json.dumps((ROOT / path).read_text(), ensure_ascii=False))

    studocu = (ROOT / 'sites/studocu.js').read_text()
    studocu = studocu.replace("fetch(url, { credentials: 'omit' })", 'fetchDocumentAsset(url)')
    assert studocu.count('fetchDocumentAsset(url)') == 2
    studocu = studocu.replace('var CONCURRENCY = 12;', 'var CONCURRENCY = 6;')
    assert studocu.count('var CONCURRENCY = 6;') == 1
    script = script.replace('__STUDOCU_JS__', studocu)
    script = script.replace('__SCRIBD_JS__', (ROOT / 'sites/scribd.js').read_text())
    slide = (ROOT / 'sites/slideshare.js').read_text()
    # ChromeXt may not inject this userscript into same-origin embed iframes.
    # Keep the iframe DOM path in the userscript without altering the extension.
    direct = '''  function requestEmbedSlides(frame) {
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

'''
    old_start = slide.index('  function requestEmbedSlides(frame) {')
    old_end = slide.index('  function fetchImage(url) {', old_start)
    # The extension's bridge body remains as the fallback after direct DOM access.
    slide = slide[:old_start] + direct + slide[old_start:old_end].replace(
        'function requestEmbedSlides(frame)', 'function requestEmbedSlidesByBridge(frame)', 1
    ).replace(
        "reject(new Error('Không nhận được phản hồi từ bridge Embed. Kiểm tra all_frames hoặc origin iframe.'));",
        "const slides = collectSlides(document);\n        if (slides.length) resolve(slides);\n        else reject(new Error('Không đọc được ảnh trong bản Embed.'));",
        1
    ) + slide[old_end:]
    begin = slide.index('  function fetchImage(url) {')
    end = slide.index('  function normalizeImage(', begin)
    slide = slide[:begin] + '''  function fetchImage(url) {
    const operation = fetchSlideshareImage(url);
    job.request = operation;
    operation.finally(() => {
      if (job.request === operation) job.request = null;
    }).catch(() => {});
    return operation;
  }

''' + slide[end:]
    script = script.replace('__SLIDESHARE_JS__', slide)
    # start() is asynchronous on Studocu, so its code runs after these consts
    # are initialized; Scribd and SlideShare also start after the current turn.
    OUT.write_text(script)
    print(f'Wrote {OUT.name}: {len(script)} characters')


if __name__ == '__main__':
    build()
