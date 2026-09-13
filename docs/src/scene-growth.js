import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js';
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/+esm';
import { POS } from './sim.js';

const TASK_TEXTURES = new Map();

function meshBox(x, y, z, color, roughness = 0.78) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(x, y, z),
    new THREE.MeshStandardMaterial({ color, roughness })
  );
  mesh.position.y = y / 2;
  return mesh;
}

function textSprite(text, color = '#fff', scale = 3.5) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(8,13,18,.84)';
  ctx.beginPath();
  ctx.roundRect(12, 18, 488, 92, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = '800 44px -apple-system,BlinkMacSystemFont,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(scale, scale * 0.25, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function taskStyle(state) {
  if (state === 'store') return { label: 'IN', color: 0x63c8ff, css: '#286fa3' };
  if (state === 'pick') return { label: 'PK', color: 0xffd163, css: '#9a6c1f' };
  if (state === 'ship') return { label: 'OUT', color: 0x62ef9b, css: '#26794e' };
  return { label: '•', color: 0xffffff, css: '#4b5560' };
}

function taskTexture(state) {
  if (TASK_TEXTURES.has(state)) return TASK_TEXTURES.get(state);
  const style = taskStyle(state);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(5,9,13,.9)';
  ctx.beginPath();
  ctx.arc(64, 64, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = style.css;
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '900 38px -apple-system,BlinkMacSystemFont,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(style.label, 64, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  TASK_TEXTURES.set(state, texture);
  return texture;
}

function station(name, pos, color, size) {
  const group = new THREE.Group();
  const base = meshBox(size.x, size.y, size.z, color);
  group.add(base);
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.26 })
  );
  edge.position.y = size.y / 2;
  group.add(edge);
  const label = textSprite(name);
  label.position.y = 1.15;
  group.add(label);
  group.position.set(pos.x, 0, pos.z);
  group.userData.base = base;
  return group;
}

function rackBank(x, z, tint = 0x8c6c46) {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x4b5661, roughness: 0.72 });
  const shelf = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.82 });
  for (const px of [-1.9, 1.9]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), steel);
    post.position.set(px, 1.3, 0);
    group.add(post);
  }
  for (const py of [0.38, 1.08, 1.78]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(4, 0.11, 1.05), shelf);
    board.position.set(0, py, 0);
    group.add(board);
  }
  group.position.set(x, 0, z);
  group.userData.shelfMaterial = shelf;
  return group;
}

function packModule(index) {
  const group = new THREE.Group();
  const body = meshBox(0.86, 0.68, 0.76, 0xc6902f);
  group.add(body);
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.23, 0.03),
    new THREE.MeshBasicMaterial({ color: 0x8fe8ff })
  );
  screen.position.set(0, 0.46, 0.395);
  group.add(screen);
  group.position.set(1.0 + (index % 2) * 1.05, 0.12, -0.9 - Math.floor(index / 2) * 0.95);
  return group;
}

function conveyorModule(index) {
  const group = new THREE.Group();
  const belt = meshBox(2.9, 0.16, 0.62, 0x252c33);
  belt.position.y = 0.31;
  group.add(belt);
  for (let i = 0; i < 7; i += 1) {
    const roller = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.56, 8),
      new THREE.MeshStandardMaterial({ color: 0x7e8992, roughness: 0.5 })
    );
    roller.rotation.z = Math.PI / 2;
    roller.position.set(-1.25 + i * 0.42, 0.42, 0);
    group.add(roller);
  }
  const positions = [
    [-4.2, 0.3, -0.55, -0.25],
    [-1.6, 0.3, -4.2, 0],
    [2.1, 0.3, -4.8, 0.2],
    [4.6, 0.3, -2.8, -0.55],
  ];
  const [x, y, z, rot] = positions[index] || positions[0];
  group.position.set(x, y, z);
  group.rotation.y = rot;
  return group;
}

function workerMesh(index) {
  const colors = [0x63c4ff, 0xffc45f, 0xa98cff, 0x5ee0a0, 0xff7e88, 0x79d9d4, 0xe9a6ff, 0xffd66e];
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.24, 0.46, 6, 10),
    new THREE.MeshStandardMaterial({ color: colors[index % colors.length], roughness: 0.62 })
  );
  body.position.y = 0.54;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xf2c49f, roughness: 0.82 })
  );
  head.position.y = 1.05;
  group.add(head);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.43, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.68, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: taskTexture('idle'), transparent: true, depthTest: false }));
  badge.position.y = 1.56;
  badge.scale.set(0.72, 0.72, 1);
  badge.visible = false;
  badge.renderOrder = 12;
  group.add(badge);
  group.userData = { ring, badge, badgeState: 'idle' };
  return group;
}

function boxMesh() {
  const group = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.42, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xd69a57, roughness: 0.82, emissive: 0x000000 })
  );
  box.position.y = 0.21;
  group.add(box);
  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.425, 0.505),
    new THREE.MeshStandardMaterial({ color: 0xc8b483, roughness: 0.9 })
  );
  tape.position.y = 0.21;
  group.add(tape);
  return group;
}

function annex(level) {
  const group = new THREE.Group();
  const z = -8.4 - (level - 1) * 3.25;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(17.4, 3.15),
    new THREE.MeshStandardMaterial({ color: level % 2 ? 0x48545e : 0x4d5963, roughness: 0.95, emissive: 0x16344a, emissiveIntensity: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.006;
  group.add(floor);
  for (const x of [-8, 0, 8]) {
    const post = meshBox(0.16, 3.0, 0.16, 0x424c55);
    post.position.set(x, 1.5, 0);
    group.add(post);
  }
  const beam = meshBox(16.2, 0.16, 0.16, 0x424c55);
  beam.position.set(0, 2.92, 0);
  group.add(beam);
  for (const x of [-5.5, -1.8, 1.8, 5.5]) {
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.05, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xbdefff })
    );
    light.position.set(x, 2.82, 0);
    group.add(light);
  }
  const label = textSprite(`HALL ${level + 1}`, '#cdefff', 2.9);
  label.position.set(0, 2.35, 0.5);
  group.add(label);
  group.position.z = z;
  group.visible = false;
  group.scale.setScalar(0.76);
  group.userData = { floor, reveal: 0 };
  return group;
}

function staffPod(index) {
  const group = new THREE.Group();
  const locker = meshBox(0.46, 1.25, 0.42, 0x47718b);
  group.add(locker);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.44), new THREE.MeshBasicMaterial({ color: 0x8edcff }));
  stripe.position.y = 0.93;
  group.add(stripe);
  group.position.set(-7.2 + (index % 3) * 0.58, 0, -1.2 - Math.floor(index / 3) * 0.55);
  return group;
}

function lane(index) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.11, 8.6),
    new THREE.MeshBasicMaterial({ color: index % 2 ? 0x5ed7ff : 0xffffff, transparent: true, opacity: 0.34, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -0.52;
  mesh.position.set(-2.8 + index * 0.32, 0.012, 1.2);
  return mesh;
}

export async function createSceneView(canvas, sim) {
  await RAPIER.init();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.setSize(innerWidth, innerHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101820);
  scene.fog = new THREE.Fog(0x101820, 20, 40);

  const camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.1, 80);
  const cameraState = { yaw: 0.72, pitch: 0.78, distance: 15.3, target: new THREE.Vector3(0, 0.25, 0.25) };

  scene.add(new THREE.HemisphereLight(0xdff3ff, 0x27323d, 2.05));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(7, 11, 6);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 14),
    new THREE.MeshStandardMaterial({ color: 0x56616a, roughness: 0.94 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const grid = new THREE.GridHelper(18, 18, 0x6c7880, 0x4c565e);
  scene.add(grid);

  const inbound = station('INBOUND', POS.inbound, 0x285c92, { x: 2.9, y: 0.15, z: 2.3 });
  const pack = station('PACK', POS.pack, 0xa56f1e, { x: 2.6, y: 0.15, z: 2.2 });
  const outbound = station('OUTBOUND', POS.outbound, 0x24794d, { x: 2.8, y: 0.15, z: 2.3 });
  scene.add(inbound, pack, outbound);

  const rackBanks = [rackBank(-2.15, -1.65)];
  scene.add(rackBanks[0]);
  for (let i = 0; i < 4; i += 1) {
    const bank = rackBank(-2.15, -2.65 - i * 1.0, 0x93714b);
    bank.visible = false;
    scene.add(bank);
    rackBanks.push(bank);
  }

  const basePack = packModule(0);
  basePack.position.set(POS.pack.x, 0.12, POS.pack.z);
  scene.add(basePack);
  const packModules = [];
  for (let i = 0; i < 5; i += 1) {
    const module = packModule(i);
    module.visible = false;
    scene.add(module);
    packModules.push(module);
  }

  const conveyors = [];
  for (let i = 0; i < 4; i += 1) {
    const module = conveyorModule(i);
    module.visible = false;
    scene.add(module);
    conveyors.push(module);
  }

  const annexes = [annex(1), annex(2), annex(3)];
  annexes.forEach((item) => scene.add(item));

  const staffPods = [];
  for (let i = 0; i < 5; i += 1) {
    const pod = staffPod(i);
    pod.visible = false;
    scene.add(pod);
    staffPods.push(pod);
  }

  const lanes = [];
  for (let i = 0; i < 5; i += 1) {
    const guide = lane(i);
    guide.visible = false;
    scene.add(guide);
    lanes.push(guide);
  }

  const workerMeshes = new Map();
  const boxMeshes = new Map();
  const flowLines = new Map();
  let flowMode = false;
  let facilityTier = -1;
  let growthPulse = 0;

  const physicsWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  physicsWorld.createCollider(RAPIER.ColliderDesc.cuboid(9, 0.08, 7).setTranslation(0, -0.08, 0));
  const overflowProps = [];

  function spawnOverflowProp() {
    const mesh = boxMesh();
    mesh.scale.setScalar(0.9);
    scene.add(mesh);
    const body = physicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(-6.2 + Math.random() * 0.7, 2.2 + Math.random() * 0.5, 4.4 + Math.random() * 0.4)
        .setLinearDamping(0.08)
        .setAngularDamping(0.16)
    );
    physicsWorld.createCollider(RAPIER.ColliderDesc.cuboid(0.23, 0.19, 0.23).setRestitution(0.18).setFriction(0.72), body);
    body.setLinvel({ x: 0.8 + Math.random() * 1.4, y: 1.2, z: (Math.random() - 0.5) * 1.6 }, true);
    body.setAngvel({ x: 2 + Math.random() * 4, y: 2 + Math.random() * 4, z: 2 + Math.random() * 4 }, true);
    overflowProps.push({ mesh, body, born: performance.now() });
    while (overflowProps.length > 16) removeOverflow(overflowProps.shift());
  }

  function removeOverflow(prop) {
    if (!prop) return;
    scene.remove(prop.mesh);
    physicsWorld.removeRigidBody(prop.body);
  }

  let outboundPulse = 0;
  sim.onEvent((event) => {
    if (event.type === 'overflow') spawnOverflowProp();
    if (event.type === 'shipment') outboundPulse = 1;
    if (event.type === 'upgrade') growthPulse = 1;
  });

  const pointers = new Map();
  let lastSingle = null;
  let pinchStartDistance = 0;
  let pinchStartCameraDistance = cameraState.distance;

  function pointerDistance() {
    const pts = [...pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  canvas.addEventListener('pointerdown', (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture?.(event.pointerId);
    if (pointers.size === 1) lastSingle = { x: event.clientX, y: event.clientY };
    if (pointers.size === 2) {
      pinchStartDistance = pointerDistance();
      pinchStartCameraDistance = cameraState.distance;
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1 && lastSingle) {
      const dx = event.clientX - lastSingle.x;
      const dy = event.clientY - lastSingle.y;
      cameraState.yaw -= dx * 0.0062;
      cameraState.pitch = THREE.MathUtils.clamp(cameraState.pitch + dy * 0.0048, 0.34, 1.18);
      lastSingle = { x: event.clientX, y: event.clientY };
    } else if (pointers.size === 2) {
      const d = pointerDistance();
      if (pinchStartDistance > 0) cameraState.distance = THREE.MathUtils.clamp(pinchStartCameraDistance * (pinchStartDistance / Math.max(1, d)), 8.5, 24);
    }
  });

  function endPointer(event) {
    pointers.delete(event.pointerId);
    const pts = [...pointers.values()];
    lastSingle = pts.length === 1 ? { ...pts[0] } : null;
    if (pts.length < 2) pinchStartDistance = 0;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    cameraState.distance = THREE.MathUtils.clamp(cameraState.distance + event.deltaY * 0.012, 8.5, 24);
  }, { passive: false });

  function currentTier() {
    const u = sim.state.upgrades;
    const score = (u.worker || 0) + (u.speed || 0) + (u.rack || 0) + (u.pack || 0) + (u.conveyor || 0);
    if (score >= 10 || sim.state.shipped >= 35) return 3;
    if (score >= 5 || sim.state.shipped >= 15) return 2;
    if (score >= 1 || sim.state.shipped >= 5) return 1;
    return 0;
  }

  function resetCamera() {
    const tier = Math.max(0, facilityTier);
    cameraState.yaw = 0.72;
    cameraState.pitch = 0.78;
    cameraState.distance = 15.3 + tier * 1.55;
    cameraState.target.set(0, 0.25, 0.25 - tier * 1.0);
  }

  function syncFacilityGrowth(dt) {
    const tier = currentTier();
    if (tier !== facilityTier) {
      facilityTier = tier;
      growthPulse = 1;
      cameraState.distance = Math.max(cameraState.distance, 15.3 + tier * 1.55);
      cameraState.target.z = 0.25 - tier * 1.0;
      annexes.forEach((item, index) => {
        const shouldShow = index < tier;
        if (shouldShow && !item.visible) {
          item.visible = true;
          item.userData.reveal = 0;
          item.scale.setScalar(0.76);
        } else if (!shouldShow) {
          item.visible = false;
          item.userData.reveal = 0;
        }
      });
    }

    const extraRackCount = Math.max(0, Math.min(4, Math.ceil(sim.rackCapacity() / 8) - 1));
    rackBanks.forEach((bank, index) => { if (index > 0) bank.visible = index <= extraRackCount; });
    packModules.forEach((module, index) => { module.visible = index < (sim.state.upgrades.pack || 0); });
    conveyors.forEach((module, index) => { module.visible = index < (sim.state.upgrades.conveyor || 0); });
    staffPods.forEach((pod, index) => { pod.visible = index < (sim.state.upgrades.worker || 0); });
    lanes.forEach((guide, index) => { guide.visible = index < (sim.state.upgrades.speed || 0); });

    for (const item of annexes) {
      if (!item.visible) continue;
      item.userData.reveal = THREE.MathUtils.lerp(item.userData.reveal, 1, Math.min(1, dt * 3.1));
      const s = 0.76 + item.userData.reveal * 0.24;
      item.scale.setScalar(s);
      const mat = item.userData.floor.material;
      mat.emissiveIntensity = 0.05 + growthPulse * 0.34;
    }
    growthPulse = THREE.MathUtils.lerp(growthPulse, 0, Math.min(1, dt * 2.6));
  }

  function updateCamera() {
    const cp = Math.cos(cameraState.pitch);
    camera.position.set(
      cameraState.target.x + Math.sin(cameraState.yaw) * cp * cameraState.distance,
      cameraState.target.y + Math.sin(cameraState.pitch) * cameraState.distance,
      cameraState.target.z + Math.cos(cameraState.yaw) * cp * cameraState.distance
    );
    camera.lookAt(cameraState.target);
  }

  function ensureFlowLine(worker) {
    let lineObj = flowLines.get(worker.id);
    if (!lineObj) {
      lineObj = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, depthTest: false })
      );
      lineObj.visible = false;
      lineObj.renderOrder = 8;
      scene.add(lineObj);
      flowLines.set(worker.id, lineObj);
    }
    return lineObj;
  }

  function flowTarget(worker) {
    const task = worker.task;
    if (!task) return null;
    if (task.stage === 'pickup') {
      const box = sim.state.boxes.find((item) => item.id === task.boxId);
      if (box) return { x: box.x, y: Math.max(0.22, box.y || 0.22), z: box.z };
    }
    if (task.kind === 'store') return { x: POS.rack.x, y: 0.35, z: POS.rack.z };
    if (task.kind === 'pick') return { x: POS.pack.x, y: 0.35, z: POS.pack.z };
    return { x: POS.outbound.x, y: 0.35, z: POS.outbound.z };
  }

  function syncWorkers(dt) {
    const live = new Set();
    sim.state.workers.forEach((worker, index) => {
      live.add(worker.id);
      let mesh = workerMeshes.get(worker.id);
      if (!mesh) {
        mesh = workerMesh(index);
        scene.add(mesh);
        workerMeshes.set(worker.id, mesh);
      }
      mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, worker.x, Math.min(1, dt * 10));
      mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, worker.z, Math.min(1, dt * 10));
      mesh.rotation.y = worker.facing;
      const style = taskStyle(worker.state);
      mesh.userData.ring.material.color.setHex(style.color);
      const badge = mesh.userData.badge;
      badge.visible = worker.state !== 'idle';
      if (mesh.userData.badgeState !== worker.state) {
        badge.material.map = taskTexture(worker.state);
        badge.material.needsUpdate = true;
        mesh.userData.badgeState = worker.state;
      }
      mesh.position.y = worker.task ? Math.sin(performance.now() * 0.012 + worker.id) * 0.025 : 0;

      const lineObj = ensureFlowLine(worker);
      const target = flowTarget(worker);
      lineObj.visible = Boolean(flowMode && target && worker.task);
      if (lineObj.visible) {
        lineObj.material.color.setHex(style.color);
        const start = new THREE.Vector3(mesh.position.x, 0.14, mesh.position.z);
        const end = new THREE.Vector3(target.x, target.y, target.z);
        const mid = start.clone().lerp(end, 0.5);
        mid.y += 0.12;
        lineObj.geometry.setFromPoints([start, mid, end]);
      }
    });
    for (const [id, mesh] of workerMeshes) {
      if (live.has(id)) continue;
      scene.remove(mesh);
      workerMeshes.delete(id);
      const lineObj = flowLines.get(id);
      if (lineObj) {
        scene.remove(lineObj);
        lineObj.geometry.dispose();
        lineObj.material.dispose();
        flowLines.delete(id);
      }
    }
  }

  function syncBoxes(dt) {
    const live = new Set();
    for (const box of sim.state.boxes) {
      live.add(box.id);
      let mesh = boxMeshes.get(box.id);
      if (!mesh) {
        mesh = boxMesh();
        mesh.position.set(box.x, box.y, box.z);
        scene.add(mesh);
        boxMeshes.set(box.id, mesh);
      }
      mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, box.x, Math.min(1, dt * 13));
      mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, box.y, Math.min(1, dt * 13));
      mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, box.z, Math.min(1, dt * 13));
      const material = mesh.children[0]?.material;
      if (material?.color) {
        let color = 0xd69a57;
        if (box.phase === 'packing') color = 0xffc04f;
        else if (box.phase === 'packed' || box.phase === 'carried_ship') color = 0x69d98f;
        material.color.setHex(color);
        material.emissive?.setHex(color);
        material.emissiveIntensity = flowMode ? 0.18 : 0.02;
      }
    }
    for (const [id, mesh] of boxMeshes) {
      if (live.has(id)) continue;
      scene.remove(mesh);
      boxMeshes.delete(id);
    }
  }

  function updateOverflow(dt) {
    physicsWorld.timestep = Math.min(1 / 30, Math.max(1 / 120, dt));
    physicsWorld.step();
    const now = performance.now();
    for (let i = overflowProps.length - 1; i >= 0; i -= 1) {
      const prop = overflowProps[i];
      const p = prop.body.translation();
      const r = prop.body.rotation();
      prop.mesh.position.set(p.x, p.y, p.z);
      prop.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if (now - prop.born > 12000 || p.y < -2) {
        removeOverflow(prop);
        overflowProps.splice(i, 1);
      }
    }
  }

  function heat(material, ratio) {
    if (!material?.emissive) return;
    const r = Math.max(0, ratio || 0);
    const color = r >= 1 ? 0xff5151 : r >= 0.72 ? 0xffb347 : 0x48cf8d;
    material.emissive.setHex(color);
    material.emissiveIntensity = (flowMode ? 0.18 : 0.015) + Math.max(0, r - 0.48) * (flowMode ? 0.58 : 0.22);
  }

  function updateHeat() {
    const ratios = sim.state.director?.ratios || {};
    const c = sim.counts();
    heat(inbound.userData.base.material, ratios.inbound || 0);
    heat(pack.userData.base.material, Math.max(ratios.orders || 0, c.packing / 3));
    heat(outbound.userData.base.material, Math.max(ratios.packed || 0, c.packed / 4));
    rackBanks.forEach((bank) => heat(bank.userData.shelfMaterial, ratios.rack || 0));
  }

  function setFlowMode(enabled) {
    flowMode = Boolean(enabled);
    grid.material.opacity = flowMode ? 0.7 : 1;
    grid.material.transparent = flowMode;
    if (!flowMode) for (const lineObj of flowLines.values()) lineObj.visible = false;
    updateHeat();
  }

  function animateEquipment(dt) {
    for (let i = 0; i < conveyors.length; i += 1) {
      const group = conveyors[i];
      if (!group.visible) continue;
      group.children.forEach((child, index) => {
        if (index === 0) return;
        child.rotation.x += dt * (2.7 + i * 0.35);
      });
    }
    if (sim.counts().packing > 0) {
      basePack.rotation.y = Math.sin(performance.now() * 0.004) * 0.025;
      packModules.forEach((module, index) => {
        if (module.visible) module.children[1].material.opacity = 0.72 + Math.sin(performance.now() * 0.008 + index) * 0.2;
      });
    }
  }

  function update(dt) {
    syncFacilityGrowth(dt);
    updateCamera();
    syncWorkers(dt);
    syncBoxes(dt);
    updateOverflow(dt);
    updateHeat();
    animateEquipment(dt);
    outboundPulse = THREE.MathUtils.lerp(outboundPulse, 0, Math.min(1, dt * 3.6));
    outbound.scale.setScalar(1 + outboundPulse * 0.1);
    renderer.render(scene, camera);
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.setSize(innerWidth, innerHeight, false);
  }
  addEventListener('resize', resize, { passive: true });

  syncFacilityGrowth(1 / 60);
  resetCamera();
  updateCamera();

  return { update, resetCamera, setFlowMode, isFlowMode: () => flowMode };
}
