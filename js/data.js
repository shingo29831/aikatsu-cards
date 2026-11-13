/**
 * Module: @role: カードマスターデータの初期定義、正規化、および裏面画像URL・入手方法の解決を担うデータモジュール
 */
(function (global) {
  'use strict';

  const OFFICIAL_CARDLIST_URL =
  const OFFICIAL_CARDLIST_BASE =
  const LOCAL_CATALOG_PATH = syncModule.LOCAL_CATALOG_PATH || 'data/cards.json';

  /** 公式HTMLの .cardModal__infoTxt から抽出したプロモカード入手方法マップ */
  const PROMO_OBTAIN_MAP = catalogModule.PROMO_OBTAIN_MAP || {};

  /**
   * 初期マスターデータ（file:// 直開き時でも動作するようフォールバックとして保持）
   */
  const DEFAULT_MASTER_DATA = catalogModule.DEFAULT_MASTER_DATA || { id: 'promo', name: 'プロモーションカード', cards: [] };

  /**
   * ネットワーク・ローカルJSON双方が取得不可の場合でも全シリーズを復元できる内蔵カタログデータ
   */
  const FALLBACK_CATALOG_DATA = catalogModule.FALLBACK_CATALOG_DATA || [];

  /**
   * 表面のimageUrlから裏面画像URL (_b.webp) を導出する
   * @param {string} frontUrl
   * @returns {string}
   */
  function deriveBackImageUrl(frontUrl) {
    if (!frontUrl) return '';
    if (/_b\.webp$/i.test(frontUrl)) return frontUrl;
    return frontUrl.replace(/\.webp$/i, '_b.webp');
  }

  /**
   * 単一シリーズオブジェクトまたは複数シリーズ配列を正規化し、フラットなカード一覧とシリーズ一覧を返す
   * @param {Object|Array} rawData
   * @returns {{ seriesList: Array<{id: string, name: string}>, cards: Array<Object>, rawStructure: Object|Array }}
   */
  function normalizeCardData(rawData) {
    if (!rawData) {
      throw new Error('カードデータが空です。');
    }

    let datasets = [];
    if (Array.isArray(rawData)) {
      if (rawData.length > 0 && rawData[0] && Array.isArray(rawData[0].cards)) {
        datasets = rawData;
      } else {
        datasets = [{ id: 'custom', name: '追加カード', cards: rawData }];
      }
    } else if (typeof rawData === 'object' && Array.isArray(rawData.cards)) {
      datasets = [rawData];
    } else {
      throw new Error('カード図鑑データの形式が正しくありません。正しいカード一覧ファイルを指定してください。');
    }

    const seriesMap = new Map();
    const cards = [];
    const seenCardIds = new Set();

    datasets.forEach((seriesObj, idx) => {
      const defaultSeriesId = String(seriesObj.id || `series_${idx + 1}`);
      const defaultSeriesName = String(seriesObj.name || defaultSeriesId);

      (seriesObj.cards || []).forEach((card) => {
        if (!card || !card.id) return;
        const id = String(card.id).trim();
        if (seenCardIds.has(id)) return;
        seenCardIds.add(id);

        const inferred = inferSeriesFromNumber(card.number || id);
        const seriesId = String(card.seriesId || seriesObj.id || inferred.seriesId || defaultSeriesId);
        const seriesName = String(card.seriesName || seriesObj.name || inferred.seriesName || defaultSeriesName);

        if (!seriesMap.has(seriesId)) {
          seriesMap.set(seriesId, { id: seriesId, name: seriesName });
        }

        const rarity = String(card.rarity || 'N').trim();
        const category = String(card.category || '').trim();
        const rawImage = String(card.imageUrl || '').trim() || `../images/cardlist/card/${id}_${rarity}.webp`;
        const imageUrl = resolveOfficialUrl(rawImage, OFFICIAL_CARDLIST_BASE);

        cards.push({
          id,
          number: String(card.number || id).trim(),
          name: String(card.name || id).trim(),
          rarity,
          type: String(card.type || '').trim(),
          category,
          brand: String(card.brand || 'ノーブランド').trim(),
          imageUrl,
          backImageUrl: card.backImageUrl
            ? resolveOfficialUrl(String(card.backImageUrl), OFFICIAL_CARDLIST_BASE)
            : deriveBackImageUrl(imageUrl),
          obtainMethod: String(card.obtainMethod || PROMO_OBTAIN_MAP[id.toUpperCase()] || '').trim(),
          isSideway: Boolean(card.isSideway || category === 'アクセサリー'),
          seriesId,
          seriesName
        });
      });
    });

    return {
      seriesList: Array.from(seriesMap.values()),
      cards,
      rawStructure: rawData
    };
  }

  function resolveOfficialUrl(rawPath, baseUrl) {
    if (!rawPath) return '';
    const trimmed = String(rawPath).trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    try {
      return new URL(trimmed, baseUrl || OFFICIAL_CARDLIST_BASE).href;
    } catch (_e) {
      return trimmed;
    }
  }


  function inferSeriesFromNumber(cardNumber, officialSeriesMap) {
    const num = String(cardNumber || '').toUpperCase();
    if (num.startsWith('EP-')) {
      return {
        seriesId: 'promo',
        seriesName: (officialSeriesMap && officialSeriesMap.get('629901')) || 'プロモーションカード'
      };
    }
    const match = num.match(/^E(\d+)-/);
    if (match) {
      const bulletNo = match[1];
      const officialCode = `62900${bulletNo}`;
      return {
        seriesId: officialCode,
        seriesName: (officialSeriesMap && officialSeriesMap.get(officialCode)) || `${bulletNo}弾`
      };
    }
    return { seriesId: 'other', seriesName: 'その他' };
  }


  function buildMetadataMap(catalogData) {
    const map = new Map();
    const registerSource = (source) => {
      if (!source) return;
      try {
        const normalized = normalizeCardData(source);
        normalized.cards.forEach((card) => {
          map.set(card.id.toUpperCase(), card);
          if (card.number) {
            map.set(card.number.toUpperCase(), card);
          }
        });
      } catch (_e) {
        // 不正構造のデータソースはスキップ
      }
    };
    registerSource(FALLBACK_CATALOG_DATA);
    registerSource(catalogData);
    return map;
  }


  function parseOfficialCardListHtml(htmlText, metadataMap, baseUrl) {
    if (!htmlText || typeof htmlText !== 'string') {
      throw new Error('解析対象のHTMLが空です。');
    }

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
        const resolved = resolveOfficialUrl(href, baseUrl);
        if (resolved && !pageUrls.includes(resolved)) {
          pageUrls.push(resolved);
        }
      }
    });

    // display:none が付与された別ページ分 (pcPage-1..N, spPage-1..M) も含めて全カード要素を抽出
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

      // 例: "E1-01_PR" -> number: "E1-01", rarity: "PR"
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

      const frontUrl = resolveOfficialUrl(
        (frontModalImg && (frontModalImg.getAttribute('data-src') || frontModalImg.getAttribute('src'))) || rawFrontSrc,
        baseUrl
      );
      const backUrl = resolveOfficialUrl(
        backModalImg && (backModalImg.getAttribute('data-src') || backModalImg.getAttribute('src')),
        baseUrl
      ) || deriveBackImageUrl(frontUrl);

      // モーダル内の入手方法テキスト（改行タグはスラッシュ区切りに変換）
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
      const seriesInfo = inferSeriesFromNumber(cardId, officialSeriesMap);
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
        backImageUrl: backUrl || meta.backImageUrl || deriveBackImageUrl(frontUrl || meta.imageUrl || ''),
        obtainMethod: obtainMethod || meta.obtainMethod || PROMO_OBTAIN_MAP[cardId.toUpperCase()] || '',
        isSideway: Boolean(isSideway || meta.isSideway || category === 'アクセサリー'),
        seriesId: meta.seriesId || seriesInfo.seriesId,
        seriesName: meta.seriesName || seriesInfo.seriesName
      });
    });

    // シリーズ単位にグループ化
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
    try {
      const fetchFn = (fetchImpl || global.fetch).bind(global);
      const res = await fetchFn(LOCAL_CATALOG_PATH, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (_e) {
      return null;
    }
  }


  async function loadOfficialAndCatalogCards(options = {}) {
    const fetchedCatalog =
      options.existingCatalog || (await fetchLocalCatalogJson(options.fetchImpl));
    const localCatalog = fetchedCatalog || FALLBACK_CATALOG_DATA;
    const metadataMap = buildMetadataMap(localCatalog);

    try {
      const firstPageHtml = await fetchOfficialHtmlWithFallback(OFFICIAL_CARDLIST_URL, options.fetchImpl);
      const firstParsed = parseOfficialCardListHtml(firstPageHtml, metadataMap, OFFICIAL_CARDLIST_BASE);

      const allCardsMap = new Map();
      firstParsed.cards.forEach((c) => allCardsMap.set(c.id, c));

      // ページネーションが別URLに分割されている場合も全ページ巡回して統合
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

  global.AikatsuCardData = {
    DEFAULT_MASTER_DATA,
    FALLBACK_CATALOG_DATA,
    PROMO_OBTAIN_MAP,
    OFFICIAL_CARDLIST_URL,
    OFFICIAL_CARDLIST_BASE,
    LOCAL_CATALOG_PATH,
    deriveBackImageUrl,
    normalizeCardData,
    resolveOfficialUrl,
    inferSeriesFromNumber,
    buildMetadataMap,
    parseOfficialCardListHtml,
    fetchTextWithTimeout,
    fetchOfficialHtmlWithFallback,
    fetchLocalCatalogJson,
    loadOfficialAndCatalogCards
  };
})(window);


  function ensureModule(globalKey, requirePath) {
    if (global[globalKey]) return global[globalKey];
    if (typeof require === 'function') {
      try {
        require(requirePath);
      } catch (_e) {
        // ブラウザ環境ではscriptタグ経由で解決
      }
    }
    return global[globalKey] || {};
  }
