import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "25mb" }));

// Lazy init Gemini AI
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
      aiClient = new GoogleGenAI({ apiKey: key });
    }
  }
  return aiClient;
}

// Lazy init Resend API
let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (key) {
      resendClient = new Resend(key);
    }
  }
  return resendClient;
}

// API Routes
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "Goodlucks Homes Intermediary Platform", time: new Date().toISOString() });
});

// Automated Resend Email Route
app.post("/api/send-email", async (req, res) => {
  try {
    const { to, subject, html, text, type } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({ error: "Missing required parameters: to, subject, html" });
    }

    const resend = getResendClient();

    if (!resend) {
      console.log(`[Resend Email Simulated] (${type || 'notification'}): To: ${to} | Subject: "${subject}"`);
      return res.json({
        success: true,
        simulated: true,
        message: "RESEND_API_KEY not set. Email logged and simulated locally.",
        emailDetails: { to, subject, type, timestamp: new Date().toISOString() }
      });
    }

    // Default sender or custom Resend verified sender
    const fromAddress = process.env.RESEND_FROM_EMAIL || "Goodlucks Homes <onboarding@resend.dev>";

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [to],
      subject,
      html,
      text: text || subject,
    });

    if (error) {
      console.error("[Resend API Error]:", error);
      // Fallback response with error details so front-end logs it gracefully
      return res.json({
        success: false,
        simulated: true,
        error: error.message,
        message: "Resend call returned error. Fallback simulation recorded."
      });
    }

    console.log(`[Resend API Success]: Email sent to ${to} (ID: ${data?.id})`);
    return res.json({
      success: true,
      simulated: false,
      id: data?.id,
      message: `Email successfully delivered to ${to} via Resend API.`
    });
  } catch (error: any) {
    console.error("[Resend Endpoint Exception]:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Internal server error during email dispatch"
    });
  }
});


// AI Property-Tenant Match Score Endpoint
app.post("/api/ai/match", async (req, res) => {
  try {
    const { tenantRequest, property } = req.body;
    if (!tenantRequest || !property) {
      return res.status(400).json({ error: "Missing tenantRequest or property object" });
    }

    const ai = getGeminiClient();
    if (!ai) {
      // Fallback algorithmic match score calculation
      let score = 80;
      if (property.rentGhs >= tenantRequest.budgetMin && property.rentGhs <= tenantRequest.budgetMax) score += 10;
      if (property.bedrooms >= tenantRequest.bedrooms) score += 5;
      if (tenantRequest.preferredLocations?.some((loc: string) => property.location.toLowerCase().includes(loc.toLowerCase()))) score += 5;
      return res.json({
        matchScore: Math.min(score, 98),
        aiMatchReason: `Algorithmic Match: Property fits budget (GH₵ ${property.rentGhs}/mo) and provides ${property.bedrooms} bedrooms in requested region.`,
      });
    }

    const prompt = `You are Goodlucks Homes AI Property Matching Engine in Ghana.
Analyze the fit between this Tenant Request and Property:

TENANT REQUEST:
- Preferred Locations: ${tenantRequest.preferredLocations?.join(", ") || "Any"}
- Budget Range: GH₵ ${tenantRequest.budgetMin} to GH₵ ${tenantRequest.budgetMax} / month
- Required Bedrooms: ${tenantRequest.bedrooms}
- Property Type: ${tenantRequest.propertyType}
- Special Notes: ${tenantRequest.notes || "None"}

PROPERTY DETAILS:
- Title: ${property.title}
- Location: ${property.location}
- Rent: GH₵ ${property.rentGhs} / month
- Bedrooms: ${property.bedrooms}, Bathrooms: ${property.bathrooms}
- Type: ${property.propertyType}
- Amenities: ${property.amenities?.join(", ")}

Respond with JSON ONLY in this format:
{
  "matchScore": <number between 50 and 99>,
  "aiMatchReason": "<2 concise sentences highlighting why this property is a great match and any subtle differences>"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text || "{}";
    const parsed = JSON.parse(responseText);
    return res.json({
      matchScore: parsed.matchScore || 88,
      aiMatchReason: parsed.aiMatchReason || "Strong match based on location, budget and bedroom specifications.",
    });
  } catch (error: any) {
    console.error("AI match error:", error);
    return res.status(500).json({
      matchScore: 85,
      aiMatchReason: "Calculated based on budget alignment and bedroom counts.",
      error: error?.message,
    });
  }
});

// AI Description Generator for Landlords
app.post("/api/ai/describe", async (req, res) => {
  try {
    const { title, location, propertyType, bedrooms, rentGhs, amenities } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({
        description: `Stunning ${bedrooms}-bedroom ${propertyType} located in prime ${location}. Features high quality finishes, ${amenities?.slice(0, 3).join(", ") || "modern amenities"}, and 24/7 reliability managed via Goodlucks Homes.`,
      });
    }

    const prompt = `Write a luxury, compelling, high-converting property description (approx 80-120 words) for a rental listing in Ghana:
Title: ${title}
Location: ${location}
Type: ${propertyType}
Bedrooms: ${bedrooms}
Monthly Rent: GH₵ ${rentGhs}
Key Amenities: ${amenities?.join(", ")}

Focus on luxury living, security, modern amenities, and peace of mind through Goodlucks Homes intermediary service. Do not mention landlord contact details.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return res.json({ description: response.text?.trim() });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Vite Development or Production Server
async function setupViteOrStatic() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Goodlucks Homes server running on http://localhost:${PORT}`);
  });
}

setupViteOrStatic();
