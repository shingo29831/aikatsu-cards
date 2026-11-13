/**
 * Module: @role: カード検索・フィルタリング・統計計算・一覧描画・モーダル操作を統括するアプリケーション制御モジュール
 */
(function (global) {
  'use strict';

  const RARITY_ORDER = { N: 1, R: 2, PR: 3, ER: 4 };

  class AikatsuCardApp {
    constructor(dataService, storageService) {
      this._dataService = dataService;
      this._storage = storageService;
      this._allCards = [];
      this._filteredCards = [];
      this._seriesList = [];
      this._rawMasterStructure = null;
      this._activeModalIndex = -1;
      this._touchStartX = 0;
      this._touchStartY = 0;
      this._cacheElements();
      this._initResponsiveSearchState();
      this._bindEvents();
    }

    async init() {
      await this._storage.init();
      this._applyDisplayMode(this._storage.getDisplayMode());

      const savedMaster = this._storage.loadCustomMasterData();
      if (savedMaster) {
        this._applyMasterData(savedMaster, false);
        this._setSyncBadge('追加カード図鑑を表示中', 'custom');
        return;
      }

      // キャッシュまたは内蔵カタログで即座に初期描画し、通信待ちによる空白表示を防ぐ
      const cachedOfficial = this._storage.loadOfficialCache();
      const initialCatalog =
        cachedOfficial ||
        this._dataService.FALLBACK_CATALOG_DATA ||
        this._dataService.DEFAULT_MASTER_DATA;
      if (initialCatalog) {
        try {
          this._applyMasterData(initialCatalog, false);
        } catch (_e) {
          // 初期データ破損時は後続の同期処理で回復
        }
      }

      await this.syncFromOfficialSite();
    }

    async syncFromOfficialSite() {
      this._setSyncBadge('公式サイトからカード情報を取得中...', 'loading');
      try {
        const result = await this._dataService.loadOfficialAndCatalogCards();
        this._storage.saveOfficialCache(result.rawStructure);
        this._applyMasterData(result.rawStructure, false);
        const label =
          result.source === 'official'
            ? `最新カード取得完了 (${this._allCards.length}枚)`
            : `カード一覧読込完了 (${this._allCards.length}枚)`;
        this._setSyncBadge(label, 'success');
      } catch (_err) {
        if (this._allCards.length === 0) {
          const fallback =
            this._dataService.FALLBACK_CATALOG_DATA || this._dataService.DEFAULT_MASTER_DATA;
          if (fallback) {
            this._applyMasterData(fallback, false);
          }
        }
        this._setSyncBadge(`保存済みカード一覧を表示中 (${this._allCards.length}枚)`, 'warn');
      }
    }

    _setSyncBadge(text, state) {
      if (!this.el.syncStatusBadge) return;
      this.el.syncStatusBadge.textContent = text;
      this.el.syncStatusBadge.dataset.state = state || 'info';
    }

    _initResponsiveSearchState() {
      // スマホ画面では初期状態で詳細検索を折りたたんでカード一覧の視認領域を確保する
      if (global.innerWidth <= 768 && this.el.searchDetailArea && this.el.btnToggleDetail) {
        this.el.searchDetailArea.classList.remove('is-open');
        this.el.btnToggleDetail.setAttribute('aria-expanded', 'false');
      }
    }

    _cacheElements() {
      this.el = {
        syncStatusBadge: document.getElementById('syncStatusBadge'),
        btnSyncOfficial: document.getElementById('btnSyncOfficial'),
        btnQuickExportOwned: document.getElementById('btnQuickExportOwned'),
        inputQuickImportOwned: document.getElementById('inputQuickImportOwned'),

        statCompRate: document.getElementById('statCompRate'),
        statProgressFill: document.getElementById('statProgressFill'),
        statOwnedUnique: document.getElementById('statOwnedUnique'),
        statTotalUnique: document.getElementById('statTotalUnique'),
        statTotalCopies: document.getElementById('statTotalCopies'),
        statFilteredRate: document.getElementById('statFilteredRate'),
        statFilteredProgressFill: document.getElementById('statFilteredProgressFill'),
        statFilteredOwned: document.getElementById('statFilteredOwned'),
        statFilteredTotal: document.getElementById('statFilteredTotal'),
        statFavoriteCount: document.getElementById('statFavoriteCount'),

        filterKeyword: document.getElementById('filterKeyword'),
        filterSeries: document.getElementById('filterSeries'),
        filterOwnership: document.getElementById('filterOwnership'),
        filterFavorite: document.getElementById('filterFavorite'),
        filterType: document.getElementById('filterType'),
        filterRarity: document.getElementById('filterRarity'),
        filterCategory: document.getElementById('filterCategory'),
        filterBrand: document.getElementById('filterBrand'),
        sortSelect: document.getElementById('sortSelect'),
        displayModeButtons: document.querySelectorAll('.js-display-mode-btn'),

        btnToggleDetail: document.getElementById('btnToggleDetail'),
        searchDetailArea: document.getElementById('searchDetailArea'),
        btnResetFilters: document.getElementById('btnResetFilters'),

        resultCountNum: document.getElementById('resultCountNum'),
        cardGrid: document.getElementById('cardGrid'),
        emptyState: document.getElementById('emptyState'),

        cardDetailModal: document.getElementById('cardDetailModal'),
        btnCloseCardModal: document.getElementById('btnCloseCardModal'),
        modalVisualWrap: document.getElementById('modalVisualWrap'),
        modalFlipContainer: document.getElementById('modalFlipContainer'),
        modalImgFront: document.getElementById('modalImgFront'),
        modalImgBack: document.getElementById('modalImgBack'),
        btnPrevCard: document.getElementById('btnPrevCard'),
        btnNextCard: document.getElementById('btnNextCard'),
        btnFlipCard: document.getElementById('btnFlipCard'),
        modalCardNumber: document.getElementById('modalCardNumber'),
        modalCardRarity: document.getElementById('modalCardRarity'),
        modalCardType: document.getElementById('modalCardType'),
        modalBtnFav: document.getElementById('modalBtnFav'),
        modalCardName: document.getElementById('modalCardName'),
        modalCardSeries: document.getElementById('modalCardSeries'),
        modalCardCategory: document.getElementById('modalCardCategory'),
        modalCardBrand: document.getElementById('modalCardBrand'),
        modalObtainWrap: document.getElementById('modalObtainWrap'),
        modalCardObtain: document.getElementById('modalCardObtain'),
        modalBtnDec: document.getElementById('modalBtnDec'),
        modalBtnInc: document.getElementById('modalBtnInc'),
        modalOwnedCount: document.getElementById('modalOwnedCount'),

        btnOpenDataModal: document.getElementById('btnOpenDataModal'),
        dataManageModal: document.getElementById('dataManageModal'),
        btnCloseDataModal: document.getElementById('btnCloseDataModal'),
        inputCardJsonFile: document.getElementById('inputCardJsonFile'),
        btnExportCardJson: document.getElementById('btnExportCardJson'),
        btnResetMasterData: document.getElementById('btnResetMasterData'),
        textareaCardJson: document.getElementById('textareaCardJson'),
        btnApplyCardJson: document.getElementById('btnApplyCardJson'),
        btnExportUserState: document.getElementById('btnExportUserState'),
        inputUserStateFile: document.getElementById('inputUserStateFile'),
        textareaUserStateJson: document.getElementById('textareaUserStateJson'),
        btnApplyUserStateJson: document.getElementById('btnApplyUserStateJson'),
        btnClearUserState: document.getElementById('btnClearUserState'),
        dataModalStatus: document.getElementById('dataModalStatus')
      };
    }

    _bindEvents() {
      const filterInputs = [
        this.el.filterKeyword,
        this.el.filterSeries,
        this.el.filterOwnership,
        this.el.filterFavorite,
        this.el.filterType,
        this.el.filterRarity,
        this.el.filterCategory,
        this.el.filterBrand,
        this.el.sortSelect
      ];

      filterInputs.forEach((input) => {
        if (!input) return;
        const evt = input.type === 'search' ? 'input' : 'change';
        input.addEventListener(evt, () => this._refreshView());
      });

      this.el.displayModeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.mode || 'checker';
          this._applyDisplayMode(mode);
        });
      });

      if (this.el.btnSyncOfficial) {
        this.el.btnSyncOfficial.addEventListener('click', async () => {
          this._storage.clearCustomMasterData();
          await this.syncFromOfficialSite();
        });
      }

      if (this.el.btnQuickExportOwned) {
        this.el.btnQuickExportOwned.addEventListener('click', () => {
          this._downloadJson(this._storage.exportUserStateJson(this._allCards), 'aikatsu_owned_cards.json');
          this._setSyncBadge('所持データをファイルに保存しました', 'success');
        });
      }

      if (this.el.inputQuickImportOwned) {
        this.el.inputQuickImportOwned.addEventListener('change', (e) => {
          this._handleUserStateFileImport(e);
        });
      }

      this.el.btnToggleDetail.addEventListener('click', () => {
        const isOpen = this.el.searchDetailArea.classList.toggle('is-open');
        this.el.btnToggleDetail.setAttribute('aria-expanded', String(isOpen));
      });

      this.el.btnResetFilters.addEventListener('click', () => {
        this.el.filterKeyword.value = '';
        this.el.filterSeries.value = '';
        this.el.filterOwnership.value = 'all';
        this.el.filterFavorite.checked = false;
        this.el.filterType.value = '';
        this.el.filterRarity.value = '';
        this.el.filterCategory.value = '';
        this.el.filterBrand.value = '';
        this.el.sortSelect.value = '1';
        this._refreshView();
      });

      // カードグリッドのイベント委譲
      this.el.cardGrid.addEventListener('click', (e) => {
        const target = e.target;
        const itemEl = target.closest('.card-item');
        if (!itemEl) return;
        const cardId = itemEl.dataset.cardId;

        if (target.closest('.js-btn-inc')) {
          this._storage.incrementCount(cardId, 1);
          this._refreshView();
        } else if (target.closest('.js-btn-dec')) {
          this._storage.incrementCount(cardId, -1);
          this._refreshView();
        } else if (target.closest('.js-btn-toggle-own')) {
          const current = this._storage.getCount(cardId);
          this._storage.setCount(cardId, current > 0 ? 0 : 1);
          this._refreshView();
        } else if (target.closest('.js-btn-fav')) {
          this._storage.toggleFavorite(cardId);
          this._refreshView();
        } else if (target.closest('.js-open-modal')) {
          const index = this._filteredCards.findIndex((c) => c.id === cardId);
          if (index !== -1) this._openCardModal(index);
        }
      });

      // カード詳細モーダル操作
      this.el.btnCloseCardModal.addEventListener('click', () => this._closeCardModal());
      this.el.cardDetailModal.addEventListener('click', (e) => {
        if (e.target === this.el.cardDetailModal) this._closeCardModal();
      });

      this.el.btnFlipCard.addEventListener('click', () => {
        const flipped = this.el.modalFlipContainer.classList.toggle('is-flipped');
        this.el.btnFlipCard.textContent = flipped ? '表面を見る ↻' : '裏面を見る ↻';
      });

      this.el.btnPrevCard.addEventListener('click', () => this._stepModalCard(-1));
      this.el.btnNextCard.addEventListener('click', () => this._stepModalCard(1));

      // スマホ向けスワイプでの前後カード送り
      if (this.el.modalVisualWrap) {
        this.el.modalVisualWrap.addEventListener(
          'touchstart',
          (e) => {
            if (!e.touches || e.touches.length !== 1) return;
            this._touchStartX = e.touches[0].clientX;
            this._touchStartY = e.touches[0].clientY;
          },
          { passive: true }
        );
        this.el.modalVisualWrap.addEventListener(
          'touchend',
          (e) => {
            if (!e.changedTouches || e.changedTouches.length !== 1) return;
            const dx = e.changedTouches[0].clientX - this._touchStartX;
            const dy = e.changedTouches[0].clientY - this._touchStartY;
            if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
              this._stepModalCard(dx < 0 ? 1 : -1);
            }
          },
          { passive: true }
        );
      }

      this.el.modalBtnInc.addEventListener('click', () => {
        const card = this._filteredCards[this._activeModalIndex];
        if (!card) return;
        this._storage.incrementCount(card.id, 1);
        this._syncModalState(card);
        this._refreshView();
      });

      this.el.modalBtnDec.addEventListener('click', () => {
        const card = this._filteredCards[this._activeModalIndex];
        if (!card) return;
        this._storage.incrementCount(card.id, -1);
        this._syncModalState(card);
        this._refreshView();
      });

      this.el.modalBtnFav.addEventListener('click', () => {
        const card = this._filteredCards[this._activeModalIndex];
        if (!card) return;
        this._storage.toggleFavorite(card.id);
        this._syncModalState(card);
        this._refreshView();
      });

      // データ管理モーダル
      this.el.btnOpenDataModal.addEventListener('click', () => {
        this.el.textareaCardJson.value = JSON.stringify(this._rawMasterStructure, null, 2);
        if (this.el.textareaUserStateJson) {
          this.el.textareaUserStateJson.value = this._storage.exportUserStateJson(this._allCards);
        }
        this.el.dataModalStatus.textContent = '';
        this.el.dataManageModal.hidden = false;
      });
      this.el.btnCloseDataModal.addEventListener('click', () => {
        this.el.dataManageModal.hidden = true;
      });
      this.el.dataManageModal.addEventListener('click', (e) => {
        if (e.target === this.el.dataManageModal) this.el.dataManageModal.hidden = true;
      });

      this.el.btnApplyCardJson.addEventListener('click', () => {
        try {
          const rawText = this.el.textareaCardJson.value.trim();
          // 公式サイトのHTMLソースが直接貼り付けられた場合も自動解析
          if (rawText.startsWith('<') && rawText.includes('cardList')) {
            const parsedHtml = this._dataService.parseOfficialCardListHtml(rawText);
            this._applyMasterData(parsedHtml.seriesGroups, true);
            this.el.dataModalStatus.textContent = `公式ページのデータから ${parsedHtml.cards.length} 枚のカードを読み込みました。`;
            return;
          }
          const parsed = JSON.parse(rawText);
          this._applyMasterData(parsed, true);
          this.el.dataModalStatus.textContent = 'カード図鑑データを反映しました。';
        } catch (err) {
          this.el.dataModalStatus.textContent = `エラー: ${this._formatUserFriendlyError(err)}`;
        }
      });

      this.el.inputCardJsonFile.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(String(reader.result));
            this.el.textareaCardJson.value = JSON.stringify(parsed, null, 2);
            this._applyMasterData(parsed, true);
            this.el.dataModalStatus.textContent = `ファイル「${file.name}」を読み込みました。`;
          } catch (err) {
            this.el.dataModalStatus.textContent = `読み込みエラー: ${this._formatUserFriendlyError(err)}`;
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      });

      this.el.btnExportCardJson.addEventListener('click', () => {
        this._downloadJson(JSON.stringify(this._rawMasterStructure, null, 2), 'cards.json');
        this.el.dataModalStatus.textContent = '現在のカード図鑑をファイルに保存しました。';
      });

      this.el.btnResetMasterData.addEventListener('click', async () => {
        this._storage.clearCustomMasterData();
        await this.syncFromOfficialSite();
        this.el.textareaCardJson.value = JSON.stringify(this._rawMasterStructure, null, 2);
        this.el.dataModalStatus.textContent = '最新のカード図鑑データに更新しました。';
      });

      this.el.btnExportUserState.addEventListener('click', () => {
        this._downloadJson(this._storage.exportUserStateJson(this._allCards), 'aikatsu_owned_cards.json');
        this.el.dataModalStatus.textContent = 'バックアップファイルを保存しました。';
      });

      this.el.inputUserStateFile.addEventListener('change', (e) => {
        this._handleUserStateFileImport(e);
      });

      if (this.el.btnApplyUserStateJson) {
        this.el.btnApplyUserStateJson.addEventListener('click', () => {
          try {
            this._storage.importUserStateJson(this.el.textareaUserStateJson.value);
            this._refreshView();
            this.el.dataModalStatus.textContent = '貼り付けた所持データを復元しました。';
          } catch (err) {
            this.el.dataModalStatus.textContent = `復元エラー: ${this._formatUserFriendlyError(err)}`;
          }
        });
      }

      this.el.btnClearUserState.addEventListener('click', () => {
        this._storage.clearUserState();
        if (this.el.textareaUserStateJson) {
          this.el.textareaUserStateJson.value = this._storage.exportUserStateJson(this._allCards);
        }
        this._refreshView();
        this.el.dataModalStatus.textContent = '所持枚数をすべてリセットしました。';
      });
    }

    _handleUserStateFileImport(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result);
          this._storage.importUserStateJson(text);
          if (this.el.textareaUserStateJson) {
            this.el.textareaUserStateJson.value = this._storage.exportUserStateJson(this._allCards);
          }
          this._refreshView();
          this.el.dataModalStatus.textContent = `「${file.name}」から所持データを復元しました。`;
          this._setSyncBadge('所持データの復元完了', 'success');
        } catch (err) {
          this.el.dataModalStatus.textContent = `復元エラー: ${this._formatUserFriendlyError(err)}`;
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    }

    _formatUserFriendlyError(err) {
      if (!err) return 'データの読み込みに失敗しました。';
      // ブラウザ標準の英語SyntaxErrorを一般ユーザー向けの日本語案内に変換
      if (err instanceof SyntaxError) {
        return 'データの形式が正しくありません。ファイルや貼り付けた文字が欠けていないかご確認ください。';
      }
      return err.message || 'データの読み込みに失敗しました。';
    }

    /**
     * 表示モードを切り替える
     * - checker: 所持=有色 / 未所持=モノクロ（ホバーで有色）
     * - binder: 図鑑タイル表示（所持=有色 / 未所持=モノクロ・ホバーで有色）
     * - color: 通常表示（全カード有色）
     * @param {string} mode
     */
    _applyDisplayMode(mode) {
      const validMode = ['checker', 'binder', 'color'].includes(mode) ? mode : 'checker';
      this._storage.setDisplayMode(validMode);

      this.el.cardGrid.classList.remove('is-monochrome-mode', 'is-binder-view', 'is-color-mode');
      if (validMode === 'checker') {
        this.el.cardGrid.classList.add('is-monochrome-mode');
      } else if (validMode === 'binder') {
        this.el.cardGrid.classList.add('is-monochrome-mode', 'is-binder-view');
      } else {
        this.el.cardGrid.classList.add('is-color-mode');
      }

      this.el.displayModeButtons.forEach((btn) => {
        const isActive = btn.dataset.mode === validMode;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
      });
    }

    _applyMasterData(rawData, persistCustom) {
      const normalized = this._dataService.normalizeCardData(rawData);
      this._allCards = normalized.cards;
      this._seriesList = normalized.seriesList;
      this._rawMasterStructure = normalized.rawStructure;

      if (persistCustom) {
        this._storage.saveCustomMasterData(rawData);
      }

      this._populateSeriesFilter();
      this._refreshView();
    }

    _populateSeriesFilter() {
      const currentVal = this.el.filterSeries.value;
      this.el.filterSeries.innerHTML = '<option value="">すべて</option>';
      this._seriesList.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        this.el.filterSeries.appendChild(opt);
      });
      if (this._seriesList.some((s) => s.id === currentVal)) {
        this.el.filterSeries.value = currentVal;
      }
    }

    _refreshView() {
      this._filteredCards = this._computeFilteredAndSortedCards();
      this._renderStats();
      this._renderGrid();
    }

    _computeFilteredAndSortedCards() {
      const keyword = this.el.filterKeyword.value.trim().toLowerCase();
      const series = this.el.filterSeries.value;
      const ownership = this.el.filterOwnership.value;
      const favOnly = this.el.filterFavorite.checked;
      const type = this.el.filterType.value;
      const rarity = this.el.filterRarity.value;
      const category = this.el.filterCategory.value;
      const brand = this.el.filterBrand.value;
      const sortMode = this.el.sortSelect.value;

      const filtered = this._allCards.filter((card) => {
        const count = this._storage.getCount(card.id);
        const isFav = this._storage.isFavorite(card.id);

        if (series && card.seriesId !== series) return false;
        if (ownership === 'owned' && count < 1) return false;
        if (ownership === 'unowned' && count > 0) return false;
        if (ownership === 'duplicate' && count < 2) return false;
        if (favOnly && !isFav) return false;
        if (type && card.type !== type) return false;
        if (rarity && card.rarity !== rarity) return false;
        if (category && card.category !== category) return false;
        if (brand && card.brand !== brand) return false;

        if (keyword) {
          const haystack = `${card.name} ${card.number} ${card.id} ${card.brand} ${card.category} ${card.obtainMethod}`.toLowerCase();
          if (!haystack.includes(keyword)) return false;
        }
        return true;
      });

      filtered.sort((a, b) => {
        if (sortMode === '2') {
          return b.number.localeCompare(a.number, 'ja', { numeric: true });
        }
        if (sortMode === '3') {
          const diff = (RARITY_ORDER[a.rarity] || 0) - (RARITY_ORDER[b.rarity] || 0);
          return diff !== 0 ? diff : a.number.localeCompare(b.number, 'ja', { numeric: true });
        }
        if (sortMode === '4') {
          const diff = (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0);
          return diff !== 0 ? diff : a.number.localeCompare(b.number, 'ja', { numeric: true });
        }
        if (sortMode === '5') {
          const diff = this._storage.getCount(b.id) - this._storage.getCount(a.id);
          return diff !== 0 ? diff : a.number.localeCompare(b.number, 'ja', { numeric: true });
        }
        return a.number.localeCompare(b.number, 'ja', { numeric: true });
      });

      return filtered;
    }

    _renderStats() {
      const totalUnique = this._allCards.length;
      let ownedUnique = 0;
      let totalCopies = 0;
      let favCount = 0;

      this._allCards.forEach((card) => {
        const c = this._storage.getCount(card.id);
        if (c > 0) {
          ownedUnique += 1;
          totalCopies += c;
        }
        if (this._storage.isFavorite(card.id)) {
          favCount += 1;
        }
      });

      const overallRate = totalUnique > 0 ? (ownedUnique / totalUnique) * 100 : 0;
      this.el.statCompRate.textContent = `${overallRate.toFixed(1)}%`;
      this.el.statProgressFill.style.width = `${overallRate.toFixed(1)}%`;
      this.el.statOwnedUnique.textContent = String(ownedUnique);
      this.el.statTotalUnique.textContent = String(totalUnique);
      this.el.statTotalCopies.textContent = String(totalCopies);
      this.el.statFavoriteCount.textContent = String(favCount);

      const filteredTotal = this._filteredCards.length;
      const filteredOwned = this._filteredCards.filter((c) => this._storage.getCount(c.id) > 0).length;
      const filteredRate = filteredTotal > 0 ? (filteredOwned / filteredTotal) * 100 : 0;

      this.el.statFilteredRate.textContent = `${filteredRate.toFixed(1)}%`;
      this.el.statFilteredProgressFill.style.width = `${filteredRate.toFixed(1)}%`;
      this.el.statFilteredOwned.textContent = String(filteredOwned);
      this.el.statFilteredTotal.textContent = String(filteredTotal);
      this.el.resultCountNum.textContent = String(filteredTotal);
    }

    _renderGrid() {
      if (!this.el.cardGrid) return;

      if (this._filteredCards.length === 0) {
        this.el.cardGrid.innerHTML = '';
        if (this.el.emptyState) this.el.emptyState.hidden = false;
        return;
      }

      if (this.el.emptyState) this.el.emptyState.hidden = true;

      const html = this._filteredCards
        .map((card) => {
          const count = this._storage.getCount(card.id);
          const isOwned = count > 0;
          const isFav = this._storage.isFavorite(card.id);
          const itemClasses = [
            'card-item',
            isOwned ? 'is-owned' : 'is-unowned',
            card.isSideway ? 'is-sideway' : ''
          ]
            .filter(Boolean)
            .join(' ');

          const idEsc = this._escapeHtml(card.id);
          const numEsc = this._escapeHtml(card.number);
          const nameEsc = this._escapeHtml(card.name);
          const rarityEsc = this._escapeHtml(card.rarity);
          const typeEsc = this._escapeHtml(card.type);
          const brandEsc = this._escapeHtml(card.brand);
          const catEsc = this._escapeHtml(card.category);
          const imgEsc = this._escapeHtml(card.imageUrl);

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

      this.el.cardGrid.innerHTML = html;
    }

    _openCardModal(index) {
      if (index < 0 || index >= this._filteredCards.length) return;
      this._activeModalIndex = index;
      const card = this._filteredCards[index];

      this.el.modalFlipContainer.classList.remove('is-flipped');
      this.el.btnFlipCard.textContent = '裏面を見る ↻';

      this.el.modalImgFront.src = card.imageUrl || '';
      this.el.modalImgFront.alt = `${card.name} (表面)`;
      this.el.modalImgBack.src =
        card.backImageUrl || this._dataService.deriveBackImageUrl(card.imageUrl || '');
      this.el.modalImgBack.alt = `${card.name} (裏面)`;

      this.el.modalCardNumber.textContent = card.number;
      this.el.modalCardRarity.textContent = card.rarity;
      this.el.modalCardRarity.className = `rarity-badge rarity-badge--${card.rarity}`;

      if (card.type) {
        this.el.modalCardType.textContent = card.type;
        this.el.modalCardType.className = `type-badge type-badge--${card.type}`;
        this.el.modalCardType.hidden = false;
      } else {
        this.el.modalCardType.textContent = '';
        this.el.modalCardType.hidden = true;
      }

      this.el.modalCardName.textContent = card.name;
      this.el.modalCardSeries.textContent = card.seriesName || '';
      this.el.modalCardCategory.textContent = card.category || '';
      this.el.modalCardBrand.textContent = card.brand || '';

      const obtainMethod =
        card.obtainMethod ||
        (this._dataService.PROMO_OBTAIN_MAP &&
          this._dataService.PROMO_OBTAIN_MAP[card.id.toUpperCase()]) ||
        '';
      if (obtainMethod) {
        this.el.modalCardObtain.textContent = obtainMethod;
        this.el.modalObtainWrap.hidden = false;
      } else {
        this.el.modalCardObtain.textContent = '';
        this.el.modalObtainWrap.hidden = true;
      }

      this._syncModalState(card);

      this.el.btnPrevCard.disabled = index <= 0;
      this.el.btnNextCard.disabled = index >= this._filteredCards.length - 1;

      this.el.cardDetailModal.hidden = false;
      this.el.cardDetailModal.setAttribute('aria-hidden', 'false');
    }

    _closeCardModal() {
      this.el.cardDetailModal.hidden = true;
      this.el.cardDetailModal.setAttribute('aria-hidden', 'true');
      this._activeModalIndex = -1;
    }

    _stepModalCard(delta) {
      const nextIndex = this._activeModalIndex + delta;
      if (nextIndex < 0 || nextIndex >= this._filteredCards.length) return;
      this._openCardModal(nextIndex);
    }

    _syncModalState(card) {
      const count = this._storage.getCount(card.id);
      const isFav = this._storage.isFavorite(card.id);
      this.el.modalOwnedCount.textContent = String(count);
      this.el.modalBtnFav.textContent = isFav ? '★' : '☆';
      this.el.modalBtnFav.classList.toggle('is-active', isFav);
      this.el.modalBtnFav.setAttribute('aria-pressed', String(isFav));
    }

    _downloadJson(jsonString, fileName) {
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    _escapeHtml(str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  }

  global.AikatsuCardApp = AikatsuCardApp;

  document.addEventListener('DOMContentLoaded', () => {
    const storage = new global.AikatsuCardStorage.CardStorageService();
    const app = new AikatsuCardApp(global.AikatsuCardData, storage);
    app.init();
  });
})(window);
