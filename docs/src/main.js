import { createSimulation } from './sim.js';
import { createSceneView } from './scene-growth.js';
import { bindUi } from './ui.js';

const SAVE_KEY = 'observer_logistics_save';
const fatal = document.getElementById('fatal');
const loading = document.getElementById('loading');

function loadSnapshot() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.schema_version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function saveSnapshot(sim) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(sim.serialize()));
    return true;
  } catch {
    return false;
  }
}

try {
  const sim = createSimulation(loadSnapshot());
  const sceneView = await createSceneView(document.getElementById('game'), sim);
  const ui = bindUi(sim, sceneView);

  loading.hidden = true;

  let last = performance.now();
  let uiTimer = 0;
  let saveTimer = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;

    sim.update(dt);
    sceneView.update(dt);

    uiTimer += dt;
    saveTimer += dt;
    if (uiTimer >= 0.2) {
      ui.render();
      uiTimer = 0;
    }
    if (saveTimer >= 5) {
      if (sim.consumeDirty()) saveSnapshot(sim);
      saveTimer = 0;
    }
  }

  addEventListener('pagehide', () => saveSnapshot(sim));
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (document.visibilityState === 'hidden') saveSnapshot(sim);
  });

  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  loading.hidden = true;
  fatal.hidden = false;
  fatal.textContent = `起動に失敗しました。\n\n${error?.message || error}`;
}
