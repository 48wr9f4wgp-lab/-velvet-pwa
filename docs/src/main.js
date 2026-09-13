import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js';
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/+esm';
import { createInput } from './input.js';

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $('game'), money: $('money'), sold: $('sold'), status: $('status'),
  grab: $('grabBtn'), sell: $('sellBtn'), buy: $('buyBtn'), reset: $('resetBtn'), fatal: $('fatal'),
  movePad: $('movePad'), moveKnob: $('moveKnob'), lookPad: $('lookPad'),
};

const SAVE_KEY = 'workshop_sandbox_v1';
const BOX_PRICE = 50;
const BOX_SALE = 100;
const MAX_BOXES = 30;
const SELL_CENTER = new THREE.Vector3(5.7, 0, -5.8);
const FIXED_STEP = 1 / 60;

function showFatal(error) {
  ui.fatal.hidden = false;
  ui.fatal.textContent = `起動に失敗しました。再読み込みしても直らない場合はこの表示を共有してください。\n\n${error?.message || error}`;
  ui.status.textContent = '起動エラー';
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !Array.isArray(parsed.boxes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

try {
  await RAPIER.init();

  const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x151a20);
  scene.fog = new THREE.Fog(0x151a20, 12, 30);

  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 60);
  const player = { position: new THREE.Vector3(0, 1.65, 6.5), yaw: 0, pitch: -0.08 };
  camera.position.copy(player.position);

  scene.add(new THREE.HemisphereLight(0xdde9ff, 0x30343a, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(4, 9, 3);
  scene.add(sun);

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_STEP;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshStandardMaterial({ color: 0x747b82, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  scene.add(new THREE.GridHelper(18, 18, 0x3f464d, 0x3a4046));
  world.createCollider(RAPIER.ColliderDesc.cuboid(9, 0.1, 9).setTranslation(0, -0.1, 0));

  function addStaticBox(size, position, color = 0x343a40) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshStandardMaterial({ color, roughness: 0.78 })
    );
    mesh.position.copy(position);
    scene.add(mesh);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
        .setTranslation(position.x, position.y, position.z)
    );
    return mesh;
  }

  // Warehouse shell.
  addStaticBox(new THREE.Vector3(18, 3.4, 0.25), new THREE.Vector3(0, 1.7, -9), 0x2a3036);
  addStaticBox(new THREE.Vector3(0.25, 3.4, 18), new THREE.Vector3(-9, 1.7, 0), 0x2a3036);
  addStaticBox(new THREE.Vector3(0.25, 3.4, 18), new THREE.Vector3(9, 1.7, 0), 0x2a3036);

  // Simple shelf: physics geometry is deliberately simple for mobile performance.
  const shelfX = -4.8;
  const shelfZ = -3.0;
  for (const x of [-2.2, 0, 2.2]) {
    addStaticBox(new THREE.Vector3(0.16, 3.0, 1.3), new THREE.Vector3(shelfX + x, 1.5, shelfZ), 0x454b51);
  }
  for (const y of [0.35, 1.45, 2.55]) {
    addStaticBox(new THREE.Vector3(4.6, 0.12, 1.3), new THREE.Vector3(shelfX, y, shelfZ), 0x8a6b47);
  }

  // Sell zone.
  const sellZone = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({ color: 0x42a96b, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
  );
  sellZone.rotation.x = -Math.PI / 2;
  sellZone.position.set(SELL_CENTER.x, 0.012, SELL_CENTER.z);
  scene.add(sellZone);

  const sellLabel = document.createElement('div');
  sellLabel.textContent = 'SELL';
  sellLabel.style.cssText = 'position:absolute;left:50%;top:12%;transform:translateX(-50%);padding:6px 10px;border-radius:8px;background:rgba(42,145,82,.75);font:700 12px -apple-system;color:white;pointer-events:none;display:none';
  document.body.appendChild(sellLabel);

  const boxes = [];
  const boxGeometry = new THREE.BoxGeometry(0.72, 0.58, 0.72);
  const boxMaterial = new THREE.MeshStandardMaterial({ color: 0xc9955b, roughness: 0.88 });
  let nextBoxId = 1;
  let held = null;

  function spawnBox(position, rotation = null) {
    if (boxes.length >= MAX_BOXES) return null;
    const mesh = new THREE.Mesh(boxGeometry, boxMaterial);
    mesh.position.copy(position);
    scene.add(mesh);

    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.35)
      .setAngularDamping(0.55)
      .setCanSleep(true);
    if (rotation) desc.setRotation(rotation);
    const body = world.createRigidBody(desc);
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.36, 0.29, 0.36).setFriction(0.82), body);

    const box = { id: nextBoxId++, mesh, body };
    mesh.userData.box = box;
    boxes.push(box);
    return box;
  }

  function removeBox(box) {
    if (!box) return;
    if (held === box) held = null;
    scene.remove(box.mesh);
    world.removeRigidBody(box.body);
    const index = boxes.indexOf(box);
    if (index >= 0) boxes.splice(index, 1);
  }

  const initialPositions = [
    [-1.5, 0.7, 0], [-0.6, 0.7, 0.4], [0.4, 0.7, -0.2], [1.4, 0.7, 0.45], [2.3, 0.7, -0.15],
  ];
  const saved = loadSave();
  let money = Math.max(0, Number(saved?.money ?? 100));
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
  raycaster.far = 3.2;
  let targeted = null;

  function updateHud(message = '') {
    ui.money.textContent = `¥${money.toLocaleString('ja-JP')}`;
    ui.sold.textContent = `${sold} / 3`;
    ui.grab.textContent = held ? '離す' : 'つかむ';
    ui.sell.disabled = !held;
    ui.buy.disabled = money < BOX_PRICE || boxes.length >= MAX_BOXES;
    if (message) ui.status.textContent = message;
    else if (sold >= 3) ui.status.textContent = '目標達成！ 次は自動化へ';
    else if (held) ui.status.textContent = '緑のSELLゾーンへ運んで売却';
    else if (targeted) ui.status.textContent = '箱を狙っています';
    else ui.status.textContent = '箱へ近づいて中央に合わせる';
  }

  function forwardVector() {
    return new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  }

  function cameraQuaternion() {
    const euler = new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ');
    return new THREE.Quaternion().setFromEuler(euler);
  }

  function toggleGrab() {
    if (held) {
      const dropPos = camera.position.clone().add(forwardVector().multiplyScalar(1.5));
      dropPos.y = Math.max(0.55, camera.position.y - 0.55);
      held.body.setTranslation({ x: dropPos.x, y: dropPos.y, z: dropPos.z }, true);
      const q = cameraQuaternion();
      held.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      held.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      held.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      held.body.setEnabled(true);
      held = null;
      updateHud('箱を離しました');
      return;
    }
    if (!targeted) {
      updateHud('箱が届く距離にありません');
      return;
    }
    held = targeted;
    held.body.setEnabled(false);
    updateHud('箱を持ちました');
  }

  function sellHeld() {
    if (!held) return updateHud('まず箱を持ってください');
    const dx = camera.position.x - SELL_CENTER.x;
    const dz = camera.position.z - SELL_CENTER.z;
    if (Math.hypot(dx, dz) > 2.25) return updateHud('SELLゾーンまで箱を運んでください');
    removeBox(held);
    money += BOX_SALE;
    sold += 1;
    updateHud(`売却 +¥${BOX_SALE}`);
    saveNow();
  }

  function buyBox() {
    if (money < BOX_PRICE) return updateHud('資金が足りません');
    if (boxes.length >= MAX_BOXES) return updateHud('箱の上限です');
    money -= BOX_PRICE;
    spawnBox(new THREE.Vector3(5.8, 1.2, 5.8));
    updateHud(`箱を購入 -¥${BOX_PRICE}`);
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
      localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, money, sold, boxes: snapshot }));
    } catch {
      updateHud('保存できませんでした');
    }
  }

  ui.grab.addEventListener('click', toggleGrab);
  ui.sell.addEventListener('click', sellHeld);
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
    if (event.code === 'KeyR') sellHeld();
    if (event.code === 'KeyB') buyBox();
  });
  addEventListener('pagehide', saveNow);
  setInterval(saveNow, 5000);

  const clock = new THREE.Clock();
  let accumulator = 0;
  const tmpDirection = new THREE.Vector3();
  const tmpRight = new THREE.Vector3();
  let frames = 0;
  let fpsTimer = 0;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    accumulator = Math.min(accumulator + dt, FIXED_STEP * 3);

    const look = input.consumeLook();
    player.yaw -= look.x * 0.0042;
    player.pitch -= look.y * 0.0035;
    player.pitch = THREE.MathUtils.clamp(player.pitch, -1.18, 1.18);

    const move = input.movement();
    tmpDirection.copy(forwardVector());
    tmpRight.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    player.position.addScaledVector(tmpDirection, move.y * 3.35 * dt);
    player.position.addScaledVector(tmpRight, move.x * 3.35 * dt);
    player.position.x = THREE.MathUtils.clamp(player.position.x, -8.55, 8.55);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -8.55, 8.55);
    camera.position.copy(player.position);
    camera.quaternion.copy(cameraQuaternion());

    while (accumulator >= FIXED_STEP) {
      world.step();
      accumulator -= FIXED_STEP;
    }

    for (const box of boxes) {
      if (box === held) continue;
      const p = box.body.translation();
      const r = box.body.rotation();
      box.mesh.position.set(p.x, p.y, p.z);
      box.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }

    if (held) {
      const holdPos = camera.position.clone().add(forwardVector().multiplyScalar(1.35));
      holdPos.y = camera.position.y - 0.45;
      held.mesh.position.lerp(holdPos, 0.42);
      held.mesh.quaternion.slerp(camera.quaternion, 0.18);
    }

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const candidates = boxes.filter((box) => box !== held).map((box) => box.mesh);
    const hit = raycaster.intersectObjects(candidates, false)[0];
    targeted = hit?.object?.userData?.box || null;

    const dx = camera.position.x - SELL_CENTER.x;
    const dz = camera.position.z - SELL_CENTER.z;
    sellLabel.style.display = Math.hypot(dx, dz) < 4.3 ? 'block' : 'none';

    frames += 1;
    fpsTimer += dt;
    if (fpsTimer > 0.5) {
      updateHud();
      frames = 0;
      fpsTimer = 0;
    }

    renderer.render(scene, camera);
  }

  function resize() {
    const width = innerWidth;
    const height = innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
  }
  addEventListener('resize', resize, { passive: true });

  updateHud('箱を売って資金を増やそう');
  frame();
} catch (error) {
  console.error(error);
  showFatal(error);
}
