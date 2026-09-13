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

  setText("#dragLike", "保存");
  setText("#dragSkip", "スキップ");

  setText("#sessionSetupView h2", "Sessionを選ぶ");
  setText("#sessionSetupView .panel .muted", "時間とムードを選んで、集中して見る。");
  const legends = document.querySelectorAll("#sessionForm legend");
  writeText(legends[0], "目安時間");
  writeText(legends[1], "ムード");
  document.querySelectorAll('#durationOptions input[name="duration"]').forEach(input => {
    writeText(input.nextElementSibling, `約${input.value}分`);
  });
  const moodNotes = {
    soft: "穏やか",
    personal: "好み重視",
    pro: "プロ寄り",
    intense: "刺激強め"
  };
  document.querySelectorAll('.mood-grid input[name="mood"]').forEach(input => {
    writeText(input.nextElementSibling?.querySelector("small"), moodNotes[input.value] || "");
  });
  setText('#sessionForm button[type="submit"]', "はじめる");
  setText("#endSessionButton", "終了");

  setText("#sessionSummaryView h2", "完了");
  const summaryLabels = document.querySelectorAll(".summary-stats small");
  writeText(summaryLabels[0], "お気に入り");
  writeText(summaryLabels[1], "スキップ");
  writeText(summaryLabels[2], "完了率");
  setText(".summary-tags .muted", "強く出た好み");
  setText("#summaryFlowButton", "Flowへ戻る");
  setText("#summaryAgainButton", "もう一度");

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
    setText("#flowPresetDialog h2", "Flowモード");
    const presetCopy = {
      soft: "Soft · 穏やかに",
      personal: "Personal · 好みを優先",
      pro: "Pro · プロ寄り",
      intense: "Intense · 刺激強め",
      favorites: "Favorites · お気に入りのみ",
      explore: "Explore · 発見を増やす"
    };
    presetDialog.querySelectorAll("[data-preset]").forEach(button => {
      const id = button.dataset.preset;
      if (presetCopy[id] && !button.disabled) writeText(button, presetCopy[id]);
    });
    setText("#flowPresetDialog .settings-status", "次のカードから反映します。");
  }
}

const textMap = new Map([
  ["Saved locally", "端末に保存しました"],
  ["Taste reset", "好みをリセットしました"],
  ["History cleared", "履歴を消去しました"],
  ["All local Velvet data cleared", "Velvetの端末データを消去しました"],
  ["No strong signal yet", "まだ強い傾向はありません"],
  ["Try a shorter 3-minute Personal session.", "次は3分のPersonalがおすすめです。"],
  ["Strong match. Intense may be worth trying next.", "好みにかなり合っています。次はIntenseも良さそうです。"],
  ["Low hit rate. Soft or Explore should diversify the next run.", "今回は合いにくめ。次はSoftかExploreで広げるのがおすすめです。"],
  ["Personal remains the best default for the next session.", "次もPersonalが一番合いそうです。"]
]);

function translateDynamic(root = document) {
  root.querySelectorAll?.("#settingsStatus, #summaryRecommendation, #summaryTagList span").forEach(el => {
    const translated = textMap.get(el.textContent.trim());
    if (translated) writeText(el, translated);
  });

  const favoriteButton = document.querySelector('#flowPresetDialog [data-preset="favorites"]');
  if (favoriteButton?.disabled) writeText(favoriteButton, "Favorites · まず1件保存");
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
