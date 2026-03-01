import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function test() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent("Say hello in JSON format: { \"hello\": \"world\" }");
    console.log(result.response.text());
  } catch (e) {
    console.error("ERROR:", e.message);
  }
}

test();
