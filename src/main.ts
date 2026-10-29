import "./styles.css";
import { init, IIIFURLAdapter } from "universalviewer";
import "universalviewer/dist/esm/index.css";


const viewer = document.querySelector<HTMLDivElement>("#viewer");
const message = document.querySelector<HTMLElement>("#message");
const messageText = document.querySelector<HTMLParagraphElement>("#message-text");

const configMap = {
    "gen_man": "general_manifest.json",
    "gen_col": "general_collection.json",
    "mob_man": "mobile_manifest.json",
    "mob_col": "mobile_collection.json"
} as const;

function showError(text: string): void {
  if (viewer) viewer.hidden = false;
  if (message && messageText) {
    message.hidden = false;
    messageText.textContent = text;
  }
}

function isConfigKey(value: string): value is keyof typeof configMap {
  return Object.prototype.hasOwnProperty.call(configMap, value);
}

function isAllowedManifestUrl(value: string): boolean {
  try {
    const url = new URL(value, window.location.origin);
    const isDeployPreview = /^deploy-preview-\d+--(heritage-tudelft|delft-iiif)\.netlify\.app$/.test(url.hostname);
    const isAllowedHost = url.hostname === "localhost"
      || url.hostname === "heritage.tudelft.nl"
      || isDeployPreview;

    return (url.protocol === "http:" || url.protocol === "https:") && isAllowedHost;
  } catch {
    return false;
  }
}


// Arrows that step through the manifests of the collection instead of the canvases of one manifest.
// Only used for the *_col configs, and only when `collectionUrl` really is a collection with several manifests.
async function setupManifestNavigation(uv: ReturnType<typeof init>, collectionUrl: string): Promise<void> {
  const prev = document.querySelector<HTMLButtonElement>("#manifest-prev");
  const next = document.querySelector<HTMLButtonElement>("#manifest-next");
  if (!prev || !next) return;

  const response = await fetch(collectionUrl);
  if (!response.ok) throw new Error(`Unable to load collection (${response.status}).`);
  const collection = await response.json();
  if (collection.type !== "Collection" && collection["@type"] !== "sc:Collection") return;
  const manifestCount = (collection.items ?? collection.manifests ?? [])
    .filter((item: { type?: string; "@type"?: string }) => (item.type ?? item["@type"]) === "Manifest" || item["@type"] === "sc:Manifest").length;
  if (manifestCount < 2) return;

  // The viewer does not emit manifest changes (not from uv.set(), nor from the contents tree), so read the
  // index from the active extension. `pending` covers the gap while a manifest we asked for is still loading.
  type Handler = { extension?: { helper?: { manifestIndex?: number } } };
  let manifestIndex = 0;
  let pending: { index: number; until: number } | null = null;

  function update(): void {
    prev!.disabled = manifestIndex <= 0;
    next!.disabled = manifestIndex >= manifestCount - 1;
  }

  function sync(): void {
    const index = (uv.get() as Handler | undefined)?.extension?.helper?.manifestIndex;
    if (typeof index !== "number") return;
    if (pending) {
      if (index !== pending.index && Date.now() < pending.until) return;
      pending = null;
    }
    manifestIndex = index;
    update();
  }

  function goTo(index: number): void {
    if (index < 0 || index >= manifestCount) return;
    manifestIndex = index;
    pending = { index, until: Date.now() + 10000 };
    update();
    uv.set({ iiifManifestId: collectionUrl, collectionIndex: 0, manifestIndex: index, canvasIndex: 0 });
  }

  prev.addEventListener("click", () => { sync(); goTo(manifestIndex - 1); });
  next.addEventListener("click", () => { sync(); goTo(manifestIndex + 1); });

  // The viewer rebuilds its DOM on every uv.set() and tree selection, so re-sync after any change. This also keeps
  // the arrows clear of the side panels, which resize.
  let refreshPending = false;
  function refresh(): void {
    refreshPending = false;
    sync();
    const centerPanel = document.querySelector<HTMLElement>("#uv .centerPanel");
    if (!centerPanel) return;
    const rect = centerPanel.getBoundingClientRect();
    prev!.style.left = `${rect.left + 8}px`;
    next!.style.right = `${document.documentElement.clientWidth - rect.right + 8}px`;
  }
  new MutationObserver(() => {
    if (refreshPending) return;
    refreshPending = true;
    requestAnimationFrame(refresh);
  }).observe(document.querySelector("#uv")!, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"]
  });

  prev.hidden = false;
  next.hidden = false;
  document.body.classList.add("manifest-nav-active");
  refresh();
}

function configUrl(value: keyof typeof configMap): string {
  return `${import.meta.env.BASE_URL}configs/${configMap[value]}`;
}


async function loadViewer(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const manifest = params.get("manifest");
  const config = params.get("config");


  if (!manifest || !config) {
    showError("Add both config and manifest query parameters to open a manifest.");
    return;
  }

  if (!isAllowedManifestUrl(manifest)) {
    showError("Invalid manifest URL. Use localhost, heritage.tudelft.nl, or a Heritage deploy-preview URL.");
    return;
  }

  if (!isConfigKey(config)) {
    showError(`Invalid config. Choose one of: ${Object.keys(configMap).join(", ")}.`);
    return;
  }

  try {
    const response = await fetch(configUrl(config), { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load config (${response.status}).`);
    const configData = await response.json();

    const urlAdapter = new IIIFURLAdapter(true);

    const d = urlAdapter.getInitialData({
      iiifManifestId: manifest,
      embedded: true,
    });

    const uv = init("uv", d);


    uv.on("configure", function({ cb }: { config: unknown; cb: (config: unknown) => void }) {
      cb(configData);
    });

    if (config.endsWith("_col")) {
      void setupManifestNavigation(uv, manifest).catch(() => { /* viewer still works without the arrows */ });
    }

    if (viewer) viewer.hidden = true;
    if (message) message.hidden = true;
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unable to load the viewer.");
  }
}

void loadViewer();