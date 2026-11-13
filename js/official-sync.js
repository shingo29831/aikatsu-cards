/**
 * Module: @role: 公式サイトからのカードリストHTML取得、DOM解析、およびローカルカタログとの統合ロードを担う通信・解析モジュール
 */
(function (global) {
  'use strict';

  const OFFICIAL_CARDLIST_URL = 'https://dcd.aikatsu.com/encore/cardlist/?search=true';
  const OFFICIAL_CARDLIST_BASE = 'https://dcd.aikatsu.com/encore/cardlist/';
  const LOCAL_CATALOG_PATH = 'data/cards.json';
  const SERIES_CATALOG_PATHS = ['data/cards-series1.json', 'data/cards-promo.json'];

  function getDataHelpers() {
    return global.AikatsuCardData || {};
  }

  function getCatalogConstants() {
    return global.AikatsuCatalogData || getDataHelpers();
  }

  /**
   * 公式カードリストHTML文字列を解析してカード一覧・シリーズグループ・ページURLを抽出する
   * @param {string} htmlText
   * @param {Map<string, Object>} [metadataMap]
   * @param {string} [baseUrl]
   * @returns {{ seriesGroups: Array<Object>, cards: Array<Object>, pageUrls: Array<string> }}
   */
  function parseOfficialCardListHtml(htmlText, metadataMap, baseUrl) {
    if (!htmlText || typeof htmlText !== 'string') {
      throw new Error('解析対象のHTMLが空です。');
    }

    const helpers = getDataHelpers();
    const catalog = getCatalogConstants();
    const resolveUrl = helpers.resolveOfficialUrl;
    const deriveBack = helpers.deriveBackImageUrl;
    const inferSeries = helpers.inferSeriesFromNumber;
    const promoMap = (catalog && catalog.PROMO_OBTAIN_MAP) || {};

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const metaLookup = metadataMap instanceof Map ? metadataMap : new Map();

    // 公式サイトの弾数ドロップダウンからシリーズ定義を取得
    const officialSeriesMap = new Map();
    doc.querySelectorAll('.searchBox--series .dropdown__option[data-value]').forEach((btn) => {
      const val = (btn.getAttribute('data-value') || '').trim();
      const label = (btn.textContent || '').trim();
      if (val && label) {
        officialSeriesMap.set(val, label);
      }
    });

    // 別ページへの実URLリンクが存在する場合は抽出
    const pageUrls = [];
    doc.querySelectorAll('.pagerCol a[href]').forEach((a) => {
      const href = (a.getAttribute('href') || '').trim();
      if (href && !/^javascript:/i.test(href) && href !== '#') {
        const resolved = resolveUrl(href, baseUrl || OFFICIAL_CARDLIST_BASE);
        if (resolved && !pageUrls.includes(resolved)) {
          pageUrls.push(resolved);
        }
      }
    });

    // display:none が付与された別ページ分も含めて全カード要素を抽出
    const itemEls = doc.querySelectorAll('.cardListBox .cardList__item, li.cardList__item');
    const extractedCards = [];
    const seenIds = new Set();

    itemEls.forEach((li) => {
      const thumbAnchor = li.querySelector('.cardList__thumb, a[data-src]');
      const thumbImg = li.querySelector('.cardList__img, img');
      const modalTargetId = thumbAnchor
        ? (thumbAnchor.getAttribute('data-src') || '').replace(/^#/, '').trim()
        : '';
      const modalEl =
        li.querySelector('.cardModal') ||
        (modalTargetId ? doc.getElementById(modalTargetId) : null);

      const dataSrc = modalTargetId.replace(/^cardModal-/, '').trim();
      const altToken = thumbImg ? (thumbImg.getAttribute('alt') || '').trim() : '';
      const rawFrontSrc =
        (thumbImg &&
          (thumbImg.getAttribute('data-src') ||
            thumbImg.getAttribute('data-lazy') ||
            thumbImg.getAttribute('data-original') ||
            thumbImg.getAttribute('src'))) ||
        '';
      const fileTokenMatch = rawFrontSrc.match(/\/([^\/]+?)\.webp$/i);
      const rawToken = dataSrc || altToken || (fileTokenMatch ? fileTokenMatch[1] : '');
      if (!rawToken) return;

      const tokenParts = rawToken.match(/^([A-Za-z0-9]+-\d+[A-Za-z0-9]*?)(?:_([A-Za-z0-9]+))?$/);
      const cardId = tokenParts ? tokenParts[1] : rawToken;
      const parsedRarity = tokenParts && tokenParts[2] ? tokenParts[2].toUpperCase() : '';

      if (seenIds.has(cardId)) return;
      seenIds.add(cardId);

      const frontModalImg = modalEl
        ? modalEl.querySelector('.cardModal__face--front img')
        : null;
      const backModalImg = modalEl
        ? modalEl.querySelector('.cardModal__face--back img')
        : null;

      const frontUrl = resolveUrl(
        (frontModalImg && (frontModalImg.getAttribute('data-src') || frontModalImg.getAttribute('src'))) || rawFrontSrc,
        baseUrl || OFFICIAL_CARDLIST_BASE
      );
      const backUrl =
        resolveUrl(
          backModalImg && (backModalImg.getAttribute('data-src') || backModalImg.getAttribute('src')),
          baseUrl || OFFICIAL_CARDLIST_BASE
        ) || deriveBack(frontUrl);

      let obtainMethod = '';
      if (modalEl) {
        const infoTxtEl = modalEl.querySelector('.cardModal__infoTxt');
        if (infoTxtEl) {
          const clone = infoTxtEl.cloneNode(true);
          clone.querySelectorAll('br').forEach((br) => br.replaceWith(' / '));
          obtainMethod = (clone.textContent || '').replace(/\s+/g, ' ').trim();
        }
      }

      const isSideway =
        li.classList.contains('sideway') ||
        Boolean(modalEl && modalEl.classList.contains('sideway'));

      const meta = metaLookup.get(cardId.toUpperCase()) || {};
      const seriesInfo = inferSeries(cardId, officialSeriesMap);
      const category = meta.category || (isSideway ? 'アクセサリー' : '未分類');

      extractedCards.push({
        id: cardId,
        number: meta.number || cardId,
        name: meta.name || cardId,
        rarity: parsedRarity || meta.rarity || 'N',
        type: meta.type || 'キュート',
        category,
        brand: meta.brand || 'ノーブランド',
        imageUrl: frontUrl || meta.imageUrl || '',
        backImageUrl: backUrl || meta.backImageUrl || deriveBack(frontUrl || meta.imageUrl || ''),
        obtainMethod: obtainMethod || meta.obtainMethod || promoMap[cardId.toUpperCase()] || '',
        isSideway: Boolean(isSideway || meta.isSideway || category === 'アクセサリー'),
        seriesId: meta.seriesId || seriesInfo.seriesId,
        seriesName: meta.seriesName || seriesInfo.seriesName
      });
    });

    const groupMap = new Map();
    extractedCards.forEach((card) => {
      if (!groupMap.has(card.seriesId)) {
        groupMap.set(card.seriesId, {
          id: card.seriesId,
          name: card.seriesName,
          cards: []
        });
      }
      groupMap.get(card.seriesId).cards.push(card);
    });

    return {
      seriesGroups: Array.from(groupMap.values()),
      cards: extractedCards,
      pageUrls
    };
  }

  async function fetchTextWithTimeout(url, fetchFn, timeoutMs = 8000) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetchFn(url, {
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.text();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function fetchOfficialHtmlWithFallback(targetUrl, fetchImpl) {
    const fetchFn = (fetchImpl || global.fetch).bind(global);
    const candidates = [
      { url: targetUrl, type: 'raw' },
      { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, type: 'raw' },
      { url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`, type: 'allorigins-json' },
      { url: `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`, type: 'raw' },
      { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, type: 'raw' }
    ];

    for (const candidate of candidates) {
      try {
        const text = await fetchTextWithTimeout(candidate.url, fetchFn, 7500);
        const html = candidate.type === 'allorigins-json' ? JSON.parse(text).contents : text;
        if (html && html.includes('cardList')) {
          return html;
        }
      } catch (_e) {
        // 次のフォールバック候補へ移行
      }
    }
    throw new Error('公式サイトからカードリストHTMLを取得できませんでした。');
  }

  async function fetchLocalCatalogJson(fetchImpl) {
    const fetchFn = (fetchImpl || global.fetch).bind(global);
    try {
      const res = await fetchFn(LOCAL_CATALOG_PATH, { cache: 'no-store' });
      if (res && res.ok) {
        return await res.json();
      }
    } catch (_e) {
      // 分割カタログファイルの取得へフォールバック
    }

    try {
      const results = await Promise.all(
        SERIES_CATALOG_PATHS.map(async (path) => {
          const r = await fetchFn(path, { cache: 'no-store' });
          return r && r.ok ? r.json() : null;
        })
      );
      const validSeries = results.filter(Boolean);
      if (validSeries.length > 0) {
        return validSeries;
      }
    } catch (_e) {
      // 内蔵カタログへフォールバック
    }
    return null;
  }

  async function loadOfficialAndCatalogCards(options = {}) {
    const helpers = getDataHelpers();
    const catalog = getCatalogConstants();
    const fallbackData = catalog.FALLBACK_CATALOG_DATA;

    const fetchedCatalog =
      options.existingCatalog || (await fetchLocalCatalogJson(options.fetchImpl));
    const localCatalog = fetchedCatalog || fallbackData;
    const metadataMap = helpers.buildMetadataMap(localCatalog);

    try {
      const firstPageHtml = await fetchOfficialHtmlWithFallback(OFFICIAL_CARDLIST_URL, options.fetchImpl);
      const firstParsed = parseOfficialCardListHtml(firstPageHtml, metadataMap, OFFICIAL_CARDLIST_BASE);

      const allCardsMap = new Map();
      firstParsed.cards.forEach((c) => allCardsMap.set(c.id, c));

      const extraUrls = firstParsed.pageUrls.filter((u) => u !== OFFICIAL_CARDLIST_URL);
      if (extraUrls.length > 0) {
        const pageResults = await Promise.allSettled(
          extraUrls.map((pageUrl) => fetchOfficialHtmlWithFallback(pageUrl, options.fetchImpl))
        );
        pageResults.forEach((res, idx) => {
          if (res.status === 'fulfilled' && res.value) {
            const pageParsed = parseOfficialCardListHtml(res.value, metadataMap, extraUrls[idx]);
            pageParsed.cards.forEach((c) => {
              if (!allCardsMap.has(c.id)) {
                allCardsMap.set(c.id, c);
              }
            });
          }
        });
      }

      if (allCardsMap.size > 0) {
        const grouped = new Map();
        Array.from(allCardsMap.values()).forEach((card) => {
          if (!grouped.has(card.seriesId)) {
            grouped.set(card.seriesId, {
              id: card.seriesId,
              name: card.seriesName,
              cards: []
            });
          }
          grouped.get(card.seriesId).cards.push(card);
        });
        return {
          rawStructure: Array.from(grouped.values()),
          source: 'official'
        };
      }
    } catch (_err) {
      // 公式サイト接続不可時はローカルJSONへフォールバック
    }

    if (localCatalog) {
      return {
        rawStructure: localCatalog,
        source: fetchedCatalog ? 'local-json' : 'fallback-master'
      };
    }

    throw new Error('カードデータを読み込めませんでした。');
  }

  global.AikatsuOfficialSync = {
    OFFICIAL_CARDLIST_URL,
    OFFICIAL_CARDLIST_BASE,
    LOCAL_CATALOG_PATH,
    SERIES_CATALOG_PATHS,
    parseOfficialCardListHtml,
    fetchTextWithTimeout,
    fetchOfficialHtmlWithFallback,
    fetchLocalCatalogJson,
    loadOfficialAndCatalogCards
  };
})(typeof window !== 'undefined' ? window : globalThis);
