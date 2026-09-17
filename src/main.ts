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

    if (viewer) viewer.hidden = true;
    if (message) message.hidden = true;
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unable to load the viewer.");
  }
}

void loadViewer();