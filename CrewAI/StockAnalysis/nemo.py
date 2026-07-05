from openai import OpenAI



client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key = "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"
)

response = client.chat.completions.create(
    model="nvidia/nemotron-3-ultra-550b-a55b",
    messages=[
        {
            "role": "user",
            "content": "What can you do?"
        }
    ],
    temperature=0.7,
    max_tokens=256,
    stream=True
)

print(response.choices[0].message.content)