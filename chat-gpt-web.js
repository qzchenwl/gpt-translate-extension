const accessTokenCache = {
    accessToken: null,
    expiryTimestamp: null,
};


async function refreshAccessToken(sessionToken, cacheDuration = 10 * 60 * 1000) {
    const currentTime = Date.now();

    if (sessionToken && accessTokenCache.accessToken && currentTime < accessTokenCache.expiryTimestamp) {
        return accessTokenCache.accessToken;
    }

    try {
        const response = await fetch('https://chat.openai.com/api/auth/session', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36',
                cookie: '__Secure-next-auth.session-token=' + sessionToken,
            },
        });
        if (!response.ok) {
            const body = await response.text();
            console.error('response not ok', response.status, body);
            throw 'Unauthorized';
        }
        const json = await response.json();
        console.log('json', json);

        if (!json.accessToken) {
            throw 'Unauthorized';
        }

        accessTokenCache.accessToken = json.accessToken;
        accessTokenCache.expiryTimestamp = currentTime + cacheDuration;

        return json.accessToken;
    } catch (error) {
        console.error('Error refreshing access token:', error);
        throw error;
    }
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export async function callChatGPTWeb(sessionToken, model, message, conversationId = uuidv4()) {
    console.log('callChatGPTWeb', sessionToken.slice(0, 4) + '****', model, message);
    const accessToken = await refreshAccessToken(sessionToken);
    
    const response = await fetch('https://chat.openai.com/backend-api/conversation', {
      method: 'POST',
      headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
          action: 'next',
          messages: [
              {
                  id: uuidv4(),
                  role: 'user',
                  content: {
                      content_type: 'text',
                      parts: [message],
                  },
              },
          ],
          model: model || 'text-davinci-002-render-sha',
          parent_message_id: conversationId,
      })
    });

    const text = await response.text();
    const events = parseEventStream(text);
    let lastEvent;
    for (let i = 0; i < events.length; ++i) {
      const event = events[i];
      if (event.data === '[DONE]') {
        break;
      }
      lastEvent = event;
    }
    if (!lastEvent) {
      throw 'No message event received!';
    } else {
      console.log('lastEvent', lastEvent);
    }

    const messageEvent = JSON.parse(lastEvent.data);
    console.log('messageEvent', messageEvent);
    return messageEvent.message.content.parts.join('');
}

function parseEventStream(data) {
  const events = [];
  const lines = data.split("\n");
  let currentEvent = {};

  for (const line of lines) {
    if (line.startsWith("event:")) {
      currentEvent.type = line.slice("event:".length).trim();
    } else if (line.startsWith("id:")) {
      currentEvent.id = line.slice("id:".length).trim();
    } else if (line.startsWith("retry:")) {
      currentEvent.retry = parseInt(line.slice("retry:".length).trim(), 10);
    } else if (line.startsWith("data:")) {
      const dataLine = line.slice("data:".length).trim();
      if (currentEvent.data) {
        currentEvent.data += "\n" + dataLine;
      } else {
        currentEvent.data = dataLine;
      }
    } else if (line === "") {
      if (currentEvent.data) {
        events.push(currentEvent);
      }
      currentEvent = {};
    }
  }

  return events;
}
