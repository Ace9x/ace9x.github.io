import { buildEmbeds, youtubeId } from "./embeds.js";
import { httpsUrl, isPlaceholder, paymentOptions } from "./payments.js";

const CART_KEY = "dayxday-cart";

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

function priceLine(amount) {
  return el("span", { class: "price" }, [
    el("span", { class: "sample", text: "SAMPLE" }),
    ` ${money(amount)}`,
  ]);
}

function productById(id) {
  return state.products.find((item) => item.id === id) || null;
}

function normalizeProduct(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  const name = String(raw.name || "").trim();
  const price = Number(raw.price);
  if (!id || !name || !Number.isFinite(price)) return null;
  const sizes = Array.isArray(raw.sizes) && raw.sizes.length ? raw.sizes.map((size) => String(size)) : ["OS"];
  return {
    id,
    name,
    price,
    image: String(raw.image || ""),
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
    artist: String(raw.artist || "Day X Day"),
    type: String(raw.type || "Release"),
    year: String(raw.year || ""),
    featured: Boolean(raw.featured),
    cover: String(raw.cover || ""),
    blurb: String(raw.blurb || ""),
    spotify: String(raw.spotify || ""),
    apple: String(raw.apple || ""),
    youtube: String(raw.youtube || ""),
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
    const message = query
      ? `Nothing in the sample catalog matches “${state.query.trim()}”.`
      : "Add products in data/products.json.";
    grid.replaceChildren(el("p", { class: "empty", text: message }));
  } else {
    grid.replaceChildren(...items.map((product, index) => productCard(product, index)));
  }
  grid.setAttribute("aria-busy", "false");
  const status = $("#filter-status");
  if (status) {
    status.textContent = query
      ? `${items.length} sample ${items.length === 1 ? "piece" : "pieces"} match ${state.query.trim()}.`
      : "";
  }
  const count = $("#result-count");
  if (count) {
    count.textContent = query
      ? `${items.length} shown`
      : `${state.products.length} sample ${state.products.length === 1 ? "piece" : "pieces"}`;
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
        "aria-label": `Quick view ${product.name}, sample price ${money(product.price)}`,
      },
      [
        el("span", { class: "card-media" }, [
          image,
          el("span", { class: "flag", text: "Sample" }),
          el("span", { class: "quick-label", text: "Quick view" }),
        ]),
        el("span", { class: "card-name", text: product.name }),
        priceLine(product.price),
      ],
    ),
  ]);
}

function fillPay(container, product, size) {
  container.replaceChildren();
  const options = paymentOptions(product, size);
  if (!options.length) {
    container.append(
      el("p", {
        class: "pay-note",
        text: "Payment link placeholder. Paste a Stripe Payment Link or PayPal URL for this piece in data/products.json.",
      }),
    );
    return;
  }
  options.forEach((option) => {
    container.append(
      el("a", {
        class: "btn btn-ghost btn-block",
        href: option.href,
        target: "_blank",
        rel: "noopener noreferrer",
        text: option.label,
      }),
    );
  });
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
        el("p", { class: "eyebrow", text: "Sample" }),
        el("h2", { id: "qv-name", text: product.name }),
        priceLine(product.price),
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
        el("button", { type: "button", class: "btn btn-block", "data-add": "true", text: "Add to cart" }),
        pay,
      ]),
    ]),
  );
  sizes.setAttribute("aria-labelledby", "size-label");
  fillPay(pay, product, quick.size);
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
  if (product && pay) fillPay(pay, product, size);
}

function addQuick() {
  const product = productById(quick.id);
  if (!product) return;
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
    return;
  }
  foot.hidden = false;
  items.replaceChildren(...state.cart.map(cartRow).filter(Boolean));
  const subtotal = state.cart.reduce((total, line) => {
    const product = productById(line.id);
    return total + (product ? product.price * line.qty : 0);
  }, 0);
  const subtotalNode = $("#cart-subtotal");
  if (subtotalNode) subtotalNode.textContent = money(subtotal);
  const pay = $("#cart-pay");
  if (pay) {
    pay.replaceChildren();
    state.cart.forEach((line) => {
      const product = productById(line.id);
      if (!product) return;
      const block = el("div", { class: "pay-line" }, [
        el("p", {
          class: "pay-line-name",
          text: `${product.name} · ${formatSize(line.size)} · ×${line.qty}`,
        }),
      ]);
      const options = paymentOptions(product, line.size);
      if (!options.length) {
        block.append(
          el("p", {
            class: "pay-note",
            text: "Payment link placeholder. Paste a Stripe or PayPal URL in data/products.json.",
          }),
        );
      } else {
        options.forEach((option) => {
          block.append(
            el("a", {
              class: "btn",
              href: option.href,
              target: "_blank",
              rel: "noopener noreferrer",
              text: option.label,
            }),
          );
        });
      }
      pay.append(block);
    });
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
      priceLine(product.price * line.qty),
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
  if (!embed) {
    return el("div", { class: "embed-shell", "data-service": service }, [
      el("div", { class: "embed-kicker" }, [
        el("span", { text: name }),
        el("span", { class: "sample", text: "Sample" }),
      ]),
      el("p", { text: `Paste a ${name} link for this release in data/music.json.` }),
    ]);
  }
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
  const cover = el("img", {
    class: "cover",
    src: release.cover,
    alt: `Sample cover art for ${release.title}`,
    width: "1024",
    height: "1024",
  });
  watchImage(cover);
  const embeds = buildEmbeds(release);
  const players = el("div", { class: "players" });
  ["spotify", "apple", "youtube"].forEach((service) => {
    players.append(embedNode(service, embeds[service], release.title));
  });
  root.replaceChildren(
    cover,
    el("div", { class: "featured-copy" }, [
      el("p", { class: "eyebrow", text: release.featured ? "New release · Sample" : "Sample release" }),
      el("h3", { class: "release-title", id: "featured-title", text: release.title }),
      el("p", { class: "dek", text: release.blurb }),
      el("p", { class: "byline", text: [release.artist, release.type, release.year].filter(Boolean).join(" · ") }),
      players,
    ]),
  );
}

function renderReleaseList() {
  const list = $("#release-list");
  if (!list) return;
  list.replaceChildren(
    ...state.releases.map((release) => {
      const cover = el("img", { src: release.cover, alt: "", width: "64", height: "64" });
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
          el("span", { class: "new-tag", text: release.featured ? "New" : "Sample" }),
        ],
      );
    }),
  );
}

function renderVideos() {
  const grid = $("#video-grid");
  if (!grid) return;
  if (!state.videos.length) {
    grid.replaceChildren(el("p", { class: "dek", text: "Add videos in data/music.json." }));
    return;
  }
  grid.replaceChildren(
    ...state.videos.map((video) => {
      const id = youtubeId(video.youtube);
      const image = el("img", { src: video.poster, alt: "", width: "864", height: "1152" });
      watchImage(image);
      const button = el(
        "button",
        {
          type: "button",
          class: "video-card",
          "data-video": video.id,
          "aria-label": id ? `Play ${video.title}` : `${video.title}. Add a YouTube link in data/music.json`,
        },
        [
          image,
          el("span", { class: "sample-flag", text: id ? "Play" : "Sample" }),
          el("span", { class: "play-disc", "aria-hidden": "true" }),
          el("span", { class: "video-meta" }, [
            el("span", { class: "video-title", text: video.title }),
            el("span", {
              class: "video-sub",
              text: id ? "YouTube" : "Add a YouTube link in data/music.json",
            }),
          ]),
        ],
      );
      if (id) button.dataset.src = `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1`;
      else button.dataset.sample = "true";
      return button;
    }),
  );
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
  const email = state.site?.email || "hello@dayxday.example";
  document.querySelectorAll("[data-email]").forEach((node) => {
    node.textContent = email;
    if (node.tagName === "A") node.setAttribute("href", `mailto:${email}`);
  });
  document.querySelectorAll("form[data-enhance]").forEach((form) => {
    form.action = `mailto:${email}`;
  });
  const endpoint = String(state.site?.formspreeEndpoint || "").trim();
  const usingMail = !httpsUrl(endpoint);
  document.querySelectorAll("[data-form-note]").forEach((note) => {
    note.textContent = usingMail
      ? "Sample form. This opens your email app until you paste a Formspree endpoint in data/site.json."
      : "This form sends through the endpoint in data/site.json.";
  });
  renderSocials();
}

async function submitForm(form) {
  const note = form.querySelector(".form-note");
  const honeypot = form.querySelector(".hp");
  if (honeypot && honeypot.value) {
    if (note) note.textContent = "Sent.";
    form.reset();
    return;
  }
  const data = Object.fromEntries(new FormData(form).entries());
  delete data.company;
  const email = state.site?.email || "hello@dayxday.example";
  const endpoint = httpsUrl(state.site?.formspreeEndpoint || "");
  if (endpoint) {
    try {
      const response = await fetch(endpoint.toString(), {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, _subject: form.dataset.subject || "Day X Day" }),
      });
      if (!response.ok) throw new Error("form");
      form.reset();
      if (note) note.textContent = "Sent. Thank you.";
    } catch {
      if (note) note.textContent = `Could not send. Email ${email} instead.`;
    }
    return;
  }
  const body = Object.entries(data)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  const subject = form.dataset.subject || "Day X Day";
  if (note) note.textContent = `Opening your email app to write ${email}.`;
  window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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

async function boot() {
  const [site, catalog, music] = await Promise.all([
    loadJson("data/site.json"),
    loadJson("data/products.json"),
    loadJson("data/music.json"),
  ]);
  state.site = site && typeof site === "object" ? site : {};
  state.currency = typeof catalog.currency === "string" ? catalog.currency : "USD";
  state.products = (catalog.products || []).map(normalizeProduct).filter(Boolean);
  state.releases = (music.releases || []).map(normalizeRelease).filter(Boolean);
  state.videos = (music.videos || []).map(normalizeVideo).filter(Boolean);
  state.activeReleaseId = state.releases.find((release) => release.featured)?.id || state.releases[0]?.id || null;
  state.cart = loadCart().filter(validLine);
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

  document.querySelectorAll("form[data-enhance]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitForm(form);
    });
  });
}

bind();
boot().catch(showError);
