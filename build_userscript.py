#!/usr/bin/env python3
"""Build the ChromeXt userscript from the extension's site modules and CSS."""

from pathlib import Path
import json

ROOT = Path(__file__).parent
OUT = ROOT / "document-downloader.user.js"

HEADER = """// ==UserScript==
// @name         Document Downloader (ChromeXt)
// @namespace    https://github.com/nguoiquanli/document-downloader
// @version      2.1.2
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
    if (typeof GM_addStyle === 'function') GM_addStyle(css);
    else {
      const style = document.createElement('style');
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }
  }

  // Only run on explicit request. Automatically deleting cookies on every URL
  // update made ChromeXt reload repeatedly (and could invalidate signed URLs
  // while the document was being assembled for printing).
  async function clearStudocuCookies() {
    try {
      if (typeof GM_cookie === 'undefined' || typeof GM_cookie.list !== 'function') {
        throw new Error('ChromeXt GM_cookie không khả dụng. Hãy xóa cookie trong cài đặt trình duyệt.');
      }
      const cookies = await GM_cookie.list({ url: location.href });
      if (!Array.isArray(cookies) || !cookies.length) {
        alert('Không tìm thấy cookie của trang này.');
        return;
      }
      for (const cookie of cookies) {
        const domain = cookie.domain?.replace(/^\\./, '') || host;
        const path = cookie.path || '/';
        const url = `${cookie.secure ? 'https' : 'http'}://${domain}${path}`;
        await GM_cookie.delete({ url, name: cookie.name, domain: cookie.domain, path });
      }
      location.reload();
    } catch (error) {
      console.warn('Document Downloader: cookie cleanup failed', error);
      alert('Không xóa được cookie: ' + (error.message || error));
    }
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
    if (isStudocu) {
      if (window !== window.top) return;
      if (typeof GM_registerMenuCommand === 'function')
        GM_registerMenuCommand('Xóa cookie Studocu và tải lại', clearStudocuCookies);
      installCss(STUDOCU_CSS);
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
    ]:
        script = script.replace(f'__{label}__', json.dumps((ROOT / path).read_text(), ensure_ascii=False))

    studocu = (ROOT / 'sites/studocu.js').read_text()
    studocu = studocu.replace("fetch(url, { credentials: 'omit' })", 'fetchDocumentAsset(url)')
    assert studocu.count('fetchDocumentAsset(url)') == 2
    script = script.replace('__STUDOCU_JS__', studocu)
    script = script.replace('__SCRIBD_JS__', (ROOT / 'sites/scribd.js').read_text())
    slide = (ROOT / 'sites/slideshare.js').read_text()
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
