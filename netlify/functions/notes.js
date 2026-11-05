const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.MODEL || "gemini-3.8-flash";
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || "";
const ACCESS_CODE = process.env.ACCESS_CODE || "";
const LEVELS = {
  "Short summary": { text: "a short summary of about 150 words", tokens: 450 },
  "Detailed study notes": { text: "compact study notes of about 350 words", tokens: 800 },
  "Revision sheet with practice questions": { text: "a compact revision sheet of about 300 words with 4 practice questions and answers", tokens: 800 }
};

const json = (status, body) => ({
  statusCode: status,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callGemini(model, prompt, ms, tokens) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
    {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: tokens, thinkingConfig: { thinkingBudget: 0 } }
      })
    }
  );
  const data = await r.json().catch(() => ({}));
  return { r, data };
  } finally { clearTimeout(timer); }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (!API_KEY) return json(500, { error: "Server is missing GEMINI_API_KEY." });
  if (ACCESS_CODE && event.headers["x-access-code"] !== ACCESS_CODE)
    return json(401, { error: "Access code required." });

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Bad request." }); }
  const subject = String(b.subject || "").trim().slice(0, 120);
  const topic = String(b.topic || "").trim().slice(0, 160);
  const level = LEVELS[b.level] || LEVELS["Detailed study notes"];
  if (!subject) return json(400, { error: "Subject is required." });

  const prompt =
    `Write ${level.text} for a student on the subject "${subject}"` +
    (topic ? `, topic "${topic}"` : ", covering the core ideas a student should know") +
    ". Use plain text only: short headings in capitals, simple dashes for lists, no markdown symbols. " +
    "Keep it compact and easy to remember: key definitions, main ideas, one short worked example where it fits, " +
    "and 3 quick self-check questions at the end.";

  // Retry on temporary overload (503/429), then try the fallback model if one is set.
  const started = Date.now();
  const plan = [MODEL, MODEL, MODEL].concat(FALLBACK_MODEL ? [FALLBACK_MODEL] : []);
  let last = null;
  try {
    for (let i = 0; i < plan.length; i++) {
      if (i > 0) {
        if (Date.now() - started > 5500) break; // stay inside Netlify's ~10s limit
        await sleep(500);
      }
      const left = 8500 - (Date.now() - started);
      if (left < 1500) break;
      const { r, data } = await callGemini(plan[i], prompt, left, level.tokens);
      if (r.ok) {
        const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
        const text = parts.map(x => x.text || "").join("\n").trim();
        if (text) return json(200, { text });
        last = { status: 502, msg: "The AI service returned no text." };
        continue;
      }
      console.error("Gemini API error:", plan[i], r.status, JSON.stringify(data));
      const msg = (data && data.error && data.error.message) ? data.error.message : "HTTP " + r.status;
      last = { status: r.status, msg };
      if (r.status !== 503 && r.status !== 429) break; // not temporary, don't retry
    }
    if (last && (last.status === 503 || last.status === 429))
      return json(503, { error: "The AI service is busy right now. Please try again in a minute." });
    if (!last) return json(504, { error: "The AI took too long to answer. Try Short summary, or try again." });
    return json(502, { error: "Gemini said: " + String(last ? last.msg : "unknown error").slice(0, 300) });
  } catch (e) {
    console.error(e);
    if (e && e.name === "AbortError")
      return json(504, { error: "The AI took too long to answer. Try a shorter option like Short summary, or try again." });
    return json(502, { error: "Could not reach the AI service." });
  }
};
