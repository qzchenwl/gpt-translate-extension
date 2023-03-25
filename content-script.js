async function getStorageData(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

function createBubbleElement(content) {
  const bubble = document.createElement("div");
  bubble.className = "translation-bubble";

  const contentContainer = document.createElement("div");
  contentContainer.className = "bubble-content";
  contentContainer.innerText = content;
  bubble.appendChild(contentContainer);

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "bubble-buttons";
  const closeButton = document.createElement("button");
  closeButton.innerText = "确定";
  closeButton.addEventListener("click", () => {
    bubble.remove();
  });
  buttonContainer.appendChild(closeButton);
  bubble.appendChild(buttonContainer);

  document.body.appendChild(bubble);
  return bubble;
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    // 使用 OpenAI 接口进行翻译
    const { text, targetLanguage } = request;
    displayTranslation(text, targetLanguage);
  }
});

function unsecuredCopyToClipboard(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
  } catch (err) {
    console.error('Unable to copy to clipboard', err);
  }
  document.body.removeChild(textArea);
}

/**
 * Copies the text passed as param to the system clipboard
 * Check if using HTTPS and navigator.clipboard is available
 * Then uses standard clipboard API, otherwise uses fallback
*/
function copyToClipboard(content) {
  if (window.isSecureContext && navigator.clipboard) {
    navigator.clipboard.writeText(content);
  } else {
    unsecuredCopyToClipboard(content);
  }
};

async function translateText(text, targetLanguage) {
  console.log("Translating text:", text, targetLanguage);

  // 从存储中获取 API Key 和 prompt 值
  const { apiKey, promptChinese, promptEnglish } = await getStorageData(["apiKey", "promptChinese", "promptEnglish"]);

  if (!apiKey) {
    alert('请在插件选项中配置 API Key');
    return;
  }

  const url = 'https://api.openai.com/v1/chat/completions';
  let prompt = `Translate the following text to ${targetLanguage === 'zh' ? 'Chinese' : 'English'}: ${text}`;
  const promptValue = targetLanguage === "zh" ? promptChinese : promptEnglish;
  if (promptValue) {
    prompt = promptValue.replace("{text}", text);
  }

  console.log("prompt:", prompt);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{"role": "user", "content": prompt}]
    })
  });

  const data = await response.json();
  console.log("API response:", data);
  if (!response.ok) {
    throw data;
  }
  const translation = data.choices[0].message.content.trim();
  console.log('translation:', translation);

  return translation;
}

function getSelectedNodeWidthAndLeft() {
  const range = window.getSelection().getRangeAt(0);
  const rects = range.getClientRects();
  let minLeft = Infinity;
  let maxRight = -Infinity;

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    minLeft = Math.min(minLeft, rect.left);
    maxRight = Math.max(maxRight, rect.right);
  }

  const width = maxRight - minLeft;
  const left = minLeft;

  return { width, left };
}

async function displayTranslation(text, targetLanguage) {
  const bubble = createBubbleElement('翻译中……');
  const contentContainer = bubble.querySelector(".bubble-content");

  try {
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
    // 设置气泡的 bottom 值
    bubble.style.bottom = (window.innerHeight - (rect.top + window.scrollY) + 14) + 'px';
    const { width, left } = getSelectedNodeWidthAndLeft();
    // 设置气泡的 left 值，使其与选中区域左对齐
    bubble.style.left = (left + window.scrollX) + 'px';
    bubble.style.width = width + 'px';
  } catch (error) {
    console.error('设置气泡位置出错', error);
  }

  try {
    const translation = await translateText(text, targetLanguage);
    copyToClipboard(translation);
    contentContainer.innerText = translation;
  } catch (error) {
    const message = '翻译遇到错误：' + JSON.stringify(error, null, 2);
    const pre = document.createElement("pre");
    pre.innerText = message;
    contentContainer.innerHTML = pre.outerHTML;
  } finally {
    const { bubbleTimeout } = await getStorageData(["bubbleTimeout"]);
    if (bubbleTimeout > 0) {
      setTimeout(() => {
        bubble.remove();
      }, bubbleTimeout * 1000);
    }
  }
}

function translate(targetLanguage) {
  console.log('translate:', targetLanguage);
  const selectedText = window.getSelection().toString();
  if (selectedText) {
    displayTranslation(selectedText, targetLanguage);
  }
}

function translateZh() {
  console.log('translateZh')
  translate('zh');
}

function translateEn() {
  translate('en');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('onMessage:', message);
  if (message.action === "translateZh") {
    translateZh();
  } else if (message.action === "translateEn") {
    translateEn();
  }
});
