/**
 * Module: @role: 統計ダッシュボード、円形進捗ゲージ、シリーズ選択肢、およびカード一覧グリッドのDOM描画を担うUIレンダリングモジュール
 */
(function (global) {
  'use strict';

  /**
   * HTML特殊文字をエスケープする
   * @param {*} str
   * @returns {string}
   */
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 円形SVGゲージのストロークとARIA進捗属性を更新する
   * @param {Element|null} fillEl
   * @param {number} rate
   */
  function updateGaugeProgress(fillEl, rate) {
    if (!fillEl) return;
    const clamped = Math.max(0, Math.min(100, Number.isFinite(rate) ? rate : 0));
    const formatted = clamped.toFixed(1);
    // 低コンプ率(数%未満)でもゲージの色を視認可能にし、2値dasharrayでブラウザ差異を防ぐ
    const visualRate = clamped > 0 ? Math.min(100, Math.max(clamped, 5)) : 0;
    const radius = parseFloat(fillEl.getAttribute && fillEl.getAttribute('r')) || 15.9155;
    const circumference = 2 * Math.PI * radius;
    const circumferenceValue = circumference.toFixed(4);
    const dashArrayValue = `${circumferenceValue} ${circumferenceValue}`;
    const dashOffsetValue = (circumference * (1 - visualRate / 100)).toFixed(4);
    const isSub =
      fillEl.id === 'statFilteredProgressFill' ||
      Boolean(fillEl.closest && fillEl.closest('.circular-gauge--sub'));
    const strokeColor = isSub ? '#6a89cc' : '#ff4fa3';

    // pathLength依存のブラウザ間不整合を避けるため実円周長でoffset制御する
    if (fillEl.removeAttribute) {
      fillEl.removeAttribute('pathLength');
    }
    fillEl.setAttribute('fill', 'none');
    fillEl.setAttribute('stroke', strokeColor);
    fillEl.setAttribute('stroke-width', '3.6');
    fillEl.setAttribute('stroke-linecap', 'round');
    fillEl.setAttribute('stroke-dasharray', dashArrayValue);
    fillEl.setAttribute('stroke-dashoffset', dashOffsetValue);

    if (fillEl.style) {
      fillEl.style.fill = 'none';
      fillEl.style.stroke = strokeColor;
      fillEl.style.strokeWidth = '3.6';
      fillEl.style.strokeLinecap = 'round';
      fillEl.style.strokeDasharray = dashArrayValue;
      fillEl.style.strokeDashoffset = dashOffsetValue;
      // 0%時にstroke-linecap:roundの始点ドットが残るのを防ぐ
      fillEl.style.opacity = clamped > 0 ? '1' : '0';
      if (!fillEl.tagName || fillEl.tagName.toLowerCase() !== 'circle') {
        fillEl.style.width = `${formatted}%`;
      }
    }

    const svgEl = fillEl.closest ? fillEl.closest('svg') : null;
    if (svgEl) {
      svgEl.setAttribute('width', '62');
      svgEl.setAttribute('height', '62');
      if (svgEl.style) {
        svgEl.style.transform = 'rotate(-90deg)';
      }
      const trackEl = svgEl.querySelector('.circular-gauge__track');
      if (trackEl) {
        trackEl.setAttribute('fill', 'none');
        trackEl.setAttribute('stroke', '#e9dce6');
        trackEl.setAttribute('stroke-width', '3.6');
        if (trackEl.style) {
          trackEl.style.fill = 'none';
          trackEl.style.stroke = '#e9dce6';
          trackEl.style.strokeWidth = '3.6';
        }
      }
    }

    const gaugeWrap = fillEl.closest ? fillEl.closest('[role="progressbar"]') : null;
    if (gaugeWrap) {
      gaugeWrap.setAttribute('aria-valuenow', formatted);
    }
  }

  /**
   * 統計計算結果をダッシュボードDOM要素へ反映する
   * @param {Object} el
   * @param {Object} stats
   */
  function renderStatsDashboard(el, stats) {
    el.statCompRate.textContent = `${stats.overallRate.toFixed(1)}%`;
    updateGaugeProgress(el.statProgressFill, stats.overallRate);
    el.statOwnedUnique.textContent = String(stats.ownedUnique);
    el.statTotalUnique.textContent = String(stats.totalUnique);
    el.statTotalCopies.textContent = String(stats.totalCopies);
    el.statFavoriteCount.textContent = String(stats.favCount);

    el.statFilteredRate.textContent = `${stats.filteredRate.toFixed(1)}%`;
    updateGaugeProgress(el.statFilteredProgressFill, stats.filteredRate);
    el.statFilteredOwned.textContent = String(stats.filteredOwned);
    el.statFilteredTotal.textContent = String(stats.filteredTotal);
    el.resultCountNum.textContent = String(stats.filteredTotal);
  }

  /**
   * シリーズ絞り込みセレクトボックスの選択肢を再構築する
   * @param {HTMLSelectElement} selectEl
   * @param {Array<{id: string, name: string}>} seriesList
   */
  function populateSeriesSelect(selectEl, seriesList) {
    if (!selectEl) return;
    const currentVal = selectEl.value;
    selectEl.innerHTML = '<option value="">すべて</option>';
    (seriesList || []).forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      selectEl.appendChild(opt);
    });
    if ((seriesList || []).some((s) => s.id === currentVal)) {
      selectEl.value = currentVal;
    }
  }

  /**
   * data-label-full / data-label-short 属性を持つoptionの表示文言を画面幅に応じて切り替える
   * @param {HTMLSelectElement|null} selectEl
   * @param {boolean} isCompact
   */
  function syncResponsiveSelectLabels(selectEl, isCompact) {
    if (!selectEl || !selectEl.options) return;
    Array.from(selectEl.options).forEach((opt) => {
      const targetLabel = isCompact ? opt.dataset.labelShort : opt.dataset.labelFull;
      if (targetLabel && opt.textContent !== targetLabel) {
        opt.textContent = targetLabel;
      }
    });
  }

  /**
   * 表示モード（checker / binder / color）のCSSクラスとボタン選択状態を反映する
   * @param {Element} gridEl
   * @param {NodeList|Array<Element>} modeButtons
   * @param {string} validMode
   */
  function applyDisplayModeUI(gridEl, modeButtons, validMode) {
    if (gridEl) {
      gridEl.classList.remove('is-monochrome-mode', 'is-binder-view', 'is-color-mode');
      if (validMode === 'checker') {
        gridEl.classList.add('is-monochrome-mode');
      } else if (validMode === 'binder') {
        gridEl.classList.add('is-monochrome-mode', 'is-binder-view');
      } else {
        gridEl.classList.add('is-color-mode');
      }
    }

    (modeButtons || []).forEach((btn) => {
      const isActive = btn.dataset.mode === validMode;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  /**
   * カード一覧グリッドをHTML描画する
   * @param {Object} el
   * @param {Array<Object>} filteredCards
   * @param {Object} storage
   */
  function renderCardGrid(el, filteredCards, storage) {
    if (!el.cardGrid) return;

    if (!filteredCards || filteredCards.length === 0) {
      el.cardGrid.innerHTML = '';
      if (el.emptyState) el.emptyState.hidden = false;
      return;
    }

    if (el.emptyState) el.emptyState.hidden = true;

    const html = filteredCards
      .map((card) => {
        const count = storage.getCount(card.id);
        const isOwned = count > 0;
        const isFav = storage.isFavorite(card.id);
        const itemClasses = [
          'card-item',
          isOwned ? 'is-owned' : 'is-unowned',
          card.isSideway ? 'is-sideway' : ''
        ]
          .filter(Boolean)
          .join(' ');

        const idEsc = escapeHtml(card.id);
        const numEsc = escapeHtml(card.number);
        const nameEsc = escapeHtml(card.name);
        const rarityEsc = escapeHtml(card.rarity);
        const typeEsc = escapeHtml(card.type);
        const brandEsc = escapeHtml(card.brand);
        const catEsc = escapeHtml(card.category);
        const imgEsc = escapeHtml(card.imageUrl);

        return `
          <li class="${itemClasses}" data-card-id="${idEsc}" itemscope itemtype="https://schema.org/Thing">
            <div class="card-thumb-btn js-open-modal" role="button" tabindex="0" aria-label="${nameEsc} の詳細を表示">
              <span class="card-owned-badge js-btn-toggle-own ${isOwned ? 'is-owned' : ''}" title="クリックで所持状態を切り替え">
                ${isOwned ? `所持 ×${count}` : '未所持'}
              </span>
              <button type="button" class="card-fav-btn js-btn-fav ${isFav ? 'is-active' : ''}" aria-label="お気に入り" aria-pressed="${isFav}">
                ${isFav ? '★' : '☆'}
              </button>
              <img src="${imgEsc}" alt="${nameEsc}" class="card-thumb-img" loading="lazy" decoding="async" itemprop="image">
            </div>
            <div class="card-body">
              <div class="card-meta-row">
                <span class="card-number-badge" itemprop="identifier">${numEsc}</span>
                <span class="rarity-badge rarity-badge--${rarityEsc}">${rarityEsc}</span>
                ${typeEsc ? `<span class="type-badge type-badge--${typeEsc}">${typeEsc}</span>` : ''}
              </div>
              <h3 class="card-title js-open-modal" itemprop="name">${nameEsc}</h3>
              <p class="card-subinfo" itemprop="description">${brandEsc} / ${catEsc}</p>
              <div class="card-footer">
                <button type="button" class="btn btn-outline btn-xs js-btn-toggle-own">
                  ${isOwned ? '所持済' : '未所持'}
                </button>
                <div class="counter-control">
                  <button type="button" class="btn-counter js-btn-dec" aria-label="1枚減らす">−</button>
                  <span class="counter-value">${count}</span>
                  <button type="button" class="btn-counter js-btn-inc" aria-label="1枚増やす">＋</button>
                </div>
              </div>
            </div>
          </li>
        `;
      })
      .join('');

    el.cardGrid.innerHTML = html;
  }

  /**
   * 検索エンジン向けに正規URLおよびJSON-LD構造化データを動的同期する
   * @param {Array<Object>} allCards
   * @param {Array<{id: string, name: string}>} seriesList
   */
  function updateSeoMetadata(allCards, seriesList) {
    if (typeof document === 'undefined') return;

    const loc = typeof window !== 'undefined' && window.location ? window.location : null;
    const isHttp = loc && (loc.protocol === 'http:' || loc.protocol === 'https:');
    const canonicalUrl = isHttp ? `${loc.origin}${loc.pathname}` : '';

    if (canonicalUrl && document.head) {
      let canonicalEl = document.querySelector('link[rel="canonical"]');
      if (!canonicalEl) {
        canonicalEl = document.createElement('link');
        canonicalEl.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalEl);
      }
      canonicalEl.setAttribute('href', canonicalUrl);

      let ogUrlEl = document.querySelector('meta[property="og:url"]');
      if (!ogUrlEl) {
        ogUrlEl = document.createElement('meta');
        ogUrlEl.setAttribute('property', 'og:url');
        document.head.appendChild(ogUrlEl);
      }
      ogUrlEl.setAttribute('content', canonicalUrl);
    }

    const jsonLdEl = document.getElementById('structuredDataJsonLd');
    if (!jsonLdEl) return;

    const cards = Array.isArray(allCards) ? allCards : [];
    const seriesNames = (Array.isArray(seriesList) ? seriesList : [])
      .map((s) => s && s.name)
      .filter(Boolean);

    const graph = [
      {
        '@type': 'WebSite',
        name: 'アイカツ！アンコール カードコレクション管理',
        alternateName: ['AIKATSU! ENCORE カード管理', 'アイカツ！カード管理'],
        inLanguage: 'ja',
        ...(canonicalUrl ? { url: canonicalUrl } : {}),
        description:
          'アイカツ！アンコール（AIKATSU! ENCORE）のカード一覧・所持チェッカー・コレクション管理Webアプリケーション。'
      },
      {
        '@type': 'WebApplication',
        name: 'アイカツ！アンコール カードコレクション管理',
        applicationCategory: 'GameApplication',
        operatingSystem: 'All',
        inLanguage: 'ja',
        ...(canonicalUrl ? { url: canonicalUrl } : {}),
        browserRequirements: 'Requires JavaScript. Requires HTML5.',
        description:
          'アイカツ！アンコールのカード検索、所持枚数カウント、全体・絞り込みコンプリート率計算、チェッカー・バインダー表示切替、JSONバックアップに対応したコレクション管理アプリ。',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'JPY'
        }
      },
      {
        '@type': 'ItemList',
        name: 'アイカツ！アンコール カード一覧',
        description:
          seriesNames.length > 0
            ? `収録シリーズ: ${seriesNames.join(' / ')}`
            : 'アイカツ！アンコール 収録カードリスト',
        numberOfItems: cards.length,
        itemListElement: cards.map((card, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          item: {
            '@type': 'Thing',
            identifier: card.number || card.id,
            name: card.name,
            ...(card.imageUrl ? { image: card.imageUrl } : {}),
            description: [card.seriesName, card.rarity, card.type, card.brand, card.category]
              .filter(Boolean)
              .join(' / ')
          }
        }))
      }
    ];

    jsonLdEl.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': graph
    });
  }

  global.AikatsuUiRenderer = {
    escapeHtml,
    updateGaugeProgress,
    renderStatsDashboard,
    populateSeriesSelect,
    syncResponsiveSelectLabels,
    applyDisplayModeUI,
    renderCardGrid,
    updateSeoMetadata
  };
})(typeof window !== 'undefined' ? window : globalThis);
