// Velvet Feed Sync loader — public PWA
(async () => {
  const URL = "https://raw.githubusercontent.com/48wr9f4wgp-lab/-velvet-pwa/main/velvet-feed-sync.js";
  const req = new Request(`${URL}?t=${Date.now()}`);
  req.timeoutInterval = 20;
  req.headers = {
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "User-Agent": "VelvetFeedSyncLoader/2"
  };
  const code = await req.loadString();
  if (!code || code.length < 1000) throw new Error("Velvet Feed Sync unavailable");
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  await new AsyncFunction(code)();
})();
