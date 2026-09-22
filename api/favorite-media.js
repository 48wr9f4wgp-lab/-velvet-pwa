import { get, put, list } from "@vercel/blob";
import { isAuthorizedRequest } from "../lib/velvet-sync-auth.js";
import { readFavoriteLibrary } from "../lib/velvet-sync-journal.js";
import { createMediaStore, createMediaHandler } from "../lib/velvet-private-media.js";

const store = createMediaStore({ get, put, list });
export default {
  fetch: createMediaHandler({ authorize: isAuthorizedRequest, store, readLibrary: readFavoriteLibrary })
};
