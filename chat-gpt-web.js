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

export async function callChatGPTWeb(question, conversationId = uuidv4()) {
    const sessionToken = await getSessionToken();
    const accessToken = await refreshAccessToken(sessionToken);
    let response = '';
    return new Promise((resolve, reject) => {
        fetchSSE('https://chat.openai.com/backend-api/conversation', {
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
                            parts: [question],
                        },
                    },
                ],
                model: 'text-davinci-002-render',
                parent_message_id: conversationId,
            }),
            onMessage: (message) => {
                if (message === '[DONE]') {
                    return resolve(response);
                }
                const data = JSON.parse(message);
                const text = data.message?.content?.parts?.[0];
                if (text) {
                    response = text;
                }
            },
        }).catch(reject);
    });
}


async function fetchSSE(resource, options) {
    const { onMessage, ...fetchOptions } = options;
    const resp = await fetch(resource, fetchOptions);
    if (!resp.ok) {
        const err = new Error(resp.statusText);
        err.details = await resp.text(); // quick hack to persist the error details
        throw err;
    }
    const parser = createParser(event => {
        if (event.type === 'event') {
            onMessage(event.data);
        }
    });

    const text = await resp.text();
    parser.feed(text);
}

function createParser(onParse) {
    let isFirstChunk;
    let buffer;
    let startingPosition;
    let startingFieldLength;
    let eventId;
    let eventName;
    let data;
    reset();
    return {
        feed,
        reset
    };
    function reset() {
        isFirstChunk = true;
        buffer = "";
        startingPosition = 0;
        startingFieldLength = -1;
        eventId = void 0;
        eventName = void 0;
        data = "";
    }
    function feed(chunk) {
        buffer = buffer ? buffer + chunk : chunk;
        if (isFirstChunk && hasBom(buffer)) {
            buffer = buffer.slice(BOM.length);
        }
        isFirstChunk = false;
        const length = buffer.length;
        let position = 0;
        let discardTrailingNewline = false;
        while (position < length) {
            if (discardTrailingNewline) {
                if (buffer[position] === "\n") {
                    ++position;
                }
                discardTrailingNewline = false;
            }
            let lineLength = -1;
            let fieldLength = startingFieldLength;
            let character;
            for (let index = startingPosition; lineLength < 0 && index < length; ++index) {
                character = buffer[index];
                if (character === ":" && fieldLength < 0) {
                    fieldLength = index - position;
                } else if (character === "\r") {
                    discardTrailingNewline = true;
                    lineLength = index - position;
                } else if (character === "\n") {
                    lineLength = index - position;
                }
            }
            if (lineLength < 0) {
                startingPosition = length - position;
                startingFieldLength = fieldLength;
                break;
            } else {
                startingPosition = 0;
                startingFieldLength = -1;
            }
            parseEventStreamLine(buffer, position, fieldLength, lineLength);
            position += lineLength + 1;
        }
        if (position === length) {
            buffer = "";
        } else if (position > 0) {
            buffer = buffer.slice(position);
        }
    }
    function parseEventStreamLine(lineBuffer, index, fieldLength, lineLength) {
        if (lineLength === 0) {
            if (data.length > 0) {
                onParse({
                    type: "event",
                    id: eventId,
                    event: eventName || void 0,
                    data: data.slice(0, -1)
                    // remove trailing newline
                });
                data = "";
                eventId = void 0;
            }
            eventName = void 0;
            return;
        }
        const noValue = fieldLength < 0;
        const field = lineBuffer.slice(index, index + (noValue ? lineLength : fieldLength));
        let step = 0;
        if (noValue) {
            step = lineLength;
        } else if (lineBuffer[index + fieldLength + 1] === " ") {
            step = fieldLength + 2;
        } else {
            step = fieldLength + 1;
        }
        const position = index + step;
        const valueLength = lineLength - step;
        const value = lineBuffer.slice(position, position + valueLength).toString();
        if (field === "data") {
            data += value ? "".concat(value, "\n") : "\n";
        } else if (field === "event") {
            eventName = value;
        } else if (field === "id" && !value.includes("\0")) {
            eventId = value;
        } else if (field === "retry") {
            const retry = parseInt(value, 10);
            if (!Number.isNaN(retry)) {
                onParse({
                    type: "reconnect-interval",
                    value: retry
                });
            }
        }
    }
}
const BOM = [239, 187, 191];
function hasBom(buffer) {
    return BOM.every((charCode, index) => buffer.charCodeAt(index) === charCode);
}
