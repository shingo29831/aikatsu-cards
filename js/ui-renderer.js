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
    fillEl.setAttribute('stroke-dasharray', `${formatted}, 100`);
    fillEl.style.strokeDasharray = `${formatted}, 100`;
    // 0%時にstroke-linecap:roundの始点ドットが残るのを防ぐ
    fillEl.style.opacity = clamped > 0 ? '1' : '0';
    fillEl.style.width = `${formatted}%`;
    const gaugeWrap = fillEl.closest('[role="progressbar"]');
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
          <li class="${itemClasses}" data-card-id="${idEsc}">
            <div class="card-thumb-btn js-open-modal" role="button" tabindex="0" aria-label="${nameEsc} の詳細を表示">
              <span class="card-owned-badge js-btn-toggle-own ${isOwned ? 'is-owned' : ''}" title="クリックで所持状態を切り替え">
                ${isOwned ? `所持 ×${count}` : '未所持'}
              </span>
              <button type="button" class="card-fav-btn js-btn-fav ${isFav ? 'is-active' : ''}" aria-label="お気に入り" aria-pressed="${isFav}">
                ${isFav ? '★' : '☆'}
              </button>
              <img src="${imgEsc}" alt="${nameEsc}" class="card-thumb-img" loading="lazy">
            </div>
            <div class="card-body">
              <div class="card-meta-row">
                <span class="card-number-badge">${numEsc}</span>
                <span class="rarity-badge rarity-badge--${rarityEsc}">${rarityEsc}</span>
                ${typeEsc ? `<span class="type-badge type-badge--${typeEsc}">${typeEsc}</span>` : ''}
              </div>
              <h3 class="card-title js-open-modal">${nameEsc}</h3>
              <p class="card-subinfo">${brandEsc} / ${catEsc}</p>
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

  global.AikatsuUiRenderer = {
    escapeHtml,
    updateGaugeProgress,
    renderStatsDashboard,
    populateSeriesSelect,
    applyDisplayModeUI,
    renderCardGrid
  };
})(typeof window !== 'undefined' ? window : globalThis);
