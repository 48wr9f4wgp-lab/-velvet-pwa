import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js';
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/+esm';
import { POS } from './sim.js';

const TASK_TEXTURES = new Map();

function roundedBox(size, color, y = size.y / 2) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshStandardMaterial({ color, roughness: 0.78 })
  );
  mesh.position.y = y;
  return mesh;
}

function makeTextSprite(text, color = '#ffffff') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(13,18,24,.78)';
  ctx.beginPath();
  ctx.roundRect(12, 18, 488, 92, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = '700 46px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(3.7, 0.93, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function taskStyle(state) {
  if (state === 'store') return { label: 'IN', bg: '#286fa3', line: 0x63c8ff };
  if (state === 'pick') return { label: 'PK', bg: '#9a6c1f', line: 0xffd163 };
  if (state === 'ship') return { label: 'OUT', bg: '#26794e', line: 0x62ef9b };
  return { label: '•', bg: '#4b5560', line: 0xffffff };
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
  ctx.strokeStyle = style.bg;
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 38px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(style.label, 64, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  TASK_TEXTURES.set(state, texture);
  return texture;
}

function addStation(scene, name, position, color, size = { x: 2.4, y: 0.16, z: 2.0 }) {
  const group = new THREE.Group();
  const base = roundedBox(size, color, size.y / 2);
  group.add(base);
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 })
  );
  border.position.y = size.y / 2;
  group.add(border);
  const label = makeTextSprite(name);
  label.position.set(0, 1.15, 0);
  group.add(label);
  group.position.set(position.x, 0, position.z);
  group.userData.base = base;
  group.userData.baseColor = new THREE.Color(color);
  scene.add(group);
  return group;
}

function createRack(scene) {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x4b5661, roughness: 0.72 });
  const shelf = new THREE.MeshStandardMaterial({ color: 0x8c6c46, roughness: 0.82 });
  for (const x of [-1.9, 1.9]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), steel);
    post.position.set(x, 1.3, 0);
    group.add(post);
  }
  for (const y of [0.38, 1.08, 1.78]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.11, 1.1), shelf);
    board.position.set(0, y, 0);
    group.add(board);
  }
  group.position.set(-2.15, 0, -1.65);
  group.userData.shelfMaterial = shelf;
  scene.add(group);
  return group;
}

function createWorkerMesh(index) {
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
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
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
  group.userData.ring = ring;
  group.userData.badge = badge;
  group.userData.badgeState = 'idle';
  return group;
}

function createBoxMesh() {
  const group = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.42, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xd69a57, roughness: 0.82 })
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

export async function createSceneView(canvas, sim) {
  await RAPIER.init();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.setSize(innerWidth, innerHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101820);
  scene.fog = new THREE.Fog(0x101820, 18, 32);

  const camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.1, 70);
  const cameraState = { yaw: 0.72, pitch: 0.78, distance: 15.3, target: new THREE.Vector3(0, 0.25, 0.25) };

  scene.add(new THREE.HemisphereLight(0xdff3ff, 0x27323d, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.15);
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

  const inboundStation = addStation(scene, 'INBOUND', POS.inbound, 0x285c92, { x: 2.9, y: 0.15, z: 2.3 });
  const packStation = addStation(scene, 'PACK', POS.pack, 0xa56f1e, { x: 2.6, y: 0.15, z: 2.2 });
  const outboundStation = addStation(scene, 'OUTBOUND', POS.outbound, 0x24794d, { x: 2.8, y: 0.15, z: 2.3 });
  const rack = createRack(scene);

  const packMachine = new THREE.Group();
  const packBody = roundedBox({ x: 1.2, y: 0.9, z: 0.9 }, 0xc6902f, 0.45);
  packMachine.add(packBody);
  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.23, 0.07, 8, 18),
    new THREE.MeshStandardMaterial({ color: 0x30363d, roughness: 0.6 })
  );
  wheel.rotation.y = Math.PI / 2;
  wheel.position.set(0.62, 0.58, 0);
  packMachine.add(wheel);
  packMachine.position.set(POS.pack.x, 0.14, POS.pack.z);
  scene.add(packMachine);

  const conveyor = new THREE.Group();
  const belt = roundedBox({ x: 3.6, y: 0.18, z: 0.78 }, 0x252c33, 0.34);
  conveyor.add(belt);
  for (let i = 0; i < 8; i += 1) {
    const roller = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.72, 10),
      new THREE.MeshStandardMaterial({ color: 0x78838c, roughness: 0.5 })
    );
    roller.rotation.z = Math.PI / 2;
    roller.position.set(-1.55 + i * 0.44, 0.46, 0);
    conveyor.add(roller);
  }
  conveyor.position.set(-4.35, 0, 1.55);
  conveyor.rotation.y = -0.55;
  conveyor.visible = false;
  scene.add(conveyor);

  const workerMeshes = new Map();
  const boxMeshes = new Map();
  const flowLines = new Map();
  let flowMode = false;

  const physicsWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  physicsWorld.createCollider(RAPIER.ColliderDesc.cuboid(9, 0.08, 7).setTranslation(0, -0.08, 0));
  const overflowProps = [];

  function spawnOverflowProp() {
    const mesh = createBoxMesh();
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
    while (overflowProps.length > 16) removeOverflowProp(overflowProps.shift());
  }

  function removeOverflowProp(prop) {
    if (!prop) return;
    scene.remove(prop.mesh);
    physicsWorld.removeRigidBody(prop.body);
  }

  let outboundPulse = 0;
  sim.onEvent((event) => {
    if (event.type === 'overflow') spawnOverflowProp();
    if (event.type === 'shipment') outboundPulse = 1;
  });

  const pointers = new Map();
  let lastSingle = null;
  let pinchStartDistance = 0;
  let pinchStartCameraDistance = cameraState.distance;

  function pointerDistance() {
    const values = [...pointers.values()];
    if (values.length < 2) return 0;
    return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
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
      if (pinchStartDistance > 0) cameraState.distance = THREE.MathUtils.clamp(pinchStartCameraDistance * (pinchStartDistance / Math.max(1, d)), 8.5, 21);
    }
  });

  function endPointer(event) {
    pointers.delete(event.pointerId);
    const values = [...pointers.values()];
    lastSingle = values.length === 1 ? { ...values[0] } : null;
    if (values.length < 2) pinchStartDistance = 0;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    cameraState.distance = THREE.MathUtils.clamp(cameraState.distance + event.deltaY * 0.012, 8.5, 21);
  }, { passive: false });

  function resetCamera() {
    cameraState.yaw = 0.72;
    cameraState.pitch = 0.78;
    cameraState.distance = 15.3;
    cameraState.target.set(0, 0.25, 0.25);
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
    let line = flowLines.get(worker.id);
    if (!line) {
      line = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false })
      );
      line.renderOrder = 8;
      line.visible = false;
      scene.add(line);
      flowLines.set(worker.id, line);
    }
    return line;
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

  function updateFlowLine(worker, mesh) {
    const line = ensureFlowLine(worker);
    const target = flowTarget(worker);
    line.visible = Boolean(flowMode && target && worker.task);
    if (!line.visible) return;
    const style = taskStyle(worker.state);
    line.material.color.setHex(style.line);
    const start = new THREE.Vector3(mesh.position.x, 0.14, mesh.position.z);
    const end = new THREE.Vector3(target.x, target.y, target.z);
    const mid = start.clone().lerp(end, 0.5);
    mid.y += 0.12;
    line.geometry.setFromPoints([start, mid, end]);
  }

  function syncWorkers(dt) {
    const live = new Set();
    sim.state.workers.forEach((worker, index) => {
      live.add(worker.id);
      let mesh = workerMeshes.get(worker.id);
      if (!mesh) {
        mesh = createWorkerMesh(index);
        scene.add(mesh);
        workerMeshes.set(worker.id, mesh);
      }
      mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, worker.x, Math.min(1, dt * 10));
      mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, worker.z, Math.min(1, dt * 10));
      mesh.rotation.y = worker.facing;
      const ring = mesh.userData.ring;
      const style = taskStyle(worker.state);
      ring.material.color.setHex(style.line);
      const badge = mesh.userData.badge;
      badge.visible = worker.state !== 'idle';
      if (mesh.userData.badgeState !== worker.state) {
        badge.material.map = taskTexture(worker.state);
        badge.material.needsUpdate = true;
        mesh.userData.badgeState = worker.state;
      }
      const moving = worker.task ? 1 : 0;
      mesh.position.y = moving ? Math.sin(performance.now() * 0.012 + worker.id) * 0.025 : 0;
      updateFlowLine(worker, mesh);
    });
    for (const [id, mesh] of workerMeshes) {
      if (live.has(id)) continue;
      scene.remove(mesh);
      workerMeshes.delete(id);
      const line = flowLines.get(id);
      if (line) {
        scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
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
        mesh = createBoxMesh();
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
        material.emissiveIntensity = flowMode ? 0.18 : 0.03;
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
        removeOverflowProp(prop);
        overflowProps.splice(i, 1);
      }
    }
  }

  function heatMaterial(material, ratio) {
    if (!material?.emissive) return;
    const r = Math.max(0, ratio || 0);
    const color = r >= 1 ? 0xff5151 : r >= 0.72 ? 0xffb347 : 0x48cf8d;
    material.emissive.setHex(color);
    const base = flowMode ? 0.18 : 0.015;
    material.emissiveIntensity = base + Math.max(0, r - 0.48) * (flowMode ? 0.58 : 0.22);
  }

  function updateStationHeat() {
    const ratios = sim.state.director?.ratios || {};
    const c = sim.counts();
    heatMaterial(inboundStation.userData.base.material, ratios.inbound || 0);
    heatMaterial(packStation.userData.base.material, Math.max(ratios.orders || 0, c.packing / 3));
    heatMaterial(outboundStation.userData.base.material, Math.max(ratios.packed || 0, c.packed / 4));
    heatMaterial(rack.userData.shelfMaterial, ratios.rack || 0);
  }

  function setFlowMode(enabled) {
    flowMode = Boolean(enabled);
    grid.material.opacity = flowMode ? 0.7 : 1;
    grid.material.transparent = flowMode;
    if (!flowMode) {
      for (const line of flowLines.values()) line.visible = false;
    }
    updateStationHeat();
  }

  function update(dt) {
    updateCamera();
    syncWorkers(dt);
    syncBoxes(dt);
    updateOverflow(dt);
    updateStationHeat();

    conveyor.visible = sim.state.upgrades.conveyor > 0;
    if (conveyor.visible) conveyor.children.forEach((child, index) => {
      if (index === 0) return;
      child.rotation.x += dt * (2.5 + sim.state.upgrades.conveyor * 0.75);
    });

    const c = sim.counts();
    if (c.packing > 0) wheel.rotation.z += dt * 4.8;
    outboundPulse = THREE.MathUtils.lerp(outboundPulse, 0, Math.min(1, dt * 3.6));
    outboundStation.scale.setScalar(1 + outboundPulse * 0.1);

    renderer.render(scene, camera);
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.setSize(innerWidth, innerHeight, false);
  }
  addEventListener('resize', resize, { passive: true });

  updateCamera();

  return { update, resetCamera, setFlowMode, isFlowMode: () => flowMode };
}
