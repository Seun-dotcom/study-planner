const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.MODEL || "gemini-3.8-flash";
const ACCESS_CODE = process.env.ACCESS_CODE || "";
const LEVELS = {
  "Short summary": "a short summary (about one page)",
  "Detailed study notes": "detailed study notes",
  "Revision sheet with practice questions": "a revision sheet with practice questions and answers"
};

const json = (status, body) => ({
  statusCode: status,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

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
    `Write ${level} for a student on the subject "${subject}"` +
    (topic ? `, topic "${topic}"` : ", covering the core ideas a student should know") +
    ". Use plain text only: short headings in capitals, simple dashes for lists, no markdown symbols. " +
    "Keep it compact and easy to remember: key definitions, main ideas, one short worked example where it fits, " +
    "and 3 quick self-check questions at the end.";

  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(MODEL) + ":generateContent",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1800, thinkingConfig: { thinkingBudget: 0 } }
        })
      }
    );
    const data = await r.json();
    if (!r.ok) {
      console.error("Gemini API error:", r.status, JSON.stringify(data));
      return json(502, { error: "The AI service returned an error." });
    }
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map(x => x.text || "").join("\n").trim();
    if (!text) return json(502, { error: "The AI service returned no text. Try again." });
    return json(200, { text });
  } catch (e) {
    console.error(e);
    return json(502, { error: "Could not reach the AI service." });
  }
};
