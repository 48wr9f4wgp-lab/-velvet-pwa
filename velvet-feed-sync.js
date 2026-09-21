// Velvet Feed Sync v1.2.3-public — dedicated public PWA publisher
// Reassembles the validated v1.1.0 engine, applies the approved Mix composition,
// and publishes only shared feed data to this public repository.
(async () => {
  const OWNER = "48wr9f4wgp-lab";
  const REPO = "-velvet-pwa";
  const BRANCH = "main";
  const PART_COUNT = 9;
  const ROOT = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/feed-base`;

  const chunks = [];
  for (let i = 1; i <= PART_COUNT; i++) {
    const part = String(i).padStart(2, "0");
    const req = new Request(`${ROOT}/part-${part}.txt?t=${Date.now()}-${i}`);
    req.timeoutInterval = 20;
    req.headers = {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "User-Agent": "VelvetFeedSync/1.2.3-public"
    };
    const text = await req.loadString();
    if (!text || text.length < 20) throw new Error(`Feed engine part ${part} unavailable`);
    chunks.push(text);
  }

  let code = chunks.join("\n");
  if (code.length < 10000) throw new Error("Velvet Feed Sync base incomplete");

  const engineIife = "(async () => {";
  if (!code.includes(engineIife)) throw new Error("Velvet Feed Sync engine IIFE missing");
  code = code.replace(engineIife, "return await (async () => {");

  const oldSourceTail = '    TGAV2: { name: "TGAV2", label: "TGAV2", sourceClass: "pro", site: "https://twiigle.com", url: "https://twiigle.com/trend.html" }\n  });';
  const newSourceTail = '    TGAV2: { name: "TGAV2", label: "TGAV2", sourceClass: "pro", site: "https://twiigle.com", url: "https://twiigle.com/trend.html" },\n    TG1W: { name: "TG1W", label: "TG1週間", sourceClass: "mixed", site: "https://twiigle.com", url: "https://twiigle.com/1w.html" }\n  });';

  const oldMix = `    mix: {
      stimulusMax: false,
      sources: {
        TGUra: { adultTrust: true, jpTrust: true, femaleBias: 0.20, preference: 0.96, exposureBias: 0.14, runCap: 4, maxRank: 40 },
        TGAma: { adultTrust: true, jpTrust: true, femaleBias: 0.16, preference: 0.94, exposureBias: 0.10, runCap: 3, maxRank: 40 },
        TGAV1: { adultTrust: true, jpTrust: true, femaleBias: 0.08, preference: 0.82, exposureBias: 0.18, runCap: 2, maxRank: 30 },
        TGAV2: { adultTrust: true, jpTrust: true, femaleBias: 0.08, preference: 0.86, exposureBias: 0.22, runCap: 1, maxRank: 30 }
      }
    },`;

  const newMix = `    mix: {
      stimulusMax: false,
      sources: {
        TGAV1: { adultTrust: true, jpTrust: true, femaleBias: 0.08, preference: 1.04, exposureBias: 0.20, runCap: 8, maxRank: 30, targetShare: 0.40 },
        TG1W: { adultTrust: true, jpTrust: true, femaleBias: 0.10, preference: 1.02, exposureBias: 0.12, runCap: 7, maxRank: 50, targetShare: 0.35 },
        TGAV2: { adultTrust: true, jpTrust: true, femaleBias: 0.08, preference: 1.00, exposureBias: 0.22, runCap: 3, maxRank: 30, targetShare: 0.15 },
        TGUra: { adultTrust: true, jpTrust: true, femaleBias: 0.20, preference: 0.96, exposureBias: 0.14, runCap: 2, maxRank: 40, targetShare: 0.10 }
      }
    },`;

  const patches = [
    ['// Velvet Feed Sync v1.1.0', '// Velvet Feed Sync v1.2.3-public'],
    ['const VERSION = "1.1.0";', 'const VERSION = "1.2.3-public";'],
    ['const CANONICAL_BASELINE = "Velvet v0.9.3";', 'const CANONICAL_BASELINE = "Velvet v0.9.6 + Exposure Compatibility 2026-09-19";'],
    ['const REPO = "eros-hub";', 'const REPO = "-velvet-pwa";'],
    ['const TARGET_BRANCH = "velvet-pages";', 'const TARGET_BRANCH = "main";'],
    ['const TOKEN_KEY = "velvet_feed_sync_github_token_v1";', 'const TOKEN_KEY = "velvet_feed_sync_github_token_public_v1";'],
    ['対象repoは eros-hub、権限は Contents: Read and write だけでOK。', '対象repoは -velvet-pwa、権限は Contents: Read and write だけでOK。'],
    [oldSourceTail, newSourceTail],
    [oldMix, newMix],
    ['        run_cap: Number(sourceDef.runCap || 3),\n        max_rank: Number(sourceDef.maxRank || 100),', '        run_cap: Number(sourceDef.runCap || 3),\n        target_share: Number(sourceDef.targetShare || 0),\n        max_rank: Number(sourceDef.maxRank || 100),']
  ];

  for (const [from, to] of patches) {
    if (!code.includes(from)) throw new Error(`Velvet Feed Sync patch anchor missing: ${from.slice(0, 72)}`);
    code = code.replace(from, to);
  }

  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  await new AsyncFunction(code)();
})();
