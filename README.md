# syllAbuIld.ai — Fullstack Starter (Frontend + Backend)

This package includes:
- **frontend/** Vite + React app
- **backend/** Express API that calls OpenAI (API key stays server-side)

## 1) Run locally

### Backend
```bash
cd syllabuild-ai-fullstack/backend
npm install
npm run dev
```

Health check:
- http://localhost:3001/api/health

### Frontend
Open a new terminal:
```bash
cd syllabuild-ai-fullstack/frontend
npm install
npm run dev
```

Open:
- http://localhost:5173

---

## 2) Make it accessible through a public link (deployment)

A simple production setup is:
- Deploy **backend** to Render/Railway/Fly.io
- Deploy **frontend** to Vercel/Netlify

### A) Deploy backend (example: Render)
1. Create a new **Web Service** from `syllabuild-ai-fullstack/backend`.
2. Build command:
   - `npm install`
3. Start command:
   - `npm start`
4. Add environment variables:
   - `OPENAI_API_KEY=your_key_here`
   - `NODE_ENV=production`
   - Optional: `OPENAI_MODEL`, `OPENAI_VISION_MODEL`, `PORT`
5. After deploy, copy backend URL (example):
   - `https://your-backend.onrender.com`

### B) Deploy frontend (example: Vercel)
1. Create a new project from `syllabuild-ai-fullstack/frontend`.
2. Framework preset: **Vite**.
3. Add environment variable:
   - `VITE_API_BASE_URL=https://your-backend.onrender.com`
4. Deploy and open the generated Vercel URL.

### C) Verify deployed app
- Open your frontend URL.
- In browser devtools/network, confirm requests go to:
  - `https://your-backend.onrender.com/api/...`
- Check backend health:
  - `https://your-backend.onrender.com/api/health`

---

## Notes
- PDF + DOCX text extraction is local in the browser.
- JPG/PNG uses backend OCR endpoint.
- After the test, click **Generate Focused Review Course** to create a remediation course.
