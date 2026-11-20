# Wicked Lyfe

A static shop and music page for Wicked Lyfe (`@wickedlyfe_inc`). It is plain HTML, CSS, and JavaScript. No build step, no paid services, and no server. GitHub Pages can host it as-is.

Shop checkout sends buyers to Wicked Lyfe's Jim payment page. The link is the **Jim** field in the admin Brand screen (`wl_settings.payment_link`). If that field is empty, or the shop cannot read it, Buy uses https://pay.jim.com/wicked-lyfe-inc-llc. Sold-out pieces show Sold out and have no Buy button. The page stays `noindex`.

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
  "id": "heavyweight-hoodie",
  "name": "Heavyweight Hoodie",
  "price": 85,
  "image": "assets/products/hoodie.jpg",
  "alt": "Black heavyweight hoodie",
  "description": "Heavyweight fleece.",
  "sizes": ["S", "M", "L", "XL"]
}
```

- `price` is what the site displays. On Jim, the buyer types that price into the payment note.
- `currency` at the top of the file changes the display format (`USD`, `EUR`, …).
- Replace a photo by overwriting the file, or point `image` at a new file in the repo. Use a short `alt` description.
- `id` must stay unique. The cart stores it in the browser.
- Delete a product by removing its object. Add one by copying an object and changing the fields.
- `"soldOut": true` keeps the piece on the page and hides Buy.

## Checkout

Buy on an in-stock piece shows a note, then opens the Jim payment page in a new tab (`rel="noopener"`). The note tells the buyer to enter the item name, size, and price in the payment note and to DM @wickedlyfe_inc on Instagram with a shipping address. The same note and link are used for Checkout in the cart. One Jim page covers every piece, so the note lists each item.

The shop reads `payment_link` from `wl_settings`. The admin Brand screen labels that field **Jim**. Leave it blank and the shop uses https://pay.jim.com/wicked-lyfe-inc-llc. Payments go to Wicked Lyfe on that page. The shop does not send checkout through Stripe, PayPal, or another processor.

If the Jim field cannot save because the column is missing, run this in the Supabase SQL editor:

```sql
alter table public.wl_settings
  add column if not exists payment_link text;

update public.wl_settings
set payment_link = 'https://pay.jim.com/wicked-lyfe-inc-llc'
where id = 1
  and (payment_link is null or btrim(payment_link) = '');
```

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

Relative paths are used throughout (`css/`, `js/`, `data/`, `assets/`), so the site works from a project subpath. The shop is served at `https://ace9x.github.io/wickedlyfe/`. `index.html` includes `<meta name="robots" content="noindex">`. Leave that tag in place.

## Fonts

The wordmark uses UnifrakturMaguntia. The rest of the page uses Outfit. Both are under the SIL Open Font License. License texts are in `assets/fonts/`.
