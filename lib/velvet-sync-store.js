import { get, put } from "@vercel/blob";
import { createFavoriteStore } from "./velvet-sync-store-v3.js";
export const { readFavoriteLibrary, unionFavoriteLibrary } = createFavoriteStore({ get, put });
