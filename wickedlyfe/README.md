# Wicked Lyfe

A static shop and music page for Wicked Lyfe (`@wickedlyfe_inc`). It is plain HTML, CSS, and JavaScript. No build step, no paid services, and no server. GitHub Pages can host it as-is.

The clothes, prices, photos, release titles, and player slots are **samples**. Prices are labeled SAMPLE and are not a charge. Nothing is for sale until you paste a real payment link.

## Preview

From this folder:

```bash
python3 -m http.server 47291
```

Open [http://127.0.0.1:47291](http://127.0.0.1:47291).

Do not open `index.html` by double-clicking it. The shop and the players load `data/*.json` with `fetch`, which browsers block on a `file://` page.

## Swap the products

Edit `data/products.json`. Each piece looks like this:

```json
{
  "id": "sample-hoodie",
  "name": "Sample Hoodie",
  "price": 85,
  "image": "assets/products/hoodie.jpg",
  "alt": "Black sample hoodie with a small red cross-stitch on the chest",
  "description": "Heavyweight fleece.",
  "sizes": ["S", "M", "L", "XL"],
  "payments": {
    "stripe": "https://buy.stripe.com/your_payment_link",
    "paypal": ""
  }
}
```

- `price` is what the site **displays**. Stripe or PayPal charges whatever amount you set on that link. Keep the two in sync.
- `currency` at the top of the file changes the display format (`USD`, `EUR`, …).
- Replace a photo by overwriting the file, or point `image` at a new file in the repo. Use a short `alt` description.
- `id` must stay unique. The cart stores it in the browser.
- Delete a product by removing its object. Add one by copying an object and changing the fields.

One size can have its own link. If that size has a link, it is used instead of the product link:

```json
"paymentsBySize": {
  "M": { "stripe": "https://buy.stripe.com/link_for_medium" }
}
```

## Swap the payment links

Checkout is one link per piece, not one combined cart. A static site cannot open a single Stripe session for mixed items without a server. The cart remembers size and quantity, and each line has its own button.

**Stripe Payment Link**

1. In the Stripe Dashboard, create a Payment Link for the piece.
2. Copy the full `https://buy.stripe.com/...` URL.
3. Paste it into `payments.stripe` for that product. Clear the string (`""`) to show the placeholder again.

**PayPal**

Paste either of these into `payments.paypal`:

- A PayPal.me URL, such as `https://paypal.me/yourname/85`
- The https URL of a hosted PayPal button (`paypal.com/...`)

Paste the URL only. Do not paste the PayPal HTML or script snippet. The page will not inject raw HTML.

Leave both strings empty and the cart shows a placeholder note instead of a dead button. When a real https link is present, the button reads **Pay with Stripe** or **Pay with PayPal** and opens in a new tab. Quantity is confirmed on that payment page. The size is shown in the cart so you can match the option you set up on the link.

You can also put any other https checkout URL in `payments.link`. It shows as **Checkout**.

## Swap the music

Edit `data/music.json`.

- The release with `"featured": true` is the new-release block. Clicking another row in the list loads that release into the same players.
- `cover` is the artwork path.
- Empty `spotify`, `apple`, and `youtube` strings keep a labeled sample shell. The page does not load a third-party player until the link is real, so a blank slot cannot throw a console error.

Accepted links:

| Field | Paste |
| --- | --- |
| `spotify` | An `https://open.spotify.com/track/...` (or album, playlist) URL, or the `src` from Spotify’s Share → Embed code |
| `apple` | An `https://music.apple.com/...` link, or the `src` from Apple Music’s embed code (`embed.music.apple.com`) |
| `youtube` | A `youtube.com/watch?v=` URL, a `youtu.be` link, an embed `src`, or the 11-character video id |

Videos live in the `videos` array. Set `youtube` the same way. `poster` is the still image shown before play. Playback starts only after a click.

## Contact form, email, and socials

Edit `data/site.json`.

- `email` is the address shown on the page and the address the forms open in the visitor’s email app.
- Leave `formspreeEndpoint` as `""` to keep the mailto behavior.
- To collect responses on the site, create a free form at [formspree.io](https://formspree.io), then paste the endpoint, for example `https://formspree.io/f/abcdwxyz`. Both the list form and the contact form post there. The “sample form” note goes away once the endpoint is set.
- `socials` is the footer list. An empty `href` hides that network. Instagram is already set to `https://www.instagram.com/wickedlyfe_inc`.

The About paragraphs and the two hero photos live in `index.html`. Replace the sentences in the About section, and replace `assets/hero-night.jpg` and `assets/hero-studio.jpg` (or change the `src`) when the real campaign photos exist.

## Custom domain on GitHub Pages

1. Push this folder to a GitHub repository. The site files stay at the repository root (this project has no build).
2. In the repo, open **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, branch `main`, folder **`/ (root)`**.
3. `.nojekyll` is already in the root so GitHub will not run Jekyll or drop files.
4. Wait until the Pages URL is live, usually `https://USERNAME.github.io/REPO/`.
5. For a domain you own, add a file named `CNAME` (no extension) in the root containing one line, such as `www.yourdomain.com`.
6. At your DNS host:
   - **www**: a CNAME record pointing `www` to `USERNAME.github.io`.
   - **apex** (`yourdomain.com`): A records pointing at `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`. Some DNS hosts let you use an ALIAS or ANAME to `USERNAME.github.io` instead.
7. Back in Pages settings, set the custom domain and turn on **Enforce HTTPS** after the certificate is issued.

Relative paths are used throughout (`css/`, `js/`, `data/`, `assets/`), so the site works from a project subpath. The sample preview is intended for `https://ace9x.github.io/wickedlyfe/`. `index.html` includes `<meta name="robots" content="noindex">` while the catalog is still sample content. Remove that tag when the real shop should be indexed.

## Fonts

The wordmark uses UnifrakturMaguntia. The rest of the page uses Outfit. Both are under the SIL Open Font License. License texts are in `assets/fonts/`.
