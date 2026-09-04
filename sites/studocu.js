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

    // pdf2htmlEX per-page text fragment: /html/{objectKey}{hex}.page, signed per
    // page. Returns '' when this page has no signed text entry (e.g. image docs, or
    // an image-only page). HEX page number.
    function pageTextUrl(a, pageNum) {
        const param = a.pageParams[pageNum];
        if (!param) return '';
        return DOC_ASSETS + a.objectKey + '/html/' + a.objectKey + pageNum.toString(16) + '.page' + param;
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
        doc.querySelectorAll('script, iframe, object, embed, link').forEach(el => el.remove());
        doc.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                const name = attr.name.toLowerCase();
                if (name.startsWith('on')) el.removeAttribute(attr.name);
                else if ((name === 'src' || name === 'href') && /^\s*javascript:/i.test(attr.value)) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return doc.body.innerHTML;
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
        fetch(url, { credentials: 'omit' })
            .then(r => (r.ok ? r.text() : null))
            .then(html => {
                if (html && html.indexOf('<span') !== -1 && pf.querySelectorAll('span').length <= 3) {
                    pf.innerHTML = sanitizePageHtml(html);
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
        removeBlur();
        ensureAllPagesLoaded();
        patchReactBlurState();
        periodicCount++;
        if (periodicCount >= 15) {
            clearInterval(periodicCheck);
            // Switch to slower interval
            setInterval(() => {
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
                    if (stable >= 1) { resolve(); return; }
                }
                if (tries++ > 18) { resolve(); return; }
                setTimeout(check, 100);
            }
            check();
        });
    }

    // Studocu's React viewer lazy-loads page text AND unmounts pages that
    // scroll out of view. So we capture each page incrementally: scroll to it,
    // wait until it is fully rendered, then clone it immediately (before it can
    // unmount). Returns an array of cloned `.pf` elements in page order.
    function captureAllPages(onProgress) {
        var pfs = document.querySelectorAll('.pf');
        var container = document.getElementById('viewer-wrapper') ||
                        document.getElementById('document-wrapper') ||
                        document.scrollingElement || document.documentElement;
        var savedTop = container ? container.scrollTop : 0;
        var captured = [];

        return new Promise(function(resolve) {
            var i = 0;
            function next() {
                if (i >= pfs.length) {
                    if (container) container.scrollTop = savedTop;
                    resolve(captured);
                    return;
                }
                var pf = pfs[i];
                pf.scrollIntoView({ behavior: 'instant', block: 'center' });
                waitForPageReady(pf).then(function() {
                    var clone = pf.cloneNode(true);
                    var computed = getComputedStyle(pf);
                    var sourceWidth = pf.offsetWidth || parseFloat(computed.width);
                    var sourceHeight = pf.offsetHeight || parseFloat(computed.height);
                    if (sourceWidth > 0 && sourceHeight > 0) {
                        clone.dataset.shSourceWidth = String(sourceWidth);
                        clone.dataset.shSourceHeight = String(sourceHeight);
                    }
                    captured.push(clone);
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
        return fetch(url, { credentials: 'omit' })
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
        var CONCURRENCY = 10;

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

    function fitPagesToA4(container) {
        Array.prototype.slice.call(container.children).forEach(function(pf) {
            // Use the dimensions captured in the live viewer. Measuring again in
            // the overlay can pick up responsive/print styles and double-scale a
            // page even though its visual preview still appears correct.
            var width = parseFloat(pf.dataset.shSourceWidth) || pf.offsetWidth || parseFloat(getComputedStyle(pf).width);
            var height = parseFloat(pf.dataset.shSourceHeight) || pf.offsetHeight || parseFloat(getComputedStyle(pf).height);
            if (!width || !height) return;
            var sheet = document.createElement('section');
            sheet.className = 'sh-print-sheet';
            sheet.style.setProperty('--page-width', width + 'px');
            sheet.style.setProperty('--page-height', height + 'px');
            sheet.style.setProperty('--page-scale', String(Math.min(793.700787 / width, 1122.519685 / height)));
            pf.before(sheet);
            sheet.appendChild(pf);
        });
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
            '#sh-dl-overlay .sh-print-sheet{display:contents;}' +
            '#sh-dl-overlay .sh-dl-pages .page-content,#sh-dl-overlay .sh-dl-pages .pc{' +
            'display:block !important;visibility:visible !important;filter:none !important;opacity:1 !important;}' +
            '#sh-dl-overlay .sh-dl-pages .pf img{filter:none !important;opacity:1 !important;visibility:visible !important;}' +
            '@media print{' +
            'body > *:not(#sh-dl-overlay){display:none !important;}' +
            'html,body{background:#fff !important;height:auto !important;overflow:visible !important;}' +
            '#sh-dl-overlay{position:static !important;inset:auto !important;overflow:visible !important;background:#fff !important;height:auto !important;}' +
            '#sh-dl-overlay .sh-dl-bar{display:none !important;}' +
            '#sh-dl-overlay .sh-dl-pages .p2hv{width:210mm !important;margin:0 !important;}' +
            '#sh-dl-overlay .sh-print-sheet{display:block !important;position:relative !important;width:210mm !important;height:297mm !important;' +
            'margin:0 !important;padding:0 !important;overflow:hidden !important;background:#fff !important;page-break-after:always;break-after:page;}' +
            '#sh-dl-overlay .sh-print-sheet:last-child{page-break-after:auto;break-after:auto;}' +
            '#sh-dl-overlay .sh-print-sheet>.pf{position:absolute !important;left:50% !important;top:50% !important;' +
            'width:var(--page-width) !important;height:var(--page-height) !important;margin:0 !important;box-shadow:none !important;' +
            'transform:translate(-50%,-50%) scale(var(--page-scale)) !important;' +
            'transform-origin:center center !important;page-break-after:auto !important;break-after:auto !important;}' +
            '@page{size:A4 portrait;margin:0;}' +
            '}';
        document.head.appendChild(style);
    }

    // Print from an isolated document so Studocu's own print/responsive layout
    // cannot re-position or apply a second scale to the captured pages.
    function printCapturedDocument(container) {
        var oldFrame = document.getElementById('sh-print-frame');
        if (oldFrame) oldFrame.remove();
        var frame = document.createElement('iframe');
        frame.id = 'sh-print-frame';
        frame.setAttribute('aria-hidden', 'true');
        // Keep an A4-sized viewport. A 1px hidden iframe would activate Studocu's
        // mobile media queries and recreate the "tiny page in one corner" bug.
        frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;';
        document.body.appendChild(frame);

        var doc = frame.contentDocument;
        doc.open();
        doc.write('<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(getTitle()) + '</title></head><body></body></html>');
        doc.close();
        document.head.querySelectorAll('link[rel="stylesheet"], style:not(#sh-dl-style)').forEach(function(node) {
            var copy = node.cloneNode(true);
            if (copy.tagName === 'LINK') copy.href = node.href;
            doc.head.appendChild(copy);
        });

        var printStyle = doc.createElement('style');
        printStyle.textContent =
            '@page{size:A4 portrait;margin:0!important;}' +
            'html,body{width:210mm!important;min-width:210mm!important;height:auto!important;margin:0!important;padding:0!important;' +
            'overflow:visible!important;background:#fff!important;box-sizing:border-box!important;}' +
            '#sh-print-root,#sh-print-root>.p2hv{display:block!important;position:static!important;width:210mm!important;' +
            'min-width:210mm!important;margin:0!important;padding:0!important;transform:none!important;zoom:1!important;}' +
            '.sh-print-sheet{display:block!important;position:relative!important;box-sizing:border-box!important;' +
            'width:210mm!important;min-width:210mm!important;max-width:210mm!important;height:297mm!important;' +
            'min-height:297mm!important;max-height:297mm!important;margin:0!important;padding:0!important;border:0!important;' +
            'overflow:hidden!important;background:#fff!important;break-inside:avoid!important;page-break-inside:avoid!important;' +
            'break-after:page!important;page-break-after:always!important;}' +
            '.sh-print-sheet:last-child{break-after:auto!important;page-break-after:auto!important;}' +
            '.sh-print-sheet>.pf{display:block!important;position:absolute!important;left:50%!important;top:50%!important;' +
            'width:var(--page-width)!important;min-width:0!important;max-width:none!important;' +
            'height:var(--page-height)!important;min-height:0!important;max-height:none!important;' +
            'margin:0!important;padding:0!important;border:0!important;box-shadow:none!important;' +
            'transform:translate(-50%,-50%) scale(var(--page-scale))!important;transform-origin:center center!important;' +
            'break-inside:avoid!important;page-break-inside:avoid!important;break-after:auto!important;page-break-after:auto!important;}' +
            '.pf,.pc,.page-content,.pf img{visibility:visible!important;opacity:1!important;filter:none!important;}' +
            '.pc,.page-content{display:block!important;}';
        doc.head.appendChild(printStyle);

        var root = doc.createElement('main');
        root.id = 'sh-print-root';
        root.appendChild(doc.importNode(container, true));
        doc.body.appendChild(root);
        var images = Array.prototype.slice.call(doc.images);
        var imageReady = Promise.all(images.map(function(img) {
            if (img.complete) return Promise.resolve();
            return new Promise(function(resolve) { img.onload = resolve; img.onerror = resolve; });
        }));
        var fontsReady = doc.fonts && doc.fonts.ready ? doc.fonts.ready.catch(function() {}) : Promise.resolve();
        Promise.all([imageReady, fontsReady]).then(function() {
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    frame.contentWindow.focus();
                    frame.contentWindow.print();
                });
            });
        });
        frame.contentWindow.addEventListener('afterprint', function() {
            setTimeout(function() { frame.remove(); }, 500);
        }, { once: true });
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
        var actions = document.createElement('div');
        actions.className = 'actions';
        var printBtn = document.createElement('button');
        printBtn.className = 'sh-dl-print';
        printBtn.textContent = 'Lưu thành PDF';
        printBtn.disabled = true;
        printBtn.style.opacity = '0.5';
        var closeBtn = document.createElement('button');
        closeBtn.className = 'sh-dl-close';
        closeBtn.textContent = 'Đóng';
        closeBtn.addEventListener('click', function() { overlay.remove(); });
        actions.appendChild(printBtn);
        actions.appendChild(closeBtn);
        bar.appendChild(titleEl);
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
            fitPagesToA4(container);
            ui.printBtn.disabled = false;
            ui.printBtn.style.opacity = '1';
            ui.printBtn.onclick = function() { printCapturedDocument(container); };
            setTimeout(function() {
                printCapturedDocument(container);
            }, 250);
        }).catch(function() {
            ui.sub.textContent = 'Could not build the document. Please refresh and try again.';
        });
    }

    // ---- Native Download button click handling ----

    var NATIVE_DOWNLOAD_SELECTOR =
        '[data-test-selector="document-viewer-download-button-topbar"], ' +
        '[class*="TopbarActions-module"][class*="secondaryActionsWrapper"] button[aria-label="Download"]';

    function nativeDownloadButton(target) {
        return target && target.closest ? target.closest(NATIVE_DOWNLOAD_SELECTOR) : null;
    }

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
