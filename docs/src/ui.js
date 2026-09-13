function yen(value) {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

function contractProgressText(contract) {
  if (!contract) return '';
  const current = Math.min(contract.target, contract.progress || 0);
  if (contract.kind === 'ship') return `${Math.floor(current)} / ${contract.target}件`;
  return `${Math.floor(current)} / ${contract.target}秒`;
}

export function bindUi(sim, sceneView) {
  const el = {
    money: document.getElementById('money'), research: document.getElementById('research'),
    shipped: document.getElementById('shipped'), orders: document.getElementById('orders'),
    inbound: document.getElementById('inbound'), rack: document.getElementById('rack'),
    throughput: document.getElementById('throughput'), workers: document.getElementById('workers'),
    status: document.getElementById('status'), toast: document.getElementById('toast'),
    reset: document.getElementById('resetBtn'), camera: document.getElementById('cameraBtn'),
    directorLabel: document.getElementById('directorLabel'), directorDetail: document.getElementById('directorDetail'),
    directorRecommendation: document.getElementById('directorRecommendation'), severityBadge: document.getElementById('severityBadge'),
    contractTitle: document.getElementById('contractTitle'), contractBody: document.getElementById('contractBody'),
    contractChoices: document.getElementById('contractChoices'),
  };

  const policyButtons = [...document.querySelectorAll('[data-policy]')];
  const speedButtons = [...document.querySelectorAll('[data-speed]')];
  const upgradeButtons = [...document.querySelectorAll('[data-upgrade]')];
  const perkButtons = [...document.querySelectorAll('[data-perk]')];
  const priorityButtons = [...document.querySelectorAll('[data-priority-kind]')];
  let toastTimer = 0;
  let lastOfferSignature = '';

  function toast(text, tone = 'normal') {
    clearTimeout(toastTimer);
    el.toast.textContent = text;
    el.toast.dataset.tone = tone;
    el.toast.classList.add('show');
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1500);
  }

  policyButtons.forEach((button) => {
    button.addEventListener('click', () => {
      sim.setPolicy(button.dataset.policy);
      try { navigator.vibrate?.(10); } catch {}
      render();
    });
  });

  priorityButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.dataset.priorityKind;
      const delta = Number(button.dataset.delta || 0);
      sim.setPriority(kind, (sim.state.priorities[kind] || 3) + delta);
      render();
    });
  });

  speedButtons.forEach((button) => {
    button.addEventListener('click', () => {
      sim.setTimeScale(Number(button.dataset.speed));
      render();
    });
  });

  upgradeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.upgrade;
      const result = sim.purchaseUpgrade(type);
      if (!result.ok) toast(result.reason, 'warn');
      else {
        toast(`設備強化 -${yen(result.cost)}`, 'good');
        try { navigator.vibrate?.(18); } catch {}
      }
      render();
    });
  });

  perkButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.perk;
      const result = sim.purchasePerk(type);
      if (!result.ok) toast(result.reason, 'warn');
      else {
        toast(`研究完了 -${result.cost} RP`, 'good');
        try { navigator.vibrate?.(18); } catch {}
      }
      render();
    });
  });

  el.camera.addEventListener('click', () => sceneView.resetCamera());
  el.reset.addEventListener('click', () => {
    if (!confirm('進行・強化・研究を初期状態へ戻しますか？')) return;
    localStorage.removeItem('observer_logistics_save');
    sim.resetProgress();
    toast('初期状態へ戻した', 'warn');
    render();
  });

  sim.onEvent((event) => {
    if (event.type === 'shipment') toast(event.text, 'good');
    else if (event.type === 'overflow') toast(event.text, 'warn');
    else if (event.type === 'upgrade' || event.type === 'perk') toast(event.text, 'good');
    else if (event.type === 'contract_complete' || event.type === 'milestone') toast(event.text, 'good');
    else if (event.type === 'contract_failed') toast(event.text, 'warn');
    else if (event.type === 'order') toast(event.text);
  });

  function renderContracts() {
    const active = sim.state.activeContract;
    if (active) {
      lastOfferSignature = '';
      el.contractTitle.textContent = active.title;
      const percent = Math.min(100, Math.round((active.progress / Math.max(1, active.target)) * 100));
      el.contractBody.innerHTML = `<div class="contractDesc">${active.desc}</div><div class="contractProgress"><i style="width:${percent}%"></i></div><div class="contractMeta"><span>${contractProgressText(active)}</span><span>残り ${Math.ceil(active.remaining)}秒</span><span>報酬 ${yen(active.reward.cash)} + ${active.reward.research}RP</span></div>`;
      el.contractChoices.innerHTML = '';
      return;
    }

    const offers = sim.state.contractOffers || [];
    const signature = offers.map((item) => item.id).join(',');
    el.contractTitle.textContent = offers.length ? '契約を1つ選択' : '次の契約を準備中';
    el.contractBody.innerHTML = offers.length ? '<div class="contractDesc">短い目標を選び、施設の方針を切り替えて達成する。</div>' : '';
    if (signature === lastOfferSignature) return;
    lastOfferSignature = signature;
    el.contractChoices.innerHTML = '';
    for (const offer of offers) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'contractChoice';
      button.innerHTML = `<strong>${offer.title}</strong><span>${offer.desc}</span><small>${yen(offer.reward.cash)} + ${offer.reward.research}RP</small>`;
      button.addEventListener('click', () => {
        const result = sim.chooseContract(offer.id);
        if (!result.ok) toast(result.reason, 'warn');
        else toast(`契約開始: ${offer.title}`);
        render();
      });
      el.contractChoices.appendChild(button);
    }
  }

  function render() {
    const c = sim.counts();
    const s = sim.state;
    const d = s.director;
    el.money.textContent = yen(s.money);
    el.research.textContent = `${s.research} RP`;
    el.shipped.textContent = s.shipped.toLocaleString('ja-JP');
    el.orders.textContent = s.ordersOpen.toLocaleString('ja-JP');
    el.inbound.textContent = c.inbound.toLocaleString('ja-JP');
    el.rack.textContent = `${c.rack} / ${sim.rackCapacity()}`;
    el.throughput.textContent = `${s.metrics.perMinute}/分`;
    el.workers.textContent = `${s.workers.length}人`;
    el.status.textContent = s.status;
    el.status.dataset.alert = s.status.startsWith('⚠') ? 'true' : 'false';

    el.directorLabel.textContent = d.label;
    el.directorDetail.textContent = d.detail;
    el.directorRecommendation.textContent = `→ ${d.recommendation}`;
    el.severityBadge.textContent = d.severity === 0 ? 'OK' : d.severity === 1 ? '注意' : d.severity === 2 ? '混雑' : '危険';
    el.severityBadge.dataset.level = String(d.severity);

    policyButtons.forEach((button) => button.classList.toggle('active', button.dataset.policy === s.policy));
    speedButtons.forEach((button) => button.classList.toggle('active', Number(button.dataset.speed) === s.timeScale));

    document.querySelectorAll('[data-priority]').forEach((row) => {
      const key = row.dataset.priority;
      const valueNode = row.querySelector('[data-priority-value]');
      if (valueNode) valueNode.textContent = String(s.priorities[key]);
      row.dataset.level = String(s.priorities[key]);
    });

    upgradeButtons.forEach((button) => {
      const type = button.dataset.upgrade;
      const def = sim.upgradeInfo[type];
      const level = s.upgrades[type];
      const maxed = level >= def.max;
      const cost = sim.upgradeCost(type);
      const levelNode = button.querySelector('[data-level]');
      const costNode = button.querySelector('[data-cost]');
      if (levelNode) levelNode.textContent = `Lv.${level}/${def.max}`;
      if (costNode) costNode.textContent = maxed ? 'MAX' : yen(cost);
      button.disabled = maxed || (!maxed && s.money < cost);
    });

    perkButtons.forEach((button) => {
      const type = button.dataset.perk;
      const def = sim.perkInfo[type];
      const level = s.perks[type];
      const maxed = level >= def.max;
      const cost = sim.perkCost(type);
      const levelNode = button.querySelector('[data-level]');
      const costNode = button.querySelector('[data-cost]');
      if (levelNode) levelNode.textContent = `Lv.${level}/${def.max}`;
      if (costNode) costNode.textContent = maxed ? 'MAX' : `${cost} RP`;
      button.disabled = maxed || (!maxed && s.research < cost);
      button.title = def.desc;
    });

    renderContracts();
  }

  render();
  return { render, toast };
}
