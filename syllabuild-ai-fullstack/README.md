# syllAbuIld.ai — Fullstack Starter (Frontend + Backend)

This package includes:
- **frontend/** Vite + React app
- **backend/** Express API that calls OpenAI (API key stays server-side)

## 1) Backend
### Windows PowerShell
```powershell/cmd
cd backend
npm install
npm run dev
```

Health check:
- http://localhost:3001/api/health

## 2) Frontend
Open a new terminal:
```powershell
cd frontend
npm install
npm run dev
```

Open:
- http://localhost:5173

## Notes
- PDF + DOCX text extraction is local in the browser.
- JPG/PNG uses backend OCR endpoint.
- After the test, click **Generate Focused Review Course** to create a remediation course.