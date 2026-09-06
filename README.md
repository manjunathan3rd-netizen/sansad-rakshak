# Sansad-Rakshak 🛡️ — AI-Powered MPLAD Monitoring & Risk Intelligence System

A demo-ready risk intelligence dashboard for tracking MPLAD fund allocation, expenditure,
and project delays — with client-side explainable risk scoring, a contractor network
graph, and a local natural-language assistant.

**Live features:** synthetic 64-project dataset, transparent weighted risk engine
(fund–progress mismatch, utilization-rush detection, overdue tracking, contractor
concentration), factor-level explanations, auto-generated inquiry memo (.txt download),
contractor network graph, alert verification workflow, and an in-browser Q&A assistant.

This is a frontend-only MVP: all "AI" scoring runs as real JavaScript in the browser
(no backend, no external API calls, no database yet). See **Roadmap** below for the
production path.

---

## 1. Run it locally

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

## 2. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: Sansad-Rakshak MPLAD risk intelligence MVP"
git branch -M main
git remote add origin https://github.com/<your-username>/sansad-rakshak.git
git push -u origin main
```

(Create the empty repo on GitHub first, without a README, so there's no merge conflict.)

## 3. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New → Project**, select the `sansad-rakshak` repo.
3. Vercel auto-detects Vite. Leave the defaults:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Click **Deploy**.
5. You'll get a live URL like `sansad-rakshak.vercel.app` — open it on your phone,
   share it with judges, put it in your README/pitch deck.

Every future `git push` to `main` auto-redeploys.

## 4. Tech stack

React 18 + Vite, Tailwind CSS, Recharts, lucide-react. No backend required for this MVP.

## 5. Roadmap to production

- Replace the in-browser risk engine with a real trained model (Isolation Forest / XGBoost)
  served from a FastAPI backend
- Add PostgreSQL + PostGIS for real project/fund/contractor data
- Wire the AI Assistant to a real LLM (Groq/Gemini) with RAG over live project data
- Real PDF report generation (WeasyPrint) instead of `.txt`
- Officer authentication (JWT/RBAC) and a public citizen transparency portal
- Real-time WebSocket alerts + SMS/WhatsApp push

## License

MIT
