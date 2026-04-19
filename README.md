# Escalation

**Escape the Outage** — a text-based incident response game. It's 2:47 AM. Something is down. You're on call.

Five scenarios (fiber cut, BGP flap, angry customer, DNSSEC rollover, cert chain expiry) with an evidence board, focus/SLA/credibility mechanics, interrupts, and a scored debrief.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Build for production

```bash
npm run build
npm run preview     # local check of the production build
```

The static build is emitted to `dist/`.

## Deploying to GitHub Pages

A workflow at `.github/workflows/deploy.yml` builds and deploys on every push to `main`.

One-time setup on the GitHub side:

1. Push this repo to GitHub (see below).
2. In the repo, go to **Settings → Pages**.
3. Under **Source**, pick **GitHub Actions**.
4. (Optional) Trigger the workflow manually under **Actions → Deploy** if the first push didn't trigger it.

Your game will be published to `https://<your-username>.github.io/Escalation/`.

`vite.config.ts` uses a **relative** base path (`base: "./"`) so the build works both from that path AND from a custom domain without needing a rebuild.

## Pointing a custom subdomain (e.g. `escalation.your-domain.com`)

1. Create a file `public/CNAME` whose only contents is your domain, e.g. `escalation.your-domain.com`.
2. Commit and push — the workflow copies `public/` into the build output, so the `CNAME` will be served at the site root.
3. In your DNS provider, add a `CNAME` record:
   - `escalation` → `<your-username>.github.io`
4. In **Settings → Pages → Custom domain**, enter the same value and enable **Enforce HTTPS** once DNS propagates.

For an apex domain (e.g. `escalation.com`, no subdomain), set `A` records to GitHub Pages' IPs as documented at
https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site.

## File layout

```
.
├── .github/workflows/deploy.yml   GitHub Actions build+deploy
├── public/                         Static assets copied verbatim (put CNAME here)
├── src/
│   ├── App.tsx                     The game (one big self-contained component)
│   ├── main.tsx                    React entry point
│   └── index.css                   Tailwind directives + baseline styles
├── index.html                      Vite HTML entry
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```
