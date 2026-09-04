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

  function embedUrlFromText(text) {
    const match = String(text || '').match(/<iframe[^>]+src=["']([^"']+\/embed_code\/key\/[^"']+)["']/i);
    if (!match) return null;
    const url = new URL(match[1], location.href);
    if (!/(^|\.)slideshare\.net$/.test(url.hostname)) return null;
    return location.origin + url.pathname + url.search;
  }

  async function getEmbedUrl() {
    const closePopup = textarea => {
      const dialog = textarea?.closest('dialog') || document.querySelector('dialog[open]');
      const close = dialog?.querySelector('button[data-cy="modal-close-button"][aria-label="Close"]');
      close?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      close?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      close?.click();
      if (dialog) {
        if (dialog.open) dialog.close();
        dialog.removeAttribute('open');
        dialog.hidden = true;
        dialog.remove();
      }
    };
    const read = () => {
      const textarea = document.querySelector('textarea[data-cy="share-embed-link"],#embed-code');
      const url = embedUrlFromText(textarea?.value);
      return url ? { url, textarea } : null;
    };
    const existing = read();
    if (existing) {
      closePopup(existing.textarea);
      return existing.url;
    }
    const button = document.querySelector('button[data-cy="embed-button"]');
    if (!button) throw new Error('Không tìm thấy nút Embed.');
    return new Promise((resolve, reject) => {
      let settled = false;
      const observer = new MutationObserver(check);
      const timer = setTimeout(() => finish(null), 4000);
      function finish(found) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        observer.disconnect();
        if (!found) {
          reject(new Error('Không lấy được liên kết Embed.'));
          return;
        }
        closePopup(found.textarea);
        resolve(found.url);
      }
      function check() {
        const found = read();
        if (found) finish(found);
      }
      observer.observe(document.documentElement, { childList: true, subtree: true });
      button.click();
      check();
    });
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
    return new Promise((resolve, reject) => {
      const token = crypto.randomUUID();
      const timer = setTimeout(() => {
        clearInterval(retry);
        window.removeEventListener('message', receive);
        reject(new Error('Không nhận được phản hồi từ bridge Embed. Kiểm tra all_frames hoặc origin iframe.'));
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
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        job.request = null;
        fn(value);
      };
      const timer = setTimeout(() => finish(reject, new Error('Không tải được ảnh')), 60000);
      job.request = {
        abort() {
          clearTimeout(timer);
          finish(reject, new Error('Đã hủy'));
        }
      };
      chrome.runtime.sendMessage({ type: 'fetch-slideshare-image', url }, response => {
        clearTimeout(timer);
        if (chrome.runtime.lastError || !response?.ok || !response.data) {
          const reason = chrome.runtime.lastError?.message || response?.error || 'Không tải được ảnh';
          finish(reject, new Error(reason));
          return;
        }
        const binary = atob(response.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        finish(resolve, { buffer: bytes.buffer, contentType: response.contentType || 'application/octet-stream' });
      });
    });
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
      await Promise.all(Array.from({ length: Math.min(4, slides.length) }, worker));
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
    const wrapper = document.querySelector('[class*="metadata-toolbar"][class*="wrapper"]');
    if (!wrapper) return null;
    return [...wrapper.children].find(el => el instanceof HTMLElement && /metadata-toolbar.*__actions/.test(el.className)) || wrapper;
  }

  function mount() {
    installStyle();
    removeTrialCta();
    const nativeButtons = [...document.querySelectorAll('button[data-testid="download-button"],button[data-cy="download-button-toolbar"]')]
      .filter(button => button.id !== ID.button);
    const template = nativeButtons[0] || null;
    const nativeWrapper = template?.closest('.download-button') || null;

    if (document.getElementById(ID.button)) {
      for (const button of nativeButtons) (button.closest('.download-button') || button).remove();
      return;
    }

    const target = nativeWrapper?.parentElement || toolbarTarget();
    if (!target) return;
    const wrapper = document.createElement('div');
    wrapper.className = nativeWrapper?.className || 'download-button download-button-guest DownloadButton-module__Lil-cW__root';
    wrapper.dataset.scriptDownload = 'true';

    const button = document.createElement('button');
    button.id = ID.button; button.type = 'button'; button.setAttribute('aria-label', 'Download');
    button.className = template?.className || 'button Button-module__4HgN-q__root Button-module__4HgN-q__accent Button-module__4HgN-q__filled Button-module__4HgN-q__large';
    button.innerHTML = template?.innerHTML || `<span><span class="Button-module__4HgN-q__iconSlot"><span class="Button-module__4HgN-q__iconEl"><span role="img" aria-label="download icon" class="icon Icon-module__J9mFQG__icon Icon-module__J9mFQG__mask" style="--icon:url(/images/next/svg/download.svg)"></span></span><span class="Button-module__4HgN-q__spinnerEl"><svg class="spinner" viewBox="0 0 50 50" width="24" height="24" fill="currentColor"><path d="M43.935 25.145c0-10.318-8.364-18.683-18.683-18.683-10.318 0-18.683 8.365-18.683 18.683h4.068c0-8.071 6.543-14.615 14.615-14.615s14.615 6.543 14.615 14.615h4.068Z"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur=".6s" repeatCount="indefinite"/></path></svg></span></span></span>`;
    const oldLabel = [...button.querySelectorAll('span')].reverse().find(span => !span.children.length && /^Download(?: now)?$/i.test(span.textContent.trim()));
    const label = oldLabel || document.createElement('span');
    label.textContent = 'Download'; label.classList.add('ss-download-label');
    if (!oldLabel) (button.firstElementChild || button).appendChild(label);
    button.onclick = downloadPdf; wrapper.appendChild(button);
    if (nativeWrapper) nativeWrapper.replaceWith(wrapper); else target.appendChild(wrapper);
    for (const extra of nativeButtons.slice(1)) (extra.closest('.download-button') || extra).remove();
  }

  mount(); let timer;
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(mount, 150); }).observe(document.documentElement, { childList: true, subtree: true });
})();
