function fillOptions() {
    chrome.storage.sync.get(["apiKey", "ocrApiKey", "ocrSecretKey", "model", "promptChinese", "promptEnglish", "bubbleTimeout", "useAPI"], (result) => {
        if (result.apiKey) {
            document.getElementById("apiKey").value = result.apiKey;
        }
        if (result.ocrApiKey) {
            document.getElementById("ocrApiKey").value = result.ocrApiKey;
        }
        if (result.ocrSecretKey) {
            document.getElementById("ocrSecretKey").value = result.ocrSecretKey;
        }
        if (result.promptChinese) {
            document.getElementById("promptChinese").value = result.promptChinese;
        }
        if (result.promptEnglish) {
            document.getElementById("promptEnglish").value = result.promptEnglish;
        }
        if (result.bubbleTimeout) {
            document.getElementById("bubbleTimeout").value = result.bubbleTimeout;
        } else {
            document.getElementById("bubbleTimeout").value = 3;
        }
        if (result.useAPI) {
            document.getElementById("openaiAPI").checked = true;
        }

        updateModelList().then(() => {
            if (result.model) {
                document.getElementById("modelSelect").value = result.model;
            }
        });

    });
}

function saveOptions() {
    const apiKey = document.getElementById("apiKey").value;
    const ocrApiKey = document.getElementById("ocrApiKey").value;
    const ocrSecretKey = document.getElementById("ocrSecretKey").value;
    const model = document.getElementById("modelSelect").value || '';
    const promptChinese = document.getElementById("promptChinese").value;
    const promptEnglish = document.getElementById("promptEnglish").value;
    const bubbleTimeout = document.getElementById("bubbleTimeout").value;
    const useAPI = !!document.getElementById("openaiAPI").checked;
    chrome.storage.sync.set({
        apiKey,
        ocrApiKey,
        ocrSecretKey,
        model,
        promptChinese,
        promptEnglish,
        bubbleTimeout,
        useAPI
    }, () => {
        console.log("API Key 和 Prompts 已保存。");

        const status = document.getElementById("saveStatus");
        status.style.display = "";
        status.style.setProperty("-webkit-transition", "opacity 0.4s ease-out");
        status.style.opacity = 1;
        window.setTimeout(function () {
            document.getElementById("saveStatus").style.opacity = 0
        }, 1500);

    });
}


async function getSessionToken() {
    const cookie = await chrome.cookies.get({
        url: 'https://chat.openai.com',
        name: '__Secure-next-auth.session-token',
    });

    if (cookie && cookie.value) {
        const sessionToken = cookie.value;
        chrome.storage.sync.set({sessionToken: sessionToken}, () => {
            console.log("sessionToken 已保存：", sessionToken);
        });
        return sessionToken;
    } else {
        return null;
    }
}

const accessTokenCache = {
    accessToken: null,
    expiryTimestamp: null,
};

async function refreshAccessToken(sessionToken, cacheDuration = 10 * 60 * 1000) {
    const currentTime = Date.now();

    if (sessionToken && accessTokenCache.accessToken && currentTime < accessTokenCache.expiryTimestamp) {
        return accessTokenCache.accessToken;
    }

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
    console.log('/api/auth/session', json);

    if (!json.accessToken) {
        throw 'Unauthorized';
    }

    accessTokenCache.accessToken = json.accessToken;
    accessTokenCache.expiryTimestamp = currentTime + cacheDuration;

    return json.accessToken;

}

async function getModelList(useAPI) {
    try {
        if (useAPI) {
            return ['', 'gpt-4', 'gpt-4-0314', 'gpt-4-32k', 'gpt-4-32k-0314', 'gpt-3.5-turbo', 'gpt-3.5-turbo-0301'];
        } else {
            const url = 'https://chat.openai.com/backend-api/models';
            const sessionToken = await getSessionToken();
            const accessToken = await refreshAccessToken(sessionToken);
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            const json = await response.json();
            console.log('/backend-api/models', json);
            return ['', ...json.models.map(x => x.slug)];
        }
    } catch (error) {
        console.error(error);
        alert('加载模型出错:' + error.message);
        return [''];
    }
}

async function updateModelList() {
    const modelSelect = document.getElementById("modelSelect");
    const removeAllModels = () => {
        while (modelSelect.firstChild) {
            modelSelect.removeChild(modelSelect.firstChild);
        }
    }
    const addModel = (model) => {
        const option = document.createElement("option");
        option.value = model || '';
        option.text = model || '默认';
        modelSelect.add(option);
    }

    removeAllModels();
    addModel('');

    const useAPI = !!document.getElementById("openaiAPI").checked;
    const modelList = await getModelList(useAPI);

    removeAllModels();
    for (const model of modelList) {
        addModel(model);
    }
}


document.addEventListener("DOMContentLoaded", fillOptions);
document.getElementById("save").addEventListener("click", saveOptions);
document.getElementById("openaiWeb").addEventListener("change", updateModelList);
document.getElementById("openaiAPI").addEventListener("change", updateModelList);
