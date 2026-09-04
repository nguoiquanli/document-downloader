chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'fetch-slideshare-image') return false;
  let url;
  try {
    url = new URL(message.url);
    if (url.protocol !== 'https:' || url.hostname !== 'image.slidesharecdn.com') throw new Error();
  } catch {
    sendResponse({ ok: false, error: 'Địa chỉ ảnh không hợp lệ.' });
    return false;
  }

  fetch(url.href, { credentials: 'omit', cache: 'force-cache' })
    .then(async response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      const size = 0x8000;
      for (let i = 0; i < bytes.length; i += size) binary += String.fromCharCode(...bytes.subarray(i, i + size));
      sendResponse({ ok: true, data: btoa(binary), contentType: response.headers.get('content-type') });
    })
    .catch(error => {
      sendResponse({ ok: false, error: `Không tải được ảnh: ${error.message || error}` });
    });
  return true;
});
