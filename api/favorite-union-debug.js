import { get } from "@vercel/blob";

const PATHS = {
  legacy: "velvet-sync/v1/favorites.json",
  scriptable: "velvet-sync/v2/clients/scriptable.json",
  pwa: "velvet-sync/v2/clients/pwa.json"
};

async function read(pathname) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result) return { items: [], orphan_ids: [], revision: 0, updated_at: null };
  const text = await new Response(result.stream).text();
  const parsed = JSON.parse(text);
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    orphan_ids: Array.isArray(parsed.orphan_ids) ? parsed.orphan_ids : [],
    revision: Number(parsed.revision || 0),
    updated_at: parsed.updated_at || null
  };
}

function fps(item) {
  return new Set(Array.isArray(item?.aliases?.fingerprints) ? item.aliases.fingerprints : []);
}

function overlaps(a, b) {
  const right = new Set(b.flatMap(item => [...fps(item)]));
  return a.filter(item => [...fps(item)].some(fp => right.has(fp)));
}

function visible(items) {
  return items.filter(item => String(item?.image_url || item?.thumb_url || "").trim()).length;
}

export default {
  async fetch() {
    const [legacy, scriptable, pwa] = await Promise.all([
      read(PATHS.legacy), read(PATHS.scriptable), read(PATHS.pwa)
    ]);
    const overlapSP = overlaps(scriptable.items, pwa.items).length;
    const scriptOnly = scriptable.items.length - overlapSP;
    const pwaOnly = pwa.items.length - overlaps(pwa.items, scriptable.items).length;

    return Response.json({
      legacy: { items: legacy.items.length, orphan_ids: legacy.orphan_ids.length, visible: visible(legacy.items), revision: legacy.revision, updated_at: legacy.updated_at },
      scriptable: { items: scriptable.items.length, orphan_ids: scriptable.orphan_ids.length, visible: visible(scriptable.items), revision: scriptable.revision, updated_at: scriptable.updated_at },
      pwa: { items: pwa.items.length, orphan_ids: pwa.orphan_ids.length, visible: visible(pwa.items), revision: pwa.revision, updated_at: pwa.updated_at },
      cross: { scriptable_pwa_overlap: overlapSP, scriptable_only_items: scriptOnly, pwa_only_items: pwaOnly }
    }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  }
};
