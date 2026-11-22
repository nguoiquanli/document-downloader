#!/usr/bin/env python3
"""Build the ChromeXt userscript from the extension's site modules and CSS."""

from pathlib import Path
import json

ROOT = Path(__file__).parent
OUT = ROOT / "document-downloader.user.js"

HEADER = """// ==UserScript==
// @name         Document Downloader (ChromeXt)
// @namespace    https://github.com/nguoiquanli/document-downloader
// @version      2.1.1
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

  // ChromeXt implements GM_cookie through Chrome DevTools Protocol. Its list
  // accepts a URL, so only cookies applicable to this document are removed.
  // ChromeXt's cookie API does not have the same domain-wide enumeration as
  // chrome.cookies.getAll({domain}); this difference is intentional here.
  async function clearStudocuCookiesOnce() {
    if (window !== window.top) return false;
    const key = 'document-downloader:cookie-reload';
    const target = location.href.split('#', 1)[0];
    try {
      const marker = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (marker?.url === target && Date.now() - marker.time < 30000) {
        sessionStorage.removeItem(key);
        return false;
      }
      sessionStorage.removeItem(key);
      if (typeof GM_cookie === 'undefined' || typeof GM_cookie.list !== 'function') {
        console.warn('Document Downloader: ChromeXt GM_cookie is unavailable; clear Studocu cookies manually if necessary.');
        return false;
      }
      const cookies = await GM_cookie.list({ url: target });
      if (!Array.isArray(cookies) || !cookies.length) return false;
      for (const cookie of cookies) {
        const domain = cookie.domain?.replace(/^\\./, '') || host;
        const path = cookie.path || '/';
        const url = `${cookie.secure ? 'https' : 'http'}://${domain}${path}`;
        await GM_cookie.delete({ url, name: cookie.name, domain: cookie.domain, path });
      }
      // Mark before navigating: the next document consumes this flag.
      sessionStorage.setItem(key, JSON.stringify({ url: target, time: Date.now() }));
      location.reload();
      return true;
    } catch (error) {
      console.warn('Document Downloader: cookie cleanup failed; use manual cleanup if needed.', error);
      return false;
    }
  }

  // Fetch-like response used by Studocu's original .text() and .blob() calls.
  function fetchDocumentAsset(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('ChromeXt GM_xmlhttpRequest is unavailable'));
        return;
      }
      const request = GM_xmlhttpRequest({
        method: 'GET', url, responseType: 'blob', anonymous: true,
        forceCORS: true, timeout: 60000,
        onload(response) {
          const blob = response.response instanceof Blob ? response.response : new Blob([response.response]);
          resolve({ ok: response.status >= 200 && response.status < 300,
            status: response.status, blob: () => Promise.resolve(blob), text: () => blob.text() });
        },
        onerror: () => reject(new Error('Document asset request failed')),
        ontimeout: () => reject(new Error('Document asset request timed out')),
      });
      request?.catch?.(() => {});
      if (!request) reject(new Error('ChromeXt refused the document request.'));
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
      if (await clearStudocuCookiesOnce()) return;
      installCss(STUDOCU_CSS);
      runStudocu();
    } else if (isScribd) {
      if (window !== window.top) return;
      installCss(SCRIBD_CSS);
      runScribd();
    } else if (isSlideShare && /\\/slideshow\\//.test(location.pathname)) {
      if (window === window.top || /\\/slideshow\\/embed_code\\/key\\//.test(location.pathname)) {
        if (window === window.top) installCss(SLIDESHARE_CSS);
        runSlideShare();
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
