import "dotenv/config";

async function test() {
  try {
    const apiKey = process.env.LLM_API_KEY || process.env.GROK_API_KEY;
    if (!apiKey) {
      console.error("ERROR: API Key is not defined in the environment.");
      return;
    }
    const baseUrl = process.env.LLM_BASE_URL || process.env.GROK_BASE_URL || "https://api.x.ai/v1";
    const modelName = process.env.LLM_MODEL || process.env.GROK_MODEL || "openai/gpt-oss-120b";
    
    console.log(`Testing with Base URL: ${baseUrl}`);
    console.log(`Testing with Model: ${modelName}`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "user", content: "Say hello in JSON format: { \"hello\": \"world\" }" }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log(data.choices[0].message.content);
  } catch (e) {
    console.error("ERROR:", e.message);
  }
}

test();
