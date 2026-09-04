const STUDOCU_HOSTS = ['studocu.com', 'studeersnel.nl', 'studocu.vn'];
const clearingTabs = new Set();

function studocuHost(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return null;
    return STUDOCU_HOSTS.find(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) || null;
  } catch {
    return null;
  }
}

async function clearStudocuCookies(tabId, rawUrl) {
  const host = studocuHost(rawUrl);
  if (!host || clearingTabs.has(tabId)) return;
  clearingTabs.add(tabId);
  try {
    const cookies = await chrome.cookies.getAll({ domain: host });
    await Promise.all(cookies.map(cookie => {
      const domain = cookie.domain.replace(/^\./, '');
      const details = {
        url: `${cookie.secure ? 'https' : 'http'}://${domain}${cookie.path || '/'}`,
        name: cookie.name,
        storeId: cookie.storeId
      };
      if (cookie.partitionKey) details.partitionKey = cookie.partitionKey;
      return chrome.cookies.remove(details);
    }));
  } finally {
    clearingTabs.delete(tabId);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') clearStudocuCookies(tabId, changeInfo.url || tab.url || '');
});

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
