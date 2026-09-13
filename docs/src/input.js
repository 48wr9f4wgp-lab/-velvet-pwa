export function createInput({ movePad, moveKnob, lookPad, canvas }) {
  const state = {
    moveX: 0,
    moveY: 0,
    lookDX: 0,
    lookDY: 0,
    keys: new Set(),
  };

  let movePointer = null;
  const moveOrigin = { x: 0, y: 0 };
  const maxRadius = 36;

  function updateMove(clientX, clientY) {
    const dx = clientX - moveOrigin.x;
    const dy = clientY - moveOrigin.y;
    const len = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, maxRadius / len);
    const px = dx * scale;
    const py = dy * scale;
    moveKnob.style.transform = `translate(${px}px, ${py}px)`;
    state.moveX = px / maxRadius;
    state.moveY = -py / maxRadius;
  }

  movePad.addEventListener('pointerdown', (event) => {
    movePointer = event.pointerId;
    const rect = movePad.getBoundingClientRect();
    moveOrigin.x = rect.left + rect.width / 2;
    moveOrigin.y = rect.top + rect.height / 2;
    movePad.setPointerCapture?.(event.pointerId);
    updateMove(event.clientX, event.clientY);
  });

  movePad.addEventListener('pointermove', (event) => {
    if (event.pointerId === movePointer) updateMove(event.clientX, event.clientY);
  });

  const endMove = (event) => {
    if (event.pointerId !== movePointer) return;
    movePointer = null;
    state.moveX = 0;
    state.moveY = 0;
    moveKnob.style.transform = 'translate(0, 0)';
  };
  movePad.addEventListener('pointerup', endMove);
  movePad.addEventListener('pointercancel', endMove);

  let lookPointer = null;
  let lookLastX = 0;
  let lookLastY = 0;

  function beginLook(event, target) {
    if (lookPointer !== null) return;
    lookPointer = event.pointerId;
    lookLastX = event.clientX;
    lookLastY = event.clientY;
    target.setPointerCapture?.(event.pointerId);
  }

  function moveLook(event) {
    if (event.pointerId !== lookPointer) return;
    state.lookDX += event.clientX - lookLastX;
    state.lookDY += event.clientY - lookLastY;
    lookLastX = event.clientX;
    lookLastY = event.clientY;
  }

  function endLook(event) {
    if (event.pointerId === lookPointer) lookPointer = null;
  }

  lookPad.addEventListener('pointerdown', (event) => beginLook(event, lookPad));
  lookPad.addEventListener('pointermove', moveLook);
  lookPad.addEventListener('pointerup', endLook);
  lookPad.addEventListener('pointercancel', endLook);

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') beginLook(event, canvas);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') moveLook(event);
  });
  canvas.addEventListener('pointerup', endLook);
  canvas.addEventListener('pointercancel', endLook);

  addEventListener('keydown', (event) => state.keys.add(event.code));
  addEventListener('keyup', (event) => state.keys.delete(event.code));
  addEventListener('blur', () => state.keys.clear());

  return {
    state,
    consumeLook() {
      const result = { x: state.lookDX, y: state.lookDY };
      state.lookDX = 0;
      state.lookDY = 0;
      return result;
    },
    movement() {
      let x = state.moveX;
      let y = state.moveY;
      if (state.keys.has('KeyA')) x -= 1;
      if (state.keys.has('KeyD')) x += 1;
      if (state.keys.has('KeyW')) y += 1;
      if (state.keys.has('KeyS')) y -= 1;
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      return { x, y };
    },
  };
}
