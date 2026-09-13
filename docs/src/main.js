import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js';
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/+esm';
import { createInput } from './input.js';

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $('game'), money: $('money'), sold: $('sold'), status: $('status'),
  grab: $('grabBtn'), sell: $('sellBtn'), buy: $('buyBtn'), reset: $('resetBtn'), fatal: $('fatal'),
  movePad: $('movePad'), moveKnob: $('moveKnob'), lookPad: $('lookPad'),
};

const SAVE_KEY = 'workshop_sandbox_v2';
const BOX_PRICE = 40;
const BASE_SALE = 80;
const MAX_BOXES = 40;
const GOAL = 10;
const MOVE_SPEED = 5.6;
const GRAB_RANGE = 5.5;
const THROW_SPEED = 11.5;
const SELL_CENTER = new THREE.Vector3(5.4, 0, -5.4);
const SELL_RADIUS = 1.95;
const FIXED_STEP = 1 / 60;

function showFatal(error) {
  ui.fatal.hidden = false;
  ui.fatal.textContent = `起動に失敗しました。再読み込みしても直らない場合はこの表示を共有してください。\n\n${error?.message || error}`;
  ui.status.textContent = '起動エラー';
}

function haptic(ms = 18) {
  try { navigator.vibrate?.(ms); } catch {}
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 2 || !Array.isArray(parsed.boxes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

try {
  await RAPIER.init();

  const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.45));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111820);
  scene.fog = new THREE.Fog(0x111820, 14, 32);

  const BASE_FOV = 72;
  const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.05, 70);
  const player = { position: new THREE.Vector3(0, 1.65, 6.4), yaw: 0, pitch: -0.08 };
  camera.position.copy(player.position);

  scene.add(new THREE.HemisphereLight(0xe7f3ff, 0x27323c, 2.35));
  const sun = new THREE.DirectionalLight(0xffffff, 2.15);
  sun.position.set(4, 10, 4);
  scene.add(sun);

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_STEP;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshStandardMaterial({ color: 0x6c7782, roughness: 0.92 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  scene.add(new THREE.GridHelper(18, 18, 0x49545e, 0x3b444d));
  world.createCollider(RAPIER.ColliderDesc.cuboid(9, 0.1, 9).setTranslation(0, -0.1, 0));

  function addStaticBox(size, position, color = 0x343a40) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshStandardMaterial({ color, roughness: 0.76 })
    );
    mesh.position.copy(position);
    scene.add(mesh);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
        .setTranslation(position.x, position.y, position.z)
    );
    return mesh;
  }

  addStaticBox(new THREE.Vector3(18, 3.4, 0.25), new THREE.Vector3(0, 1.7, -9), 0x26313a);
  addStaticBox(new THREE.Vector3(0.25, 3.4, 18), new THREE.Vector3(-9, 1.7, 0), 0x26313a);
  addStaticBox(new THREE.Vector3(0.25, 3.4, 18), new THREE.Vector3(9, 1.7, 0), 0x26313a);

  const shelfX = -4.8;
  const shelfZ = -3.0;
  for (const x of [-2.2, 0, 2.2]) {
    addStaticBox(new THREE.Vector3(0.16, 3.0, 1.3), new THREE.Vector3(shelfX + x, 1.5, shelfZ), 0x414c56);
  }
  for (const y of [0.35, 1.45, 2.55]) {
    addStaticBox(new THREE.Vector3(4.6, 0.12, 1.3), new THREE.Vector3(shelfX, y, shelfZ), 0x936d43);
  }

  const sellZone = new THREE.Mesh(
    new THREE.CircleGeometry(SELL_RADIUS, 32),
    new THREE.MeshBasicMaterial({ color: 0x34d27a, transparent: true, opacity: 0.52, side: THREE.DoubleSide })
  );
  sellZone.rotation.x = -Math.PI / 2;
  sellZone.position.set(SELL_CENTER.x, 0.014, SELL_CENTER.z);
  scene.add(sellZone);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(SELL_RADIUS - 0.12, SELL_RADIUS + 0.08, 32),
    new THREE.MeshBasicMaterial({ color: 0x82ffb2, transparent: true, opacity: 0.92, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(SELL_CENTER.x, 0.02, SELL_CENTER.z);
  scene.add(ring);

  const sellLabel = document.createElement('div');
  sellLabel.textContent = 'THROW HERE';
  sellLabel.style.cssText = 'position:absolute;z-index:20;left:50%;top:12%;transform:translateX(-50%);padding:7px 12px;border-radius:999px;background:rgba(22,180,91,.82);box-shadow:0 0 24px rgba(52,210,122,.35);font:800 12px -apple-system;color:white;pointer-events:none;display:none';
  document.body.appendChild(sellLabel);

  const feedback = document.createElement('div');
  feedback.style.cssText = 'position:absolute;z-index:30;left:50%;top:34%;transform:translate(-50%,-50%);font:900 30px -apple-system;color:#fff;text-shadow:0 3px 16px rgba(0,0,0,.8);pointer-events:none;opacity:0;transition:opacity .14s,transform .22s;white-space:nowrap';
  document.body.appendChild(feedback);

  const comboBadge = document.createElement('div');
  comboBadge.style.cssText = 'position:absolute;z-index:30;right:18px;top:20%;font:900 20px -apple-system;color:#ffe27a;text-shadow:0 2px 12px rgba(0,0,0,.75);pointer-events:none;opacity:0;transition:opacity .15s,transform .15s';
  document.body.appendChild(comboBadge);

  const flash = document.createElement('div');
  flash.style.cssText = 'position:absolute;z-index:25;inset:0;background:rgba(84,255,151,.18);pointer-events:none;opacity:0;transition:opacity .16s';
  document.body.appendChild(flash);

  let feedbackTimer = 0;
  let comboTimer = 0;
  function showFeedback(text, strong = false) {
    clearTimeout(feedbackTimer);
    feedback.textContent = text;
    feedback.style.fontSize = strong ? '38px' : '30px';
    feedback.style.opacity = '1';
    feedback.style.transform = 'translate(-50%,-58%) scale(1.08)';
    requestAnimationFrame(() => { feedback.style.transform = 'translate(-50%,-50%) scale(1)'; });
    feedbackTimer = setTimeout(() => { feedback.style.opacity = '0'; }, 520);
  }

  function pulseFlash() {
    flash.style.transition = 'none';
    flash.style.opacity = '1';
    requestAnimationFrame(() => {
      flash.style.transition = 'opacity .18s';
      flash.style.opacity = '0';
    });
  }

  const boxes = [];
  const boxGeometry = new THREE.BoxGeometry(0.74, 0.6, 0.74);
  const baseBoxMaterial = new THREE.MeshStandardMaterial({ color: 0xd39a59, roughness: 0.74, emissive: 0x000000, emissiveIntensity: 0 });
  let nextBoxId = 1;
  let held = null;
  let targeted = null;
  let previousTarget = null;
  let combo = 0;
  let lastSaleAt = 0;
  let cameraPunch = 0;

  function spawnBox(position, rotation = null) {
    if (boxes.length >= MAX_BOXES) return null;
    const material = baseBoxMaterial.clone();
    const mesh = new THREE.Mesh(boxGeometry, material);
    mesh.position.copy(position);
    scene.add(mesh);

    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.22)
      .setAngularDamping(0.36)
      .setCanSleep(true);
    if (rotation) desc.setRotation(rotation);
    const body = world.createRigidBody(desc);
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.37, 0.30, 0.37).setFriction(0.72).setRestitution(0.08), body);

    const box = { id: nextBoxId++, mesh, body };
    mesh.userData.box = box;
    boxes.push(box);
    return box;
  }

  function removeBox(box) {
    if (!box) return;
    if (held === box) held = null;
    if (targeted === box) targeted = null;
    if (previousTarget === box) previousTarget = null;
    scene.remove(box.mesh);
    box.mesh.material.dispose();
    world.removeRigidBody(box.body);
    const index = boxes.indexOf(box);
    if (index >= 0) boxes.splice(index, 1);
  }

  const initialPositions = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      initialPositions.push([-2.3 + col * 1.5, 0.72 + row * 0.04, 2.3 - row * 1.35]);
    }
  }

  const saved = loadSave();
  let money = Math.max(0, Number(saved?.money ?? 120));
  let sold = Math.max(0, Number(saved?.sold ?? 0));

  if (saved?.boxes?.length) {
    for (const b of saved.boxes.slice(0, MAX_BOXES)) {
      const p = b.p || [0, 1, 0];
      const r = b.r || [0, 0, 0, 1];
      spawnBox(new THREE.Vector3(p[0], Math.max(0.35, p[1]), p[2]), { x: r[0], y: r[1], z: r[2], w: r[3] });
    }
  } else {
    initialPositions.forEach(([x, y, z]) => spawnBox(new THREE.Vector3(x, y, z)));
  }

  const input = createInput({ movePad: ui.movePad, moveKnob: ui.moveKnob, lookPad: ui.lookPad, canvas: ui.canvas });
  const raycaster = new THREE.Raycaster();
  raycaster.far = GRAB_RANGE;

  function updateHud(message = '') {
    ui.money.textContent = `¥${money.toLocaleString('ja-JP')}`;
    ui.sold.textContent = `${sold} / ${GOAL}`;
    ui.grab.textContent = held ? '離す' : '吸着';
    ui.sell.textContent = '投げる';
    ui.sell.disabled = !held;
    ui.buy.textContent = `補充 ¥${BOX_PRICE}`;
    ui.buy.disabled = money < BOX_PRICE || boxes.length >= MAX_BOXES;
    if (message) ui.status.textContent = message;
    else if (sold >= GOAL) ui.status.textContent = '目標達成！ コンボを伸ばせ';
    else if (held) ui.status.textContent = '緑ゾーンへ投げ込め';
    else if (targeted) ui.status.textContent = '吸着できる';
    else ui.status.textContent = '箱を狙って吸着 → 投げる';
  }

  function forwardVector() {
    return new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  }

  function viewVector() {
    return camera.getWorldDirection(new THREE.Vector3()).normalize();
  }

  function cameraQuaternion() {
    const euler = new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ');
    return new THREE.Quaternion().setFromEuler(euler);
  }

  function toggleGrab() {
    if (held) {
      const dir = viewVector();
      const dropPos = camera.position.clone().add(dir.multiplyScalar(1.45));
      dropPos.y = Math.max(0.52, dropPos.y);
      held.body.setTranslation({ x: dropPos.x, y: dropPos.y, z: dropPos.z }, true);
      held.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      held.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      held.body.setEnabled(true);
      held.mesh.material.emissiveIntensity = 0;
      held = null;
      haptic(10);
      updateHud('離した');
      return;
    }
    if (!targeted) {
      cameraPunch = Math.max(cameraPunch, 0.025);
      updateHud('中央に箱を合わせろ');
      return;
    }
    held = targeted;
    held.body.setEnabled(false);
    held.mesh.material.emissive.setHex(0x34d9ff);
    held.mesh.material.emissiveIntensity = 0.9;
    cameraPunch = Math.max(cameraPunch, 0.055);
    haptic(12);
    updateHud('吸着！ 投げろ');
  }

  function throwHeld() {
    if (!held) return updateHud('まず箱を吸着');
    const box = held;
    const dir = viewVector();
    const start = camera.position.clone().add(dir.clone().multiplyScalar(1.25));
    box.mesh.position.copy(start);
    box.body.setTranslation({ x: start.x, y: start.y, z: start.z }, true);
    box.body.setRotation(cameraQuaternion(), true);
    box.body.setEnabled(true);
    box.body.setLinvel({ x: dir.x * THROW_SPEED, y: dir.y * THROW_SPEED + 1.25, z: dir.z * THROW_SPEED }, true);
    box.body.setAngvel({ x: 4.5, y: 7.5, z: 3.5 }, true);
    box.mesh.material.emissiveIntensity = 0;
    held = null;
    cameraPunch = Math.max(cameraPunch, 0.11);
    haptic(16);
    updateHud('ズドン！');
  }

  function sellBox(box) {
    const now = performance.now();
    combo = now - lastSaleAt < 2400 ? combo + 1 : 1;
    lastSaleAt = now;
    const multiplier = 1 + Math.min(combo - 1, 4) * 0.25;
    const reward = Math.round(BASE_SALE * multiplier);
    removeBox(box);
    money += reward;
    sold += 1;
    cameraPunch = Math.max(cameraPunch, 0.16);
    showFeedback(`+¥${reward}`, combo >= 3);
    pulseFlash();
    haptic(combo >= 3 ? 28 : 18);

    clearTimeout(comboTimer);
    if (combo >= 2) {
      comboBadge.textContent = `COMBO ×${combo}`;
      comboBadge.style.opacity = '1';
      comboBadge.style.transform = 'scale(1.16)';
      requestAnimationFrame(() => { comboBadge.style.transform = 'scale(1)'; });
      comboTimer = setTimeout(() => { comboBadge.style.opacity = '0'; }, 2100);
    }

    updateHud(combo >= 2 ? `COMBO ×${combo}  +¥${reward}` : `ナイス！ +¥${reward}`);
    saveNow();

    setTimeout(() => {
      if (boxes.length < MAX_BOXES) {
        spawnBox(new THREE.Vector3(-2.6 + Math.random() * 5.2, 1.05, 4.7 + Math.random() * 1.2));
      }
    }, 650);
  }

  function buyBox() {
    if (money < BOX_PRICE) return updateHud('資金不足');
    if (boxes.length >= MAX_BOXES) return updateHud('箱が多すぎる');
    money -= BOX_PRICE;
    spawnBox(new THREE.Vector3(-2.4 + Math.random() * 4.8, 1.1, 5.1));
    updateHud(`補充 -¥${BOX_PRICE}`);
    haptic(8);
    saveNow();
  }

  function saveNow() {
    try {
      const snapshot = boxes.map((box) => {
        if (held === box) {
          return { p: [box.mesh.position.x, box.mesh.position.y, box.mesh.position.z], r: [box.mesh.quaternion.x, box.mesh.quaternion.y, box.mesh.quaternion.z, box.mesh.quaternion.w] };
        }
        const p = box.body.translation();
        const r = box.body.rotation();
        return { p: [p.x, p.y, p.z], r: [r.x, r.y, r.z, r.w] };
      });
      localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 2, money, sold, boxes: snapshot }));
    } catch {
      updateHud('保存できませんでした');
    }
  }

  ui.grab.addEventListener('click', toggleGrab);
  ui.sell.addEventListener('click', throwHeld);
  ui.buy.addEventListener('click', buyBox);
  ui.reset.addEventListener('click', () => {
    if (confirm('資金・売却数・箱配置を初期化しますか？')) {
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    }
  });
  addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.code === 'KeyE') toggleGrab();
    if (event.code === 'KeyR' || event.code === 'Space') throwHeld();
    if (event.code === 'KeyB') buyBox();
  });
  addEventListener('pagehide', saveNow);
  setInterval(saveNow, 8000);

  const clock = new THREE.Clock();
  let accumulator = 0;
  const tmpDirection = new THREE.Vector3();
  const tmpRight = new THREE.Vector3();
  let hudTimer = 0;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    accumulator = Math.min(accumulator + dt, FIXED_STEP * 3);

    const look = input.consumeLook();
    player.yaw -= look.x * 0.0061;
    player.pitch -= look.y * 0.0049;
    player.pitch = THREE.MathUtils.clamp(player.pitch, -1.2, 1.2);

    const move = input.movement();
    tmpDirection.copy(forwardVector());
    tmpRight.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    player.position.addScaledVector(tmpDirection, move.y * MOVE_SPEED * dt);
    player.position.addScaledVector(tmpRight, move.x * MOVE_SPEED * dt);
    player.position.x = THREE.MathUtils.clamp(player.position.x, -8.45, 8.45);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -8.45, 8.45);

    camera.quaternion.copy(cameraQuaternion());
    camera.position.copy(player.position);

    while (accumulator >= FIXED_STEP) {
      world.step();
      accumulator -= FIXED_STEP;
    }

    const sellCandidates = [];
    for (const box of boxes) {
      if (box === held) continue;
      const p = box.body.translation();
      const r = box.body.rotation();
      box.mesh.position.set(p.x, p.y, p.z);
      box.mesh.quaternion.set(r.x, r.y, r.z, r.w);

      if (p.y < -3) {
        box.body.setTranslation({ x: -2.4 + Math.random() * 4.8, y: 1.2, z: 4.8 }, true);
        box.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }

      const dx = p.x - SELL_CENTER.x;
      const dz = p.z - SELL_CENTER.z;
      if (Math.hypot(dx, dz) <= SELL_RADIUS && p.y < 2.4) sellCandidates.push(box);
    }

    for (const box of sellCandidates) {
      if (boxes.includes(box)) sellBox(box);
    }

    if (held) {
      const holdPos = camera.position.clone().add(viewVector().multiplyScalar(1.18));
      held.mesh.position.lerp(holdPos, 0.58);
      held.mesh.quaternion.slerp(camera.quaternion, 0.25);
      held.mesh.material.emissiveIntensity = 0.9;
    }

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const candidates = boxes.filter((box) => box !== held).map((box) => box.mesh);
    const hit = raycaster.intersectObjects(candidates, false)[0];
    targeted = hit?.object?.userData?.box || null;

    if (previousTarget && previousTarget !== targeted && previousTarget !== held) {
      previousTarget.mesh.material.emissiveIntensity = 0;
    }
    if (targeted && targeted !== held) {
      targeted.mesh.material.emissive.setHex(0x68e8ff);
      targeted.mesh.material.emissiveIntensity = 0.72;
    }
    previousTarget = targeted;

    const dx = camera.position.x - SELL_CENTER.x;
    const dz = camera.position.z - SELL_CENTER.z;
    sellLabel.style.display = Math.hypot(dx, dz) < 7.2 ? 'block' : 'none';

    if (performance.now() - lastSaleAt > 2600 && combo > 0) combo = 0;

    cameraPunch = THREE.MathUtils.lerp(cameraPunch, 0, Math.min(1, dt * 8));
    camera.fov = BASE_FOV + cameraPunch * 26;
    camera.updateProjectionMatrix();
    if (cameraPunch > 0.01) {
      camera.position.x += (Math.random() - 0.5) * cameraPunch * 0.16;
      camera.position.y += (Math.random() - 0.5) * cameraPunch * 0.12;
    }

    hudTimer += dt;
    if (hudTimer > 0.25) {
      updateHud();
      hudTimer = 0;
    }

    renderer.render(scene, camera);
  }

  function resize() {
    const width = innerWidth;
    const height = innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.45));
    renderer.setSize(width, height, false);
  }
  addEventListener('resize', resize, { passive: true });

  ui.sell.textContent = '投げる';
  ui.buy.textContent = `補充 ¥${BOX_PRICE}`;
  updateHud('箱を狙って吸着 → 緑へ投げ込め');
  showFeedback('READY', false);
  frame();
} catch (error) {
  console.error(error);
  showFatal(error);
}
