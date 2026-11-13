/**
 * Module: @role: カードの検索条件フィルタリング、複数条件ソート、およびコレクション統計値の算出を担うドメインロジックモジュール
 */
(function (global) {
  'use strict';

  const RARITY_ORDER = { N: 1, R: 2, PR: 3, ER: 4 };

  /**
   * 検索フォーム要素群から現在の絞り込み・並び替え条件オブジェクトを抽出する
   * @param {Object} el DOM要素キャッシュ
   * @returns {Object}
   */
  function extractFilterCriteria(el) {
    return {
      keyword: el.filterKeyword ? el.filterKeyword.value.trim().toLowerCase() : '',
      series: el.filterSeries ? el.filterSeries.value : '',
      ownership: el.filterOwnership ? el.filterOwnership.value : 'all',
      favOnly: Boolean(el.filterFavorite && el.filterFavorite.checked),
      type: el.filterType ? el.filterType.value : '',
      rarity: el.filterRarity ? el.filterRarity.value : '',
      category: el.filterCategory ? el.filterCategory.value : '',
      brand: el.filterBrand ? el.filterBrand.value : '',
      sortMode: el.sortSelect ? el.sortSelect.value : '1'
    };
  }

  /**
   * 指定された条件とストレージ状態に基づきカード配列をフィルタリング・ソートする
   * @param {Array<Object>} allCards
   * @param {Object} criteria
   * @param {Object} storage CardStorageServiceインスタンス
   * @returns {Array<Object>}
   */
  function filterAndSortCards(allCards, criteria, storage) {
    const {
      keyword = '',
      series = '',
      ownership = 'all',
      favOnly = false,
      type = '',
      rarity = '',
      category = '',
      brand = '',
      sortMode = '1'
    } = criteria || {};

    const filtered = (allCards || []).filter((card) => {
      const count = storage.getCount(card.id);
      const isFav = storage.isFavorite(card.id);

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
        const diff = storage.getCount(b.id) - storage.getCount(a.id);
        return diff !== 0 ? diff : a.number.localeCompare(b.number, 'ja', { numeric: true });
      }
      return a.number.localeCompare(b.number, 'ja', { numeric: true });
    });

    return filtered;
  }

  /**
   * 全体および絞り込み結果のコレクション統計値を計算する
   * @param {Array<Object>} allCards
   * @param {Array<Object>} filteredCards
   * @param {Object} storage CardStorageServiceインスタンス
   * @returns {Object}
   */
  function computeCollectionStats(allCards, filteredCards, storage) {
    const totalUnique = (allCards || []).length;
    let ownedUnique = 0;
    let totalCopies = 0;
    let favCount = 0;

    (allCards || []).forEach((card) => {
      const c = storage.getCount(card.id);
      if (c > 0) {
        ownedUnique += 1;
        totalCopies += c;
      }
      if (storage.isFavorite(card.id)) {
        favCount += 1;
      }
    });

    const overallRate = totalUnique > 0 ? (ownedUnique / totalUnique) * 100 : 0;
    const filteredTotal = (filteredCards || []).length;
    const filteredOwned = (filteredCards || []).filter((c) => storage.getCount(c.id) > 0).length;
    const filteredRate = filteredTotal > 0 ? (filteredOwned / filteredTotal) * 100 : 0;

    return {
      totalUnique,
      ownedUnique,
      totalCopies,
      favCount,
      overallRate,
      filteredTotal,
      filteredOwned,
      filteredRate
    };
  }

  global.AikatsuCardFilter = {
    RARITY_ORDER,
    extractFilterCriteria,
    filterAndSortCards,
    computeCollectionStats
  };
})(typeof window !== 'undefined' ? window : globalThis);
