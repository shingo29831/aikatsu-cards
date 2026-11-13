/**
 * Module: @role: ユーザーのカード所持枚数・お気に入り状態・カスタムJSONデータの永続化を担うストレージ層
 */
(function (global) {
  'use strict';

  const STORAGE_KEYS = {
    USER_STATE: 'aikatsu_encore_user_state_v1',
    CUSTOM_MASTER: 'aikatsu_encore_custom_master_v1',
    OFFICIAL_CACHE: 'aikatsu_encore_official_cache_v1',
    VIEW_SETTINGS: 'aikatsu_encore_view_settings_v1'
  };

  const IDB_CONFIG = {
    NAME: 'aikatsu_encore_card_db',
    VERSION: 1,
    STORE_OWNED: 'owned_cards',
    STORE_KV: 'app_kv'
  };

  class CardStorageService {
    /**
     * @param {Storage} [storageBackend=window.localStorage] DI用ストレージバックエンド
     * @param {IDBFactory} [idbFactory=window.indexedDB] DI用IndexedDBファクトリ
     */
    constructor(storageBackend, idbFactory) {
      this._storage = storageBackend || global.localStorage;
      this._idbFactory = idbFactory !== undefined ? idbFactory : global.indexedDB;
      this._db = null;
      this._state = this._loadUserStateFromLocal();
      this._viewSettings = this._loadViewSettingsFromLocal();
    }

    /**
     * IndexedDBローカルDBを初期化し、既存の所持データを同期・復元する
     * @returns {Promise<void>}
     */
    async init() {
      if (!this._idbFactory) return;
      try {
        this._db = await this._openDatabase();
        const idbState = await this._readStateFromIdb();
        if (idbState) {
          const mergedCounts = { ...this._state.counts, ...idbState.counts };
          const mergedFavs = { ...this._state.favorites, ...idbState.favorites };
          this._state = { counts: mergedCounts, favorites: mergedFavs };
          this._saveUserStateToLocal();
        }
        await this._syncAllOwnedToIdb();
      } catch (_e) {
        // IndexedDB非対応・プライベートモード制限時はlocalStorageとメモリで継続
      }
    }

    _openDatabase() {
      return new Promise((resolve, reject) => {
        const req = this._idbFactory.open(IDB_CONFIG.NAME, IDB_CONFIG.VERSION);
        req.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(IDB_CONFIG.STORE_OWNED)) {
            db.createObjectStore(IDB_CONFIG.STORE_OWNED, { keyPath: 'cardId' });
          }
          if (!db.objectStoreNames.contains(IDB_CONFIG.STORE_KV)) {
            db.createObjectStore(IDB_CONFIG.STORE_KV, { keyPath: 'key' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    _readStateFromIdb() {
      if (!this._db) return Promise.resolve(null);
      return new Promise((resolve) => {
        try {
          const tx = this._db.transaction([IDB_CONFIG.STORE_OWNED], 'readonly');
          const store = tx.objectStore(IDB_CONFIG.STORE_OWNED);
          const req = store.getAll();
          req.onsuccess = () => {
            const rows = req.result || [];
            if (rows.length === 0) {
              resolve(null);
              return;
            }
            const counts = {};
            const favorites = {};
            rows.forEach((row) => {
              if (!row || !row.cardId) return;
              const c = Math.floor(Number(row.count) || 0);
              if (c > 0) counts[row.cardId] = c;
              if (row.favorite) favorites[row.cardId] = true;
            });
            resolve({ counts, favorites });
          };
          req.onerror = () => resolve(null);
        } catch (_e) {
          resolve(null);
        }
      });
    }

    _putCardToIdb(cardId) {
      if (!this._db) return;
      try {
        const count = this.getCount(cardId);
        const favorite = this.isFavorite(cardId);
        const tx = this._db.transaction([IDB_CONFIG.STORE_OWNED], 'readwrite');
        const store = tx.objectStore(IDB_CONFIG.STORE_OWNED);
        if (count === 0 && !favorite) {
          store.delete(cardId);
        } else {
          store.put({
            cardId,
            count,
            favorite,
            updatedAt: new Date().toISOString()
          });
        }
      } catch (_e) {
        // 無視
      }
    }

    _syncAllOwnedToIdb() {
      if (!this._db) return Promise.resolve();
      return new Promise((resolve) => {
        try {
          const tx = this._db.transaction([IDB_CONFIG.STORE_OWNED], 'readwrite');
          const store = tx.objectStore(IDB_CONFIG.STORE_OWNED);
          store.clear();
          const allKeys = new Set([
            ...Object.keys(this._state.counts),
            ...Object.keys(this._state.favorites)
          ]);
          const now = new Date().toISOString();
          allKeys.forEach((cardId) => {
            const count = this.getCount(cardId);
            const favorite = this.isFavorite(cardId);
            if (count > 0 || favorite) {
              store.put({ cardId, count, favorite, updatedAt: now });
            }
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (_e) {
          resolve();
        }
      });
    }

    _loadUserStateFromLocal() {
      try {
        const raw = this._storage.getItem(STORAGE_KEYS.USER_STATE);
        if (!raw) {
          return { counts: {}, favorites: {} };
        }
        const parsed = JSON.parse(raw);
        return {
          counts: parsed && typeof parsed.counts === 'object' ? parsed.counts : {},
          favorites: parsed && typeof parsed.favorites === 'object' ? parsed.favorites : {}
        };
      } catch (_e) {
        return { counts: {}, favorites: {} };
      }
    }

    _saveUserStateToLocal() {
      try {
        this._storage.setItem(STORAGE_KEYS.USER_STATE, JSON.stringify(this._state));
      } catch (_e) {
        // クォータ超過時はメモリとIndexedDBで維持
      }
    }

    _loadViewSettingsFromLocal() {
      try {
        const raw = this._storage.getItem(STORAGE_KEYS.VIEW_SETTINGS);
        if (!raw) {
          return { displayMode: 'checker', hideTutorialOnStartup: false };
        }
        const parsed = JSON.parse(raw);
        return {
          displayMode: parsed && parsed.displayMode ? String(parsed.displayMode) : 'checker',
          hideTutorialOnStartup: Boolean(parsed && parsed.hideTutorialOnStartup)
        };
      } catch (_e) {
        return { displayMode: 'checker', hideTutorialOnStartup: false };
      }
    }

    _saveViewSettingsToLocal() {
      try {
        this._storage.setItem(STORAGE_KEYS.VIEW_SETTINGS, JSON.stringify(this._viewSettings));
      } catch (_e) {
        // 無視
      }
    }

    getDisplayMode() {
      return this._viewSettings.displayMode || 'checker';
    }

    setDisplayMode(mode) {
      this._viewSettings.displayMode = String(mode || 'checker');
      this._saveViewSettingsToLocal();
    }

    hasSavedUserData() {
      return (
        Object.keys(this._state.counts || {}).length > 0 ||
        Object.keys(this._state.favorites || {}).length > 0
      );
    }

    getHideTutorialOnStartup() {
      return Boolean(this._viewSettings.hideTutorialOnStartup);
    }

    setHideTutorialOnStartup(hide) {
      this._viewSettings.hideTutorialOnStartup = Boolean(hide);
      this._saveViewSettingsToLocal();
    }

    shouldShowTutorial() {
      // 「次回表示しない」がfalse、またはローカル設定未保存時は表示する
      return !this.getHideTutorialOnStartup();
    }

    getCount(cardId) {
      const val = Number(this._state.counts[cardId] || 0);
      return Number.isFinite(val) && val > 0 ? Math.floor(val) : 0;
    }

    setCount(cardId, count) {
      const normalized = Math.max(0, Math.floor(Number(count) || 0));
      if (normalized === 0) {
        delete this._state.counts[cardId];
      } else {
        this._state.counts[cardId] = normalized;
      }
      this._saveUserStateToLocal();
      this._putCardToIdb(cardId);
      return normalized;
    }

    incrementCount(cardId, delta) {
      const current = this.getCount(cardId);
      return this.setCount(cardId, current + delta);
    }

    isFavorite(cardId) {
      return Boolean(this._state.favorites[cardId]);
    }

    toggleFavorite(cardId) {
      const next = !this.isFavorite(cardId);
      if (next) {
        this._state.favorites[cardId] = true;
      } else {
        delete this._state.favorites[cardId];
      }
      this._saveUserStateToLocal();
      this._putCardToIdb(cardId);
      return next;
    }

    clearUserState() {
      this._state = { counts: {}, favorites: {} };
      this._saveUserStateToLocal();
      this._syncAllOwnedToIdb();
    }

    /**
     * ユーザーの所持カード・お気に入り情報をJSON文字列としてエクスポートする
     * @param {Array<Object>} [allCards=[]]
     * @returns {string}
     */
    exportUserStateJson(allCards = []) {
      const cardMetaMap = new Map();
      (allCards || []).forEach((c) => {
        if (c && c.id) cardMetaMap.set(c.id, c);
      });

      const allIds = Array.from(
        new Set([...Object.keys(this._state.counts), ...Object.keys(this._state.favorites)])
      ).sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));

      const ownedCards = allIds.map((id) => {
        const meta = cardMetaMap.get(id);
        return {
          id,
          number: meta ? meta.number : id,
          name: meta ? meta.name : id,
          count: this.getCount(id),
          favorite: this.isFavorite(id)
        };
      });

      return JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          counts: this._state.counts,
          favorites: this._state.favorites,
          ownedCards
        },
        null,
        2
      );
    }

    /**
     * JSON文字列からユーザーの所持状況・お気に入りデータをインポートする
     * @param {string} jsonString
     */
    importUserStateJson(jsonString) {
      let parsed;
      try {
        parsed = JSON.parse(jsonString);
      } catch (_e) {
        throw new Error('データの形式が正しくありません。バックアップファイルや貼り付けた文字をご確認ください。');
      }
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('所持データの形式が正しくありません。');
      }

      const nextCounts = {};
      const nextFavs = {};

      // 配列形式 ([{id, count, favorite}, ...]) または { ownedCards: [...] } / { cards: [...] } のサポート
      const cardArray = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.ownedCards)
          ? parsed.ownedCards
          : Array.isArray(parsed.cards)
            ? parsed.cards
            : null;

      if (cardArray) {
        cardArray.forEach((item) => {
          if (!item || typeof item !== 'object') return;
          const id = String(item.id || item.number || item.cardId || '').trim();
          if (!id) return;
          const count = Math.floor(Number(item.count !== undefined ? item.count : item.owned ? 1 : 0) || 0);
          if (count > 0) nextCounts[id] = count;
          if (item.favorite || item.isFavorite) nextFavs[id] = true;
        });
      }

      if (parsed.counts && typeof parsed.counts === 'object') {
        Object.entries(parsed.counts).forEach(([k, v]) => {
          const n = Math.floor(Number(v) || 0);
          if (n > 0) nextCounts[k.trim()] = n;
        });
      }

      if (parsed.favorites && typeof parsed.favorites === 'object') {
        Object.entries(parsed.favorites).forEach(([k, v]) => {
          if (v) nextFavs[k.trim()] = true;
        });
      }

      // シンプルな { "EP-001": 2, "E1-01": 1 } マップ形式のサポート
      if (!cardArray && !parsed.counts && !parsed.favorites) {
        Object.entries(parsed).forEach(([k, v]) => {
          if (k === 'version' || k === 'exportedAt') return;
          const n = Math.floor(Number(v) || 0);
          if (n > 0) nextCounts[k.trim()] = n;
        });
      }

      this._state = { counts: nextCounts, favorites: nextFavs };
      this._saveUserStateToLocal();
      this._syncAllOwnedToIdb();
    }

    loadCustomMasterData() {
      try {
        const raw = this._storage.getItem(STORAGE_KEYS.CUSTOM_MASTER);
        return raw ? JSON.parse(raw) : null;
      } catch (_e) {
        return null;
      }
    }

    saveCustomMasterData(rawStructure) {
      try {
        this._storage.setItem(STORAGE_KEYS.CUSTOM_MASTER, JSON.stringify(rawStructure));
      } catch (_e) {
        // 無視
      }
    }

    clearCustomMasterData() {
      try {
        this._storage.removeItem(STORAGE_KEYS.CUSTOM_MASTER);
      } catch (_e) {
        // 無視
      }
    }

    loadOfficialCache() {
      try {
        const raw = this._storage.getItem(STORAGE_KEYS.OFFICIAL_CACHE);
        return raw ? JSON.parse(raw) : null;
      } catch (_e) {
        return null;
      }
    }

    saveOfficialCache(rawStructure) {
      try {
        this._storage.setItem(STORAGE_KEYS.OFFICIAL_CACHE, JSON.stringify(rawStructure));
      } catch (_e) {
        // 無視
      }
    }
  }

  global.AikatsuCardStorage = {
    CardStorageService
  };
})(typeof window !== 'undefined' ? window : globalThis);
