import { useEffect, useRef, useState } from "react";
import * as mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";

/** PDF.js worker setup */
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
} catch {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url
    ).toString();
  } catch {
    // pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
}

// ===== Backend-proxied models (server uses env; client only sends desired model name) =====
const AI_MODEL = "gpt-4.1";
const AI_VISION_MODEL = "gpt-4.1-mini";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const apiUrl = (path) => `${API_BASE}${path}`;

const API = {
  OCR_IMAGE: apiUrl("/api/ai/ocr-image"),
  GENERATE_COURSE: apiUrl("/api/ai/generate-course"),
  ANALYZE_TEST: apiUrl("/api/ai/analyze-test"),
  FOCUSED_COURSE: apiUrl("/api/ai/focused-course"),
};

const C = {
  bg: "#0d0d1a",
  bgLight: "#f6f8ff",
  surf: "#13131f",
  surfLight: "#ffffff",
  surf2: "#1a1a2e",
  surf2Light: "#eef2ff",
  border: "#252540",
  borderLight: "#d7defc",
  text: "#e2e8f0",
  textLight: "#111827",
  muted: "#7c8db5",
  mutedLight: "#475569",
  accent: "#6366f1",
  accent2: "#a855f7",
  success: "#22c55e",
  danger: "#ef4444",
};

const card = {
  background: C.surf,
  border: `1px solid ${C.border}`,
  borderRadius: "12px",
  padding: "1.5rem",
};

const inp = {
  width: "100%",
  background: C.surf2,
  border: `1px solid ${C.border}`,
  color: C.text,
  padding: "0.75rem 1rem",
  borderRadius: "8px",
  fontSize: "0.95rem",
  outline: "none",
};

const lbl = {
  fontSize: "0.82rem",
  color: C.muted,
  marginBottom: "0.4rem",
  display: "block",
  fontWeight: 500,
};

const Btn = ({ children, outline, onClick, disabled, full, style: sx = {} }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      background: outline
        ? "transparent"
        : `linear-gradient(135deg,${C.accent},${C.accent2})`,
      color: outline ? C.accent : "#fff",
      border: outline ? `1px solid ${C.accent}` : "none",
      padding: "0.65rem 1.4rem",
      borderRadius: "8px",
      cursor: disabled ? "not-allowed" : "pointer",
      fontWeight: 600,
      fontSize: "0.9rem",
      opacity: disabled ? 0.45 : 1,
      width: full ? "100%" : "auto",
      transition: "opacity 0.2s",
      ...sx,
    }}
  >
    {children}
  </button>
);

const Err = ({ msg }) =>
  msg ? (
    <div
      style={{
        background: "#ef444418",
        border: "1px solid #ef444460",
        color: C.danger,
        padding: "0.75rem 1rem",
        borderRadius: "8px",
        marginBottom: "1rem",
        fontSize: "0.88rem",
      }}
    >
      {msg}
    </div>
  ) : null;

const Info = ({ msg }) =>
  msg ? (
    <div
      style={{
        background: `${C.accent}12`,
        border: `1px solid ${C.accent}40`,
        color: C.accent,
        padding: "0.75rem 1rem",
        borderRadius: "8px",
        marginBottom: "1rem",
        fontSize: "0.88rem",
      }}
    >
      ⏳ {msg}
    </div>
  ) : null;

const Logo = ({ onClick }) => (
  <span
    style={{
      fontWeight: 800,
      fontSize: "1.35rem",
      cursor: "pointer",
      letterSpacing: "-0.5px",
    }}
    onClick={onClick}
  >
    syll<span style={{ color: C.accent }}>A</span>bu
    <span style={{ color: C.accent }}>I</span>ld
    <span style={{ color: C.accent2, fontWeight: 400, fontSize: "0.8rem" }}>
      .ai
    </span>
  </span>
);

const postJSON = async (url, body) => {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || d?.message || `Request failed (${r.status})`);
  return d;
};

const toB64 = (f) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(f);
  });

const normalizeText = (s = "") =>
  s
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const parseJSONLoosely = (raw) => {
  if (!raw || typeof raw !== "string") throw new Error("Empty AI response");
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI response did not contain valid JSON.");
    return JSON.parse(m[0]);
  }
};

const validatePassword = (pw) => {
  const errors = [];
  if (pw.length < 8) errors.push("at least 8 characters");
  if (!/[A-Z]/.test(pw)) errors.push("1 uppercase letter");
  if (!/[a-z]/.test(pw)) errors.push("1 lowercase letter");
  if (!/\d/.test(pw)) errors.push("1 number");
  if (!/[!@#$%^&*()_\-+=[\]{};:'\",.<>/?\\|`~]/.test(pw))
    errors.push("1 special character");

  return {
    ok: errors.length === 0,
    message: errors.length ? `Password must include ${errors.join(", ")}.` : "",
  };
};

const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const shuffleQuestionOptions = (q) => {
  const opts = (q.options || []).slice(0, 4).map((opt, idx) => ({
    text: opt,
    correct: idx === q.correctAnswer,
  }));
  const shuffled = shuffleArray(opts);
  return {
    ...q,
    options: shuffled.map((x) => x.text),
    correctAnswer: shuffled.findIndex((x) => x.correct),
  };
};

const normalizeCourseJSON = (parsed) => {
  const out = { ...parsed };
  out.courseTitle = out.courseTitle || "Untitled Course";
  out.courseDescription =
    out.courseDescription || "AI-generated course from the uploaded syllabus.";

  out.units = Array.isArray(out.units) ? out.units : [];
  out.units = out.units.map((u, ui) => ({
    id: u?.id || `u${ui + 1}`,
    title: u?.title || `Unit ${ui + 1}`,
    description: u?.description || "",
    lessons: Array.isArray(u?.lessons)
      ? u.lessons.map((l, li) => ({
          id: l?.id || `u${ui + 1}l${li + 1}`,
          title: l?.title || `Lesson ${li + 1}`,
          content: typeof l?.content === "string" ? l.content : "",
          keyPoints: Array.isArray(l?.keyPoints)
            ? l.keyPoints.filter(Boolean).slice(0, 10)
            : [],
        }))
      : [],
  }));

  out.finalTest = out.finalTest || {};
  out.finalTest.questions = Array.isArray(out.finalTest.questions)
    ? out.finalTest.questions
        .map((q, i) => ({
          id: q?.id || `q${i + 1}`,
          question: q?.question || `Question ${i + 1}`,
          options:
            Array.isArray(q?.options) && q.options.length >= 4
              ? q.options.slice(0, 4)
              : ["Option A", "Option B", "Option C", "Option D"],
          correctAnswer:
            Number.isInteger(q?.correctAnswer) && q.correctAnswer >= 0 && q.correctAnswer <= 3
              ? q.correctAnswer
              : 0,
          explanation: q?.explanation || "",
        }))
        .map(shuffleQuestionOptions)
    : [];

  return out;
};

const extractDocxTextLocal = async (file) => {
  const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return normalizeText(res.value || "");
};

const extractPdfTextLocal = async (file) => {
  const ab = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(ab) });
  const pdf = await loadingTask.promise;

  let pages = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const tc = await page.getTextContent();
    const pageText = (tc.items || [])
      .map((it) => (typeof it?.str === "string" ? it.str : ""))
      .join(" ");
    pages.push(`--- Page ${pageNum} ---\n${normalizeText(pageText)}`);
  }
  return normalizeText(pages.join("\n\n"));
};

const extractImageTextViaBackend = async (file) => {
  const b64 = await toB64(file);
  const dataUrl = `data:${file.type};base64,${b64}`;
  const d = await postJSON(API.OCR_IMAGE, {
    model: AI_VISION_MODEL,
    imageDataUrl: dataUrl,
    instruction:
      "OCR this image and extract ALL visible text verbatim. Return only raw text.",
  });
  return normalizeText(d.text || "");
};

export default function App() {
  const [page, setPage] = useState("home");
  const [theme, setTheme] = useState(() => localStorage.getItem("sb_theme") || "dark");

  // simple local persistence
  const [users, setUsers] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("sb_users") || "[]");
    } catch {
      return [];
    }
  });
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("sb_user") || "null");
    } catch {
      return null;
    }
  });
  const [allCourses, setAllCourses] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("sb_courses") || "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("sb_users", JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem("sb_user", JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    localStorage.setItem("sb_courses", JSON.stringify(allCourses));
  }, [allCourses]);

  useEffect(() => {
    localStorage.setItem("sb_theme", theme);
  }, [theme]);

  const palette =
    theme === "light"
      ? {
          bg: C.bgLight,
          surf: C.surfLight,
          surf2: C.surf2Light,
          border: C.borderLight,
          text: C.textLight,
          muted: C.mutedLight,
          accent: C.accent,
          accent2: C.accent2,
          success: C.success,
          danger: C.danger,
        }
      : C;

  // fix full-width layout even if user keeps default Vite CSS somewhere
  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.background = palette.bg;
    const root = document.getElementById("root");
    if (root) {
      root.style.margin = "0";
      root.style.padding = "0";
      root.style.maxWidth = "100%";
      root.style.width = "100%";
      root.style.minHeight = "100vh";
      root.style.textAlign = "left";
    }
  }, [palette.bg]);

  const [af, setAf] = useState({ name: "", email: "", pass: "", confirmPass: "" });
  const [authErr, setAuthErr] = useState("");

  const [file, setFile] = useState(null);
  const [fileExt, setFileExt] = useState("");
  const [etxt, setEtxt] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [gStatus, setGStatus] = useState("");
  const [gErr, setGErr] = useState("");

  const [course, setCourse] = useState(null);
  const [uIdx, setUI] = useState(0);
  const [lIdx, setLI] = useState(0);
  const [inTest, setInTest] = useState(false);
  const [ans, setAns] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(null);
  const [analysis, setAnalysis] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [remediating, setRemediating] = useState(false);
  const [lastWrong, setLastWrong] = useState([]);

  const fileRef = useRef();

  const go = (p) => {
    setPage(p);
    setAuthErr("");
    setGErr("");
    setGStatus("");
  };

  const mc = () => allCourses[user?.email] || [];

  const addCourse = (c) => {
    if (!user) return;
    setAllCourses((p) => ({ ...p, [user.email]: [...(p[user.email] || []), c] }));
  };

  const signUp = () => {
    const name = af.name.trim();
    const email = af.email.trim().toLowerCase();
    if (!name || !email || !af.pass || !af.confirmPass) {
      setAuthErr("All fields are required.");
      return;
    }
    if (users.find((u) => u.email === email)) {
      setAuthErr("Email already registered.");
      return;
    }
    if (af.pass !== af.confirmPass) {
      setAuthErr("Passwords do not match.");
      return;
    }
    const pw = validatePassword(af.pass);
    if (!pw.ok) {
      setAuthErr(pw.message);
      return;
    }
    const nu = { name, email, pass: af.pass };
    setUsers((p) => [...p, nu]);
    setUser(nu);
    setAllCourses((p) => ({ ...p, [nu.email]: [] }));
    setAf({ name: "", email: "", pass: "", confirmPass: "" });
    go("home");
  };

  const signIn = () => {
    const email = af.email.trim().toLowerCase();
    const u = users.find((u) => u.email === email && u.pass === af.pass);
    if (!u) {
      setAuthErr("Invalid credentials.");
      return;
    }
    setUser(u);
    setAf({ name: "", email: "", pass: "", confirmPass: "" });
    go("home");
  };

  const handleFile = async (f) => {
    setFile(f);
    setEtxt("");
    setGErr("");
    setGStatus("");

    const ext = (f.name.split(".").pop() || "").toLowerCase();
    setFileExt(ext);

    if (ext === "docx" || ext === "pdf") {
      setExtracting(true);
      try {
        setGStatus(ext === "pdf" ? "Extracting text from PDF locally..." : "Extracting text from DOCX locally...");
        let text = "";
        if (ext === "docx") text = await extractDocxTextLocal(f);
        if (ext === "pdf") text = await extractPdfTextLocal(f);

        if (!text || text.length < 20) {
          throw new Error("Very little text extracted. If scanned, use JPG/PNG.");
        }
        setEtxt(text);
      } catch (e) {
        setGErr(`${ext.toUpperCase()} read error: ${e.message}`);
      } finally {
        setExtracting(false);
        setGStatus("");
      }
    }
  };

  const generate = async () => {
    if (!file) {
      setGErr("Please upload a file.");
      return;
    }

    setGenerating(true);
    setGErr("");
    setGStatus("");

    try {
      let text = etxt;
      if (!text) {
        if (!["jpg", "jpeg", "png"].includes(fileExt)) {
          throw new Error("Unsupported file type. Use PDF, DOCX, JPG, or PNG.");
        }
        setGStatus("Extracting text from image (backend OCR)...");
        text = await extractImageTextViaBackend(file);
        setEtxt(text);
      }

      if (!text || text.trim().length < 50) {
        throw new Error("Extracted text is too short to generate a useful course.");
      }

      setGStatus("Generating a detailed course (full coverage)...");
      const d = await postJSON(API.GENERATE_COURSE, {
        model: AI_MODEL,
        syllabusText: text,
        settings: {
          minimumLessonWords: 450,
          quizCountTarget: 20,
        },
      });

      const parsed = normalizeCourseJSON(parseJSONLoosely(d.jsonText || d.text || ""));
      parsed.id = Date.now();
      parsed.createdAt = new Date().toLocaleDateString();
      parsed.sourceText = text;

      setCourse(parsed);
      setUI(0);
      setLI(0);
      setInTest(false);
      setAns({});
      setSubmitted(false);
      setScore(null);
      setAnalysis("");
      setLastWrong([]);
      addCourse(parsed);
      go("course");
    } catch (e) {
      setGErr("Error: " + e.message);
    } finally {
      setGStatus("");
      setGenerating(false);
    }
  };

  const submitTest = async () => {
    const qs = course.finalTest?.questions || [];
    if (!qs.length) return;

    let correct = 0;
    const wrong = [];

    qs.forEach((q, i) => {
      if (ans[i] === q.correctAnswer) correct++;
      else {
        wrong.push({
          question: q.question,
          yourAnswer: q.options?.[ans[i]] ?? "(not answered)",
          correctAnswer: q.options?.[q.correctAnswer] ?? "(missing)",
          explanation: q.explanation || "",
        });
      }
    });

    const pct = Math.round((correct / qs.length) * 100);
    setScore({ pct, correct, total: qs.length });
    setSubmitted(true);
    setLastWrong(wrong);

    if (wrong.length > 0) {
      setAnalyzing(true);
      try {
        const d = await postJSON(API.ANALYZE_TEST, {
          model: AI_MODEL,
          courseTitle: course.courseTitle,
          score: { pct, correct, total: qs.length },
          wrong,
        });
        setAnalysis(d.text || "");
      } catch (e) {
        setAnalysis("Could not generate AI analysis right now.");
      } finally {
        setAnalyzing(false);
      }
    }
  };

  const generateFocusedCourse = async () => {
    if (!course || !lastWrong.length) return;

    setRemediating(true);
    setGErr("");
    try {
      const d = await postJSON(API.FOCUSED_COURSE, {
        model: AI_MODEL,
        originalCourse: {
          courseTitle: course.courseTitle,
          courseDescription: course.courseDescription,
          units: course.units,
        },
        wrongAnswers: lastWrong,
        priorAnalysis: analysis || "",
        sourceText: course.sourceText || etxt || "",
        settings: {
          minimumLessonWords: 450,
          quizCountTarget: 18,
        },
      });

      const parsed = normalizeCourseJSON(parseJSONLoosely(d.jsonText || d.text || ""));
      parsed.id = Date.now();
      parsed.createdAt = new Date().toLocaleDateString();
      parsed.courseTitle = `${parsed.courseTitle || course.courseTitle} (Focused Review)`;
      parsed.sourceText = course.sourceText || etxt || "";

      setCourse(parsed);
      setUI(0);
      setLI(0);
      setInTest(false);
      setAns({});
      setSubmitted(false);
      setScore(null);
      setAnalysis("");
      setLastWrong([]);
      addCourse(parsed);
      go("course");
    } catch (e) {
      setGErr("Focused-course generation failed: " + e.message);
    } finally {
      setRemediating(false);
    }
  };

  const wrap = {
    maxWidth: "1280px",
    margin: "0 auto",
    padding: "2.5rem 2rem",
    width: "100%",
  };
  const appStyle = {
    minHeight: "100vh",
    width: "100%",
    background: palette.bg,
    color: palette.text,
    fontFamily: "'Inter',system-ui,sans-serif",
  };

  const Nav = () => (
    <nav
      style={{
        background: palette.surf,
        borderBottom: `1px solid ${palette.border}`,
        padding: "0 2rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "64px",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <Logo onClick={() => go("home")} />
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
        {[
          ["home", "Home"],
          ["mycourses", "My Courses"],
          ["create", "Create Course"],
        ].map(([p, label]) => (
          <button
            key={p}
            onClick={() => go(p)}
            style={{
              color: page === p ? palette.accent : palette.muted,
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: page === p ? 600 : 400,
              transition: "color 0.15s",
              background: "transparent",
              border: "none",
            }}
          >
            {label}
          </button>
        ))}
        <Btn outline onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
          {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
        </Btn>
        {user ? (
          <>
            <span style={{ color: palette.accent, fontSize: "0.9rem", fontWeight: 500 }}>
              Welcome, {user.name}!
            </span>
            <Btn
              outline
              onClick={() => {
                setUser(null);
                go("home");
              }}
            >
              Sign Out
            </Btn>
          </>
        ) : (
          <>
            <span
              onClick={() => go("signin")}
              style={{ color: palette.muted, cursor: "pointer", fontSize: "0.9rem" }}
            >
              Sign In
            </span>
            <Btn onClick={() => go("signup")}>Sign Up</Btn>
          </>
        )}
      </div>
    </nav>
  );

  // ===== HOME =====
  if (page === "home")
    return (
      <div style={appStyle}>
        <Nav />
        <div style={{ ...wrap, textAlign: "center", paddingTop: "4rem" }}>
          <p
            style={{
              color: palette.accent,
              fontSize: "0.78rem",
              fontWeight: 700,
              letterSpacing: "3px",
              textTransform: "uppercase",
              marginBottom: "1rem",
            }}
          >
            AI-Powered Education
          </p>
          <h1
            style={{
              fontSize: "clamp(2.2rem,5vw,3.8rem)",
              fontWeight: 900,
              lineHeight: 1.1,
              marginBottom: "1.5rem",
            }}
          >
            Turn Any Syllabus Into
            <br />
            <span
              style={{
                background: `linear-gradient(135deg,${C.accent},${C.accent2})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              a Full Course
            </span>
          </h1>
          <p
            style={{
              color: palette.muted,
              fontSize: "1.1rem",
              maxWidth: "560px",
              margin: "0 auto 2.5rem",
              lineHeight: 1.8,
            }}
          >
            Create a structured online course in minutes. Upload your notes or syllabus and get units, lessons, quizzes, and personalised feedback.
          </p>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
              marginBottom: "5rem",
              flexWrap: "wrap",
            }}
          >
            <Btn onClick={() => go("create")} style={{ padding: "1rem 2.2rem", fontSize: "1rem" }}>
              Generate your course →
            </Btn>
          </div>

          <p style={{ color: palette.muted, marginTop: "-3rem", marginBottom: "3rem", fontSize: "0.9rem" }}>
            Trusted by educators for private, server-side AI processing · 🔒 Your API key never leaves backend
          </p>

          <div style={{ color: palette.muted, marginBottom: "2.5rem", fontSize: "1.2rem" }} aria-hidden>
            ↓ Scroll to see platform features
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))",
              gap: "1.25rem",
              textAlign: "left",
            }}
          >
            {[
              {
                icon: "📄",
                t: "Local Text Extraction",
                d: "DOCX + text PDFs extracted locally (Mammoth + PDF.js). Images use backend OCR only when needed.",
              },
              {
                icon: "🧠",
                t: "Backend-secured AI",
                d: "All OpenAI calls happen server-side. Your API key stays in backend/.env (never in the browser).",
              },
              {
                icon: "🎯",
                t: "Better Quizzes",
                d: "Options are shuffled client-side so answers are not all A. Explanations shown in review.",
              },
              {
                icon: "🔄",
                t: "Focused Review Course",
                d: "After the test, generate a new course that focuses on weak areas and adds targeted practice.",
              },
            ].map((f, i) => (
              <div key={i} style={card}>
                <div style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>{f.icon}</div>
                <h3 style={{ marginBottom: "0.5rem", fontSize: "0.98rem" }}>{f.t}</h3>
                  <p style={{ color: palette.muted, fontSize: "0.87rem", lineHeight: 1.65, margin: 0 }}>
                    {f.d}
                  </p>
                </div>
              ))}
          </div>

          <div style={{ ...card, marginTop: "2rem", textAlign: "left" }}>
            <h3 style={{ marginTop: 0 }}>Privacy & trust</h3>
            <p style={{ color: palette.muted, marginBottom: "0.6rem" }}>
              Your files are processed only for course generation. Keep your OpenAI key in backend env vars and deploy over HTTPS.
            </p>
            <p style={{ color: palette.muted, margin: 0 }}>
              Suggested next pages: Privacy Policy · Terms of Service · Contact Support.
            </p>
          </div>
        </div>
      </div>
    );

  // ===== AUTH =====
  if (page === "signin" || page === "signup") {
    const su = page === "signup";
    return (
      <div style={appStyle}>
        <Nav />
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "calc(100vh - 64px)",
            padding: "2rem",
          }}
        >
          <div style={{ ...card, width: "100%", maxWidth: "420px" }}>
            <h2 style={{ textAlign: "center", marginBottom: "0.4rem" }}>
              {su ? "Create Account" : "Welcome Back"}
            </h2>
            <p style={{ color: C.muted, textAlign: "center", marginBottom: "1.5rem", fontSize: "0.88rem" }}>
              {su ? "Start building courses with AI" : "Sign in to your account"}
            </p>
            <Err msg={authErr} />
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {su && (
                <div>
                  <label style={lbl} htmlFor="name">Full Name</label>
                  <input id="name" style={{ ...inp, background: palette.surf2, border: `1px solid ${palette.border}`, color: palette.text }} placeholder="Jane Doe" value={af.name} onChange={(e) => setAf((p) => ({ ...p, name: e.target.value }))} />
                </div>
              )}
              <div>
                <label style={lbl} htmlFor="email">Email</label>
                <input id="email" style={{ ...inp, background: palette.surf2, border: `1px solid ${palette.border}`, color: palette.text }} type="email" placeholder="you@example.com" value={af.email} onChange={(e) => setAf((p) => ({ ...p, email: e.target.value }))} />
              </div>

              <div>
                <label style={lbl} htmlFor="password">Password</label>
                <input id="password" style={{ ...inp, background: palette.surf2, border: `1px solid ${palette.border}`, color: palette.text }} type="password" placeholder="••••••••" value={af.pass} onChange={(e) => setAf((p) => ({ ...p, pass: e.target.value }))} />
                {su && (
                  <p style={{ color: C.muted, fontSize: "0.76rem", margin: "0.45rem 0 0" }}>
                    Use 8+ chars with uppercase, lowercase, number, and special character.
                  </p>
                )}
              </div>

              {su && (
                <div>
                  <label style={lbl} htmlFor="confirmPassword">Confirm Password</label>
                  <input id="confirmPassword" style={{ ...inp, background: palette.surf2, border: `1px solid ${palette.border}`, color: palette.text }} type="password" placeholder="••••••••" value={af.confirmPass} onChange={(e) => setAf((p) => ({ ...p, confirmPass: e.target.value }))} />
                </div>
              )}

              <Btn full onClick={su ? signUp : signIn} style={{ padding: "0.85rem", fontSize: "0.95rem", marginTop: "0.25rem" }}>
                {su ? "Create Account" : "Sign In"}
              </Btn>

              <p style={{ textAlign: "center", color: palette.muted, fontSize: "0.88rem", margin: 0 }}>
                {su ? "Already have an account? " : "Don't have an account? "}
                <span style={{ color: palette.accent, cursor: "pointer" }} onClick={() => { setAuthErr(""); go(su ? "signin" : "signup"); }}>
                  {su ? "Sign In" : "Sign Up"}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== MY COURSES =====
  if (page === "mycourses") {
    const courses_ = mc();
    return (
      <div style={appStyle}>
        <Nav />
        <div style={wrap}>
          <h1 style={{ marginBottom: "0.4rem" }}>My Courses</h1>
          <p style={{ color: C.muted, marginBottom: "2.5rem" }}>
            {user ? `${courses_.length} course${courses_.length !== 1 ? "s" : ""} saved` : "Sign in to view your saved courses"}
          </p>

          {!user ? (
            <div style={{ textAlign: "center", padding: "4rem" }}>
              <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🔒</div>
              <p style={{ color: C.muted, marginBottom: "1.5rem" }}>Please sign in to access your courses</p>
              <Btn onClick={() => go("signin")}>Sign In</Btn>
            </div>
          ) : courses_.length === 0 ? (
            <div style={{ textAlign: "center", padding: "4rem" }}>
              <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>📚</div>
              <p style={{ color: C.muted, marginBottom: "1.5rem" }}>No courses yet. Create your first one!</p>
              <Btn onClick={() => go("create")}>Create Course</Btn>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "1.5rem" }}>
              {courses_.map((c, i) => (
                <div
                  key={i}
                  style={{ ...card, cursor: "pointer", transition: "border-color 0.2s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.accent)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
                  onClick={() => {
                    setCourse(c);
                    setUI(0);
                    setLI(0);
                    setInTest(false);
                    setAns({});
                    setSubmitted(false);
                    setScore(null);
                    setAnalysis("");
                    setLastWrong([]);
                    go("course");
                  }}
                >
                  <div
                    style={{
                      background: `linear-gradient(135deg,${C.accent}22,${C.accent2}22)`,
                      borderRadius: "8px",
                      padding: "1.25rem",
                      textAlign: "center",
                      fontSize: "2.5rem",
                      marginBottom: "1rem",
                    }}
                  >
                    📖
                  </div>
                  <h3 style={{ marginBottom: "0.5rem", fontSize: "0.97rem" }}>{c.courseTitle}</h3>
                  <p style={{ color: C.muted, fontSize: "0.84rem", marginBottom: "1rem", lineHeight: 1.6 }}>
                    {c.courseDescription}
                  </p>
                  <div style={{ display: "flex", gap: "1rem", fontSize: "0.78rem", color: C.muted }}>
                    <span>📚 {c.units?.length || 0} units</span>
                    <span>❓ {c.finalTest?.questions?.length || 0} Qs</span>
                    <span>📅 {c.createdAt}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== CREATE =====
  if (page === "create")
    return (
      <div style={appStyle}>
        <Nav />
        <div style={{ ...wrap, maxWidth: "760px" }}>
          <h1 style={{ marginBottom: "0.4rem" }}>Create New Course</h1>
          <p style={{ color: palette.muted, marginBottom: "2rem" }}>
            Upload your syllabus and let OpenAI build a full course for you (secure backend).
          </p>

          <Err msg={gErr} />
          <Info msg={gStatus} />

          {(extracting || generating) && (
            <div style={{ ...card, marginBottom: "1rem", padding: "1rem" }}>
              <p style={{ marginTop: 0, marginBottom: "0.6rem", fontWeight: 600 }}>Generation progress</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.6rem" }}>
                {[
                  ["1. Extract", extracting || !!etxt],
                  ["2. Generate", generating],
                  ["3. Review", !!course],
                ].map(([label, active]) => (
                  <div key={label} style={{ borderRadius: "8px", padding: "0.5rem", textAlign: "center", background: active ? `${palette.accent}22` : palette.surf2, border: `1px solid ${active ? palette.accent : palette.border}` }}>
                    <span style={{ fontSize: "0.8rem", color: active ? palette.text : palette.muted }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ ...card, marginBottom: "1.5rem" }}>
            <h3 style={{ marginBottom: "1rem" }}>📁 Upload Your Document</h3>
            <div
              style={{
                border: `2px dashed ${C.border}`,
                borderRadius: "10px",
                padding: "2.5rem",
                textAlign: "center",
                cursor: "pointer",
                transition: "border-color 0.2s",
              }}
              onClick={() => fileRef.current.click()}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.accent)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
            >
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>☁️</div>
              <p style={{ fontWeight: 600, marginBottom: "0.4rem" }}>
                {file ? file.name : "Drop file here or click to browse"}
              </p>
              <p style={{ color: C.muted, fontSize: "0.85rem", margin: 0 }}>
                PDF · DOCX · JPG · PNG · Max recommended size: 10MB
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.jpg,.jpeg,.png"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                }}
              />
            </div>

            {extracting && (
              <p style={{ color: palette.accent, marginTop: "0.75rem", fontSize: "0.88rem" }}>
                ⏳ Extracting text locally...
              </p>
            )}

            {file && (
              <p style={{ color: palette.muted, fontSize: "0.83rem", marginTop: "0.6rem" }}>
                Selected file size: {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            )}

            {etxt && (
              <div style={{ marginTop: "1rem" }}>
                <p style={{ color: C.success, fontSize: "0.88rem", marginBottom: "0.5rem" }}>
                  ✅ Text extracted ({etxt.length.toLocaleString()} characters)
                </p>
                <div
                  style={{
                    background: C.surf2,
                    borderRadius: "8px",
                    padding: "0.75rem 1rem",
                    maxHeight: "120px",
                    overflow: "auto",
                    fontSize: "0.76rem",
                    color: C.muted,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {etxt.slice(0, 700)}
                  {etxt.length > 700 ? "..." : ""}
                </div>
              </div>
            )}
          </div>

          <div style={{ ...card, marginBottom: "1.5rem", background: `${C.accent}08`, border: `1px solid ${C.accent}28` }}>
            <p style={{ color: C.muted, fontSize: "0.84rem", lineHeight: 1.75, margin: 0 }}>
              ℹ️ <strong style={{ color: C.text }}>How it works:</strong> DOCX and text-based PDFs are extracted locally (Mammoth + PDF.js). JPG/PNG uses backend OCR. Course generation + test analysis happen on the backend (OpenAI key stays server-side).
            </p>
          </div>

          <Btn full onClick={generate} disabled={generating || !file} style={{ padding: "1rem", fontSize: "1rem" }}>
            {generating ? `⏳ ${gStatus || "Generating..."}` : "🚀 Generate Course"}
          </Btn>
        </div>
      </div>
    );

  // ===== COURSE =====
  if (page === "course" && course) {
    const qs = course.finalTest?.questions || [];

    if (inTest)
      return (
        <div style={appStyle}>
          <Nav />
          <div style={{ ...wrap, maxWidth: "900px" }}>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "2rem", flexWrap: "wrap" }}>
              <Btn outline onClick={() => setInTest(false)}>
                ← Back to Course
              </Btn>
              <div>
                <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Final Test</h1>
                <p style={{ color: C.muted, margin: 0, fontSize: "0.85rem" }}>{course.courseTitle}</p>
              </div>
            </div>

            {submitted ? (
              <>
                <div style={{ ...card, textAlign: "center", marginBottom: "1.5rem" }}>
                  <div style={{ fontSize: "3.5rem", marginBottom: "0.75rem" }}>
                    {score.pct >= 80 ? "🎉" : score.pct >= 60 ? "📚" : "💪"}
                  </div>
                  <h2
                    style={{
                      fontSize: "3.2rem",
                      fontWeight: 900,
                      color: score.pct >= 70 ? C.success : score.pct >= 50 ? C.accent : C.danger,
                      margin: "0 0 0.25rem",
                    }}
                  >
                    {score.pct}%
                  </h2>
                  <p style={{ color: C.muted, margin: 0 }}>
                    {score.correct} of {score.total} correct
                  </p>
                </div>

                {analyzing && (
                  <div style={{ ...card, color: C.accent, marginBottom: "1.25rem" }}>
                    🔍 AI is analysing your results...
                  </div>
                )}

                {analysis && (
                  <div style={{ ...card, marginBottom: "1.5rem", border: `1px solid ${C.accent}40` }}>
                    <h3 style={{ color: C.accent, marginBottom: "1rem" }}>🧠 AI Performance Analysis</h3>
                    <div style={{ color: C.muted, lineHeight: 1.9, fontSize: "0.93rem", whiteSpace: "pre-wrap" }}>
                      {analysis}
                    </div>
                  </div>
                )}

                {lastWrong.length > 0 && (
                  <div style={{ ...card, marginBottom: "1.5rem", border: `1px solid ${C.accent}35` }}>
                    <h3 style={{ marginBottom: "0.75rem" }}>🎯 Improve Weak Areas</h3>
                    <p style={{ color: C.muted, fontSize: "0.9rem", marginBottom: "1rem", lineHeight: 1.6 }}>
                      Generate a new focused course that emphasizes your weak topics, adds targeted explanations, and provides practice tailored to your mistakes.
                    </p>
                    <Btn onClick={generateFocusedCourse} disabled={remediating}>
                      {remediating ? "⏳ Building Focused Review Course..." : "Generate Focused Review Course →"}
                    </Btn>
                  </div>
                )}

                <div style={card}>
                  <h3 style={{ marginBottom: "1.5rem" }}>📝 Detailed Review</h3>
                  {qs.map((q, i) => {
                    const ok = ans[i] === q.correctAnswer;
                    return (
                      <div
                        key={i}
                        style={{
                          marginBottom: "1.5rem",
                          paddingBottom: "1.5rem",
                          borderBottom: i < qs.length - 1 ? `1px solid ${C.border}` : "none",
                        }}
                      >
                        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", alignItems: "flex-start" }}>
                          <span style={{ color: ok ? C.success : C.danger, fontWeight: 800, fontSize: "1.1rem" }}>
                            {ok ? "✓" : "✗"}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: "0.93rem" }}>
                            Q{i + 1}. {q.question}
                          </span>
                        </div>

                        {q.options.map((opt, j) => (
                          <div
                            key={j}
                            style={{
                              padding: "0.45rem 0.9rem",
                              borderRadius: "6px",
                              marginBottom: "0.3rem",
                              fontSize: "0.87rem",
                              background: j === q.correctAnswer ? "#22c55e18" : j === ans[i] && !ok ? "#ef444418" : "transparent",
                              color: j === q.correctAnswer ? C.success : j === ans[i] && !ok ? C.danger : C.muted,
                              border: `1px solid ${j === q.correctAnswer ? "#22c55e35" : j === ans[i] && !ok ? "#ef444435" : "transparent"}`,
                            }}
                          >
                            {["A", "B", "C", "D"][j]}. {opt}
                          </div>
                        ))}

                        {!ok && q.explanation && (
                          <p style={{ color: C.muted, fontSize: "0.8rem", marginTop: "0.5rem", fontStyle: "italic", paddingLeft: "0.5rem" }}>
                            💡 {q.explanation}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div style={card}>
                  {qs.map((q, i) => (
                    <div key={i} style={{ marginBottom: "2rem", paddingBottom: "2rem", borderBottom: i < qs.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      <p style={{ fontWeight: 600, marginBottom: "1rem", fontSize: "0.95rem" }}>
                        Q{i + 1}. {q.question}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {q.options.map((opt, j) => (
                          <div
                            key={j}
                            onClick={() => setAns((p) => ({ ...p, [i]: j }))}
                            style={{
                              padding: "0.7rem 1rem",
                              borderRadius: "8px",
                              cursor: "pointer",
                              border: `1px solid ${ans[i] === j ? C.accent : C.border}`,
                              background: ans[i] === j ? `${C.accent}18` : C.surf2,
                              color: ans[i] === j ? C.accent : C.text,
                              transition: "all 0.12s",
                              fontSize: "0.92rem",
                            }}
                          >
                            <span style={{ fontWeight: 700, marginRight: "0.75rem" }}>{["A", "B", "C", "D"][j]}.</span>
                            {opt}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.5rem" }}>
                  <span style={{ color: C.muted, fontSize: "0.88rem" }}>
                    {Object.keys(ans).length} / {qs.length} answered
                  </span>
                  <Btn onClick={submitTest} disabled={Object.keys(ans).length < qs.length}>
                    Submit Test →
                  </Btn>
                </div>
              </>
            )}
          </div>
        </div>
      );

    const unit = course.units?.[uIdx];
    const lesson = unit?.lessons?.[lIdx];
    const isFirst = uIdx === 0 && lIdx === 0;
    const isLast = uIdx === course.units.length - 1 && lIdx === (unit?.lessons?.length ?? 1) - 1;

    const prev = () => {
      if (lIdx > 0) setLI((l) => l - 1);
      else if (uIdx > 0) {
        const pu = uIdx - 1;
        setUI(pu);
        setLI((course.units?.[pu]?.lessons?.length || 1) - 1);
      }
    };

    const next = () => {
      if (lIdx < (unit?.lessons?.length ?? 1) - 1) setLI((l) => l + 1);
      else if (uIdx < course.units.length - 1) {
        setUI((u) => u + 1);
        setLI(0);
      } else setInTest(true);
    };

    return (
      <div style={{ ...appStyle, overflow: "hidden" }}>
        <Nav />
        <div style={{ display: "flex", height: "calc(100vh - 64px)" }}>
          {/* Sidebar */}
          <div style={{ width: "300px", minWidth: "300px", background: C.surf, borderRight: `1px solid ${C.border}`, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "1.25rem 1.5rem", borderBottom: `1px solid ${C.border}` }}>
              <p style={{ fontSize: "0.7rem", color: C.muted, textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: "0.5rem" }}>
                Course
              </p>
              <h3 style={{ fontSize: "0.9rem", lineHeight: 1.5, margin: "0 0 0.25rem" }}>{course.courseTitle}</h3>
              <p style={{ color: C.muted, fontSize: "0.76rem", margin: 0 }}>
                {course.units?.length || 0} units · {course.units?.reduce((a, u) => a + (u?.lessons?.length || 0), 0) || 0} lessons
              </p>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem 0" }}>
              {course.units?.map((u, ui) => (
                <div key={ui}>
                  <div
                    onClick={() => {
                      setUI(ui);
                      setLI(0);
                    }}
                    style={{
                      padding: "0.65rem 1.25rem",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: uIdx === ui ? C.accent : C.muted,
                      background: uIdx === ui ? `${C.accent}12` : "transparent",
                      borderLeft: `3px solid ${uIdx === ui ? C.accent : "transparent"}`,
                      transition: "all 0.15s",
                    }}
                  >
                    {u.title}
                  </div>

                  {uIdx === ui &&
                    u.lessons?.map((l, li) => (
                      <div
                        key={li}
                        onClick={() => setLI(li)}
                        style={{
                          padding: "0.45rem 1.25rem 0.45rem 2.25rem",
                          cursor: "pointer",
                          fontSize: "0.78rem",
                          color: lIdx === li ? C.text : C.muted,
                          background: lIdx === li ? `${C.accent2}12` : "transparent",
                          borderLeft: `3px solid ${lIdx === li ? C.accent2 : "transparent"}`,
                          transition: "all 0.15s",
                        }}
                      >
                        ▸ {l.title}
                      </div>
                    ))}
                </div>
              ))}
            </div>

            <div style={{ padding: "1rem 1.25rem", borderTop: `1px solid ${C.border}` }}>
              <Btn full onClick={() => setInTest(true)} style={{ padding: "0.7rem", fontSize: "0.87rem" }}>
                📝 Take Final Test
              </Btn>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "2.5rem 3rem", maxWidth: "100%" }}>
            {lesson ? (
              <>
                <p style={{ color: C.muted, fontSize: "0.8rem", marginBottom: "0.75rem" }}>
                  {unit.title} <span style={{ color: C.border, margin: "0 0.25rem" }}>›</span> {lesson.title}
                </p>

                <h1 style={{ fontSize: "1.85rem", fontWeight: 800, marginBottom: "2rem", lineHeight: 1.3 }}>
                  {lesson.title}
                </h1>

                <div style={{ ...card, marginBottom: "1.5rem", lineHeight: 2, color: C.muted }}>
                  {String(lesson.content || "")
                    .split("\n")
                    .map((p, i) =>
                      p.trim() ? (
                        <p key={i} style={{ marginBottom: "1.1rem", fontSize: "0.96rem" }}>
                          {p}
                        </p>
                      ) : null
                    )}
                </div>

                {lesson.keyPoints?.length > 0 && (
                  <div style={{ ...card, background: `linear-gradient(135deg,${C.accent}10,${C.accent2}10)`, border: `1px solid ${C.accent}30`, marginBottom: "2rem" }}>
                    <h3 style={{ color: C.accent, marginBottom: "1rem", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1.5px" }}>
                      🔑 Key Points
                    </h3>
                    {lesson.keyPoints.map((kp, i) => (
                      <div key={i} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.7rem", alignItems: "flex-start" }}>
                        <span style={{ color: C.accent, fontWeight: 800, marginTop: "0.1rem" }}>✓</span>
                        <span style={{ color: C.text, fontSize: "0.92rem" }}>{kp}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "2rem" }}>
                  <Btn outline onClick={prev} disabled={isFirst}>
                    ← Previous
                  </Btn>
                  <Btn onClick={next}>{isLast ? "Take Final Test →" : "Next →"}</Btn>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "4rem", color: C.muted }}>Select a lesson from the sidebar to begin</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={appStyle}>
      <Nav />
      <div style={wrap}>
        <p style={{ color: C.muted }}>Navigate using the top bar.</p>
      </div>
    </div>
  );
}
