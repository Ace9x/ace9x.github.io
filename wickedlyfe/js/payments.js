/** Payment-link helpers. Paste Stripe Payment Links or PayPal URLs in data/products.json. */

export function isPlaceholder(value) {
  if (value == null) return true;
  const text = String(value).trim();
  if (!text) return true;
  return /REPLACE_ME|PASTE_|YOUR_LINK|YOUR_PAYMENT_LINK|YOUR_ID/i.test(text);
}

export function httpsUrl(value) {
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

export function describeLink(value) {
  const url = httpsUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let kind = "link";
  let label = "Checkout";
  if (host === "buy.stripe.com" || host === "donate.stripe.com") {
    kind = "stripe";
    label = "Pay with Stripe";
  } else if (host === "paypal.me" || host === "paypal.com" || host.endsWith(".paypal.com")) {
    kind = "paypal";
    label = "Pay with PayPal";
  }
  return { href: url.toString(), kind, label };
}

/**
 * Resolve the checkout buttons for a product.
 * A size entry in paymentsBySize wins when that size has its own link.
 */
export function paymentOptions(product, size) {
  const payments = product?.payments && typeof product.payments === "object" ? product.payments : {};
  const bySize = product?.paymentsBySize && size ? product.paymentsBySize[size] : null;
  const sized = bySize && ["stripe", "paypal", "link"].some((key) => !isPlaceholder(bySize[key]));
  const source = sized ? bySize : payments;
  const options = [];
  const seen = new Set();
  for (const key of ["stripe", "paypal", "link"]) {
    const item = describeLink(source?.[key]);
    if (!item || seen.has(item.href)) continue;
    seen.add(item.href);
    options.push(item);
  }
  return options;
}
