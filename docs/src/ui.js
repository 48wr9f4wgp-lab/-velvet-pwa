function yen(value) {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

export function bindUi(sim, sceneView) {
  const el = {
    money: document.getElementById('money'),
    shipped: document.getElementById('shipped'),
    orders: document.getElementById('orders'),
    inbound: document.getElementById('inbound'),
    rack: document.getElementById('rack'),
    throughput: document.getElementById('throughput'),
    workers: document.getElementById('workers'),
    status: document.getElementById('status'),
    toast: document.getElementById('toast'),
    reset: document.getElementById('resetBtn'),
    camera: document.getElementById('cameraBtn'),
  };

  const policyButtons = [...document.querySelectorAll('[data-policy]')];
  const speedButtons = [...document.querySelectorAll('[data-speed]')];
  const upgradeButtons = [...document.querySelectorAll('[data-upgrade]')];
  let toastTimer = 0;

  function toast(text, tone = 'normal') {
    clearTimeout(toastTimer);
    el.toast.textContent = text;
    el.toast.dataset.tone = tone;
    el.toast.classList.add('show');
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1450);
  }

  policyButtons.forEach((button) => {
    button.addEventListener('click', () => {
      sim.setPolicy(button.dataset.policy);
      try { navigator.vibrate?.(10); } catch {}
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
        toast(`強化完了 -${yen(result.cost)}`, 'good');
        try { navigator.vibrate?.(18); } catch {}
      }
      render();
    });
  });

  el.camera.addEventListener('click', () => sceneView.resetCamera());
  el.reset.addEventListener('click', () => {
    if (!confirm('進行・強化を初期状態へ戻しますか？')) return;
    localStorage.removeItem('observer_logistics_save');
    sim.resetProgress();
    toast('初期状態へ戻した', 'warn');
    render();
  });

  sim.onEvent((event) => {
    if (event.type === 'shipment') toast(event.text, 'good');
    else if (event.type === 'overflow') toast(event.text, 'warn');
    else if (event.type === 'upgrade') toast(event.text, 'good');
    else if (event.type === 'order') toast(event.text);
  });

  function render() {
    const c = sim.counts();
    const s = sim.state;
    el.money.textContent = yen(s.money);
    el.shipped.textContent = s.shipped.toLocaleString('ja-JP');
    el.orders.textContent = s.ordersOpen.toLocaleString('ja-JP');
    el.inbound.textContent = c.inbound.toLocaleString('ja-JP');
    el.rack.textContent = `${c.rack} / ${sim.rackCapacity()}`;
    el.throughput.textContent = `${s.metrics.perMinute}/分`;
    el.workers.textContent = `${s.workers.length}人`;
    el.status.textContent = s.status;
    el.status.dataset.alert = s.status.startsWith('⚠') ? 'true' : 'false';

    policyButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.policy === s.policy);
    });
    speedButtons.forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.speed) === s.timeScale);
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
  }

  render();
  return { render, toast };
}
