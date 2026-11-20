import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";
import { buildEmbeds, youtubeId } from "./embeds.js";
import { SUPABASE_KEY, SUPABASE_URL } from "./config.js";
import { httpsUrl, paymentLink } from "./payments.js";

const CART_KEY = "wickedlyfe-cart";
const TALK_KEY = "wl-talk-at";
const SETTINGS_CORE =
  "id,brand_name,tagline,bio,logo_url,music_url,instagram_url,accent_color,announcement,stripe_link,paypal_link";
const SETTINGS_COLUMNS = `${SETTINGS_CORE},payment_link`;
const MUSIC_COLUMNS =
  "id,kind,title,artist,release_type,release_date,artwork_url,blurb,spotify_url,apple_url,youtube_url,page_url,featured,badge,sort_order";
const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const state = {
  site: null,
  currency: "USD",
  products: [],
  releases: [],
  videos: [],
  query: "",
  cart: [],
  activeReleaseId: null,
};

const quick = { id: null, size: null, qty: 1 };
let checkoutLines = [];
const dialogToken = new WeakMap();

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const $ = (selector, root = document) => root.querySelector(selector);

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = String(value);
    else if (key === "text") node.textContent = String(value);
    else if (key === "hidden") node.hidden = true;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function money(amount) {
  const currency = state.currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `$${Number(amount).toFixed(0)}`;
  }
}

function formatSize(size) {
  return size === "OS" ? "One size" : size;
}

function priceLine(product, qty = 1) {
  if (product.soldOut) {
    return el("span", { class: "price" }, [el("span", { class: "sold-label", text: "Sold out" })]);
  }
  if (product.priceLabel) return el("span", { class: "price", text: product.priceLabel });
  return el("span", { class: "price", text: money(product.price * qty) });
}

function productById(id) {
  return state.products.find((item) => item.id === id) || null;
}

function normalizeProduct(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  const name = String(raw.name || "").trim();
  const priceLabel = String(raw.priceLabel || "").trim();
  const soldOut = Boolean(raw.soldOut);
  const priceNum = raw.price === null || raw.price === "" ? NaN : Number(raw.price);
  const price = Number.isFinite(priceNum) ? priceNum : null;
  if (!id || !name) return null;
  if (!soldOut && !priceLabel && price === null) return null;
  const sizes = Array.isArray(raw.sizes) && raw.sizes.length ? raw.sizes.map((size) => String(size)) : ["OS"];
  const images = Array.isArray(raw.images) ? raw.images.map((item) => String(item)).filter(Boolean) : [];
  return {
    id,
    name,
    price,
    priceLabel,
    soldOut,
    sample: Boolean(raw.sample),
    featured: Boolean(raw.featured),
    image: String(raw.image || images[0] || ""),
    images,
    alt: String(raw.alt || name),
    description: String(raw.description || ""),
    sizes,
    payments: raw.payments && typeof raw.payments === "object" ? raw.payments : {},
    paymentsBySize: raw.paymentsBySize && typeof raw.paymentsBySize === "object" ? raw.paymentsBySize : {},
  };
}

function normalizeRelease(raw) {
  if (!raw || !raw.id || !raw.title) return null;
  return {
    id: String(raw.id),
    title: String(raw.title),
    artist: String(raw.artist || ""),
    type: String(raw.type || "Release"),
    year: String(raw.year || ""),
    featured: Boolean(raw.featured),
    cover: String(raw.cover || ""),
    blurb: String(raw.blurb || ""),
    spotify: String(raw.spotify || ""),
    apple: String(raw.apple || ""),
    youtube: String(raw.youtube || ""),
    page: String(raw.page || ""),
    badge: String(raw.badge || ""),
  };
}

function normalizeVideo(raw) {
  if (!raw || !raw.title) return null;
  return {
    id: String(raw.id || raw.title),
    title: String(raw.title),
    youtube: String(raw.youtube || ""),
    poster: String(raw.poster || "assets/hero-night.jpg"),
  };
}

function loadCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((line) => ({
      id: String(line.id || ""),
      size: String(line.size || ""),
      qty: Number(line.qty) || 1,
    }));
  } catch {
    return [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  } catch {
    /* Storage can be blocked. The cart still works for this visit. */
  }
}

function validLine(line) {
  const product = productById(line.id);
  if (!product || !product.sizes.includes(line.size)) return false;
  if (!Number.isFinite(line.qty) || line.qty < 1) return false;
  line.qty = Math.min(10, Math.floor(line.qty));
  return true;
}

function cartCount() {
  return state.cart.reduce((total, line) => total + line.qty, 0);
}

function bumpCount() {
  const badge = $("#cart-count");
  if (!badge) return;
  badge.classList.remove("bump");
  void badge.offsetWidth;
  badge.classList.add("bump");
}

function watchImage(image) {
  image.addEventListener("error", () => {
    image.classList.add("is-missing");
    image.removeAttribute("src");
  });
}

function syncExpanded() {
  document.querySelectorAll("[data-open]").forEach((button) => {
    const dialog = document.getElementById(button.dataset.open);
    if (dialog) button.setAttribute("aria-expanded", dialog.open ? "true" : "false");
  });
}

function openDialog(dialog) {
  if (!dialog) return;
  document.querySelectorAll("dialog[open]").forEach((other) => {
    if (other !== dialog) {
      dialogToken.set(other, (dialogToken.get(other) || 0) + 1);
      other.classList.remove("is-in");
      other.close();
    }
  });
  dialogToken.set(dialog, (dialogToken.get(dialog) || 0) + 1);
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => dialog.classList.add("is-in"));
  dialog.querySelector("[data-autofocus]")?.focus();
  syncExpanded();
}

function closeDialog(dialog) {
  if (!dialog?.open) return;
  const token = (dialogToken.get(dialog) || 0) + 1;
  dialogToken.set(dialog, token);
  dialog.classList.remove("is-in");
  window.setTimeout(() => {
    if (dialogToken.get(dialog) !== token) return;
    if (dialog.open) dialog.close();
    syncExpanded();
  }, prefersReducedMotion() ? 0 : 260);
}

function jumpTo(selector) {
  document.querySelectorAll("dialog[open]").forEach((dialog) => {
    dialogToken.set(dialog, (dialogToken.get(dialog) || 0) + 1);
    dialog.classList.remove("is-in");
    dialog.close();
  });
  syncExpanded();
  const target = document.querySelector(selector);
  if (!target) return;
  target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
  history.pushState(null, "", selector);
}

function setSearch(open) {
  const panel = $("#search-panel");
  const button = $("#search-open");
  const input = $("#search-input");
  if (!panel || !button || !input) return;
  panel.hidden = !open;
  button.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    input.focus();
    $("#shop")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
  } else {
    input.value = "";
    state.query = "";
    renderProducts();
  }
}

function renderProducts() {
  const grid = $("#product-grid");
  if (!grid) return;
  const query = state.query.trim().toLowerCase();
  const items = state.products.filter((product) => {
    if (!query) return true;
    return `${product.name} ${product.description}`.toLowerCase().includes(query);
  });
  if (!items.length) {
    const message = query ? `Nothing matches “${state.query.trim()}”.` : "Nothing in the shop yet.";
    grid.replaceChildren(el("p", { class: "empty", text: message }));
  } else {
    grid.replaceChildren(...items.map((product, index) => productCard(product, index)));
  }
  grid.setAttribute("aria-busy", "false");
  const status = $("#filter-status");
  if (status) {
    status.textContent = query
      ? `${items.length} ${items.length === 1 ? "piece matches" : "pieces match"} ${state.query.trim()}.`
      : "";
  }
  const count = $("#result-count");
  if (count) {
    const noun = state.products.length === 1 ? "piece" : "pieces";
    count.textContent = query ? `${items.length} shown` : `${state.products.length} ${noun}`;
  }
}

function productCard(product, index) {
  const image = el("img", {
    src: product.image,
    alt: product.alt,
    width: "1024",
    height: "1024",
    decoding: "async",
    loading: index < 2 ? "eager" : "lazy",
  });
  watchImage(image);
  return el("article", { class: "card" }, [
    el(
      "button",
      {
        type: "button",
        class: "card-open",
        "data-quick": product.id,
        "aria-label": product.soldOut
          ? `${product.name}, sold out`
          : `View ${product.name}, ${product.priceLabel || money(product.price)}`,
      },
      [
        el("span", { class: "card-media" }, [
          image,
          product.soldOut ? el("span", { class: "flag sold", text: "Sold out" }) : null,
          el("span", { class: "quick-label", text: product.soldOut ? "Sold out" : "View" }),
        ]),
        el("span", { class: "card-name", text: product.name }),
        priceLine(product),
      ],
    ),
  ]);
}

function checkoutUrl() {
  return paymentLink(state.brand?.payment_link);
}

function instagramUrl() {
  return httpsUrl(state.brand?.instagram_url) || httpsUrl("https://www.instagram.com/wickedlyfe_inc");
}

function applyCheckoutLink() {
  const link = $("#pay-continue");
  if (link) {
    link.href = checkoutUrl();
    link.target = "_blank";
    link.rel = "noopener";
  }
  const ig = $("#pay-ig");
  const igUrl = instagramUrl();
  if (ig && igUrl) ig.href = igUrl.toString();
}

function paymentNote(className) {
  const ig = instagramUrl();
  return el("p", { class: className }, [
    "Jim is a payment request link. In the payment note, enter the item name, size, and price. Then DM ",
    ig
      ? el("a", { href: ig.toString(), target: "_blank", rel: "noopener", text: "@wickedlyfe_inc" })
      : "@wickedlyfe_inc",
    " on Instagram with your shipping address.",
  ]);
}

function lineSummary(line) {
  const product = line.product;
  const price = product.priceLabel || (Number.isFinite(product.price) ? money(product.price) : "");
  const parts = [product.name, formatSize(line.size)];
  if (price) parts.push(price);
  if (line.qty > 1) parts.push(`×${line.qty}`);
  return parts.join(" · ");
}

function openPayNote(lines) {
  const box = $("#pay-items");
  if (!box || !lines.length) return;
  applyCheckoutLink();
  box.replaceChildren(...lines.map((line) => el("p", { text: lineSummary(line) })));
  openDialog($("#pay-dialog"));
}

function fillPay(container, product) {
  container.replaceChildren();
  if (product.soldOut) {
    container.append(el("p", { class: "pay-note", text: "Sold out." }));
    return;
  }
  container.append(paymentNote("pay-note"));
}

function renderQuick() {
  const product = productById(quick.id);
  const body = $("#qv-body");
  if (!product || !body) return;
  const sizes = el("div", { class: "sizes", role: "radiogroup", "aria-label": `Size for ${product.name}` });
  product.sizes.forEach((size, index) => {
    const selected = quick.size === size;
    sizes.append(
      el("button", {
        type: "button",
        class: "size-btn",
        role: "radio",
        "data-size": size,
        "aria-checked": selected ? "true" : "false",
        tabindex: selected || (!quick.size && index === 0) ? "0" : "-1",
        text: formatSize(size),
      }),
    );
  });
  const pay = el("div", { id: "qv-pay", class: "pay-slot" });
  const photo = el("img", { src: product.image, alt: product.alt, width: "1024", height: "1024" });
  watchImage(photo);
  body.replaceChildren(
    el("div", { class: "qv" }, [
      el("div", { class: "qv-photo" }, [photo]),
      el("div", { class: "qv-info" }, [
        product.soldOut ? el("p", { class: "eyebrow", text: "Sold out" }) : null,
        el("h2", { id: "qv-name", text: product.name }),
        priceLine(product),
        el("p", { class: "help", text: product.description }),
        el("div", { class: "field" }, [
          el("div", { class: "label-row" }, [
            el("span", { class: "label", id: "size-label", text: "Size" }),
            el("span", { id: "qv-error", class: "field-error", role: "alert" }),
          ]),
          sizes,
        ]),
        el("div", { class: "field" }, [
          el("span", { class: "label", text: "Quantity" }),
          el("div", { class: "qty" }, [
            el("button", {
              type: "button",
              id: "qv-minus",
              "data-qty": "-1",
              "aria-label": "Decrease quantity",
              disabled: quick.qty <= 1,
              text: "–",
            }),
            el("span", { id: "qv-qty", text: String(quick.qty) }),
            el("button", {
              type: "button",
              id: "qv-plus",
              "data-qty": "1",
              "aria-label": "Increase quantity",
              disabled: quick.qty >= 10,
              text: "+",
            }),
          ]),
        ]),
        pay,
        product.soldOut
          ? null
          : el("button", {
              type: "button",
              class: "btn btn-block",
              "data-buy": "true",
              text: "Buy",
            }),
        product.soldOut
          ? null
          : el("button", {
              type: "button",
              class: "btn btn-ghost btn-block",
              "data-add": "true",
              text: "Add to cart",
            }),
      ]),
    ]),
  );
  sizes.setAttribute("aria-labelledby", "size-label");
  fillPay(pay, product);
  $("#quick-view")?.setAttribute("aria-labelledby", "qv-name");
}

function openQuick(id) {
  const product = productById(id);
  if (!product) return;
  quick.id = id;
  quick.size = product.sizes.length === 1 ? product.sizes[0] : null;
  quick.qty = 1;
  renderQuick();
  openDialog($("#quick-view"));
}

function selectSize(size) {
  quick.size = size;
  document.querySelectorAll("#quick-view [data-size]").forEach((button) => {
    const selected = button.dataset.size === size;
    button.setAttribute("aria-checked", selected ? "true" : "false");
    button.tabIndex = selected ? 0 : -1;
  });
  const error = $("#qv-error");
  if (error) error.textContent = "";
  const product = productById(quick.id);
  const pay = $("#qv-pay");
  if (product && pay) fillPay(pay, product);
}

function buyQuick() {
  const product = productById(quick.id);
  if (!product || product.soldOut) return;
  if (!quick.size) {
    const error = $("#qv-error");
    if (error) error.textContent = "Select a size.";
    $("#quick-view [data-size]")?.focus();
    return;
  }
  openPayNote([{ product, size: quick.size, qty: quick.qty }]);
}

function addQuick() {
  const product = productById(quick.id);
  if (!product || product.soldOut) return;
  if (!quick.size) {
    const error = $("#qv-error");
    if (error) error.textContent = "Select a size.";
    $("#quick-view [data-size]")?.focus();
    return;
  }
  const existing = state.cart.find((line) => line.id === product.id && line.size === quick.size);
  if (existing) existing.qty = Math.min(10, existing.qty + quick.qty);
  else state.cart.push({ id: product.id, size: quick.size, qty: quick.qty });
  saveCart();
  renderCart();
  bumpCount();
  openDialog($("#cart-dialog"));
}

function changeQty(id, size, delta) {
  const line = state.cart.find((item) => item.id === id && item.size === size);
  if (!line) return;
  line.qty = Math.min(10, Math.max(1, line.qty + delta));
  saveCart();
  renderCart(delta > 0 ? "plus" : "minus", id, size);
  bumpCount();
}

function removeLine(id, size) {
  state.cart = state.cart.filter((line) => !(line.id === id && line.size === size));
  saveCart();
  renderCart();
  bumpCount();
  $("#cart-dialog [data-autofocus]")?.focus();
}

function renderCart(focusKind, focusId, focusSize) {
  const count = cartCount();
  const badge = $("#cart-count");
  if (badge) {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.dataset.empty = count === 0 ? "true" : "false";
  }
  const opener = $("#cart-open");
  if (opener) {
    opener.setAttribute("aria-label", count ? `Open cart, ${count} ${count === 1 ? "item" : "items"}` : "Open cart, empty");
  }
  const title = $("#cart-title");
  if (title) title.textContent = count ? `Cart (${count})` : "Cart";
  const items = $("#cart-items");
  const foot = $("#cart-foot");
  if (!items || !foot) return;
  if (!state.cart.length) {
    items.replaceChildren(
      el("div", { class: "cart-empty" }, [
        el("p", { text: "Your cart is empty." }),
        el("button", { type: "button", class: "btn btn-ghost", "data-goto": "#shop", text: "Shop the collection" }),
      ]),
    );
    foot.hidden = true;
    checkoutLines = [];
    $("#cart-pay")?.replaceChildren();
    return;
  }
  foot.hidden = false;
  items.replaceChildren(...state.cart.map(cartRow).filter(Boolean));
  const subtotal = state.cart.reduce((total, line) => {
    const product = productById(line.id);
    if (!product || product.soldOut || product.priceLabel || !Number.isFinite(product.price)) return total;
    return total + product.price * line.qty;
  }, 0);
  const subtotalNode = $("#cart-subtotal");
  if (subtotalNode) subtotalNode.textContent = money(subtotal);
  const pay = $("#cart-pay");
  if (pay) {
    pay.replaceChildren();
    const payable = [];
    state.cart.forEach((line) => {
      const product = productById(line.id);
      if (!product) return;
      if (product.soldOut) {
        pay.append(el("p", { class: "pay-note", text: `${product.name} is sold out.` }));
        return;
      }
      payable.push({ product, size: line.size, qty: line.qty });
    });
    checkoutLines = payable;
    if (payable.length) {
      pay.append(
        el("button", {
          type: "button",
          class: "btn btn-block",
          "data-checkout": "true",
          text: "Checkout",
        }),
      );
    }
  } else {
    checkoutLines = [];
  }
  if (focusKind && focusId) {
    const row = items.querySelector(
      `[data-line-id="${CSS.escape(focusId)}"][data-line-size="${CSS.escape(focusSize || "")}"]`,
    );
    const target = row?.querySelector(`[data-${focusKind}]`);
    if (target && !target.disabled) target.focus();
    else row?.querySelector("button")?.focus();
  }
}

function cartRow(line) {
  const product = productById(line.id);
  if (!product) return null;
  const image = el("img", { src: product.image, alt: "", width: "84", height: "84" });
  watchImage(image);
  return el("article", { class: "cart-row", "data-line-id": line.id, "data-line-size": line.size }, [
    image,
    el("div", {}, [
      el("h3", { class: "cart-name", text: product.name }),
      el("p", { class: "cart-meta", text: formatSize(line.size) }),
      priceLine(product, line.qty),
      el("div", { class: "cart-actions" }, [
        el("div", { class: "qty" }, [
          el("button", {
            type: "button",
            "data-minus": "true",
            "aria-label": `Decrease quantity of ${product.name}, size ${formatSize(line.size)}`,
            disabled: line.qty <= 1,
            text: "–",
          }),
          el("span", { text: String(line.qty) }),
          el("button", {
            type: "button",
            "data-plus": "true",
            "aria-label": `Increase quantity of ${product.name}, size ${formatSize(line.size)}`,
            disabled: line.qty >= 10,
            text: "+",
          }),
        ]),
        el("button", {
          type: "button",
          class: "text-btn",
          "data-remove": "true",
          text: "Remove",
          "aria-label": `Remove ${product.name}, size ${formatSize(line.size)}`,
        }),
      ]),
    ]),
  ]);
}

const SERVICE_NAMES = { spotify: "Spotify", apple: "Apple Music", youtube: "YouTube" };

function embedNode(service, embed, title) {
  const name = SERVICE_NAMES[service];
  const frame = el("iframe", {
    class: `embed-frame ${service}`,
    src: embed.src,
    title: `${title} on ${name}`,
    loading: "lazy",
    referrerpolicy: "strict-origin-when-cross-origin",
    allow: "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture",
    allowfullscreen: true,
  });
  const wrap = el("div", { class: "embed-live" }, [frame]);
  if (embed.openUrl) {
    wrap.append(
      el("a", {
        class: "embed-open",
        href: embed.openUrl,
        target: "_blank",
        rel: "noopener noreferrer",
        text: `Open in ${name}`,
      }),
    );
  }
  return wrap;
}

function renderFeatured() {
  const root = $("#featured");
  if (!root) return;
  const release = state.releases.find((item) => item.id === state.activeReleaseId) || state.releases[0];
  if (!release) {
    root.replaceChildren(el("p", { text: "Add a release in data/music.json." }));
    return;
  }
  const cover = release.cover
    ? el("img", {
        class: "cover",
        src: release.cover,
        alt: `Cover art for ${release.title} by ${release.artist || "DAYxDAY"}`,
        width: "800",
        height: "800",
      })
    : el("div", { class: "cover" });
  if (release.cover) watchImage(cover);
  const embeds = buildEmbeds(release);
  const players = el("div", { class: "players" });
  ["spotify", "apple", "youtube"].forEach((service) => {
    if (embeds[service]) players.append(embedNode(service, embeds[service], release.title));
  });
  const links = el("div", { class: "out-links" });
  if (embeds.spotify) links.append(externalLink("Spotify", embeds.spotify.openUrl));
  if (embeds.apple) links.append(externalLink("Apple Music", embeds.apple.openUrl));
  if (httpsUrl(release.page)) links.append(externalLink("UnitedMasters", release.page));
  root.replaceChildren(
    cover,
    el("div", { class: "featured-copy" }, [
      release.badge
        ? el("p", { class: "ep-badge", text: release.badge })
        : el("p", { class: "eyebrow", text: release.featured ? "Latest release" : "Release" }),
      el("h3", { class: "release-title", id: "featured-title", text: release.title }),
      release.blurb ? el("p", { class: "dek", text: release.blurb }) : null,
      el("p", { class: "byline", text: [release.artist || "DAYxDAY", release.type, release.year].filter(Boolean).join(" · ") }),
      players,
      links,
    ]),
  );
}

function externalLink(label, href) {
  const url = httpsUrl(href);
  if (!url) return null;
  return el("a", { href: url.toString(), target: "_blank", rel: "noopener noreferrer", text: label });
}

function renderReleaseList() {
  const list = $("#release-list");
  if (!list) return;
  list.replaceChildren(
    ...state.releases.map((release) => {
      const cover = el("img", {
        src: release.cover,
        alt: "",
        width: "64",
        height: "64",
        loading: "lazy",
      });
      watchImage(cover);
      return el(
        "button",
        {
          type: "button",
          class: "release-row",
          "data-release": release.id,
          "aria-current": release.id === state.activeReleaseId ? "true" : "false",
        },
        [
          cover,
          el("span", { class: "release-copy" }, [
            el("span", { class: "release-name", text: release.title }),
            el("span", { class: "release-meta", text: [release.type, release.year].filter(Boolean).join(" · ") }),
          ]),
          el("span", {
            class: release.badge || release.featured ? "new-tag" : "release-meta",
            text: release.badge || release.featured ? "New" : release.year || "",
          }),
        ],
      );
    }),
  );
}

function renderVideos() {
  const grid = $("#video-grid");
  const block = $(".video-block");
  if (!grid) return;
  const frames = state.videos
    .map((video) => {
      const id = youtubeId(video.youtube);
      if (!id) return null;
      return el("figure", { class: "video-embed" }, [
        el("iframe", {
          class: "video-frame",
          src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
          title: video.title,
          loading: "lazy",
          referrerpolicy: "strict-origin-when-cross-origin",
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen",
          allowfullscreen: true,
        }),
        el("figcaption", { class: "video-caption", text: video.title }),
      ]);
    })
    .filter(Boolean);
  if (block) block.hidden = frames.length === 0;
  grid.replaceChildren(...frames);
}

function renderSocials() {
  const list = $("#social-list");
  const socials = Array.isArray(state.site?.socials) ? state.site.socials : [];
  const ready = socials.filter((item) => item?.label && httpsUrl(item.href));
  if (!list || !ready.length) return;
  list.replaceChildren(
    ...ready.map((item) => {
      const li = el("li");
      li.append(
        el("a", {
          href: httpsUrl(item.href).toString(),
          target: "_blank",
          rel: "noopener noreferrer",
          text: item.label,
        }),
      );
      return li;
    }),
  );
}

function applySite() {
  renderSocials();
}

function formNote(form, text) {
  const note = form.querySelector("[data-form-note]");
  if (note) note.textContent = text;
}

function trapped(form) {
  const honeypot = form.querySelector('[name="wl_hp"]');
  if (honeypot && honeypot.value) return true;
  const opened = Number(form.dataset.opened || 0);
  return Boolean(opened && Date.now() - opened < 1200);
}

function sentTooSoon() {
  try {
    return Date.now() - Number(localStorage.getItem(TALK_KEY) || 0) < 20000;
  } catch {
    return false;
  }
}

function markSent() {
  try {
    localStorage.setItem(TALK_KEY, String(Date.now()));
  } catch {
    /* The server limit still applies. */
  }
}

function talkError(error) {
  const text = `${error?.message || ""} ${error?.details || ""}`;
  if (/rate_limited/i.test(text)) return "Please wait a bit and try again.";
  if (text.includes("image")) return "Use a JPG, PNG, WEBP, or GIF.";
  if (text.includes("size")) return "That photo is over 5 MB.";
  if (/failed to fetch|network|timeout/i.test(text)) return "Can't send right now. Check your connection and try again.";
  return "That didn't send. Try again in a moment.";
}

async function prepareImage(file) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) throw new Error("image");
  const direct = IMAGE_TYPES[file.type];
  if (direct && file.size <= 5 * 1024 * 1024) return { blob: file, type: file.type, ext: direct };
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("image");
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob || blob.size > 5 * 1024 * 1024) throw new Error("size");
  return { blob, type: "image/jpeg", ext: "jpg" };
}

async function insertMessage(row) {
  const { error } = await supabase.from("wl_messages").insert(row);
  if (error) throw error;
  markSent();
}

async function submitTalk(form) {
  if (form.dataset.sending === "1") return;
  if (trapped(form)) {
    form.reset();
    formNote(form, "Sent. Thank you.");
    return;
  }
  if (sentTooSoon()) {
    formNote(form, "Please wait a moment before sending another note.");
    return;
  }
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim();
  const topic = String(data.get("topic") || "").trim();
  const message = String(data.get("message") || "").trim();
  if (!name || !email || !topic || !message) {
    formNote(form, "Add your name, email, a topic, and a message.");
    return;
  }
  form.dataset.sending = "1";
  formNote(form, "Sending…");
  try {
    let imagePath = null;
    const file = form.querySelector('input[type="file"]')?.files?.[0];
    const image = await prepareImage(file);
    if (image) {
      imagePath = `inbox/${crypto.randomUUID()}.${image.ext}`;
      const upload = await supabase.storage.from("wl-inbox").upload(imagePath, image.blob, {
        contentType: image.type,
        upsert: false,
      });
      if (upload.error) throw upload.error;
    }
    await insertMessage({ name, email, topic, message, image_path: imagePath, status: "new" });
    form.reset();
    formNote(form, "Sent. Thank you.");
  } catch (error) {
    formNote(form, talkError(error));
  } finally {
    form.dataset.sending = "";
  }
}

async function submitList(form) {
  if (form.dataset.sending === "1") return;
  if (trapped(form)) {
    form.reset();
    formNote(form, "You're on the list.");
    return;
  }
  if (sentTooSoon()) {
    formNote(form, "Please wait a moment before sending another note.");
    return;
  }
  const email = String(new FormData(form).get("email") || "").trim();
  if (!email) {
    formNote(form, "Add an email.");
    return;
  }
  form.dataset.sending = "1";
  formNote(form, "Sending…");
  try {
    await insertMessage({
      name: "List signup",
      email,
      topic: "Other",
      message: "Add me to the list for new music and drops.",
      status: "new",
    });
    form.reset();
    formNote(form, "You're on the list.");
  } catch (error) {
    formNote(form, talkError(error));
  } finally {
    form.dataset.sending = "";
  }
}

function showError() {
  const box = $("#load-error");
  if (box) box.hidden = false;
  const grid = $("#product-grid");
  if (grid) {
    grid.setAttribute("aria-busy", "false");
    grid.replaceChildren();
  }
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(path);
  return response.json();
}

function standInImage(row) {
  const blob = `${row.category || ""} ${row.slug || ""} ${row.name || ""}`.toLowerCase();
  if (blob.includes("hat") || blob.includes("cap")) return "assets/products/cap.jpg";
  if (blob.includes("hoodie")) return "assets/products/hoodie.jpg";
  if (blob.includes("sweater") || blob.includes("crew")) return "assets/products/crewneck.jpg";
  if (blob.includes("tee") || blob.includes("shirt")) return "assets/products/tee.jpg";
  return "assets/products/tee.jpg";
}

function productFromRow(row) {
  const images = Array.isArray(row.images) ? row.images.filter((item) => typeof item === "string" && item.trim()) : [];
  const cents = row.price_cents;
  const soldOut = Boolean(row.sold_out);
  return normalizeProduct({
    id: row.id,
    name: row.name,
    description: row.description || "",
    alt: row.name,
    soldOut,
    sample: false,
    featured: Boolean(row.featured),
    price: cents == null ? null : cents / 100,
    priceLabel: cents == null && !soldOut ? "Coming soon" : "",
    image: images[0] || standInImage(row),
    images,
    sizes: row.sizes,
  });
}

function applyMusicRows(rows) {
  const releases = [];
  const videos = [];
  for (const row of rows || []) {
    if (row.kind === "video") {
      const video = normalizeVideo({
        id: row.id,
        title: row.title,
        youtube: row.youtube_url,
        poster: row.artwork_url || "assets/hero-night.jpg",
      });
      if (video) videos.push(video);
    } else {
      const release = normalizeRelease({
        id: row.id,
        title: row.title,
        artist: row.artist,
        type: row.release_type,
        year: row.release_date ? String(row.release_date).slice(0, 4) : "",
        featured: row.featured,
        cover: row.artwork_url,
        blurb: row.blurb,
        spotify: row.spotify_url,
        apple: row.apple_url,
        youtube: row.youtube_url,
        page: row.page_url,
        badge: row.badge,
      });
      if (release) releases.push(release);
    }
  }
  if (!releases.length && !videos.length) return;
  if (releases.length) {
    state.releases = releases;
    state.activeReleaseId = releases.find((item) => item.badge)?.id || releases.find((item) => item.featured)?.id || releases[0].id;
  }
  if (videos.length) state.videos = videos;
}

async function loadSettingsRow() {
  let result = await supabase.from("wl_settings").select(SETTINGS_COLUMNS).eq("id", 1).maybeSingle();
  const missingLink = /payment_link/i.test(`${result.error?.message || ""} ${result.error?.details || ""} ${result.error?.hint || ""}`);
  if (result.error && missingLink) {
    result = await supabase.from("wl_settings").select(SETTINGS_CORE).eq("id", 1).maybeSingle();
  }
  if (result.error) throw result.error;
  if (!result.data) throw new Error("settings");
  return result.data;
}

async function loadRemote() {
  const [brand, productsRes, musicRes] = await Promise.all([
    loadSettingsRow(),
    supabase.from("wl_products").select("*").eq("active", true).order("sort_order", { ascending: true }),
    supabase.from("wl_music").select(MUSIC_COLUMNS).eq("active", true).order("sort_order", { ascending: true }),
  ]);
  if (productsRes.error) throw productsRes.error;
  return {
    brand,
    products: (productsRes.data || []).map(productFromRow).filter(Boolean),
    music: musicRes.error ? null : musicRes.data,
  };
}

function applyBrand(brand) {
  if (!brand) return;
  state.brand = brand;
  const tagline = $("#hero-sub");
  if (tagline && brand.tagline) tagline.textContent = brand.tagline;
  const bio = $("#hero-bio");
  if (bio && brand.bio) bio.textContent = brand.bio;
  const about = $("#about-bio");
  if (about && brand.bio) about.textContent = brand.bio;
  const note = $("#about-note");
  if (note) note.textContent = "Wicked Lyfe is apparel. Sold out pieces stay on the page. In-stock pieces check out on Jim.";
  const shopNote = $("#shop-note");
  if (shopNote) shopNote.textContent = "Sold out pieces stay on the page. Buy on an in-stock piece pays on Jim.";
  if (brand.brand_name) {
    document.title = `${brand.brand_name} — Apparel`;
    document.querySelectorAll("[data-brand]").forEach((node) => {
      node.textContent = brand.brand_name;
    });
  }
  if (brand.logo_url) {
    const shippedHeader = /logo-header\.(png|webp)(\?|$)/i.test(brand.logo_url);
    document.querySelectorAll("[data-logo]").forEach((img) => {
      if (shippedHeader && img.classList.contains("hero-logo")) return;
      img.src = brand.logo_url;
      img.closest("picture")?.querySelector("source")?.remove();
    });
  }
  const listen = $("#listen-link");
  if (listen && httpsUrl(brand.music_url)) listen.href = httpsUrl(brand.music_url).toString();
  if (httpsUrl(brand.instagram_url)) {
    const href = httpsUrl(brand.instagram_url).toString();
    document.querySelectorAll('a[href*="instagram.com"]').forEach((link) => {
      link.href = href;
    });
    if (Array.isArray(state.site?.socials)) {
      state.site.socials = state.site.socials.map((item) =>
        item.label === "Instagram" ? { ...item, href } : item,
      );
    }
  }
  if (brand.accent_color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(brand.accent_color).trim())) {
    document.documentElement.style.setProperty("--red", String(brand.accent_color).trim());
  }
  const bar = $("#announcement");
  if (bar) {
    const text = String(brand.announcement || "").trim();
    bar.hidden = !text;
    bar.textContent = text;
  }
  applyCheckoutLink();
}

async function boot() {
  const [site, catalog, music] = await Promise.all([
    loadJson("data/site.json"),
    loadJson("data/products.json"),
    loadJson("data/music.json"),
  ]);
  state.site = site && typeof site === "object" ? site : {};
  state.currency = typeof catalog.currency === "string" ? catalog.currency : "USD";
  state.releases = (music.releases || []).map(normalizeRelease).filter(Boolean);
  state.videos = (music.videos || []).map(normalizeVideo).filter(Boolean);
  state.activeReleaseId = state.releases.find((release) => release.featured)?.id || state.releases[0]?.id || null;
  let remote = null;
  try {
    remote = await loadRemote();
  } catch {
    remote = null;
  }
  if (remote) {
    state.products = remote.products;
    applyBrand(remote.brand);
    if (remote.music) applyMusicRows(remote.music);
  } else {
    state.brand = null;
    state.products = (catalog.products || []).map((item) => normalizeProduct(item)).filter(Boolean);
  }
  state.cart = loadCart().filter(validLine);
  applyCheckoutLink();
  applySite();
  renderProducts();
  renderFeatured();
  renderReleaseList();
  renderVideos();
  renderCart();
  const loading = $("#loading-note");
  if (loading) loading.remove();
}

function bind() {
  const year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  const onScroll = () => {
    $(".site-header")?.classList.toggle("is-scrolled", window.scrollY > 4);
  };
  onScroll();
  document.addEventListener("scroll", onScroll, { passive: true });

  $("#search-open")?.addEventListener("click", () => {
    const panel = $("#search-panel");
    setSearch(Boolean(panel?.hidden));
  });
  $("#search-input")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderProducts();
  });
  $("#search-clear")?.addEventListener("click", () => {
    const input = $("#search-input");
    if (input) input.value = "";
    state.query = "";
    renderProducts();
    input?.focus();
  });

  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-open]");
    if (opener) {
      openDialog(document.getElementById(opener.dataset.open));
      return;
    }
    const closer = event.target.closest("[data-close]");
    if (closer) {
      closeDialog(document.getElementById(closer.dataset.close));
      return;
    }
    const quickButton = event.target.closest("[data-quick]");
    if (quickButton) {
      openQuick(quickButton.dataset.quick);
      return;
    }
    const jump = event.target.closest("[data-goto]");
    if (jump) {
      event.preventDefault();
      jumpTo(jump.dataset.goto);
      return;
    }
    const release = event.target.closest("[data-release]");
    if (release) {
      state.activeReleaseId = release.dataset.release;
      renderFeatured();
      renderReleaseList();
      $("#featured")?.scrollIntoView({ block: "nearest" });
      return;
    }
    const video = event.target.closest("[data-video]");
    if (video?.dataset.src) {
      const frame = el("iframe", {
        class: "video-frame",
        src: video.dataset.src,
        title: video.querySelector(".video-title")?.textContent || "Video",
        allow: "autoplay; encrypted-media; fullscreen; picture-in-picture",
        allowfullscreen: true,
        referrerpolicy: "strict-origin-when-cross-origin",
      });
      video.replaceWith(frame);
      return;
    }
    if (event.target.closest("[data-checkout]")) {
      openPayNote(checkoutLines);
      return;
    }
    const row = event.target.closest("[data-line-id]");
    if (row && event.target.closest("#cart-dialog")) {
      const id = row.dataset.lineId;
      const size = row.dataset.lineSize;
      if (event.target.closest("[data-plus]")) changeQty(id, size, 1);
      else if (event.target.closest("[data-minus]")) changeQty(id, size, -1);
      else if (event.target.closest("[data-remove]")) removeLine(id, size);
    }
  });

  $("#quick-view")?.addEventListener("click", (event) => {
    const sizeButton = event.target.closest("[data-size]");
    if (sizeButton) {
      selectSize(sizeButton.dataset.size);
      return;
    }
    const qtyButton = event.target.closest("[data-qty]");
    if (qtyButton) {
      quick.qty = Math.min(10, Math.max(1, quick.qty + Number(qtyButton.dataset.qty)));
      const label = $("#qv-qty");
      if (label) label.textContent = String(quick.qty);
      const minus = $("#qv-minus");
      const plus = $("#qv-plus");
      if (minus) minus.disabled = quick.qty <= 1;
      if (plus) plus.disabled = quick.qty >= 10;
      return;
    }
    if (event.target.closest("[data-buy]")) {
      buyQuick();
      return;
    }
    if (event.target.closest("[data-add]")) addQuick();
  });

  $("#quick-view")?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const current = event.target.closest("[data-size]");
    if (!current) return;
    const buttons = [...document.querySelectorAll("#quick-view [data-size]")];
    const index = buttons.indexOf(current);
    if (index < 0) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = buttons[(index + direction + buttons.length) % buttons.length];
    next.focus();
    selectSize(next.dataset.size);
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeDialog(dialog);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
    dialog.addEventListener("close", syncExpanded);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const panel = $("#search-panel");
    if (panel && !panel.hidden && !document.querySelector("dialog[open]")) {
      setSearch(false);
      $("#search-open")?.focus();
    }
  });

  document.querySelectorAll("#talk-form, #list-form, #account-list").forEach((form) => {
    form.dataset.opened = String(Date.now());
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (form.id === "talk-form") submitTalk(form);
      else submitList(form);
    });
  });

  const markSection = () => {
    const links = [...document.querySelectorAll(".section-nav a")];
    let current = null;
    for (const link of links) {
      const node = document.getElementById(link.getAttribute("href").slice(1));
      if (node && node.getBoundingClientRect().top <= 140) current = link;
    }
    links.forEach((link) => {
      if (link === current) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  };
  markSection();
  document.addEventListener("scroll", markSection, { passive: true });
}

bind();
boot().catch(showError);
