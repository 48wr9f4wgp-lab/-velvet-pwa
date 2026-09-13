import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js';
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/+esm';
import { POS } from './sim.js';

const TASK_TEXTURES = new Map();

function mat(color, roughness = 0.78, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, roughness, emissive });
}

function boxMesh(x, y, z, color, roughness = 0.78) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mat(color, roughness));
  mesh.position.y = y / 2;
  return mesh;
}

function floorLabel(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = 'rgba(5,10,14,.68)';
  ctx.fillRect(4, 18, 504, 92);
  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  ctx.strokeRect(4, 18, 504, 92);
  ctx.fillStyle = '#fff';
  ctx.font = '900 56px -apple-system,BlinkMacSystemFont,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.25, 0.56),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.014;
  mesh.renderOrder = 3;
  return mesh;
}

function taskStyle(state) {
  if (state === 'store') return { label: 'IN', color: 0x63c8ff, css: '#286fa3' };
  if (state === 'pick') return { label: 'PK', color: 0xffd163, css: '#9a6c1f' };
  if (state === 'ship') return { label: 'OUT', color: 0x62ef9b, css: '#26794e' };
  return { label: '•', color: 0xffffff, css: '#4b5560' };
}

function taskTexture(state) {
  if (TASK_TEXTURES.has(state)) return TASK_TEXTURES.get(state);
  const s = taskStyle(state);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(5,9,13,.92)';
  ctx.beginPath();
  ctx.arc(64, 64, 45, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = s.css;
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '900 36px -apple-system,BlinkMacSystemFont,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s.label, 64, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  TASK_TEXTURES.set(state, tex);
  return tex;
}

function station(name, pos, color, size) {
  const group = new THREE.Group();
  const base = boxMesh(size.x, size.y, size.z, color, 0.78);
  base.material.emissive = new THREE.Color(0x000000);
  group.add(base);
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 })
  );
  edge.position.y = size.y / 2;
  group.add(edge);
  const label = floorLabel(name, `#${new THREE.Color(color).getHexString()}`);
  label.position.set(0, 0.015, 0);
  group.add(label);
  group.position.set(pos.x, 0, pos.z);
  group.userData.base = base;
  return group;
}

function rackBank(x, z, tint = 0x8c6c46) {
  const group = new THREE.Group();
  const steel = mat(0x4b5661, 0.72);
  const shelf = mat(tint, 0.82);
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
  const body = boxMesh(0.85, 0.68, 0.74, 0xc6902f);
  group.add(body);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.03), new THREE.MeshBasicMaterial({ color: 0x8fe8ff }));
  screen.position.set(0, 0.46, 0.385);
  group.add(screen);
  const cols = 3;
  group.position.set(1.2 + (index % cols) * 1.0, 0.12, -0.75 - Math.floor(index / cols) * 0.9);
  group.userData.body = body;
  return group;
}

function conveyorModule(index) {
  const group = new THREE.Group();
  const belt = boxMesh(2.8, 0.16, 0.62, 0x252c33);
  belt.position.y = 0.31;
  group.add(belt);
  const rollers = [];
  for (let i = 0; i < 7; i += 1) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.56, 8), mat(0x7e8992, 0.5));
    r.rotation.z = Math.PI / 2;
    r.position.set(-1.25 + i * 0.42, 0.42, 0);
    group.add(r);
    rollers.push(r);
  }
  const positions = [
    [-4.6, 0.0, 1.45, -0.5],
    [-2.4, 0.0, -4.35, 0],
    [1.0, 0.0, -5.0, 0],
    [4.25, 0.0, -4.3, -0.48],
  ];
  const [x, y, z, rot] = positions[index] || positions[0];
  group.position.set(x, y, z);
  group.rotation.y = rot;
  group.userData.rollers = rollers;
  return group;
}

function workerMesh(index) {
  const colors = [0x63c4ff, 0xffc45f, 0xa98cff, 0x5ee0a0, 0xff7e88, 0x79d9d4, 0xe9a6ff, 0xffd66e];
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.46, 6, 10), mat(colors[index % colors.length], 0.62));
  body.position.y = 0.54;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat(0xf2c49f, 0.82));
  head.position.y = 1.05;
  group.add(head);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.4, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.52, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: taskTexture('idle'), transparent: true, depthTest: false }));
  badge.position.y = 1.48;
  badge.scale.set(0.46, 0.46, 1);
  badge.visible = false;
  badge.renderOrder = 12;
  group.add(badge);
  group.userData = { ring, badge, badgeState: 'idle' };
  return group;
}

function parcelMesh() {
  const group = new THREE.Group();
  const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.5), mat(0xd69a57, 0.82, 0x000000));
  parcel.position.y = 0.21;
  group.add(parcel);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.425, 0.505), mat(0xc8b483, 0.9));
  tape.position.y = 0.21;
  group.add(tape);
  return group;
}

function annex(level) {
  const group = new THREE.Group();
  const z = -8.3 - (level - 1) * 3.2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(17.4, 3.05), mat(level % 2 ? 0x48545e : 0x4d5963, 0.95, 0x16344a));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.006;
  floor.material.emissiveIntensity = 0;
  group.add(floor);
  for (const x of [-8, -4, 0, 4, 8]) {
    const post = boxMesh(0.12, 2.8, 0.12, 0x424c55);
    post.position.set(x, 1.4, 0);
    group.add(post);
  }
  const beam = boxMesh(16.2, 0.13, 0.13, 0x424c55);
  beam.position.set(0, 2.73, 0);
  group.add(beam);
  const sign = floorLabel(`HALL ${level + 1}`, '#89dfff');
  sign.rotation.x = 0;
  sign.position.set(0, 2.2, 0.05);
  sign.scale.setScalar(0.72);
  group.add(sign);
  group.position.z = z;
  group.visible = false;
  group.scale.setScalar(0.82);
  group.userData = { floor, reveal: 0 };
  return group;
}

function outboundGate(index) {
  const group = new THREE.Group();
  const left = boxMesh(0.13, 2.45, 0.13, 0x46515a);
  const right = boxMesh(0.13, 2.45, 0.13, 0x46515a);
  left.position.set(-0.85, 1.22, 0);
  right.position.set(0.85, 1.22, 0);
  const beam = boxMesh(1.83, 0.13, 0.13, 0x46515a);
  beam.position.set(0, 2.38, 0);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.08), new THREE.MeshBasicMaterial({ color: 0x76f0aa }));
  lamp.position.set(0, 2.24, 0);
  group.add(left, right, beam, lamp);
  group.position.set(5.6 - index * 2.0, 0, -6.3);
  return group;
}

function lane(index) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.08, 8.6),
    new THREE.MeshBasicMaterial({ color: index % 2 ? 0x5ed7ff : 0xffffff, transparent: true, opacity: 0.25, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -0.52;
  mesh.position.set(-2.8 + index * 0.28, 0.012, 1.2);
  return mesh;
}

export async function createSceneView(canvas, sim) {
  await RAPIER.init();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.setSize(innerWidth, innerHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101820);
  scene.fog = new THREE.Fog(0x101820, 21, 45);
  const camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.1, 90);
  const cameraState = { yaw: 0.72, pitch: 0.77, distance: 16.2, targetDistance: 16.2, target: new THREE.Vector3(0, 0.25, -0.15) };

  scene.add(new THREE.HemisphereLight(0xdff3ff, 0x27323d, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(7, 11, 6);
  scene.add(sun);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 16), mat(0x56616a, 0.94));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -0.7;
  scene.add(floor);
  const grid = new THREE.GridHelper(18, 18, 0x66727b, 0x47515a);
  grid.position.z = -0.7;
  scene.add(grid);

  const inbound = station('INBOUND', POS.inbound, 0x285c92, { x: 2.9, y: 0.15, z: 2.3 });
  const pack = station('PACK', POS.pack, 0xa56f1e, { x: 2.6, y: 0.15, z: 2.2 });
  const outbound = station('OUTBOUND', POS.outbound, 0x24794d, { x: 2.8, y: 0.15, z: 2.3 });
  scene.add(inbound, pack, outbound);

  const rackBanks = [rackBank(-2.15, -1.65)];
  scene.add(rackBanks[0]);
  for (let i = 0; i < 4; i += 1) {
    const bank = rackBank(-2.15, -2.75 - i * 0.95, 0x93714b);
    bank.visible = false;
    scene.add(bank);
    rackBanks.push(bank);
  }

  const packModules = [];
  const basePack = packModule(0);
  basePack.position.set(POS.pack.x, 0.12, POS.pack.z);
  scene.add(basePack);
  for (let i = 0; i < 5; i += 1) {
    const module = packModule(i);
    module.visible = false;
    scene.add(module);
    packModules.push(module);
  }

  const conveyors = [];
  for (let i = 0; i < 4; i += 1) {
    const c = conveyorModule(i);
    c.visible = false;
    scene.add(c);
    conveyors.push(c);
  }

  const annexes = [];
  for (let i = 1; i <= 3; i += 1) {
    const a = annex(i);
    scene.add(a);
    annexes.push(a);
  }

  const gates = [outboundGate(0), outboundGate(1), outboundGate(2)];
  gates.forEach((g, i) => { g.visible = i === 0; scene.add(g); });

  const lanes = [];
  for (let i = 0; i < 5; i += 1) {
    const l = lane(i);
    l.visible = false;
    scene.add(l);
    lanes.push(l);
  }

  const workerMeshes = new Map();
  const boxMeshes = new Map();
  const flowLines = new Map();
  let flowMode = false;
  let lastGrowth = -1;

  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  physics.createCollider(RAPIER.ColliderDesc.cuboid(9, 0.08, 10).setTranslation(0, -0.08, -2));
  const overflow = [];

  function removeOverflow(item) {
    if (!item) return;
    scene.remove(item.mesh);
    physics.removeRigidBody(item.body);
  }

  function spawnOverflow() {
    const mesh = parcelMesh();
    scene.add(mesh);
    const body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(-6.2 + Math.random() * 0.7, 2.0, 4.1).setLinearDamping(0.08).setAngularDamping(0.16)
    );
    physics.createCollider(RAPIER.ColliderDesc.cuboid(0.23, 0.19, 0.23).setRestitution(0.16).setFriction(0.72), body);
    body.setLinvel({ x: 0.6 + Math.random(), y: 1.0, z: (Math.random() - 0.5) * 1.3 }, true);
    body.setAngvel({ x: 2, y: 3, z: 2 }, true);
    overflow.push({ mesh, body, born: performance.now() });
    while (overflow.length > 12) removeOverflow(overflow.shift());
  }

  let outboundPulse = 0;
  sim.onEvent((event) => {
    if (event.type === 'overflow') spawnOverflow();
    if (event.type === 'shipment') outboundPulse = 1;
  });

  const pointers = new Map();
  let lastSingle = null;
  let pinchStart = 0;
  let pinchCamera = cameraState.distance;
  const pointerDistance = () => {
    const p = [...pointers.values()];
    return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  };
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture?.(e.pointerId);
    if (pointers.size === 1) lastSingle = { x: e.clientX, y: e.clientY };
    if (pointers.size === 2) { pinchStart = pointerDistance(); pinchCamera = cameraState.targetDistance; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1 && lastSingle) {
      const dx = e.clientX - lastSingle.x;
      const dy = e.clientY - lastSingle.y;
      cameraState.yaw -= dx * 0.006;
      cameraState.pitch = THREE.MathUtils.clamp(cameraState.pitch + dy * 0.0046, 0.38, 1.16);
      lastSingle = { x: e.clientX, y: e.clientY };
    } else if (pointers.size === 2) {
      const d = pointerDistance();
      if (pinchStart > 0) cameraState.targetDistance = THREE.MathUtils.clamp(pinchCamera * (pinchStart / Math.max(1, d)), 9, 28);
    }
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    const p = [...pointers.values()];
    lastSingle = p.length === 1 ? { ...p[0] } : null;
    if (p.length < 2) pinchStart = 0;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraState.targetDistance = THREE.MathUtils.clamp(cameraState.targetDistance + e.deltaY * 0.012, 9, 28);
  }, { passive: false });

  function resetCamera() {
    cameraState.yaw = 0.72;
    cameraState.pitch = 0.77;
    const growth = growthLevel();
    cameraState.targetDistance = 16.2 + growth * 2.1;
    cameraState.target.set(0, 0.25, -growth * 1.1);
  }

  function growthLevel() {
    const u = sim.state.upgrades;
    const total = u.worker + u.speed + u.rack + u.pack + u.conveyor;
    if (total >= 13) return 3;
    if (total >= 8) return 2;
    if (total >= 4) return 1;
    return 0;
  }

  function updateGrowth(dt) {
    const u = sim.state.upgrades;
    rackBanks.forEach((b, i) => { b.visible = i === 0 || i <= u.rack; });
    packModules.forEach((m, i) => { m.visible = i < u.pack; });
    conveyors.forEach((c, i) => { c.visible = i < u.conveyor; });
    lanes.forEach((l, i) => { l.visible = i < u.speed; });
    gates.forEach((g, i) => { g.visible = i === 0 || i <= Math.floor((u.conveyor + u.worker) / 3); });

    const growth = growthLevel();
    annexes.forEach((a, i) => {
      const shouldShow = i < growth;
      if (shouldShow && !a.visible) { a.visible = true; a.userData.reveal = 1; }
      if (!shouldShow) a.visible = false;
      if (a.visible && a.userData.reveal > 0) {
        a.userData.reveal = Math.max(0, a.userData.reveal - dt * 0.75);
        const t = 1 - a.userData.reveal;
        const s = 0.82 + t * 0.18;
        a.scale.setScalar(s);
        a.userData.floor.material.emissiveIntensity = a.userData.reveal * 0.8;
      } else if (a.visible) {
        a.scale.setScalar(1);
        a.userData.floor.material.emissiveIntensity = 0;
      }
    });
    if (growth !== lastGrowth) {
      lastGrowth = growth;
      cameraState.targetDistance = Math.max(cameraState.targetDistance, 16.2 + growth * 2.1);
      cameraState.target.z = -growth * 1.1;
    }
  }

  function updateCamera(dt) {
    cameraState.distance = THREE.MathUtils.lerp(cameraState.distance, cameraState.targetDistance, Math.min(1, dt * 3.8));
    const cp = Math.cos(cameraState.pitch);
    camera.position.set(
      cameraState.target.x + Math.sin(cameraState.yaw) * cp * cameraState.distance,
      cameraState.target.y + Math.sin(cameraState.pitch) * cameraState.distance,
      cameraState.target.z + Math.cos(cameraState.yaw) * cp * cameraState.distance
    );
    camera.lookAt(cameraState.target);
  }

  function ensureFlowLine(id) {
    let line = flowLines.get(id);
    if (!line) {
      line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.78, depthTest: false }));
      line.renderOrder = 8;
      scene.add(line);
      flowLines.set(id, line);
    }
    return line;
  }

  function flowTarget(worker) {
    if (!worker.task) return null;
    if (worker.task.stage === 'pickup') {
      const b = sim.state.boxes.find((x) => x.id === worker.task.boxId);
      if (b) return { x: b.x, y: Math.max(0.22, b.y || 0.22), z: b.z };
    }
    if (worker.task.kind === 'store') return { x: POS.rack.x, y: 0.35, z: POS.rack.z };
    if (worker.task.kind === 'pick') return { x: POS.pack.x, y: 0.35, z: POS.pack.z };
    return { x: POS.outbound.x, y: 0.35, z: POS.outbound.z };
  }

  function criticalTask(kind) {
    const key = sim.state.director?.key;
    if (key === 'inbound') return kind === 'store';
    if (key === 'orders' || key === 'rack') return kind === 'pick';
    if (key === 'packed') return kind === 'ship';
    return false;
  }

  function syncWorkers(dt) {
    const live = new Set();
    let stableLines = 0;
    sim.state.workers.forEach((worker, index) => {
      live.add(worker.id);
      let mesh = workerMeshes.get(worker.id);
      if (!mesh) { mesh = workerMesh(index); scene.add(mesh); workerMeshes.set(worker.id, mesh); }
      mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, worker.x, Math.min(1, dt * 11));
      mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, worker.z, Math.min(1, dt * 11));
      mesh.rotation.y = worker.facing;
      const s = taskStyle(worker.state);
      mesh.userData.ring.material.color.setHex(s.color);
      const badge = mesh.userData.badge;
      badge.visible = flowMode && worker.state !== 'idle';
      if (mesh.userData.badgeState !== worker.state) {
        badge.material.map = taskTexture(worker.state);
        badge.material.needsUpdate = true;
        mesh.userData.badgeState = worker.state;
      }
      mesh.position.y = worker.task ? Math.sin(performance.now() * 0.012 + worker.id) * 0.022 : 0;

      const line = ensureFlowLine(worker.id);
      const target = flowTarget(worker);
      const directorStable = sim.state.director?.key === 'stable';
      const show = flowMode && target && worker.task && (criticalTask(worker.task.kind) || (directorStable && stableLines < 2));
      line.visible = Boolean(show);
      if (show) {
        if (directorStable) stableLines += 1;
        line.material.color.setHex(s.color);
        const start = new THREE.Vector3(mesh.position.x, 0.14, mesh.position.z);
        const end = new THREE.Vector3(target.x, target.y, target.z);
        const mid = start.clone().lerp(end, 0.5); mid.y += 0.11;
        line.geometry.setFromPoints([start, mid, end]);
      }
    });
    for (const [id, mesh] of workerMeshes) {
      if (live.has(id)) continue;
      scene.remove(mesh); workerMeshes.delete(id);
      const line = flowLines.get(id);
      if (line) { scene.remove(line); line.geometry.dispose(); line.material.dispose(); flowLines.delete(id); }
    }
  }

  function syncBoxes(dt) {
    const live = new Set();
    for (const b of sim.state.boxes) {
      live.add(b.id);
      let mesh = boxMeshes.get(b.id);
      if (!mesh) { mesh = parcelMesh(); mesh.position.set(b.x, b.y, b.z); scene.add(mesh); boxMeshes.set(b.id, mesh); }
      mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, b.x, Math.min(1, dt * 13));
      mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, b.y, Math.min(1, dt * 13));
      mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, b.z, Math.min(1, dt * 13));
      let c = 0xd69a57;
      if (b.phase === 'packing') c = 0xffc04f;
      else if (b.phase === 'packed' || b.phase === 'carried_ship') c = 0x69d98f;
      const m = mesh.children[0]?.material;
      if (m) { m.color.setHex(c); m.emissive.setHex(c); m.emissiveIntensity = flowMode ? 0.13 : 0.015; }
    }
    for (const [id, mesh] of boxMeshes) if (!live.has(id)) { scene.remove(mesh); boxMeshes.delete(id); }
  }

  function heat(material, ratio) {
    if (!material?.emissive) return;
    const r = Math.max(0, ratio || 0);
    material.emissive.setHex(r >= 1 ? 0xff5151 : r >= 0.72 ? 0xffb347 : 0x48cf8d);
    material.emissiveIntensity = (flowMode ? 0.15 : 0.01) + Math.max(0, r - 0.5) * (flowMode ? 0.52 : 0.18);
  }

  function updateHeat() {
    const r = sim.state.director?.ratios || {};
    const c = sim.counts();
    heat(inbound.userData.base.material, r.inbound || 0);
    heat(pack.userData.base.material, Math.max(r.orders || 0, c.packing / 3));
    heat(outbound.userData.base.material, Math.max(r.packed || 0, c.packed / 4));
    rackBanks.forEach((b) => heat(b.userData.shelfMaterial, r.rack || 0));
  }

  function updateOverflow(dt) {
    physics.timestep = Math.min(1 / 30, Math.max(1 / 120, dt));
    physics.step();
    const now = performance.now();
    for (let i = overflow.length - 1; i >= 0; i -= 1) {
      const item = overflow[i];
      const p = item.body.translation(); const q = item.body.rotation();
      item.mesh.position.set(p.x, p.y, p.z); item.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      if (now - item.born > 10000 || p.y < -2) { removeOverflow(item); overflow.splice(i, 1); }
    }
  }

  function setFlowMode(enabled) {
    flowMode = Boolean(enabled);
    grid.material.transparent = flowMode;
    grid.material.opacity = flowMode ? 0.55 : 1;
    if (!flowMode) for (const line of flowLines.values()) line.visible = false;
  }

  function update(dt) {
    updateGrowth(dt);
    updateCamera(dt);
    syncWorkers(dt);
    syncBoxes(dt);
    updateHeat();
    updateOverflow(dt);
    conveyors.forEach((c) => { if (c.visible) c.userData.rollers.forEach((r) => { r.rotation.x += dt * 4.2; }); });
    outboundPulse = THREE.MathUtils.lerp(outboundPulse, 0, Math.min(1, dt * 3.6));
    outbound.scale.setScalar(1 + outboundPulse * 0.07);
    renderer.render(scene, camera);
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setSize(innerWidth, innerHeight, false);
  }
  addEventListener('resize', resize, { passive: true });
  resetCamera();
  return { update, resetCamera, setFlowMode, isFlowMode: () => flowMode };
}
