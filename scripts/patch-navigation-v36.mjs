import fs from 'node:fs';

const appPath = 'src/app.js';
const inputPath = 'src/input-guard.js';
const workflowPath = '.github/workflows/navigation-patch.yml';

function replaceOnce(text, before, after, label) {
  const index = text.indexOf(before);
  if (index < 0) throw new Error(`Patch target not found: ${label}`);
  if (text.indexOf(before, index + before.length) >= 0) throw new Error(`Patch target not unique: ${label}`);
  return text.slice(0, index) + after + text.slice(index + before.length);
}

let app = fs.readFileSync(appPath, 'utf8');

app = replaceOnce(
  app,
  'let flowTransitionTimer = null;\nlet flowExclusions = new Set();\nconst runtimeSeenByMode = new Map();',
  'let flowTransitionTimer = null;\nlet flowExclusions = new Set();\nlet flowBackStack = [];\nlet flowForwardStack = [];\nconst FLOW_NAV_LIMIT = 60;\nconst runtimeSeenByMode = new Map();',
  'flow navigation state'
);

app = replaceOnce(
  app,
  'function showNextFlowItem(options = {}) {\n  renderFlowItem(selectNextFlowItem(options));\n}\n\nfunction animateFlowDecision(direction, nextItem) {',
  `function showNextFlowItem(options = {}) {\n  renderFlowItem(selectNextFlowItem(options));\n}\n\nfunction clearFlowNavigation() {\n  flowBackStack = [];\n  flowForwardStack = [];\n}\n\nfunction pushFlowBack(item = currentItem, { clearForward = true } = {}) {\n  if (!item?.id) return;\n  const last = flowBackStack[flowBackStack.length - 1];\n  if (!last || last.id !== item.id) flowBackStack.push(item);\n  if (flowBackStack.length > FLOW_NAV_LIMIT) flowBackStack = flowBackStack.slice(-FLOW_NAV_LIMIT);\n  if (clearForward) flowForwardStack = [];\n}\n\nfunction animateFlowNavigation(direction, item, { recordExposure = true, rememberRuntime = true } = {}) {\n  if (!item) return;\n  clearTimeout(flowTransitionTimer);\n  flowTransitionTimer = null;\n  if (state.settings.reducedMotion) {\n    renderFlowItem(item, { recordExposure, rememberRuntime });\n    return;\n  }\n  const x = direction === "back" ? 110 : -110;\n  els.mediaCard.style.transform = "translateX(" + x + "%) rotate(" + (direction === "back" ? 5 : -5) + "deg)";\n  els.mediaCard.style.opacity = "0";\n  flowTransitionTimer = setTimeout(() => {\n    flowTransitionTimer = null;\n    renderFlowItem(item, { recordExposure, rememberRuntime });\n  }, 140);\n}\n\nfunction navigateFlowNext() {\n  if (!currentItem) return;\n  if (flowForwardStack.length) {\n    pushFlowBack(currentItem, { clearForward: false });\n    const item = flowForwardStack.pop();\n    animateFlowNavigation("next", item, { recordExposure: false, rememberRuntime: false });\n    return;\n  }\n  pushFlowBack(currentItem);\n  const item = selectNextFlowItem();\n  if (!item) return;\n  preloadImages([item]);\n  animateFlowNavigation("next", item);\n}\n\nfunction navigateFlowBack() {\n  if (!currentItem || !flowBackStack.length) return;\n  const item = flowBackStack.pop();\n  if (!item) return;\n  if (!flowForwardStack.length || flowForwardStack[flowForwardStack.length - 1]?.id !== currentItem.id) {\n    flowForwardStack.push(currentItem);\n    if (flowForwardStack.length > FLOW_NAV_LIMIT) flowForwardStack = flowForwardStack.slice(-FLOW_NAV_LIMIT);\n  }\n  animateFlowNavigation("back", item, { recordExposure: false, rememberRuntime: false });\n}\n\nfunction animateFlowDecision(direction, nextItem) {`,
  'flow navigation helpers'
);

app = replaceOnce(
  app,
  '  const stateBefore = JSON.parse(JSON.stringify(state));\n  const modeBefore = flowMode;\n  state = recordReaction(state, reactedItem, reaction);',
  '  const stateBefore = JSON.parse(JSON.stringify(state));\n  const modeBefore = flowMode;\n  pushFlowBack(reactedItem);\n  state = recordReaction(state, reactedItem, reaction);',
  'reaction history push'
);

app = replaceOnce(
  app,
  '    if (nextFavorite) {\n      preloadImages([nextFavorite]);\n      animateFlowDecision("skip", nextFavorite);',
  '    if (nextFavorite) {\n      pushFlowBack(item);\n      preloadImages([nextFavorite]);\n      animateFlowDecision("skip", nextFavorite);',
  'favorite navigation history'
);

app = replaceOnce(
  app,
  '  state = saveState(action.stateBefore);\n\n  if (action.kind === "unfavorite"',
  '  state = saveState(action.stateBefore);\n  clearFlowNavigation();\n\n  if (action.kind === "unfavorite"',
  'undo navigation reset'
);

app = replaceOnce(app, 'function bindSwipe(card, onLike, onSkip) {', 'function bindSwipe(card, onBack, onNext) {', 'bindSwipe signature');
app = replaceOnce(app, '      if (dx > 0) onLike(); else onSkip();', '      if (dx > 0) onBack(); else onNext();', 'bindSwipe direction');

app = replaceOnce(
  app,
  '  state = recordView(state, item);\n  preloadImages(session.queue.slice(session.index + 1, session.index + 4));\n  window.dispatchEvent(new CustomEvent("velvet:session-item", { detail: { item } }));\n}\n\nfunction reactSession(reaction) {',
  `  state = recordView(state, item);\n  preloadImages(session.queue.slice(session.index + 1, session.index + 4));\n  window.dispatchEvent(new CustomEvent("velvet:session-item", { detail: { item } }));\n}\n\nfunction navigateSessionNext() {\n  if (!session || session.ended) return;\n  session.index += 1;\n  renderSessionItem();\n}\n\nfunction navigateSessionBack() {\n  if (!session || session.ended || session.index <= 0) return;\n  session.index -= 1;\n  renderSessionItem();\n}\n\nfunction reactSession(reaction) {`,
  'session navigation helpers'
);

app = replaceOnce(
  app,
  '  const item = session.queue[session.index];\n  if (!item) return finishSession(false);\n  state = recordReaction(state, item, reaction);',
  '  const item = session.queue[session.index];\n  if (!item) return finishSession(false);\n  if (session.likedIds.includes(item.id) || session.skippedIds.includes(item.id)) {\n    navigateSessionNext();\n    return;\n  }\n  state = recordReaction(state, item, reaction);',
  'session reaction dedupe'
);

app = replaceOnce(
  app,
  '  flowExclusions.clear();\n  runtimeSeenByMode.clear();\n  currentItem = null;',
  '  flowExclusions.clear();\n  runtimeSeenByMode.clear();\n  clearFlowNavigation();\n  currentItem = null;',
  'reset navigation state'
);

app = replaceOnce(
  app,
  '  flowExclusions.clear();\n  runtimeSeenByMode.clear();\n  currentItem = null;\n  if (appUnlocked) showNextFlowItem();',
  '  flowExclusions.clear();\n  runtimeSeenByMode.clear();\n  clearFlowNavigation();\n  currentItem = null;\n  if (appUnlocked) showNextFlowItem();',
  'reload navigation state'
);

app = replaceOnce(
  app,
  'function bindEvents() {\n  window.addEventListener("velvet:flow-undo", undoLastFlowAction);',
  'function bindEvents() {\n  window.addEventListener("velvet:flow-undo", undoLastFlowAction);\n  window.addEventListener("velvet:flow-next", navigateFlowNext);\n  window.addEventListener("velvet:flow-back", navigateFlowBack);\n  window.addEventListener("velvet:session-next", navigateSessionNext);\n  window.addEventListener("velvet:session-back", navigateSessionBack);',
  'navigation event bindings'
);

app = replaceOnce(
  app,
  '    flowMode = VALID_FLOW_MODES.has(requested) ? requested : "personal";\n    lastFlowAction = null;\n    state = recordModeUse(state, `flow:${flowMode}`);',
  '    flowMode = VALID_FLOW_MODES.has(requested) ? requested : "personal";\n    lastFlowAction = null;\n    clearFlowNavigation();\n    state = recordModeUse(state, `flow:${flowMode}`);',
  'preset navigation reset'
);

app = replaceOnce(
  app,
  '  bindSwipe(els.mediaCard, handleFlowLike, () => reactFlow("skip"));\n  bindSwipe(els.sessionMediaCard, () => reactSession("like"), () => reactSession("skip"));',
  '  bindSwipe(els.mediaCard, navigateFlowBack, navigateFlowNext);\n  bindSwipe(els.sessionMediaCard, navigateSessionBack, navigateSessionNext);',
  'fallback swipe semantics'
);

fs.writeFileSync(appPath, app);

const input = `import "./ui-ja.js?v=36";\nimport "./flow-feedback.js?v=36";\nimport "./feed-bridge.js?v=36";\nimport "./media-viewer.js?v=36";\n\nconst UX_STYLESHEET = "./flow-ux.css";\nif (!document.querySelector('link[data-velvet-flow-ux]')) {\n  const link = document.createElement("link");\n  link.rel = "stylesheet";\n  link.href = UX_STYLESHEET;\n  link.dataset.velvetFlowUx = "1";\n  document.head.append(link);\n}\n\nconst LOCK_MS = 180;\nconst NAV_DISTANCE = 52;\nconst FLICK_DISTANCE = 28;\nconst FLICK_VELOCITY = 0.45;\nconst TAP_DISTANCE = 9;\nconst TAP_MAX_MS = 420;\nconst lockedUntil = new Map();\n\nfunction now() {\n  return typeof performance !== "undefined" ? performance.now() : Date.now();\n}\n\nfunction acquire(group) {\n  const t = now();\n  if (t < (lockedUntil.get(group) || 0)) return false;\n  lockedUntil.set(group, t + LOCK_MS);\n  return true;\n}\n\nfunction resetNavigationCard(card) {\n  card.style.transform = "";\n  card.style.opacity = "";\n  document.querySelector("#dragLike")?.style.setProperty("opacity", "0");\n  document.querySelector("#dragSkip")?.style.setProperty("opacity", "0");\n}\n\nfunction guardButton(selector, group, label) {\n  const button = document.querySelector(selector);\n  if (!button) return;\n  if (label) button.dataset.label = label;\n  button.addEventListener("click", event => {\n    if (acquire(group)) return;\n    event.preventDefault();\n    event.stopImmediatePropagation();\n  }, { capture: true });\n}\n\nfunction bindFastNavigationGesture({ cardSelector, showCues = false, scope = "flow" }) {\n  const card = document.querySelector(cardSelector);\n  if (!card) return;\n\n  const gestures = new Map();\n\n  card.addEventListener("pointerdown", event => {\n    if (event.pointerType === "mouse" && event.button !== 0) return;\n    gestures.set(event.pointerId, {\n      startX: event.clientX,\n      startY: event.clientY,\n      x: 0,\n      y: 0,\n      startedAt: now(),\n      vertical: false\n    });\n    card.setPointerCapture?.(event.pointerId);\n    event.stopImmediatePropagation();\n  }, { capture: true });\n\n  card.addEventListener("pointermove", event => {\n    const gesture = gestures.get(event.pointerId);\n    if (!gesture) return;\n\n    const dx = event.clientX - gesture.startX;\n    const dy = event.clientY - gesture.startY;\n    gesture.x = dx;\n    gesture.y = dy;\n\n    if (!gesture.vertical && Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.35) gesture.vertical = true;\n\n    if (!gesture.vertical) {\n      event.preventDefault();\n      const pct = Math.max(-1, Math.min(1, dx / NAV_DISTANCE));\n      card.style.transform = \"translateX(\" + (dx * 0.78) + \"px) rotate(\" + (pct * 4.5) + \"deg)\";\n      if (showCues) {\n        document.querySelector("#dragLike")?.style.setProperty("opacity", String(Math.max(0, Math.min(1, pct * 1.15))));\n        document.querySelector("#dragSkip")?.style.setProperty("opacity", String(Math.max(0, Math.min(1, -pct * 1.15))));\n      }\n    }\n\n    event.stopImmediatePropagation();\n  }, { capture: true });\n\n  const finish = event => {\n    if (!gestures.has(event.pointerId)) return;\n    const gesture = gestures.get(event.pointerId);\n    gestures.delete(event.pointerId);\n    card.releasePointerCapture?.(event.pointerId);\n\n    const elapsed = Math.max(1, now() - gesture.startedAt);\n    const velocity = gesture.x / elapsed;\n    const horizontalEnough = Math.abs(gesture.x) >= Math.abs(gesture.y) * 0.72;\n    const distanceNavigation = Math.abs(gesture.x) >= NAV_DISTANCE;\n    const flickNavigation = Math.abs(gesture.x) >= FLICK_DISTANCE && Math.abs(velocity) >= FLICK_VELOCITY;\n    const navigated = !gesture.vertical && horizontalEnough && (distanceNavigation || flickNavigation);\n    const tapped = !gesture.vertical && Math.abs(gesture.x) <= TAP_DISTANCE && Math.abs(gesture.y) <= TAP_DISTANCE && elapsed <= TAP_MAX_MS;\n\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    resetNavigationCard(card);\n\n    if (navigated) {\n      const direction = gesture.x > 0 ? "back" : "next";\n      window.dispatchEvent(new CustomEvent(\"velvet:\" + scope + \"-\" + direction));\n      return;\n    }\n\n    if (tapped) window.dispatchEvent(new CustomEvent("velvet:media-tap", { detail: { scope } }));\n  };\n\n  card.addEventListener("pointerup", finish, { capture: true });\n  card.addEventListener("pointercancel", event => {\n    gestures.delete(event.pointerId);\n    resetNavigationCard(card);\n    event.stopImmediatePropagation();\n  }, { capture: true });\n}\n\nguardButton("#likeButton", "flow", "お気に入り");\nguardButton("#skipButton", "flow", "スキップ");\nguardButton("#sessionLikeButton", "session", "お気に入り");\nguardButton("#sessionSkipButton", "session", "スキップ");\n\nconst backCue = document.querySelector("#dragLike");\nconst nextCue = document.querySelector("#dragSkip");\nif (backCue) backCue.textContent = "戻る";\nif (nextCue) nextCue.textContent = "進む";\n\nbindFastNavigationGesture({ cardSelector: "#mediaCard", showCues: true, scope: "flow" });\nbindFastNavigationGesture({ cardSelector: "#sessionMediaCard", scope: "session" });\n`;

fs.writeFileSync(inputPath, input);

fs.writeFileSync(workflowPath, `name: Velvet navigation patch\n\non:\n  workflow_dispatch:\n\npermissions:\n  contents: write\n\njobs:\n  patch:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo \"v36 navigation patch already applied\"\n`);

console.log('Velvet swipe navigation patch v36 applied');
