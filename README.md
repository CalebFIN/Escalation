# Escalation

It's 2:47 AM. Something is down. You're on call.

**Escape the Outage** is a short, text-based incident response game. Four scenarios: a fiber cut, a sneaky upstream carrier, an angry customer called Kevin, and a call where Kevin is absolutely certain the whole internet is broken (it is not). Investigate, commit to a root cause, try to keep your credibility intact.

## Play it locally

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Ship it

```bash
npm run build        # static build in dist/
npm run preview      # sanity-check the production build
```

Every push to `main` auto-deploys to GitHub Pages via `.github/workflows/deploy.yml`. First time only: in the repo, go to **Settings → Pages → Source** and pick **GitHub Actions**. After that, commits deploy themselves.

The build uses a relative base path, so it works at `https://<user>.github.io/Escalation/` or behind a custom domain without a rebuild. To point a subdomain, drop your hostname into `public/CNAME` and add a DNS `CNAME` record at `<user>.github.io`.

## File layout

```
.
├── .github/workflows/deploy.yml   GitHub Actions build + deploy
├── public/                         Static assets (put CNAME here if using a custom domain)
├── src/
│   ├── App.tsx                     The whole game, one file
│   ├── main.tsx                    React entry
│   └── index.css                   Tailwind + baseline styles
├── index.html
├── package.json
├── vite.config.ts
└── tailwind.config.js
```
