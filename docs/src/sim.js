const POS = {
  inbound: { x: -6.1, z: 3.8 },
  rack: { x: -2.1, z: -1.1 },
  pack: { x: 2.25, z: 0.2 },
  packed: { x: 3.1, z: -1.25 },
  outbound: { x: 6.0, z: -3.4 },
  center: { x: 0, z: 1.4 },
};

const BASE = {
  workerCount: 3,
  workerSpeed: 1.75,
  rackCapacity: 8,
  packTime: 2.6,
  inboundInterval: 3.0,
  orderInterval: 7.2,
  saleValue: 120,
  inboundMax: 10,
};

const UPGRADE_INFO = {
  worker: { label: 'スタッフ追加', max: 5, baseCost: 420 },
  speed: { label: '歩行速度', max: 5, baseCost: 250 },
  rack: { label: '棚拡張', max: 4, baseCost: 300 },
  pack: { label: '梱包設備', max: 5, baseCost: 320 },
  conveyor: { label: '自動搬送', max: 4, baseCost: 700 },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function moveToward(subject, target, amount) {
  const dx = target.x - subject.x;
  const dz = target.z - subject.z;
  const d = Math.hypot(dx, dz);
  if (d <= amount || d < 0.0001) {
    subject.x = target.x;
    subject.z = target.z;
    return true;
  }
  subject.x += (dx / d) * amount;
  subject.z += (dz / d) * amount;
  return false;
}

function rackPosition(slot) {
  const cols = 4;
  const col = slot % cols;
  const row = Math.floor(slot / cols);
  return {
    x: -3.65 + col * 1.0,
    y: 0.34 + (row % 2) * 0.7,
    z: -1.65 - Math.floor(row / 2) * 0.8,
  };
}

function inboundPosition(index) {
  const col = index % 5;
  const row = Math.floor(index / 5);
  return { x: -7.0 + col * 0.55, y: 0.3 + row * 0.48, z: 4.2 };
}

function packedPosition(index) {
  return { x: 2.75 + (index % 3) * 0.55, y: 0.3, z: -1.45 - Math.floor(index / 3) * 0.58 };
}

function createWorker(id, index) {
  return {
    id,
    x: -0.8 + (index % 3) * 0.8,
    z: 2.25 + Math.floor(index / 3) * 0.65,
    task: null,
    carrying: null,
    state: 'idle',
    facing: 0,
  };
}

export function createSimulation(saved = null) {
  const listeners = new Set();
  let nextBoxId = 1;
  let nextWorkerId = 1;
  let inboundTimer = 0.4;
  let orderTimer = 3.0;
  let conveyorTimer = 0;
  let overflowCooldown = 0;
  let saveDirty = false;
  const shipmentTimes = [];

  const state = {
    schema_version: 1,
    money: 650,
    shipped: 0,
    ordersOpen: 2,
    policy: 'balanced',
    timeScale: 1,
    upgrades: { worker: 0, speed: 0, rack: 0, pack: 0, conveyor: 0 },
    workers: [],
    boxes: [],
    status: '起動中',
    metrics: { perMinute: 0 },
  };

  function emit(type, detail = {}) {
    const event = { type, at: performance.now(), ...detail };
    for (const listener of listeners) listener(event);
  }

  function workerCount() {
    return BASE.workerCount + state.upgrades.worker;
  }

  function workerSpeed() {
    return BASE.workerSpeed * (1 + state.upgrades.speed * 0.16);
  }

  function rackCapacity() {
    return BASE.rackCapacity + state.upgrades.rack * 4;
  }

  function packTime() {
    return BASE.packTime * Math.pow(0.82, state.upgrades.pack);
  }

  function conveyorInterval() {
    if (!state.upgrades.conveyor) return Infinity;
    return Math.max(1.15, 4.6 - state.upgrades.conveyor * 0.75);
  }

  function upgradeCost(type) {
    const def = UPGRADE_INFO[type];
    const level = state.upgrades[type] ?? 0;
    return Math.round(def.baseCost * Math.pow(1.62, level));
  }

  function markDirty() {
    saveDirty = true;
  }

  function ensureWorkers() {
    while (state.workers.length < workerCount()) {
      const index = state.workers.length;
      state.workers.push(createWorker(nextWorkerId++, index));
      emit('worker_hired', { text: 'スタッフが増えた' });
    }
  }

  function normalizeInboundPositions() {
    const inbound = state.boxes.filter((box) => box.phase === 'inbound' && !box.reservedBy);
    inbound.forEach((box, index) => Object.assign(box, inboundPosition(index)));
  }

  function normalizePackedPositions() {
    const packed = state.boxes.filter((box) => box.phase === 'packed' && !box.reservedBy);
    packed.forEach((box, index) => Object.assign(box, packedPosition(index)));
  }

  function spawnInbound() {
    const current = counts().inbound;
    if (current >= BASE.inboundMax) {
      if (overflowCooldown <= 0) {
        overflowCooldown = 2.2;
        emit('overflow', { text: '搬入口があふれた' });
      }
      return false;
    }
    const box = {
      id: nextBoxId++,
      phase: 'inbound',
      reservedBy: null,
      rackSlot: null,
      packRemaining: 0,
      carrierId: null,
      ...inboundPosition(current),
    };
    state.boxes.push(box);
    emit('inbound', { boxId: box.id });
    return true;
  }

  function counts() {
    let inbound = 0;
    let rack = 0;
    let packing = 0;
    let packed = 0;
    for (const box of state.boxes) {
      if (box.phase === 'inbound') inbound += 1;
      else if (box.phase === 'rack') rack += 1;
      else if (box.phase === 'packing') packing += 1;
      else if (box.phase === 'packed') packed += 1;
      else if (box.phase === 'carried_store') inbound += 1;
      else if (box.phase === 'carried_pick') packing += 1;
      else if (box.phase === 'carried_ship') packed += 1;
    }
    return { inbound, rack, packing, packed };
  }

  function inProcessOrders() {
    let total = 0;
    for (const box of state.boxes) {
      if (['carried_pick', 'packing', 'packed', 'carried_ship'].includes(box.phase)) total += 1;
    }
    return total;
  }

  function reservedRackSlots() {
    const used = new Set();
    for (const box of state.boxes) {
      if (box.rackSlot != null && box.phase === 'rack') used.add(box.rackSlot);
    }
    for (const worker of state.workers) {
      if (worker.task?.kind === 'store' && worker.task.rackSlot != null) used.add(worker.task.rackSlot);
    }
    return used;
  }

  function freeRackSlot() {
    const used = reservedRackSlots();
    for (let i = 0; i < rackCapacity(); i += 1) {
      if (!used.has(i)) return i;
    }
    return null;
  }

  function availableBox(phase) {
    return state.boxes.find((box) => box.phase === phase && !box.reservedBy) || null;
  }

  function policyWeights() {
    if (state.policy === 'inbound') return { store: 1.8, pick: 0.72, ship: 1.05 };
    if (state.policy === 'ship') return { store: 0.62, pick: 1.7, ship: 1.75 };
    return { store: 1, pick: 1, ship: 1.15 };
  }

  function assignTask(worker) {
    if (worker.task) return;
    const weights = policyWeights();
    const options = [];
    const packed = availableBox('packed');
    if (packed) options.push({ kind: 'ship', box: packed, score: 110 * weights.ship });

    const needed = Math.max(0, state.ordersOpen - inProcessOrders());
    const rack = availableBox('rack');
    if (needed > 0 && rack) options.push({ kind: 'pick', box: rack, score: (82 + needed * 8) * weights.pick });

    const inbound = availableBox('inbound');
    const slot = freeRackSlot();
    if (inbound && slot != null) options.push({ kind: 'store', box: inbound, rackSlot: slot, score: 72 * weights.store });

    options.sort((a, b) => b.score - a.score);
    const selected = options[0];
    if (!selected) {
      worker.state = 'idle';
      return;
    }

    selected.box.reservedBy = worker.id;
    worker.task = {
      kind: selected.kind,
      boxId: selected.box.id,
      stage: 'pickup',
      rackSlot: selected.rackSlot ?? null,
    };
    worker.state = selected.kind;
  }

  function boxById(id) {
    return state.boxes.find((box) => box.id === id) || null;
  }

  function pickupPosition(box, task) {
    if (task.kind === 'store') return { x: box.x, z: box.z };
    if (task.kind === 'pick') return { x: box.x, z: box.z };
    return { x: box.x, z: box.z };
  }

  function dropPosition(task) {
    if (task.kind === 'store') {
      const p = rackPosition(task.rackSlot);
      return { x: p.x, z: p.z };
    }
    if (task.kind === 'pick') return POS.pack;
    return POS.outbound;
  }

  function pickup(worker, box) {
    worker.carrying = box.id;
    box.carrierId = worker.id;
    box.rackSlot = null;
    if (worker.task.kind === 'store') box.phase = 'carried_store';
    if (worker.task.kind === 'pick') box.phase = 'carried_pick';
    if (worker.task.kind === 'ship') box.phase = 'carried_ship';
    worker.task.stage = 'drop';
  }

  function deliver(worker, box) {
    const kind = worker.task.kind;
    if (kind === 'store') {
      box.phase = 'rack';
      box.reservedBy = null;
      box.carrierId = null;
      box.rackSlot = worker.task.rackSlot;
      Object.assign(box, rackPosition(box.rackSlot));
    } else if (kind === 'pick') {
      box.phase = 'packing';
      box.reservedBy = null;
      box.carrierId = null;
      box.packRemaining = packTime();
      box.x = POS.pack.x;
      box.y = 0.35;
      box.z = POS.pack.z;
    } else if (kind === 'ship') {
      const index = state.boxes.indexOf(box);
      if (index >= 0) state.boxes.splice(index, 1);
      state.ordersOpen = Math.max(0, state.ordersOpen - 1);
      state.money += BASE.saleValue;
      state.shipped += 1;
      shipmentTimes.push(performance.now());
      emit('shipment', { text: `出荷 +¥${BASE.saleValue}`, value: BASE.saleValue });
      markDirty();
    }
    worker.carrying = null;
    worker.task = null;
    worker.state = 'idle';
  }

  function updateWorkers(dt) {
    const speed = workerSpeed();
    for (const worker of state.workers) {
      if (!worker.task) assignTask(worker);
      const task = worker.task;
      if (!task) {
        const home = { x: POS.center.x + ((worker.id % 3) - 1) * 0.75, z: POS.center.z + (worker.id % 2) * 0.45 };
        moveToward(worker, home, speed * 0.35 * dt);
        continue;
      }
      const box = boxById(task.boxId);
      if (!box) {
        worker.task = null;
        worker.carrying = null;
        continue;
      }

      const target = task.stage === 'pickup' ? pickupPosition(box, task) : dropPosition(task);
      const oldX = worker.x;
      const oldZ = worker.z;
      const arrived = moveToward(worker, target, speed * dt);
      if (Math.abs(worker.x - oldX) + Math.abs(worker.z - oldZ) > 0.0001) {
        worker.facing = Math.atan2(worker.x - oldX, worker.z - oldZ);
      }
      if (worker.carrying === box.id) {
        box.x = worker.x;
        box.y = 0.88;
        box.z = worker.z;
      }
      if (!arrived) continue;
      if (task.stage === 'pickup') pickup(worker, box);
      else deliver(worker, box);
    }
    normalizeInboundPositions();
    normalizePackedPositions();
  }

  function updatePacking(dt) {
    for (const box of state.boxes) {
      if (box.phase !== 'packing') continue;
      box.packRemaining -= dt;
      if (box.packRemaining <= 0) {
        box.phase = 'packed';
        box.packRemaining = 0;
        emit('packed', { boxId: box.id, text: '梱包完了' });
      }
    }
    normalizePackedPositions();
  }

  function runConveyor(dt) {
    if (!state.upgrades.conveyor) return;
    conveyorTimer -= dt;
    if (conveyorTimer > 0) return;
    conveyorTimer = conveyorInterval();
    const box = availableBox('inbound');
    const slot = freeRackSlot();
    if (!box || slot == null) return;
    box.phase = 'rack';
    box.rackSlot = slot;
    box.reservedBy = null;
    Object.assign(box, rackPosition(slot));
    emit('conveyor', { text: '自動搬送が1箱処理' });
  }

  function updateSpawners(dt) {
    inboundTimer -= dt;
    orderTimer -= dt;
    overflowCooldown -= dt;
    if (inboundTimer <= 0) {
      inboundTimer += BASE.inboundInterval;
      spawnInbound();
    }
    if (orderTimer <= 0) {
      orderTimer += BASE.orderInterval;
      const amount = Math.random() < 0.28 ? 2 : 1;
      state.ordersOpen += amount;
      emit('order', { text: `新規注文 +${amount}`, amount });
    }
  }

  function updateMetrics() {
    const now = performance.now();
    while (shipmentTimes.length && now - shipmentTimes[0] > 60000) shipmentTimes.shift();
    state.metrics.perMinute = shipmentTimes.length;
    const c = counts();
    if (c.inbound >= 8) state.status = '⚠ 搬入口が詰まっている';
    else if (c.rack >= rackCapacity()) state.status = '⚠ 棚が満杯';
    else if (state.ordersOpen >= Math.max(4, state.workers.length + 1)) state.status = '⚠ 注文が滞留';
    else if (c.packed >= 3) state.status = '⚠ 出荷待ちが滞留';
    else state.status = '安定稼働';
  }

  function update(realDt) {
    const scaled = clamp(realDt, 0, 0.05) * state.timeScale;
    if (scaled <= 0) {
      updateMetrics();
      return;
    }
    updateSpawners(scaled);
    runConveyor(scaled);
    updatePacking(scaled);
    updateWorkers(scaled);
    updateMetrics();
  }

  function setPolicy(policy) {
    if (!['balanced', 'inbound', 'ship'].includes(policy)) return false;
    state.policy = policy;
    emit('policy', { text: policy === 'balanced' ? '方針: バランス' : policy === 'inbound' ? '方針: 入庫優先' : '方針: 出庫優先' });
    markDirty();
    return true;
  }

  function setTimeScale(scale) {
    if (![0, 1, 2, 4].includes(scale)) return false;
    state.timeScale = scale;
    return true;
  }

  function purchaseUpgrade(type) {
    const def = UPGRADE_INFO[type];
    if (!def) return { ok: false, reason: '不明な強化' };
    const level = state.upgrades[type] ?? 0;
    if (level >= def.max) return { ok: false, reason: '最大レベル' };
    const cost = upgradeCost(type);
    if (state.money < cost) return { ok: false, reason: '資金不足' };
    state.money -= cost;
    state.upgrades[type] = level + 1;
    ensureWorkers();
    conveyorTimer = 0;
    emit('upgrade', { text: `${def.label} Lv.${state.upgrades[type]}`, type });
    markDirty();
    return { ok: true, cost, level: state.upgrades[type] };
  }

  function hydrate(snapshot) {
    if (!snapshot || snapshot.schema_version !== 1) return;
    if (Number.isFinite(snapshot.money)) state.money = Math.max(0, snapshot.money);
    if (Number.isFinite(snapshot.shipped)) state.shipped = Math.max(0, snapshot.shipped);
    if (['balanced', 'inbound', 'ship'].includes(snapshot.policy)) state.policy = snapshot.policy;
    if (snapshot.upgrades && typeof snapshot.upgrades === 'object') {
      for (const [key, def] of Object.entries(UPGRADE_INFO)) {
        const raw = Number(snapshot.upgrades[key] ?? 0);
        state.upgrades[key] = clamp(Math.floor(raw), 0, def.max);
      }
    }
  }

  function serialize() {
    return {
      schema_version: 1,
      money: state.money,
      shipped: state.shipped,
      policy: state.policy,
      upgrades: { ...state.upgrades },
    };
  }

  function consumeDirty() {
    const wasDirty = saveDirty;
    saveDirty = false;
    return wasDirty;
  }

  hydrate(saved);
  ensureWorkers();
  for (let i = 0; i < 6; i += 1) spawnInbound();
  updateMetrics();

  return {
    state,
    update,
    counts,
    rackCapacity,
    workerSpeed,
    packTime,
    conveyorInterval,
    upgradeCost,
    upgradeInfo: UPGRADE_INFO,
    setPolicy,
    setTimeScale,
    purchaseUpgrade,
    serialize,
    consumeDirty,
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    resetProgress() {
      state.money = 650;
      state.shipped = 0;
      state.policy = 'balanced';
      state.upgrades = { worker: 0, speed: 0, rack: 0, pack: 0, conveyor: 0 };
      state.workers.splice(0);
      state.boxes.splice(0);
      nextWorkerId = 1;
      nextBoxId = 1;
      ensureWorkers();
      for (let i = 0; i < 6; i += 1) spawnInbound();
      state.ordersOpen = 2;
      markDirty();
    },
  };
}

export { POS };
