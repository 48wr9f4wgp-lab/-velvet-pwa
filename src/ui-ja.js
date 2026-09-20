function writeText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

function setText(selector, text) {
  writeText(document.querySelector(selector), text);
}

function localizeStaticUi() {
  setText(".privacy-gate__copy", "タップして開く");
  setText("#unlockButton", "開く");
  setText("#returnButton", "戻る");
  setText("#quickHideButton", "隠す");
  document.querySelector("#quickHideButton")?.setAttribute("aria-label", "すぐ隠す");

  const emptyState = document.querySelector("#emptyState");
  if (emptyState?.dataset.reason === "favorites") {
    setText("#emptyState h2", "お気に入りはまだありません");
    setText("#emptyState p", "♥で保存した画像がここに並びます。");
    setText("#retryFeedButton", "再読み込み");
  } else {
    setText("#emptyState h2", "フィードを読み込めません");
    setText("#emptyState p", "通信状況を確認して、もう一度読み込んでください。");
    setText("#retryFeedButton", "再読み込み");
  }

  // Swipe gestures are navigation, not reactions.
  setText("#dragLike", "戻る");
  setText("#dragSkip", "進む");

  setText(".settings-sheet__head h2", "設定");
  const settings = [
    ["#privacyBlurSetting", "起動時に隠す", "開くまで内容を表示しません。"],
    ["#resumeSetting", "前回の続きから", "前回見ていた位置を引き継ぎます。"],
    ["#reducedMotionSetting", "アニメーションを減らす", "スワイプや切り替えの動きを抑えます。"],
    ["#historyModeSetting", "履歴", "好みの学習データは端末内に保存されます。"]
  ];
  for (const [selector, title, note] of settings) {
    const control = document.querySelector(selector);
    const label = control?.closest("label");
    if (!label) continue;
    writeText(label.querySelector("b"), title);
    writeText(label.querySelector("small"), note);
  }
  const history = document.querySelector("#historyModeSetting");
  if (history) {
    const labels = {
      off: "Off — 個別履歴を残さない",
      likes: "お気に入りのみ",
      full: "すべて端末内に保存"
    };
    [...history.options].forEach(option => {
      if (labels[option.value]) writeText(option, labels[option.value]);
    });
  }
  setText("#resetTasteButton", "好みをリセット");
  setText("#clearHistoryButton", "履歴を消去");
  setText("#clearAllButton", "Velvetの端末データをすべて消去");

  const presetDialog = document.querySelector("#flowPresetDialog");
  if (presetDialog) {
    setText("#flowPresetDialog h2", "表示を選ぶ");
    setText("#flowPresetDialog .settings-status", "選ぶとすぐ反映します。");
  }
}

const textMap = new Map([
  ["Saved locally", "端末に保存しました"],
  ["Taste reset", "好みをリセットしました"],
  ["History cleared", "履歴を消去しました"],
  ["All local Velvet data cleared", "Velvetの端末データを消去しました"],
  ["No strong signal yet", "まだ強い傾向はありません"]
]);

function translateDynamic(root = document) {
  root.querySelectorAll?.("#settingsStatus, #summaryRecommendation, #summaryTagList span").forEach(el => {
    const translated = textMap.get(el.textContent.trim());
    if (translated) writeText(el, translated);
  });

}

function translateAll() {
  localizeStaticUi();
  translateDynamic();
}

translateAll();

let scheduled = false;
const observer = new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    translateAll();
  });
});
observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-reason"] });
