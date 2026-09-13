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

const PERK_INFO = {
  smartDispatch: { label: 'スマート配車', cost: 2, max: 3, desc: '混雑度に応じて仕事選択を自動補正' },
  bulkPack: { label: '標準化梱包', cost: 2, max: 3, desc: '梱包時間 -15%' },
  contractBonus: { label: '高単価契約', cost: 3, max: 2, desc: '契約報酬 +25%' },
};

const CONTRACT_KINDS = ['ship', 'inbound', 'throughput'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  let nextContractId = 1;
  let inboundTimer = 0.4;
  let orderTimer = 3.0;
  let conveyorTimer = 0;
  let overflowCooldown = 0;
  let offerCooldown = 0;
  let saveDirty = false;
  let simClock = 0;
  const shipmentTimes = [];

  const state = {
    schema_version: 1,
    money: 650,
    research: 0,
    shipped: 0,
    ordersOpen: 2,
    policy: 'balanced',
    timeScale: 1,
    priorities: { store: 3, pick: 3, ship: 4 },
    upgrades: { worker: 0, speed: 0, rack: 0, pack: 0, conveyor: 0 },
    perks: { smartDispatch: 0, bulkPack: 0, contractBonus: 0 },
    contractOffers: [],
    activeContract: null,
    completedContracts: 0,
    milestoneAwarded: 0,
    workers: [],
    boxes: [],
    status: '起動中',
    director: {
      key: 'stable', label: '安定稼働', severity: 0,
      detail: '流れは安定しています', recommendation: '次の強化に備えて資金を貯める',
      ratios: { inbound: 0, rack: 0, orders: 0, packed: 0 },
    },
    metrics: { perMinute: 0 },
  };

  function emit(type, detail = {}) {
    const event = { type, at: simClock, ...detail };
    for (const listener of listeners) listener(event);
  }

  function workerCount() { return BASE.workerCount + state.upgrades.worker; }
  function workerSpeed() { return BASE.workerSpeed * (1 + state.upgrades.speed * 0.16); }
  function rackCapacity() { return BASE.rackCapacity + state.upgrades.rack * 4; }
  function packTime() { return BASE.packTime * Math.pow(0.82, state.upgrades.pack) * Math.pow(0.85, state.perks.bulkPack); }
  function conveyorInterval() { return state.upgrades.conveyor ? Math.max(1.15, 4.6 - state.upgrades.conveyor * 0.75) : Infinity; }
  function upgradeCost(type) { const def = UPGRADE_INFO[type]; return def ? Math.round(def.baseCost * Math.pow(1.62, state.upgrades[type] ?? 0)) : Infinity; }
  function perkCost(type) { return PERK_INFO[type]?.cost ?? Infinity; }
  function markDirty() { saveDirty = true; }

  function ensureWorkers() {
    while (state.workers.length < workerCount()) {
      const index = state.workers.length;
      state.workers.push(createWorker(nextWorkerId++, index));
      emit('worker_hired', { text: 'スタッフが増えた' });
    }
  }

  function normalizeInboundPositions() {
    state.boxes.filter((box) => box.phase === 'inbound' && !box.reservedBy).forEach((box, index) => Object.assign(box, inboundPosition(index)));
  }
  function normalizePackedPositions() {
    state.boxes.filter((box) => box.phase === 'packed' && !box.reservedBy).forEach((box, index) => Object.assign(box, packedPosition(index)));
  }

  function counts() {
    let inbound = 0, rack = 0, packing = 0, packed = 0;
    for (const box of state.boxes) {
      if (box.phase === 'inbound' || box.phase === 'carried_store') inbound += 1;
      else if (box.phase === 'rack') rack += 1;
      else if (box.phase === 'packing' || box.phase === 'carried_pick') packing += 1;
      else if (box.phase === 'packed' || box.phase === 'carried_ship') packed += 1;
    }
    return { inbound, rack, packing, packed };
  }

  function spawnInbound() {
    const current = counts().inbound;
    if (current >= BASE.inboundMax) {
      if (overflowCooldown <= 0) { overflowCooldown = 2.2; emit('overflow', { text: '搬入口があふれた' }); }
      return false;
    }
    const box = { id: nextBoxId++, phase: 'inbound', reservedBy: null, rackSlot: null, packRemaining: 0, carrierId: null, ...inboundPosition(current) };
    state.boxes.push(box); emit('inbound', { boxId: box.id }); return true;
  }

  function inProcessOrders() { return state.boxes.filter((box) => ['carried_pick', 'packing', 'packed', 'carried_ship'].includes(box.phase)).length; }
  function reservedRackSlots() {
    const used = new Set();
    for (const box of state.boxes) if (box.rackSlot != null && box.phase === 'rack') used.add(box.rackSlot);
    for (const worker of state.workers) if (worker.task?.kind === 'store' && worker.task.rackSlot != null) used.add(worker.task.rackSlot);
    return used;
  }
  function freeRackSlot() { const used = reservedRackSlots(); for (let i = 0; i < rackCapacity(); i += 1) if (!used.has(i)) return i; return null; }
  function availableBox(phase) { return state.boxes.find((box) => box.phase === phase && !box.reservedBy) || null; }

  function policyWeights() {
    if (state.policy === 'inbound') return { store: 1.8, pick: 0.72, ship: 1.05 };
    if (state.policy === 'ship') return { store: 0.62, pick: 1.7, ship: 1.75 };
    return { store: 1, pick: 1, ship: 1.15 };
  }
  function priorityWeight(kind) { return [0, 0.58, 0.8, 1, 1.32, 1.72][clamp(Number(state.priorities[kind] ?? 3), 1, 5)]; }
  function smartDispatchBonus(kind) {
    const level = state.perks.smartDispatch, d = state.director;
    if (!level) return 1;
    if (d.key === 'inbound' && kind === 'store') return 1 + 0.18 * level;
    if ((d.key === 'orders' || d.key === 'packed') && (kind === 'pick' || kind === 'ship')) return 1 + 0.18 * level;
    if (d.key === 'rack' && kind === 'pick') return 1 + 0.14 * level;
    return 1;
  }

  function assignTask(worker) {
    if (worker.task) return;
    const weights = policyWeights(), options = [], packed = availableBox('packed');
    if (packed) options.push({ kind: 'ship', box: packed, score: 110 * weights.ship * priorityWeight('ship') * smartDispatchBonus('ship') });
    const needed = Math.max(0, state.ordersOpen - inProcessOrders()), rack = availableBox('rack');
    if (needed > 0 && rack) options.push({ kind: 'pick', box: rack, score: (82 + needed * 8) * weights.pick * priorityWeight('pick') * smartDispatchBonus('pick') });
    const inbound = availableBox('inbound'), slot = freeRackSlot();
    if (inbound && slot != null) options.push({ kind: 'store', box: inbound, rackSlot: slot, score: 72 * weights.store * priorityWeight('store') * smartDispatchBonus('store') });
    options.sort((a, b) => b.score - a.score);
    const selected = options[0];
    if (!selected) { worker.state = 'idle'; return; }
    selected.box.reservedBy = worker.id;
    worker.task = { kind: selected.kind, boxId: selected.box.id, stage: 'pickup', rackSlot: selected.rackSlot ?? null };
    worker.state = selected.kind;
  }

  function boxById(id) { return state.boxes.find((box) => box.id === id) || null; }
  function dropPosition(task) { if (task.kind === 'store') { const p = rackPosition(task.rackSlot); return { x: p.x, z: p.z }; } return task.kind === 'pick' ? POS.pack : POS.outbound; }
  function pickup(worker, box) {
    worker.carrying = box.id; box.carrierId = worker.id; box.rackSlot = null;
    box.phase = worker.task.kind === 'store' ? 'carried_store' : worker.task.kind === 'pick' ? 'carried_pick' : 'carried_ship';
    worker.task.stage = 'drop';
  }

  function handleMilestone() {
    const milestone = Math.floor(state.shipped / 10) * 10;
    if (milestone <= 0 || milestone <= state.milestoneAwarded) return;
    state.milestoneAwarded = milestone; state.research += 1; emit('milestone', { text: `${milestone}件出荷達成 研究+1`, milestone }); markDirty();
  }

  function deliver(worker, box) {
    const kind = worker.task.kind;
    if (kind === 'store') { box.phase = 'rack'; box.reservedBy = null; box.carrierId = null; box.rackSlot = worker.task.rackSlot; Object.assign(box, rackPosition(box.rackSlot)); }
    else if (kind === 'pick') { box.phase = 'packing'; box.reservedBy = null; box.carrierId = null; box.packRemaining = packTime(); box.x = POS.pack.x; box.y = 0.35; box.z = POS.pack.z; }
    else {
      const index = state.boxes.indexOf(box); if (index >= 0) state.boxes.splice(index, 1);
      state.ordersOpen = Math.max(0, state.ordersOpen - 1); state.money += BASE.saleValue; state.shipped += 1; shipmentTimes.push(simClock);
      emit('shipment', { text: `出荷 +¥${BASE.saleValue}`, value: BASE.saleValue }); handleMilestone(); markDirty();
    }
    worker.carrying = null; worker.task = null; worker.state = 'idle';
  }

  function updateWorkers(dt) {
    const speed = workerSpeed();
    for (const worker of state.workers) {
      if (!worker.task) assignTask(worker);
      const task = worker.task;
      if (!task) { moveToward(worker, { x: POS.center.x + ((worker.id % 3) - 1) * 0.75, z: POS.center.z + (worker.id % 2) * 0.45 }, speed * 0.35 * dt); continue; }
      const box = boxById(task.boxId); if (!box) { worker.task = null; worker.carrying = null; continue; }
      const target = task.stage === 'pickup' ? { x: box.x, z: box.z } : dropPosition(task), oldX = worker.x, oldZ = worker.z;
      const arrived = moveToward(worker, target, speed * dt);
      if (Math.abs(worker.x - oldX) + Math.abs(worker.z - oldZ) > 0.0001) worker.facing = Math.atan2(worker.x - oldX, worker.z - oldZ);
      if (worker.carrying === box.id) { box.x = worker.x; box.y = 0.88; box.z = worker.z; }
      if (arrived) task.stage === 'pickup' ? pickup(worker, box) : deliver(worker, box);
    }
    normalizeInboundPositions(); normalizePackedPositions();
  }

  function updatePacking(dt) {
    for (const box of state.boxes) if (box.phase === 'packing') { box.packRemaining -= dt; if (box.packRemaining <= 0) { box.phase = 'packed'; box.packRemaining = 0; emit('packed', { boxId: box.id, text: '梱包完了' }); } }
    normalizePackedPositions();
  }

  function runConveyor(dt) {
    if (!state.upgrades.conveyor) return; conveyorTimer -= dt; if (conveyorTimer > 0) return; conveyorTimer = conveyorInterval();
    const box = availableBox('inbound'), slot = freeRackSlot(); if (!box || slot == null) return;
    box.phase = 'rack'; box.rackSlot = slot; box.reservedBy = null; Object.assign(box, rackPosition(slot)); emit('conveyor', { text: '自動搬送が1箱処理' });
  }

  function updateSpawners(dt) {
    inboundTimer -= dt; orderTimer -= dt; overflowCooldown -= dt;
    if (inboundTimer <= 0) { inboundTimer += BASE.inboundInterval; spawnInbound(); }
    if (orderTimer <= 0) { orderTimer += BASE.orderInterval; const amount = Math.random() < 0.28 ? 2 : 1; state.ordersOpen += amount; emit('order', { text: `新規注文 +${amount}`, amount }); }
  }

  function contractReward(baseCash, baseResearch = 1) { return { cash: Math.round(baseCash * (1 + state.perks.contractBonus * 0.25)), research: baseResearch }; }
  function makeContract(kind) {
    const id = nextContractId++;
    if (kind === 'ship') { const target = 6 + Math.floor(Math.random() * 4); return { id, kind, title: `速配 ${target}件`, desc: `${target}件を期限内に出荷`, duration: 78, remaining: 78, target, progress: 0, startShipped: state.shipped, reward: contractReward(320 + target * 28) }; }
    if (kind === 'inbound') return { id, kind, title: '搬入口クリーン', desc: '搬入口4箱以下を28秒維持', duration: 92, remaining: 92, target: 28, progress: 0, reward: contractReward(420) };
    return { id, kind: 'throughput', title: '高効率運転', desc: '処理速度4/分以上を24秒維持', duration: 105, remaining: 105, target: 24, progress: 0, reward: contractReward(500) };
  }
  function generateContractOffers() { state.contractOffers = [...CONTRACT_KINDS].sort(() => Math.random() - 0.5).map(makeContract); emit('contract_offers', { text: '新しい契約候補が届いた' }); }
  function chooseContract(id) {
    if (state.activeContract) return { ok: false, reason: '契約進行中' };
    const contract = state.contractOffers.find((item) => item.id === Number(id)); if (!contract) return { ok: false, reason: '契約が見つかりません' };
    contract.startShipped = state.shipped; contract.progress = 0; contract.remaining = contract.duration; state.activeContract = { ...contract, reward: { ...contract.reward } }; state.contractOffers = [];
    emit('contract_start', { text: `契約開始: ${contract.title}` }); markDirty(); return { ok: true };
  }
  function finishContract(success) {
    const contract = state.activeContract; if (!contract) return;
    if (success) { state.money += contract.reward.cash; state.research += contract.reward.research; state.completedContracts += 1; emit('contract_complete', { text: `契約達成 +¥${contract.reward.cash} / 研究+${contract.reward.research}`, reward: contract.reward }); }
    else emit('contract_failed', { text: `契約失敗: ${contract.title}` });
    state.activeContract = null; offerCooldown = 5; markDirty();
  }
  function updateContract(dt) {
    if (!state.activeContract) { if (state.contractOffers.length === 0) { offerCooldown -= dt; if (offerCooldown <= 0) generateContractOffers(); } return; }
    const contract = state.activeContract, c = counts(); contract.remaining = Math.max(0, contract.remaining - dt);
    if (contract.kind === 'ship') contract.progress = Math.max(0, state.shipped - contract.startShipped);
    else if (contract.kind === 'inbound') contract.progress = c.inbound <= 4 ? contract.progress + dt : Math.max(0, contract.progress - dt * 0.7);
    else contract.progress = state.metrics.perMinute >= 4 ? contract.progress + dt : Math.max(0, contract.progress - dt * 0.5);
    if (contract.progress >= contract.target) finishContract(true); else if (contract.remaining <= 0) finishContract(false);
  }

  function updateMetrics() {
    while (shipmentTimes.length && simClock - shipmentTimes[0] > 60) shipmentTimes.shift(); state.metrics.perMinute = shipmentTimes.length;
    const c = counts(), ratios = { inbound: c.inbound / BASE.inboundMax, rack: c.rack / Math.max(1, rackCapacity()), orders: state.ordersOpen / Math.max(4, state.workers.length + 1), packed: c.packed / 4 };
    const [key, ratio] = Object.entries(ratios).sort((a, b) => b[1] - a[1])[0] || ['stable', 0], severity = ratio >= 1 ? 3 : ratio >= 0.78 ? 2 : ratio >= 0.58 ? 1 : 0;
    const table = { inbound: ['搬入口', '未処理の荷物が増えています', '入庫優先・スタッフ追加・自動搬送が有効'], rack: ['棚容量', '棚の空きが少なく流れが止まりやすい', '棚拡張か出庫優先で在庫を減らす'], orders: ['注文滞留', '注文に対して処理が追いついていません', '出庫優先・梱包設備・スタッフ強化が有効'], packed: ['出荷待ち', '梱包済み荷物が出口で滞留', '出荷優先を上げる'] };
    if (!severity) { state.director = { key: 'stable', label: '安定稼働', severity: 0, detail: '大きな詰まりはありません', recommendation: '次の契約と強化に備える', ratios }; state.status = '安定稼働'; }
    else { const [label, detail, recommendation] = table[key]; state.director = { key, label, severity, detail, recommendation, ratios }; state.status = `${severity >= 3 ? '⚠⚠' : '⚠'} ${label}: ${Math.round(ratio * 100)}%`; }
  }

  function update(realDt) {
    const scaled = clamp(realDt, 0, 0.05) * state.timeScale; if (scaled <= 0) { updateMetrics(); return; }
    simClock += scaled; updateSpawners(scaled); runConveyor(scaled); updatePacking(scaled); updateWorkers(scaled); updateMetrics(); updateContract(scaled);
  }
  function setPolicy(policy) { if (!['balanced', 'inbound', 'ship'].includes(policy)) return false; state.policy = policy; emit('policy', { text: policy === 'balanced' ? '方針: バランス' : policy === 'inbound' ? '方針: 入庫優先' : '方針: 出庫優先' }); markDirty(); return true; }
  function setPriority(kind, value) { if (!['store', 'pick', 'ship'].includes(kind)) return false; const next = clamp(Math.round(Number(value)), 1, 5); if (!Number.isFinite(next)) return false; state.priorities[kind] = next; emit('priority', { text: `${kind === 'store' ? '入庫' : kind === 'pick' ? '梱包' : '出荷'}優先度 ${next}` }); markDirty(); return true; }
  function setTimeScale(scale) { if (![0, 1, 2, 4].includes(scale)) return false; state.timeScale = scale; return true; }
  function purchaseUpgrade(type) { const def = UPGRADE_INFO[type], level = state.upgrades[type] ?? 0; if (!def) return { ok: false, reason: '不明な強化' }; if (level >= def.max) return { ok: false, reason: '最大レベル' }; const cost = upgradeCost(type); if (state.money < cost) return { ok: false, reason: '資金不足' }; state.money -= cost; state.upgrades[type] = level + 1; ensureWorkers(); conveyorTimer = 0; emit('upgrade', { text: `${def.label} Lv.${state.upgrades[type]}`, type }); markDirty(); return { ok: true, cost, level: state.upgrades[type] }; }
  function purchasePerk(type) { const def = PERK_INFO[type], level = state.perks[type] ?? 0; if (!def) return { ok: false, reason: '不明な研究' }; if (level >= def.max) return { ok: false, reason: '最大レベル' }; const cost = perkCost(type); if (state.research < cost) return { ok: false, reason: '研究ポイント不足' }; state.research -= cost; state.perks[type] = level + 1; emit('perk', { text: `${def.label} Lv.${state.perks[type]}`, type }); markDirty(); return { ok: true, cost, level: state.perks[type] }; }

  function hydrate(snapshot) {
    if (!snapshot || snapshot.schema_version !== 1) return;
    if (Number.isFinite(snapshot.money)) state.money = Math.max(0, snapshot.money);
    if (Number.isFinite(snapshot.research)) state.research = Math.max(0, Math.floor(snapshot.research));
    if (Number.isFinite(snapshot.shipped)) state.shipped = Math.max(0, snapshot.shipped);
    if (Number.isFinite(snapshot.completedContracts)) state.completedContracts = Math.max(0, Math.floor(snapshot.completedContracts));
    if (Number.isFinite(snapshot.milestoneAwarded)) state.milestoneAwarded = Math.max(0, Math.floor(snapshot.milestoneAwarded));
    if (['balanced', 'inbound', 'ship'].includes(snapshot.policy)) state.policy = snapshot.policy;
    if (snapshot.priorities) for (const key of ['store', 'pick', 'ship']) state.priorities[key] = clamp(Math.round(Number(snapshot.priorities[key] ?? state.priorities[key])), 1, 5);
    if (snapshot.upgrades) for (const [key, def] of Object.entries(UPGRADE_INFO)) state.upgrades[key] = clamp(Math.floor(Number(snapshot.upgrades[key] ?? 0)), 0, def.max);
    if (snapshot.perks) for (const [key, def] of Object.entries(PERK_INFO)) state.perks[key] = clamp(Math.floor(Number(snapshot.perks[key] ?? 0)), 0, def.max);
  }
  function serialize() { return { schema_version: 1, money: state.money, research: state.research, shipped: state.shipped, completedContracts: state.completedContracts, milestoneAwarded: state.milestoneAwarded, policy: state.policy, priorities: { ...state.priorities }, upgrades: { ...state.upgrades }, perks: { ...state.perks } }; }
  function consumeDirty() { const wasDirty = saveDirty; saveDirty = false; return wasDirty; }
  function resetProgress() {
    Object.assign(state, { money: 650, research: 0, shipped: 0, completedContracts: 0, milestoneAwarded: 0, policy: 'balanced', timeScale: 1, priorities: { store: 3, pick: 3, ship: 4 }, upgrades: { worker: 0, speed: 0, rack: 0, pack: 0, conveyor: 0 }, perks: { smartDispatch: 0, bulkPack: 0, contractBonus: 0 }, contractOffers: [], activeContract: null, ordersOpen: 2 });
    state.workers.splice(0); state.boxes.splice(0); nextWorkerId = 1; nextBoxId = 1; shipmentTimes.splice(0); simClock = 0; inboundTimer = 0.4; orderTimer = 3.0; offerCooldown = 0;
    ensureWorkers(); for (let i = 0; i < 6; i += 1) spawnInbound(); updateMetrics(); generateContractOffers(); markDirty();
  }

  hydrate(saved); ensureWorkers(); for (let i = 0; i < 6; i += 1) spawnInbound(); updateMetrics(); generateContractOffers();
  return { state, update, counts, rackCapacity, workerSpeed, packTime, conveyorInterval, upgradeCost, perkCost, upgradeInfo: UPGRADE_INFO, perkInfo: PERK_INFO, setPolicy, setPriority, setTimeScale, purchaseUpgrade, purchasePerk, chooseContract, serialize, consumeDirty, onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); }, resetProgress };
}

export { POS };
