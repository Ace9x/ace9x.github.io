/** Turn pasted Spotify, Apple Music, and YouTube links into safe embed URLs. */

import { isPlaceholder } from "./payments.js";

function asHttps(value) {
  if (isPlaceholder(value)) return null;
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return url;
}

function spotifyEmbed(value) {
  const url = asHttps(value);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "open.spotify.com") return null;
  if (url.pathname.startsWith("/embed/")) {
    const openPath = url.pathname.replace(/^\/embed\//, "");
    return {
      src: url.toString(),
      openUrl: `https://open.spotify.com/${openPath}`,
    };
  }
  const match = url.pathname.match(/^\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)\/?$/);
  if (!match) return null;
  return {
    src: `https://open.spotify.com/embed/${match[1]}/${match[2]}`,
    openUrl: `https://open.spotify.com/${match[1]}/${match[2]}`,
  };
}

function appleEmbed(value) {
  const url = asHttps(value);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, "");
  if (host === "embed.music.apple.com") {
    const open = new URL(url.toString());
    open.hostname = "music.apple.com";
    return { src: url.toString(), openUrl: open.toString() };
  }
  if (host === "music.apple.com") {
    const embed = new URL(url.toString());
    embed.hostname = "embed.music.apple.com";
    return { src: embed.toString(), openUrl: url.toString() };
  }
  return null;
}

export function youtubeId(value) {
  if (isPlaceholder(value)) return null;
  const text = String(value).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  const url = asHttps(text);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, "");
  const idPattern = /^[A-Za-z0-9_-]{11}$/;
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] || "";
    return idPattern.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "m.youtube.com") {
    const watch = url.searchParams.get("v") || "";
    if (idPattern.test(watch)) return watch;
    const parts = url.pathname.split("/").filter(Boolean);
    const marker = parts.findIndex((part) => part === "embed" || part === "shorts" || part === "live");
    const id = marker >= 0 ? parts[marker + 1] : "";
    return idPattern.test(id || "") ? id : null;
  }
  return null;
}

function youtubeEmbed(value) {
  const id = youtubeId(value);
  if (!id) return null;
  return {
    src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
    openUrl: `https://www.youtube.com/watch?v=${id}`,
  };
}

export function buildEmbeds(release) {
  return {
    spotify: spotifyEmbed(release?.spotify),
    apple: appleEmbed(release?.apple),
    youtube: youtubeEmbed(release?.youtube),
  };
}
