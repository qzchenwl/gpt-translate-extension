export async function callChatGPAPI(apiKey, prompt) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{ "role": "user", "content": prompt }]
        })
    });

    const data = await response.json();
    console.log("API response:", data);
    if (!response.ok) {
        throw data;
    }
    const translation = data.choices[0].message.content.trim();
    return translation;
}