import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";
import { SUPABASE_KEY, SUPABASE_URL } from "../js/config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.querySelector("#app");
const toastNode = document.querySelector("#toast");
const PRESET_SIZES = ["S", "M", "L", "XL", "2XL", "OS"];
const STAND_IN = {
  hat: "../assets/products/cap.jpg",
  sweater: "../assets/products/crewneck.jpg",
  hoodie: "../assets/products/hoodie.jpg",
  tee: "../assets/products/tee.jpg",
};

const ui = {
  tab: "products",
  email: "",
  codeSent: false,
  products: [],
  settings: null,
  requests: [],
  editing: null,
  busy: false,
};

let refreshTimer = 0;

function $(selector, root = document) {
  return root.querySelector(selector);
}

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

function friendly(error) {
  const text = String(error?.message || error || "");
  if (text === "price") return "Enter a price like 50, or leave it blank for Coming soon.";
  if (/failed to fetch|network|timeout/i.test(text)) return "Can't reach the shop right now. Check your connection and try again.";
  if (/otp|token|expired|invalid/i.test(text)) return "That code didn't work. Request a new one and try again.";
  if (/rate|over_email|too many/i.test(text)) return "Too many emails just now. Wait a minute and try again.";
  if (/permission|row-level|jwt|42501|not authorized/i.test(text)) return "That didn't save. Sign in again, and make sure Ace Apps has approved this email.";
  return "Something went wrong. Try again in a moment.";
}

function toast(message = "Saved ✓") {
  toastNode.textContent = message;
  toastNode.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    toastNode.hidden = true;
  }, 2200);
}

function money(cents) {
  if (cents == null) return "Coming soon";
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

function standIn(product) {
  const blob = `${product.category || ""} ${product.name || ""}`.toLowerCase();
  if (blob.includes("hat") || blob.includes("cap")) return STAND_IN.hat;
  if (blob.includes("hoodie")) return STAND_IN.hoodie;
  if (blob.includes("sweater")) return STAND_IN.sweater;
  return STAND_IN.tee;
}

function thumb(product) {
  const src = (product.images || []).find(Boolean) || standIn(product);
  return el("img", { src, alt: "" });
}

function slugify(name) {
  const slug = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "item";
}

function centsFromDollars(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("price");
  return Math.round(amount * 100);
}

function show(node) {
  app.replaceChildren(node);
}

function loginView(message = "") {
  show(
    el("section", { class: "card" }, [
      el("h2", { text: "Sign in" }),
      el("p", { class: "help", text: "We'll email you a 6-digit code and a sign-in link. Either one works." }),
      message ? el("p", { class: "error", text: message }) : null,
      el("label", { for: "email", text: "Email" }),
      el("input", { id: "email", type: "email", autocomplete: "email", inputmode: "email", value: ui.email, required: true }),
      el("div", { class: "actions" }, [el("button", { class: "btn wide", id: "send-code", type: "button", text: ui.codeSent ? "Send a new code" : "Email me a code" })]),
      ui.codeSent
        ? el("div", {}, [
            el("label", { for: "code", text: "6-digit code" }),
            el("input", {
              id: "code",
              type: "text",
              inputmode: "numeric",
              autocomplete: "one-time-code",
              maxlength: "6",
              placeholder: "123456",
            }),
            el("div", { class: "actions" }, [el("button", { class: "btn wide", id: "verify-code", type: "button", text: "Sign in" })]),
          ])
        : null,
    ]),
  );
}

function shell(body) {
  const tabs = el("div", { class: "tabs", role: "tablist" }, [
    tabButton("products", "Products"),
    tabButton("brand", "Brand"),
    tabButton("ask", "Ask"),
  ]);
  const signOut = el("button", { class: "btn ghost wide", id: "sign-out", type: "button", text: "Sign out" });
  show(el("div", {}, [tabs, body, el("div", { class: "actions" }, [signOut])]));
}

function tabButton(id, label) {
  return el("button", { type: "button", "data-tab": id, role: "tab", "aria-selected": ui.tab === id ? "true" : "false", text: label });
}

function productList() {
  const items = ui.products.map((product, index) =>
    el("article", { class: "item", draggable: "true", "data-index": String(index) }, [
      thumb(product),
      el("div", {}, [
        el("h2", { text: product.name }),
        el("p", { class: "meta", text: `${money(product.price_cents)}${product.sold_out ? " · Sold out" : ""}${product.active ? "" : " · Hidden"}` }),
        el("div", { class: "row" }, [
          el("button", { class: "mini", type: "button", "data-edit": product.id, text: "Edit" }),
          el("button", { class: "mini", type: "button", "data-up": String(index), text: "Up", disabled: index === 0 }),
          el("button", { class: "mini", type: "button", "data-down": String(index), text: "Down", disabled: index === ui.products.length - 1 }),
        ]),
      ]),
    ]),
  );
  shell(
    el("section", {}, [
      el("button", { class: "btn wide", id: "add-item", type: "button", text: "Add item" }),
      items.length ? el("div", { class: "card", id: "product-list" }, items) : el("p", { class: "help", text: "No pieces yet. Add the first one." }),
    ]),
  );
}

function sizeChips(selected) {
  return el(
    "div",
    { class: "row", id: "size-chips" },
    PRESET_SIZES.map((size) =>
      el("button", {
        type: "button",
        class: "chip",
        "data-size": size,
        "aria-pressed": selected.includes(size) ? "true" : "false",
        text: size === "OS" ? "One size" : size,
      }),
    ),
  );
}

function photoRow(src, index, total) {
  return el("div", { class: "photo" }, [
    el("img", { src, alt: "" }),
    el("div", { class: "row" }, [
      el("button", { class: "mini", type: "button", "data-photo-up": String(index), text: "Up", disabled: index === 0 }),
      el("button", { class: "mini", type: "button", "data-photo-down": String(index), text: "Down", disabled: index === total - 1 }),
      el("button", { class: "mini", type: "button", "data-photo-delete": String(index), text: "Remove" }),
    ]),
  ]);
}

function editor(product) {
  const sizes = Array.isArray(product.sizes) ? product.sizes.slice() : [];
  const images = Array.isArray(product.images) ? product.images.slice() : [];
  const dollars = product.price_cents == null ? "" : String(product.price_cents / 100);
  shell(
    el("form", { id: "product-form", class: "card" }, [
      el("button", { class: "btn ghost", type: "button", id: "back", text: "Back" }),
      el("h2", { text: product.id ? "Edit item" : "New item" }),
      el("label", { for: "name", text: "Name" }),
      el("input", { id: "name", name: "name", type: "text", value: product.name || "", required: true }),
      el("label", { for: "price", text: "Price in dollars" }),
      el("input", { id: "price", name: "price", type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "Leave blank for Coming soon", value: dollars }),
      el("label", { for: "description", text: "Description" }),
      el("textarea", { id: "description", name: "description", text: product.description || "" }),
      el("label", { text: "Sizes" }),
      sizeChips(sizes),
      el("div", { class: "row" }, [
        el("input", { id: "custom-size", type: "text", placeholder: "Custom size" }),
        el("button", { class: "mini", type: "button", id: "add-size", text: "Add size" }),
      ]),
      el("label", { for: "category", text: "Category" }),
      el("input", { id: "category", name: "category", type: "text", value: product.category || "", placeholder: "hats, tees, hoodies" }),
      toggle("Sold out", "sold_out", product.sold_out),
      toggle("Featured", "featured", product.featured),
      toggle("Show on site", "active", product.active !== false),
      el("label", { for: "buy_url", text: "Buy link" }),
      el("input", { id: "buy_url", name: "buy_url", type: "url", placeholder: "https://", value: product.buy_url || "" }),
      el("label", { text: "Photos" }),
      el("p", { class: "help", text: "Take a photo or pick one from your gallery. We shrink it before upload." }),
      el("input", { id: "photos", type: "file", accept: "image/*", multiple: true }),
      el("div", { class: "photos", id: "photo-list" }, images.map((src, index) => photoRow(src, index, images.length))),
      el("p", { class: "error", id: "form-error", hidden: true }),
      el("div", { class: "actions" }, [
        el("button", { class: "btn wide", type: "submit", text: "Save" }),
        product.id ? el("button", { class: "btn danger wide", type: "button", id: "delete-item", text: "Delete item" }) : null,
      ]),
    ]),
  );
  $("#product-form").dataset.sizes = JSON.stringify(sizes);
  $("#product-form").dataset.images = JSON.stringify(images);
  $("#product-form").dataset.id = product.id || "";
}

function toggle(label, name, on) {
  return el("label", { class: "toggle" }, [
    el("span", { text: label }),
    el("input", { type: "checkbox", name, checked: on ? true : null }),
  ]);
}

function brandForm() {
  const settings = ui.settings || {};
  shell(
    el("form", { id: "brand-form", class: "card" }, [
      el("h2", { text: "Brand" }),
      el("label", { text: "Logo" }),
      settings.logo_url ? el("img", { class: "thumb", src: settings.logo_url, alt: "Current logo" }) : null,
      el("input", { id: "logo", type: "file", accept: "image/*" }),
      field("Tagline", "tagline", settings.tagline),
      el("label", { for: "bio", text: "Bio" }),
      el("textarea", { id: "bio", name: "bio", text: settings.bio || "" }),
      field("Music link", "music_url", settings.music_url, "url"),
      field("Instagram link", "instagram_url", settings.instagram_url, "url"),
      field("Announcement bar", "announcement", settings.announcement),
      el("p", { class: "help", text: "Leave the announcement blank to hide the bar." }),
      el("label", { for: "accent_color", text: "Accent color" }),
      el("input", { id: "accent_color", name: "accent_color", type: "color", value: settings.accent_color || "#c8102e" }),
      field("Stripe link", "stripe_link", settings.stripe_link, "url"),
      field("PayPal link", "paypal_link", settings.paypal_link, "url"),
      field("Contact email", "contact_email", settings.contact_email, "email"),
      el("p", { class: "error", id: "form-error", hidden: true }),
      el("div", { class: "actions" }, [el("button", { class: "btn wide", type: "submit", text: "Save" })]),
    ]),
  );
}

function field(label, name, value, type = "text") {
  return el("div", {}, [
    el("label", { for: name, text: label }),
    el("input", { id: name, name, type, value: value || "" }),
  ]);
}

function statusLabel(status) {
  return { new: "New", in_progress: "In progress", done: "Done", needs_info: "Needs info" }[status] || "New";
}

function askView() {
  const history = ui.requests.map((request) =>
    el("article", { class: "bubble" }, [
      el("p", { class: "who", text: new Date(request.created_at).toLocaleString() }),
      el("p", { text: request.message }),
      el("span", { class: "badge", text: statusLabel(request.status) }),
      request.reply ? el("div", { class: "reply" }, [el("p", { class: "who", text: "Ace Apps" }), el("p", { text: request.reply })]) : null,
    ]),
  );
  shell(
    el("section", { class: "chat" }, [
      el("form", { id: "ask-form", class: "card" }, [
        el("h2", { text: "Ask the assistant" }),
        el("p", { class: "help", text: "Ace Apps' assistant reads these and makes the change, usually within a few hours." }),
        el("label", { for: "message", text: "What should change?" }),
        el("textarea", { id: "message", name: "message", placeholder: "Add a red hoodie, $60", required: true }),
        el("label", { for: "attachments", text: "Photos, optional" }),
        el("input", { id: "attachments", type: "file", accept: "image/*", multiple: true }),
        el("p", { class: "error", id: "form-error", hidden: true }),
        el("div", { class: "actions" }, [el("button", { class: "btn wide", type: "submit", text: "Send" })]),
      ]),
      ...history,
    ]),
  );
}

function render() {
  if (ui.tab === "brand") brandForm();
  else if (ui.tab === "ask") askView();
  else if (ui.editing) editor(ui.editing);
  else productList();
}

let gateMessage = "";

async function requireAdmin(session) {
  const { data, error } = await supabase.rpc("wl_is_admin");
  if (error || data !== true) {
    gateMessage = "This email isn't approved yet, ask Ace Apps to add you";
    await supabase.auth.signOut();
    return false;
  }
  ui.email = session.user.email || ui.email;
  return true;
}

async function loadShop() {
  const [productsRes, settingsRes, requestsRes] = await Promise.all([
    supabase.from("wl_products").select("*").order("sort_order", { ascending: true }),
    supabase.from("wl_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("wl_requests").select("*").order("created_at", { ascending: false }),
  ]);
  if (productsRes.error) throw productsRes.error;
  if (settingsRes.error) throw settingsRes.error;
  if (requestsRes.error) throw requestsRes.error;
  ui.products = productsRes.data || [];
  ui.settings = settingsRes.data;
  ui.requests = requestsRes.data || [];
}

async function enterApp(session) {
  const ok = await requireAdmin(session);
  if (!ok) return;
  try {
    await loadShop();
    render();
    startRefresh();
  } catch (error) {
    loginView(friendly(error));
  }
}

function startRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    if (ui.tab !== "ask" || ui.editing) return;
    try {
      const { data, error } = await supabase.from("wl_requests").select("*").order("created_at", { ascending: false });
      if (error) return;
      ui.requests = data || [];
      if (ui.tab === "ask") render();
    } catch {
      /* Keep the current list if the refresh misses. */
    }
  }, 30000);
}

async function resizeImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("image");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  const webp = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  if (webp) return { blob: webp, type: "image/webp", ext: "webp" };
  const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!jpeg) throw new Error("image");
  return { blob: jpeg, type: "image/jpeg", ext: "jpg" };
}

async function uploadImage(file, folder) {
  const image = await resizeImage(file);
  const path = `${folder}/${crypto.randomUUID()}.${image.ext}`;
  const { error } = await supabase.storage.from("wl-media").upload(path, image.blob, { contentType: image.type, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("wl-media").getPublicUrl(path);
  return data.publicUrl;
}

function storagePath(url) {
  const marker = "/wl-media/";
  const index = String(url).indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(String(url).slice(index + marker.length).split("?")[0]);
}

async function saveOrder(list) {
  for (let index = 0; index < list.length; index += 1) {
    const { error } = await supabase
      .from("wl_products")
      .update({ sort_order: index + 1, updated_at: new Date().toISOString() })
      .eq("id", list[index].id);
    if (error) throw error;
  }
  ui.products = list.map((item, index) => ({ ...item, sort_order: index + 1 }));
}

function formError(message) {
  const node = $("#form-error");
  if (!node) return;
  node.hidden = !message;
  node.textContent = message || "";
}

function readEditor() {
  const form = $("#product-form");
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  if (!name) throw new Error("name");
  return {
    id: form.dataset.id || null,
    name,
    description: String(data.get("description") || "").trim(),
    price_cents: centsFromDollars(data.get("price")),
    category: String(data.get("category") || "").trim() || null,
    sold_out: Boolean($("[name=sold_out]").checked),
    featured: Boolean($("[name=featured]").checked),
    active: Boolean($("[name=active]").checked),
    buy_url: String(data.get("buy_url") || "").trim() || null,
    sizes: JSON.parse(form.dataset.sizes || "[]"),
    images: JSON.parse(form.dataset.images || "[]"),
  };
}

function refreshEditorLists() {
  const form = $("#product-form");
  if (!form) return;
  const images = JSON.parse(form.dataset.images || "[]");
  $("#photo-list").replaceChildren(...images.map((src, index) => photoRow(src, index, images.length)));
  const sizes = JSON.parse(form.dataset.sizes || "[]");
  $("#size-chips").querySelectorAll("[data-size]").forEach((button) => {
    button.setAttribute("aria-pressed", sizes.includes(button.dataset.size) ? "true" : "false");
  });
}

async function onSubmitProduct(event) {
  event.preventDefault();
  formError("");
  let draft;
  try {
    draft = readEditor();
  } catch (error) {
    formError(error.message === "name" ? "Add a name for this piece." : friendly(error));
    return;
  }
  try {
    const payload = {
      name: draft.name,
      description: draft.description,
      price_cents: draft.price_cents,
      category: draft.category,
      sold_out: draft.sold_out,
      featured: draft.featured,
      active: draft.active,
      buy_url: draft.buy_url,
      sizes: draft.sizes,
      images: draft.images,
      updated_at: new Date().toISOString(),
    };
    if (draft.id) {
      const { error } = await supabase.from("wl_products").update(payload).eq("id", draft.id);
      if (error) throw error;
    } else {
      payload.slug = slugify(draft.name);
      payload.sort_order = ui.products.length + 1;
      let inserted = await supabase.from("wl_products").insert(payload).select("*").single();
      if (inserted.error && /duplicate|23505/i.test(`${inserted.error.code || ""} ${inserted.error.message || ""}`)) {
        payload.slug = `${payload.slug}-${crypto.randomUUID().slice(0, 4)}`;
        inserted = await supabase.from("wl_products").insert(payload).select("*").single();
      }
      if (inserted.error) throw inserted.error;
      draft.id = inserted.data.id;
    }
    await loadShop();
    ui.editing = ui.products.find((item) => item.id === draft.id) || null;
    toast();
    render();
  } catch (error) {
    formError(friendly(error));
  }
}

async function onSubmitBrand(event) {
  event.preventDefault();
  formError("");
  const data = new FormData(event.currentTarget);
  const file = $("#logo").files?.[0];
  try {
    let logoUrl = ui.settings?.logo_url || null;
    if (file) logoUrl = await uploadImage(file, "brand");
    const payload = {
      tagline: String(data.get("tagline") || "").trim() || null,
      bio: String(data.get("bio") || "").trim() || null,
      music_url: String(data.get("music_url") || "").trim() || null,
      instagram_url: String(data.get("instagram_url") || "").trim() || null,
      announcement: String(data.get("announcement") || "").trim() || null,
      accent_color: String(data.get("accent_color") || "").trim() || null,
      stripe_link: String(data.get("stripe_link") || "").trim() || null,
      paypal_link: String(data.get("paypal_link") || "").trim() || null,
      contact_email: String(data.get("contact_email") || "").trim() || null,
      logo_url: logoUrl,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("wl_settings").update(payload).eq("id", 1);
    if (error) throw error;
    await loadShop();
    toast();
    render();
  } catch (error) {
    formError(error.message === "image" ? "That file isn't a photo." : friendly(error));
  }
}

async function onSubmitAsk(event) {
  event.preventDefault();
  formError("");
  const data = new FormData(event.currentTarget);
  const message = String(data.get("message") || "").trim();
  if (!message) {
    formError("Write what you want changed.");
    return;
  }
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user?.email) throw userError || new Error("auth");
    const files = [...($("#attachments").files || [])];
    const attachments = [];
    for (const file of files) attachments.push(await uploadImage(file, "requests"));
    const { error } = await supabase.from("wl_requests").insert({
      created_by: userData.user.email,
      message,
      attachments,
      status: "new",
    });
    if (error) throw error;
    await loadShop();
    toast("Sent ✓");
    render();
  } catch (error) {
    formError(error.message === "image" ? "That file isn't a photo." : friendly(error));
  }
}

async function sendCode() {
  ui.email = $("#email").value.trim();
  if (!ui.email) {
    loginView("Add the email Ace Apps approved.");
    return;
  }
  const { error } = await supabase.auth.signInWithOtp({
    email: ui.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${location.origin}/wickedlyfe/admin/`,
    },
  });
  if (error) {
    loginView(friendly(error));
    return;
  }
  ui.codeSent = true;
  loginView("Check your email for the code or the sign-in link.");
}

async function verifyCode() {
  const token = $("#code")?.value.trim();
  if (!token) {
    loginView("Enter the 6-digit code from the email.");
    ui.codeSent = true;
    return;
  }
  const { error } = await supabase.auth.verifyOtp({ email: ui.email, token, type: "email" });
  if (error) {
    ui.codeSent = true;
    loginView(friendly(error));
  }
}

function mockProducts() {
  return [
    { id: "preview-hat", name: "Mix Media 90s Hat", price_cents: 5000, sold_out: false, active: true, images: [], category: "hats" },
    { id: "preview-sweater", name: "Custom Bleach-Dye Overhood Sweater", price_cents: null, sold_out: true, active: true, images: [], category: "sweaters" },
    { id: "preview-tee", name: "Wicked Lyfe Graphic Tee", price_cents: null, sold_out: false, active: true, images: [], category: "tees" },
    { id: "preview-hoodie", name: "Wicked Lyfe Graphic Hoodie", price_cents: null, sold_out: false, active: true, images: [], category: "hoodies" },
  ];
}

function showPreview() {
  ui.products = mockProducts();
  ui.tab = "products";
  ui.editing = null;
  app.replaceChildren(
    el("div", {}, [
      el("p", { class: "banner", text: "Layout preview. This is not signed in and cannot change the shop." }),
      el("div", { class: "tabs" }, [tabButton("products", "Products"), tabButton("brand", "Brand"), tabButton("ask", "Ask")]),
      el("section", {}, [
        el("button", { class: "btn wide", type: "button", text: "Add item" }),
        el(
          "div",
          { class: "card" },
          ui.products.map((product, index) =>
            el("article", { class: "item" }, [
              thumb(product),
              el("div", {}, [
                el("h2", { text: product.name }),
                el("p", { class: "meta", text: `${money(product.price_cents)}${product.sold_out ? " · Sold out" : ""}` }),
                el("div", { class: "row" }, [
                  el("button", { class: "mini", type: "button", text: "Edit" }),
                  el("button", { class: "mini", type: "button", text: "Up", disabled: index === 0 }),
                  el("button", { class: "mini", type: "button", text: "Down", disabled: index === ui.products.length - 1 }),
                ]),
              ]),
            ]),
          ),
        ),
      ]),
    ]),
  );
}

document.addEventListener("click", async (event) => {
  const tab = event.target.closest("[data-tab]");
  if (tab && !new URLSearchParams(location.search).has("preview")) {
    ui.tab = tab.dataset.tab;
    ui.editing = null;
    render();
    return;
  }
  if (event.target.closest("#send-code")) {
    await sendCode();
    return;
  }
  if (event.target.closest("#verify-code")) {
    await verifyCode();
    return;
  }
  if (event.target.closest("#sign-out")) {
    clearInterval(refreshTimer);
    await supabase.auth.signOut();
    ui.codeSent = false;
    loginView();
    return;
  }
  if (event.target.closest("#add-item")) {
    ui.editing = { name: "", sizes: ["OS"], images: [], active: true, sold_out: false, featured: false, price_cents: null };
    render();
    return;
  }
  const edit = event.target.closest("[data-edit]");
  if (edit) {
    ui.editing = ui.products.find((item) => item.id === edit.dataset.edit) || null;
    render();
    return;
  }
  if (event.target.closest("#back")) {
    ui.editing = null;
    render();
    return;
  }
  const up = event.target.closest("[data-up]");
  const down = event.target.closest("[data-down]");
  if (up || down) {
    const index = Number((up || down).dataset.up || (up || down).dataset.down);
    const next = index + (up ? -1 : 1);
    const copy = ui.products.slice();
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    try {
      await saveOrder(copy);
      toast();
      render();
    } catch (error) {
      formError(friendly(error));
    }
    return;
  }
  const size = event.target.closest("[data-size]");
  if (size && $("#product-form")) {
    const form = $("#product-form");
    const sizes = JSON.parse(form.dataset.sizes || "[]");
    const value = size.dataset.size;
    const next = sizes.includes(value) ? sizes.filter((item) => item !== value) : [...sizes, value];
    form.dataset.sizes = JSON.stringify(next);
    refreshEditorLists();
    return;
  }
  if (event.target.closest("#add-size")) {
    const form = $("#product-form");
    const input = $("#custom-size");
    const value = input.value.trim();
    if (!value) return;
    const sizes = JSON.parse(form.dataset.sizes || "[]");
    if (!sizes.includes(value)) sizes.push(value);
    form.dataset.sizes = JSON.stringify(sizes);
    input.value = "";
    refreshEditorLists();
    return;
  }
  const photoUp = event.target.closest("[data-photo-up]");
  const photoDown = event.target.closest("[data-photo-down]");
  if ((photoUp || photoDown) && $("#product-form")) {
    const form = $("#product-form");
    const images = JSON.parse(form.dataset.images || "[]");
    const index = Number((photoUp || photoDown).dataset.photoUp || (photoUp || photoDown).dataset.photoDown);
    const next = index + (photoUp ? -1 : 1);
    const [item] = images.splice(index, 1);
    images.splice(next, 0, item);
    form.dataset.images = JSON.stringify(images);
    refreshEditorLists();
    return;
  }
  const removePhoto = event.target.closest("[data-photo-delete]");
  if (removePhoto && $("#product-form")) {
    const form = $("#product-form");
    const images = JSON.parse(form.dataset.images || "[]");
    const [removed] = images.splice(Number(removePhoto.dataset.photoDelete), 1);
    form.dataset.images = JSON.stringify(images);
    refreshEditorLists();
    const path = storagePath(removed);
    if (path) supabase.storage.from("wl-media").remove([path]).catch(() => {});
    return;
  }
  if (event.target.closest("#delete-item")) {
    const id = $("#product-form")?.dataset.id;
    if (!id || !confirm("Delete this item? This cannot be undone.")) return;
    try {
      const { error } = await supabase.from("wl_products").delete().eq("id", id);
      if (error) throw error;
      ui.editing = null;
      await loadShop();
      toast();
      render();
    } catch (error) {
      formError(friendly(error));
    }
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "product-form") onSubmitProduct(event);
  if (event.target.id === "brand-form") onSubmitBrand(event);
  if (event.target.id === "ask-form") onSubmitAsk(event);
});

document.addEventListener("change", async (event) => {
  if (event.target.id !== "photos" || !$("#product-form")) return;
  const form = $("#product-form");
  const images = JSON.parse(form.dataset.images || "[]");
  formError("");
  try {
    for (const file of event.target.files || []) images.push(await uploadImage(file, "products"));
    form.dataset.images = JSON.stringify(images);
    event.target.value = "";
    refreshEditorLists();
  } catch (error) {
    formError(error.message === "image" ? "That file isn't a photo." : friendly(error));
  }
});

document.addEventListener("dragstart", (event) => {
  const item = event.target.closest(".item");
  if (!item) return;
  event.dataTransfer?.setData("text/plain", item.dataset.index || "");
});

document.addEventListener("dragover", (event) => {
  if (event.target.closest(".item")) event.preventDefault();
});

document.addEventListener("drop", async (event) => {
  const target = event.target.closest(".item");
  if (!target) return;
  event.preventDefault();
  const from = Number(event.dataTransfer?.getData("text/plain"));
  const to = Number(target.dataset.index);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return;
  const copy = ui.products.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  try {
    await saveOrder(copy);
    toast();
    render();
  } catch (error) {
    formError(friendly(error));
  }
});

if (new URLSearchParams(location.search).get("preview") === "1") {
  showPreview();
} else {
  let sawSession = false;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      sawSession = false;
      loginView(gateMessage);
      gateMessage = "";
      return;
    }
    if (!session) {
      if (!sawSession) loginView();
      return;
    }
    if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
      if (sawSession && event === "INITIAL_SESSION") return;
      sawSession = true;
      enterApp(session);
    }
  });
  supabase.auth.getSession().then(({ data }) => {
    if (!data.session && !app.childElementCount) loginView();
  });
}
