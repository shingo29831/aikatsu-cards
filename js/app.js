/**
 * Module: @role: カード検索・フィルタリング・統計計算・一覧描画・モーダル操作を統括するアプリケーション制御モジュール
 */
(function (global) {
  'use strict';

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

  const filterModule = ensureModule('AikatsuCardFilter', './card-filter.js');
  const uiRenderer = ensureModule('AikatsuUiRenderer', './ui-renderer.js');
  const modalController = ensureModule('AikatsuModalController', './modal-controller.js');

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
      const byId = (id) => document.getElementById(id);
      this.el = {
        syncStatusBadge: byId('syncStatusBadge'),
        btnSyncOfficial: byId('btnSyncOfficial'),
        btnQuickExportOwned: byId('btnQuickExportOwned'),
        inputQuickImportOwned: byId('inputQuickImportOwned'),

        statCompRate: byId('statCompRate'),
        statProgressFill: byId('statProgressFill'),
        statOwnedUnique: byId('statOwnedUnique'),
        statTotalUnique: byId('statTotalUnique'),
        statTotalCopies: byId('statTotalCopies'),
        statFilteredRate: byId('statFilteredRate'),
        statFilteredProgressFill: byId('statFilteredProgressFill'),
        statFilteredOwned: byId('statFilteredOwned'),
        statFilteredTotal: byId('statFilteredTotal'),
        statFavoriteCount: byId('statFavoriteCount'),

        filterKeyword: byId('filterKeyword'),
        filterSeries: byId('filterSeries'),
        filterOwnership: byId('filterOwnership'),
        filterFavorite: byId('filterFavorite'),
        filterType: byId('filterType'),
        filterRarity: byId('filterRarity'),
        filterCategory: byId('filterCategory'),
        filterBrand: byId('filterBrand'),
        sortSelect: byId('sortSelect'),
        displayModeButtons: document.querySelectorAll('.js-display-mode-btn'),

        btnToggleDetail: byId('btnToggleDetail'),
        searchDetailArea: byId('searchDetailArea'),
        btnResetFilters: byId('btnResetFilters'),

        resultCountNum: byId('resultCountNum'),
        cardGrid: byId('cardGrid'),
        emptyState: byId('emptyState'),

        cardDetailModal: byId('cardDetailModal'),
        btnCloseCardModal: byId('btnCloseCardModal'),
        modalVisualWrap: byId('modalVisualWrap'),
        modalFlipContainer: byId('modalFlipContainer'),
        modalImgFront: byId('modalImgFront'),
        modalImgBack: byId('modalImgBack'),
        btnPrevCard: byId('btnPrevCard'),
        btnNextCard: byId('btnNextCard'),
        btnFlipCard: byId('btnFlipCard'),
        modalCardNumber: byId('modalCardNumber'),
        modalCardRarity: byId('modalCardRarity'),
        modalCardType: byId('modalCardType'),
        modalBtnFav: byId('modalBtnFav'),
        modalCardName: byId('modalCardName'),
        modalCardSeries: byId('modalCardSeries'),
        modalCardCategory: byId('modalCardCategory'),
        modalCardBrand: byId('modalCardBrand'),
        modalObtainWrap: byId('modalObtainWrap'),
        modalCardObtain: byId('modalCardObtain'),
        modalBtnDec: byId('modalBtnDec'),
        modalBtnInc: byId('modalBtnInc'),
        modalOwnedCount: byId('modalOwnedCount'),

        btnOpenDataModal: byId('btnOpenDataModal'),
        dataManageModal: byId('dataManageModal'),
        btnCloseDataModal: byId('btnCloseDataModal'),
        inputCardJsonFile: byId('inputCardJsonFile'),
        btnExportCardJson: byId('btnExportCardJson'),
        btnResetMasterData: byId('btnResetMasterData'),
        textareaCardJson: byId('textareaCardJson'),
        btnApplyCardJson: byId('btnApplyCardJson'),
        btnExportUserState: byId('btnExportUserState'),
        inputUserStateFile: byId('inputUserStateFile'),
        textareaUserStateJson: byId('textareaUserStateJson'),
        btnApplyUserStateJson: byId('btnApplyUserStateJson'),
        btnClearUserState: byId('btnClearUserState'),
        dataModalStatus: byId('dataModalStatus')
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
          this._applyDisplayMode(btn.dataset.mode || 'checker');
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

      modalController.bindModalEvents(this);
    }

    _handleUserStateFileImport(e) {
      modalController.handleUserStateFileImport(this, e);
    }

    _formatUserFriendlyError(err) {
      return modalController.formatUserFriendlyError(err);
    }

    _applyDisplayMode(mode) {
      const validMode = ['checker', 'binder', 'color'].includes(mode) ? mode : 'checker';
      this._storage.setDisplayMode(validMode);
      uiRenderer.applyDisplayModeUI(this.el.cardGrid, this.el.displayModeButtons, validMode);
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
      uiRenderer.populateSeriesSelect(this.el.filterSeries, this._seriesList);
    }

    _refreshView() {
      this._filteredCards = this._computeFilteredAndSortedCards();
      this._renderStats();
      this._renderGrid();
    }

    _computeFilteredAndSortedCards() {
      const criteria = filterModule.extractFilterCriteria(this.el);
      return filterModule.filterAndSortCards(this._allCards, criteria, this._storage);
    }

    _renderStats() {
      const stats = filterModule.computeCollectionStats(
        this._allCards,
        this._filteredCards,
        this._storage
      );
      uiRenderer.renderStatsDashboard(this.el, stats);
    }

    _updateGaugeProgress(fillEl, rate) {
      uiRenderer.updateGaugeProgress(fillEl, rate);
    }

    _renderGrid() {
      uiRenderer.renderCardGrid(this.el, this._filteredCards, this._storage);
    }

    _openCardModal(index) {
      modalController.openCardModal(this, index);
    }

    _closeCardModal() {
      modalController.closeCardModal(this);
    }

    _stepModalCard(delta) {
      modalController.stepModalCard(this, delta);
    }

    _syncModalState(card) {
      modalController.syncModalState(this, card);
    }

    _downloadJson(jsonString, fileName) {
      modalController.downloadJson(jsonString, fileName);
    }

    _escapeHtml(str) {
      return uiRenderer.escapeHtml(str);
    }
  }

  global.AikatsuCardApp = AikatsuCardApp;

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      const storage = new global.AikatsuCardStorage.CardStorageService();
      const app = new AikatsuCardApp(global.AikatsuCardData, storage);
      app.init();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
