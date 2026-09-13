const card = document.querySelector("#sessionMediaCard");

function ensureCue(id, className, text) {
  let cue = document.querySelector(`#${id}`);
  if (cue || !card) return cue;
  cue = document.createElement("div");
  cue.id = id;
  cue.className = `drag-cue ${className}`;
  cue.textContent = text;
  cue.setAttribute("aria-hidden", "true");
  card.append(cue);
  return cue;
}

const backCue = ensureCue("sessionDragBack", "drag-cue--like", "戻る");
const nextCue = ensureCue("sessionDragNext", "drag-cue--skip", "進む");

function reset() {
  backCue?.style.setProperty("opacity", "0");
  nextCue?.style.setProperty("opacity", "0");
}

window.addEventListener("velvet:gesture-progress", event => {
  if (event.detail?.scope !== "session") return;
  const pct = Number(event.detail?.pct) || 0;
  backCue?.style.setProperty("opacity", String(Math.max(0, Math.min(1, pct * 1.15))));
  nextCue?.style.setProperty("opacity", String(Math.max(0, Math.min(1, -pct * 1.15))));
});

window.addEventListener("velvet:gesture-end", event => {
  if (event.detail?.scope === "session") reset();
});

window.addEventListener("velvet:session-item", reset);
reset();
