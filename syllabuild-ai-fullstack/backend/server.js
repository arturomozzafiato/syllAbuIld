import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 3001);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_URL = "https://api.openai.com/v1/responses";

// Safer defaults (you can override via env)
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1";
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";

// For local dev only
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";

app.use(express.json({ limit: "25mb" }));

// ✅ In production (single-link hosting), don’t enable CORS at all.
// That keeps your API from being callable by random websites.
if (!IS_PROD) {
  const allowed = CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: allowed.length ? allowed : true }));
}

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text);
      }
    } else if (item?.type === "output_text" && typeof item.text === "string") {
      parts.push(item.text);
    }
  }
  return parts.join("");
}

async function openaiResponses({ model, input, max_output_tokens = 4000, json_object = false }) {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY. Set it in backend/.env (or hosting env vars).");

  const body = {
    model,
    input,
    max_output_tokens,
    truncation: "auto",
    ...(json_object ? { text: { format: { type: "json_object" } } } : {}),
  };

  const r = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d?.error?.message || d?.message || `OpenAI error (${r.status})`;
    throw new Error(msg);
  }
  return d;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, env: NODE_ENV, time: new Date().toISOString() });
});

app.post("/api/ai/ocr-image", async (req, res) => {
  try {
    const { imageDataUrl, instruction, model } = req.body || {};
    if (!imageDataUrl) return res.status(400).json({ error: "imageDataUrl is required" });

    const usedModel = model || OPENAI_VISION_MODEL;
    const usedInstruction =
      instruction || "OCR this image and extract ALL visible text verbatim. Return only raw text.";

    const input = [
      {
        role: "user",
        content: [
          { type: "input_text", text: usedInstruction },
          { type: "input_image", image_url: imageDataUrl },
        ],
      },
    ];

    const d = await openaiResponses({
      model: usedModel,
      input,
      max_output_tokens: 4000,
      json_object: false,
    });

    res.json({ text: extractText(d) });
  } catch (e) {
    res.status(500).json({ error: e.message || "OCR failed" });
  }
});

// ---------- 2-pass generation to avoid truncated JSON ----------

function buildCourseOnlyPrompt({ syllabusText, settings }) {
  const minWords = settings?.minimumLessonWords ?? 300;

  return `You are an expert curriculum designer. Create a comprehensive, detailed course from the syllabus below.

Return ONLY a valid JSON object (no markdown fences) with this EXACT structure (NO finalTest in this step):
{
  "courseTitle": "string",
  "courseDescription": "string (2-3 sentences)",
  "units": [
    {
      "id": "u1",
      "title": "Unit 1: Title",
      "description": "string",
      "lessons": [
        {
          "id": "u1l1",
          "title": "string",
          "content": "Thorough lesson content — minimum ${minWords} words. Include explanations, examples, and elaboration.",
          "keyPoints": ["string","string","string","string"]
        }
      ]
    }
  ]
}

Rules:
- Cover ALL major topics from the syllabus. Do NOT skip sections.
- Create as many units and lessons as needed for full coverage, but keep content tight and high-signal.
- Each lesson content must be ${minWords}+ words with examples.
- Return ONLY the JSON, nothing else.

SYLLABUS:
${syllabusText}`;
}

function buildQuizOnlyPrompt({ courseOutline, settings }) {
  const quizCount = settings?.quizCountTarget ?? 20;

  return `You are an expert examiner. Create a final test for the course outline below.

Return ONLY a valid JSON object (no markdown fences) with this EXACT structure:
{
  "finalTest": {
    "questions": [
      {
        "id": "q1",
        "question": "string",
        "options": ["Option A text","Option B text","Option C text","Option D text"],
        "correctAnswer": 0,
        "explanation": "string"
      }
    ]
  }
}

Rules:
- Create exactly ${quizCount} MCQs covering ALL units and lessons.
- Questions must test understanding and application, not just recall.
- correctAnswer is 0-indexed (0=A,1=B,2=C,3=D)
- IMPORTANT: Distribute correct answers across A/B/C/D (avoid bias).
- Return ONLY JSON, nothing else.

COURSE OUTLINE:
${JSON.stringify(courseOutline, null, 2)}`;
}

function safeParseJson(raw) {
  // json_object mode should already be valid JSON, but keep a fallback
  try {
    return JSON.parse(raw);
  } catch {
    const m = String(raw || "").match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Model output was not valid JSON.");
    return JSON.parse(m[0]);
  }
}

app.post("/api/ai/generate-course", async (req, res) => {
  try {
    const { syllabusText, settings, model } = req.body || {};
    if (!syllabusText || typeof syllabusText !== "string") {
      return res.status(400).json({ error: "syllabusText (string) is required" });
    }

    const usedModel = model || OPENAI_MODEL;
    const trimmed = syllabusText.slice(0, 24000);

    // Pass 1: course (no quiz)
    const coursePrompt = buildCourseOnlyPrompt({ syllabusText: trimmed, settings });
    const d1 = await openaiResponses({
      model: usedModel,
      input: [{ role: "user", content: coursePrompt }],
      max_output_tokens: 12000,
      json_object: true,
    });

    const courseObj = safeParseJson(extractText(d1));

    // Pass 2: quiz only
    const outlineForQuiz = {
      courseTitle: courseObj.courseTitle,
      units: (courseObj.units || []).map((u) => ({
        id: u.id,
        title: u.title,
        lessons: (u.lessons || []).map((l) => ({ id: l.id, title: l.title })),
      })),
    };

    const quizPrompt = buildQuizOnlyPrompt({ courseOutline: outlineForQuiz, settings });
    const d2 = await openaiResponses({
      model: usedModel,
      input: [{ role: "user", content: quizPrompt }],
      max_output_tokens: 5000,
      json_object: true,
    });

    const quizObj = safeParseJson(extractText(d2));

    // Merge
    courseObj.finalTest = quizObj.finalTest;

    res.json({ jsonText: JSON.stringify(courseObj) });
  } catch (e) {
    res.status(500).json({ error: e.message || "Course generation failed" });
  }
});

app.post("/api/ai/analyze-test", async (req, res) => {
  try {
    const { courseTitle, score, wrong, model } = req.body || {};
    const usedModel = model || OPENAI_MODEL;
    if (!Array.isArray(wrong)) return res.status(400).json({ error: "wrong must be an array" });

    const prompt = `A student finished "${courseTitle || "a course"}" scoring ${score?.pct ?? "?"}% (${score?.correct ?? "?"}/${score?.total ?? "?"}).
Incorrect answers (JSON):
${JSON.stringify(wrong, null, 2)}

Provide:
1) Main weak areas/topics (bullet list)
2) Specific study recommendations for each weak area (bullet list)
3) A short encouraging closing message

Be concise and actionable (under 250 words).`;

    const d = await openaiResponses({
      model: usedModel,
      input: [{ role: "user", content: prompt }],
      max_output_tokens: 900,
      json_object: false,
    });

    res.json({ text: extractText(d) });
  } catch (e) {
    res.status(500).json({ error: e.message || "Analysis failed" });
  }
});

function buildFocusedPrompt({ originalCourse, wrongAnswers, priorAnalysis, sourceText, settings }) {
  const minWords = settings?.minimumLessonWords ?? 300;
  const quizCount = settings?.quizCountTarget ?? 18;

  return `You are an expert tutor and curriculum designer.

Goal: Create a NEW course JSON focused primarily on the student's weak areas, while still including only the essential prerequisites needed to understand them.

Return ONLY a valid JSON object:
{
  "courseTitle": "string",
  "courseDescription": "string (2-3 sentences)",
  "units": [
    {
      "id": "u1",
      "title": "Unit 1: Title",
      "description": "string",
      "lessons": [
        {
          "id": "u1l1",
          "title": "string",
          "content": "Minimum ${minWords} words. Clear explanations + examples + practice guidance.",
          "keyPoints": ["string","string","string","string"]
        }
      ]
    }
  ],
  "finalTest": {
    "questions": [
      {
        "id": "q1",
        "question": "string",
        "options": ["Option A","Option B","Option C","Option D"],
        "correctAnswer": 0,
        "explanation": "string"
      }
    ]
  }
}

Inputs:
- Original course outline:
${JSON.stringify(originalCourse, null, 2)}

- Student wrong answers:
${JSON.stringify(wrongAnswers, null, 2)}

- Prior performance analysis:
${priorAnalysis || "(none)"}

Rules:
- Focus heavily on weak areas revealed by wrong answers.
- Include prerequisite refreshers only when needed.
- Create as many units as needed for remediation (typical 5–10).
- Each lesson: ${minWords}+ words, worked examples, and common pitfalls.
- Create ${quizCount} MCQs targeted to weak areas and application.
- Distribute correct answers across A/B/C/D.
- Return ONLY JSON.

Reference syllabus (optional):
${(sourceText || "").slice(0, 24000)}`;
}

app.post("/api/ai/focused-course", async (req, res) => {
  try {
    const { originalCourse, wrongAnswers, priorAnalysis, sourceText, settings, model } = req.body || {};
    const usedModel = model || OPENAI_MODEL;

    if (!originalCourse) return res.status(400).json({ error: "originalCourse is required" });
    if (!Array.isArray(wrongAnswers) || wrongAnswers.length === 0) {
      return res.status(400).json({ error: "wrongAnswers must be a non-empty array" });
    }

    const prompt = buildFocusedPrompt({ originalCourse, wrongAnswers, priorAnalysis, sourceText, settings });

    const d = await openaiResponses({
      model: usedModel,
      input: [{ role: "user", content: prompt }],
      max_output_tokens: 15000,
      json_object: true,
    });

    res.json({ jsonText: extractText(d) });
  } catch (e) {
    res.status(500).json({ error: e.message || "Focused course generation failed" });
  }
});

// ---------- Serve frontend in production (single-link hosting) ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.join(__dirname, "..", "frontend", "dist");

if (IS_PROD) {
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get("*", (req, res) => {
      // keep /api routes above; this catch-all serves the SPA
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  } else {
    console.warn("⚠️ frontend/dist not found. Did you run the frontend build step?");
  }
}

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`NODE_ENV=${NODE_ENV}`);
  if (!IS_PROD) console.log(`CORS origin(s): ${CORS_ORIGIN}`);
});