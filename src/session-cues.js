const backCue = document.querySelector("#sessionDragBack");
const nextCue = document.querySelector("#sessionDragNext");

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
