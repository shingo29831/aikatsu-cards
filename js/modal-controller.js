/**
 * Module: @role: カード詳細モーダルの表示・フリップ・前後移動と、データ管理モーダルのファイル入出力・バックアップ操作を担うモーダル制御モジュール
 */
(function (global) {
  'use strict';

  /**
   * 指定インデックスのカードを詳細モーダルに描画して開く
   * @param {Object} app AikatsuCardAppインスタンス
   * @param {number} index
   */
  function openCardModal(app, index) {
    if (index < 0 || index >= app._filteredCards.length) return;
    app._activeModalIndex = index;
    const card = app._filteredCards[index];
    const el = app.el;

    el.modalFlipContainer.classList.remove('is-flipped');
    el.btnFlipCard.textContent = '裏面を見る ↻';

    el.modalImgFront.src = card.imageUrl || '';
    el.modalImgFront.alt = `${card.name} (表面)`;
    el.modalImgBack.src =
      card.backImageUrl || app._dataService.deriveBackImageUrl(card.imageUrl || '');
    el.modalImgBack.alt = `${card.name} (裏面)`;

    el.modalCardNumber.textContent = card.number;
    el.modalCardRarity.textContent = card.rarity;
    el.modalCardRarity.className = `rarity-badge rarity-badge--${card.rarity}`;

    if (card.type) {
      el.modalCardType.textContent = card.type;
      el.modalCardType.className = `type-badge type-badge--${card.type}`;
      el.modalCardType.hidden = false;
    } else {
      el.modalCardType.textContent = '';
      el.modalCardType.hidden = true;
    }

    el.modalCardName.textContent = card.name;
    el.modalCardSeries.textContent = card.seriesName || '';
    el.modalCardCategory.textContent = card.category || '';
    el.modalCardBrand.textContent = card.brand || '';

    const obtainMethod =
      card.obtainMethod ||
      (app._dataService.PROMO_OBTAIN_MAP &&
        app._dataService.PROMO_OBTAIN_MAP[card.id.toUpperCase()]) ||
      '';
    if (obtainMethod) {
      el.modalCardObtain.textContent = obtainMethod;
      el.modalObtainWrap.hidden = false;
    } else {
      el.modalCardObtain.textContent = '';
      el.modalObtainWrap.hidden = true;
    }

    syncModalState(app, card);

    el.btnPrevCard.disabled = index <= 0;
    el.btnNextCard.disabled = index >= app._filteredCards.length - 1;

    el.cardDetailModal.hidden = false;
    el.cardDetailModal.setAttribute('aria-hidden', 'false');
  }

  /**
   * カード詳細モーダルを閉じる
   * @param {Object} app
   */
  function closeCardModal(app) {
    app.el.cardDetailModal.hidden = true;
    app.el.cardDetailModal.setAttribute('aria-hidden', 'true');
    app._activeModalIndex = -1;
  }

  /**
   * モーダル表示中のカードを前後へ移動する
   * @param {Object} app
   * @param {number} delta
   */
  function stepModalCard(app, delta) {
    const nextIndex = app._activeModalIndex + delta;
    if (nextIndex < 0 || nextIndex >= app._filteredCards.length) return;
    app._openCardModal(nextIndex);
  }

  /**
   * モーダル内の所持枚数とお気に入りボタン状態を同期する
   * @param {Object} app
   * @param {Object} card
   */
  function syncModalState(app, card) {
    const count = app._storage.getCount(card.id);
    const isFav = app._storage.isFavorite(card.id);
    app.el.modalOwnedCount.textContent = String(count);
    app.el.modalBtnFav.textContent = isFav ? '★' : '☆';
    app.el.modalBtnFav.classList.toggle('is-active', isFav);
    app.el.modalBtnFav.setAttribute('aria-pressed', String(isFav));
  }

  /**
   * JSON文字列をファイルとしてダウンロード保存する
   * @param {string} jsonString
   * @param {string} fileName
   */
  function downloadJson(jsonString, fileName) {
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

  /**
   * 例外オブジェクトを一般ユーザー向けの日本語メッセージに整形する
   * @param {Error|*} err
   * @returns {string}
   */
  function formatUserFriendlyError(err) {
    if (!err) return 'データの読み込みに失敗しました。';
    // ブラウザ標準の英語SyntaxErrorを一般ユーザー向けの日本語案内に変換
    if (err instanceof SyntaxError) {
      return 'データの形式が正しくありません。ファイルや貼り付けた文字が欠けていないかご確認ください。';
    }
    return err.message || 'データの読み込みに失敗しました。';
  }

  /**
   * ファイル選択イベントからユーザーの所持状態データをインポートする
   * @param {Object} app
   * @param {Event} e
   */
  function handleUserStateFileImport(app, e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        app._storage.importUserStateJson(text);
        if (app.el.textareaUserStateJson) {
          app.el.textareaUserStateJson.value = app._storage.exportUserStateJson(app._allCards);
        }
        app._refreshView();
        app.el.dataModalStatus.textContent = `「${file.name}」から所持データを復元しました。`;
        app._setSyncBadge('所持データの復元完了', 'success');
      } catch (err) {
        app.el.dataModalStatus.textContent = `復元エラー: ${ app._formatUserFriendlyError(err) }`;
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  /**
   * チュートリアルモーダルの表示ページを切り替え、ナビゲーションUIを同期する
   * @param {Object} app
   * @param {number} pageIndex
   */
  function setTutorialPage(app, pageIndex) {
    const el = app.el;
    const pages = el.tutorialPages ? Array.from(el.tutorialPages) : [];
    const total = pages.length;
    if (total === 0) return;

    const clamped = Math.max(0, Math.min(pageIndex, total - 1));
    app._tutorialPageIndex = clamped;

    pages.forEach((pageEl, idx) => {
      const isActive = idx === clamped;
      pageEl.hidden = !isActive;
      pageEl.classList.toggle('is-active', isActive);
    });

    if (el.tutorialDots) {
      Array.from(el.tutorialDots).forEach((dotEl, idx) => {
        const isActive = idx === clamped;
        dotEl.classList.toggle('is-active', isActive);
        if (isActive) {
          dotEl.setAttribute('aria-current', 'step');
        } else {
          dotEl.removeAttribute('aria-current');
        }
      });
    }

    if (el.tutorialPageIndicator) {
      el.tutorialPageIndicator.textContent = `${clamped + 1} / ${total}`;
    }

    const isFirst = clamped === 0;
    const isLast = clamped === total - 1;

    if (el.btnTutorialPrev) {
      el.btnTutorialPrev.disabled = isFirst;
    }
    if (el.btnTutorialNext) {
      el.btnTutorialNext.hidden = isLast;
    }
    if (el.btnStartFromTutorial) {
      el.btnStartFromTutorial.hidden = !isLast;
    }

    if (el.tutorialDialog) {
      el.tutorialDialog.scrollTop = 0;
    }
  }

  /**
   * チュートリアルモーダル内のページを前後に移動する
   * @param {Object} app
   * @param {number} delta
   */
  function stepTutorialPage(app, delta) {
    const current = Number.isFinite(app._tutorialPageIndex) ? app._tutorialPageIndex : 0;
    setTutorialPage(app, current + delta);
  }

  /**
   * チュートリアルモーダルを開く
   * @param {Object} app
   */
  function openTutorialModal(app) {
    const el = app.el;
    if (!el.tutorialModal) return;
    if (el.chkTutorialHideNext) {
      el.chkTutorialHideNext.checked = app._storage.getHideTutorialOnStartup();
    }
    setTutorialPage(app, 0);
    el.tutorialModal.hidden = false;
    el.tutorialModal.setAttribute('aria-hidden', 'false');
  }

  /**
   * チュートリアルモーダルを閉じ、表示設定を保存する
   * @param {Object} app
   */
  function closeTutorialModal(app) {
    const el = app.el;
    if (!el.tutorialModal) return;
    if (el.chkTutorialHideNext) {
      app._storage.setHideTutorialOnStartup(Boolean(el.chkTutorialHideNext.checked));
    }
    el.tutorialModal.hidden = true;
    el.tutorialModal.setAttribute('aria-hidden', 'true');
  }

  /**
   * カード詳細モーダル・データ管理モーダル・チュートリアルモーダルのイベントをバインドする
   * @param {Object} app
   */
  function bindModalEvents(app) {
    const el = app.el;

    el.btnCloseCardModal.addEventListener('click', () => app._closeCardModal());
    el.cardDetailModal.addEventListener('click', (e) => {
      if (e.target === el.cardDetailModal) app._closeCardModal();
    });

    el.btnFlipCard.addEventListener('click', () => {
      const flipped = el.modalFlipContainer.classList.toggle('is-flipped');
      el.btnFlipCard.textContent = flipped ? '表面を見る ↻' : '裏面を見る ↻';
    });

    el.btnPrevCard.addEventListener('click', () => app._stepModalCard(-1));
    el.btnNextCard.addEventListener('click', () => app._stepModalCard(1));

    // スマホ向けスワイプでの前後カード送り
    if (el.modalVisualWrap) {
      el.modalVisualWrap.addEventListener(
        'touchstart',
        (e) => {
          if (!e.touches || e.touches.length !== 1) return;
          app._touchStartX = e.touches[0].clientX;
          app._touchStartY = e.touches[0].clientY;
        },
        { passive: true }
      );
      el.modalVisualWrap.addEventListener(
        'touchend',
        (e) => {
          if (!e.changedTouches || e.changedTouches.length !== 1) return;
          const dx = e.changedTouches[0].clientX - app._touchStartX;
          const dy = e.changedTouches[0].clientY - app._touchStartY;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
            app._stepModalCard(dx < 0 ? 1 : -1);
          }
        },
        { passive: true }
      );
    }

    el.modalBtnInc.addEventListener('click', () => {
      const card = app._filteredCards[app._activeModalIndex];
      if (!card) return;
      app._storage.incrementCount(card.id, 1);
      app._syncModalState(card);
      app._refreshView();
    });

    el.modalBtnDec.addEventListener('click', () => {
      const card = app._filteredCards[app._activeModalIndex];
      if (!card) return;
      app._storage.incrementCount(card.id, -1);
      app._syncModalState(card);
      app._refreshView();
    });

    el.modalBtnFav.addEventListener('click', () => {
      const card = app._filteredCards[app._activeModalIndex];
      if (!card) return;
      app._storage.toggleFavorite(card.id);
      app._syncModalState(card);
      app._refreshView();
    });

    // データ管理モーダル
    el.btnOpenDataModal.addEventListener('click', () => {
      el.textareaCardJson.value = JSON.stringify(app._rawMasterStructure, null, 2);
      if (el.textareaUserStateJson) {
        el.textareaUserStateJson.value = app._storage.exportUserStateJson(app._allCards);
      }
      el.dataModalStatus.textContent = '';
      el.dataManageModal.hidden = false;
    });
    el.btnCloseDataModal.addEventListener('click', () => {
      el.dataManageModal.hidden = true;
    });
    el.dataManageModal.addEventListener('click', (e) => {
      if (e.target === el.dataManageModal) el.dataManageModal.hidden = true;
    });

    el.btnApplyCardJson.addEventListener('click', () => {
      try {
        const rawText = el.textareaCardJson.value.trim();
        // 公式サイトのHTMLソースが直接貼り付けられた場合も自動解析
        if (rawText.startsWith('<') && rawText.includes('cardList')) {
          const parsedHtml = app._dataService.parseOfficialCardListHtml(rawText);
          app._applyMasterData(parsedHtml.seriesGroups, true);
          el.dataModalStatus.textContent = `公式ページのデータから ${parsedHtml.cards.length} 枚のカードを読み込みました。`;
          return;
        }
        const parsed = JSON.parse(rawText);
        app._applyMasterData(parsed, true);
        el.dataModalStatus.textContent = 'カード図鑑データを反映しました。';
      } catch (err) {
        el.dataModalStatus.textContent = `エラー: ${app._formatUserFriendlyError(err)}`;
      }
    });

    el.inputCardJsonFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          el.textareaCardJson.value = JSON.stringify(parsed, null, 2);
          app._applyMasterData(parsed, true);
          el.dataModalStatus.textContent = `ファイル「${file.name}」を読み込みました。`;
        } catch (err) {
          el.dataModalStatus.textContent = `読み込みエラー: ${app._formatUserFriendlyError(err)}`;
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    el.btnExportCardJson.addEventListener('click', () => {
      app._downloadJson(JSON.stringify(app._rawMasterStructure, null, 2), 'cards.json');
      el.dataModalStatus.textContent = '現在のカード図鑑をファイルに保存しました。';
    });

    el.btnResetMasterData.addEventListener('click', async () => {
      app._storage.clearCustomMasterData();
      await app.syncFromOfficialSite();
      el.textareaCardJson.value = JSON.stringify(app._rawMasterStructure, null, 2);
      el.dataModalStatus.textContent = '最新のカード図鑑データに更新しました。';
    });

    el.btnExportUserState.addEventListener('click', () => {
      app._downloadJson(app._storage.exportUserStateJson(app._allCards), 'aikatsu_owned_cards.json');
      el.dataModalStatus.textContent = 'バックアップファイルを保存しました。';
    });

    el.inputUserStateFile.addEventListener('change', (e) => {
      app._handleUserStateFileImport(e);
    });

    if (el.btnApplyUserStateJson) {
      el.btnApplyUserStateJson.addEventListener('click', () => {
        try {
          app._storage.importUserStateJson(el.textareaUserStateJson.value);
          app._refreshView();
          el.dataModalStatus.textContent = '貼り付けた所持データを復元しました。';
        } catch (err) {
          el.dataModalStatus.textContent = `復元エラー: ${app._formatUserFriendlyError(err)}`;
        }
      });
    }

    el.btnClearUserState.addEventListener('click', () => {
      app._storage.clearUserState();
      if (el.textareaUserStateJson) {
        el.textareaUserStateJson.value = app._storage.exportUserStateJson(app._allCards);
      }
      app._refreshView();
      el.dataModalStatus.textContent = '所持枚数をすべてリセットしました。';
    });

    if (el.btnOpenTutorial) {
      el.btnOpenTutorial.addEventListener('click', () => {
        openTutorialModal(app);
      });
    }
    if (el.btnCloseTutorialModal) {
      el.btnCloseTutorialModal.addEventListener('click', () => {
        closeTutorialModal(app);
      });
    }
    if (el.btnTutorialPrev) {
      el.btnTutorialPrev.addEventListener('click', () => {
        stepTutorialPage(app, -1);
      });
    }
    if (el.btnTutorialNext) {
      el.btnTutorialNext.addEventListener('click', () => {
        stepTutorialPage(app, 1);
      });
    }
    if (el.tutorialDots) {
      Array.from(el.tutorialDots).forEach((dotEl, idx) => {
        dotEl.addEventListener('click', () => {
          const targetIdx = Number(dotEl.dataset.tutorialDot);
          setTutorialPage(app, Number.isFinite(targetIdx) ? targetIdx : idx);
        });
      });
    }
    if (el.tutorialPagesContainer) {
      let tutorialTouchX = 0;
      let tutorialTouchY = 0;
      el.tutorialPagesContainer.addEventListener(
        'touchstart',
        (e) => {
          if (!e.touches || e.touches.length !== 1) return;
          tutorialTouchX = e.touches[0].clientX;
          tutorialTouchY = e.touches[0].clientY;
        },
        { passive: true }
      );
      el.tutorialPagesContainer.addEventListener(
        'touchend',
        (e) => {
          if (!e.changedTouches || e.changedTouches.length !== 1) return;
          const dx = e.changedTouches[0].clientX - tutorialTouchX;
          const dy = e.changedTouches[0].clientY - tutorialTouchY;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            stepTutorialPage(app, dx < 0 ? 1 : -1);
          }
        },
        { passive: true }
      );
    }
    if (el.btnStartFromTutorial) {
      el.btnStartFromTutorial.addEventListener('click', () => {
        closeTutorialModal(app);
      });
    }
    if (el.chkTutorialHideNext) {
      el.chkTutorialHideNext.addEventListener('change', () => {
        app._storage.setHideTutorialOnStartup(Boolean(el.chkTutorialHideNext.checked));
      });
    }
    if (el.tutorialModal) {
      el.tutorialModal.addEventListener('click', (e) => {
        if (e.target === el.tutorialModal) closeTutorialModal(app);
      });
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (el.cardDetailModal && !el.cardDetailModal.hidden) {
            app._closeCardModal();
          } else if (el.dataManageModal && !el.dataManageModal.hidden) {
            el.dataManageModal.hidden = true;
          } else if (el.tutorialModal && !el.tutorialModal.hidden) {
            closeTutorialModal(app);
          }
          return;
        }

        if (
          el.tutorialModal &&
          !el.tutorialModal.hidden &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey
        ) {
          const tagName = e.target && e.target.tagName ? e.target.tagName : '';
          if (tagName === 'TEXTAREA' || tagName === 'SELECT') return;
          if (e.key === 'ArrowLeft') {
            stepTutorialPage(app, -1);
          } else if (e.key === 'ArrowRight') {
            stepTutorialPage(app, 1);
          }
        }
      });
    }
  }

  global.AikatsuModalController = {
    openCardModal,
    closeCardModal,
    stepModalCard,
    syncModalState,
    downloadJson,
    formatUserFriendlyError,
    handleUserStateFileImport,
    setTutorialPage,
    stepTutorialPage,
    openTutorialModal,
    closeTutorialModal,
    bindModalEvents
  };
})(typeof window !== 'undefined' ? window : globalThis);
