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

async function callBackgroundFunction(action, params) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, params }, (response) => {
      if (response.success) {
        resolve(response.data);
      } else {
        reject(response.error);
      }
    });
  });
}

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
  return await callBackgroundFunction('translateText', {text, targetLanguage});
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setBubbleWidthAndLeft(bubble) {
  const range = window.getSelection().getRangeAt(0);
  const rects = range.getClientRects();
  let minLeft = Infinity;
  let maxRight = -Infinity;

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    minLeft = Math.min(minLeft, rect.left);
    maxRight = Math.max(maxRight, rect.right);
  }

  const width = clamp(maxRight - minLeft, 30, window.innerWidth);
  const left = clamp(minLeft, 0, window.innerWidth);

  bubble.style.width = width + 'px';
  bubble.style.left = left + window.scrollX + 'px';
}

function setBubbleTop(bubble) {
  const computedStyle = window.getComputedStyle(bubble);
  const bubbleHeight = parseInt(computedStyle.height);
  const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
  const top = clamp(rect.top, bubbleHeight + 14, window.innerHeight);
  bubble.style.top = top + window.scrollY - (bubbleHeight + 14) + 'px';
}

async function displayTranslation(targetLanguage) {
  const bubble = createBubbleElement('翻译中……');

  setBubbleWidthAndLeft(bubble);
  setBubbleTop(bubble);

  const contentContainer = bubble.querySelector(".bubble-content");
  try {
    const text = window.getSelection().toString();
    const translation = await translateText(text, targetLanguage);
    copyToClipboard(translation);
    contentContainer.innerText = translation;
    setBubbleTop(bubble); 
  } catch (error) {
    if (error === 'Unauthorized') {
      contentContainer.innerHTML = `请前往<a target="_blank" href="https://chat.openai.com/chat">OpenAI</a>登录，或者在设置中使用API模式。`;
      setBubbleTop(bubble);
    } else {
      const message = '翻译遇到错误：' + JSON.stringify(error, null, 2);
      const pre = document.createElement("pre");
      pre.innerText = message;
      contentContainer.innerHTML = pre.outerHTML;
      setBubbleTop(bubble);
    }
  } finally {
    let { bubbleTimeout } = await getStorageData(["bubbleTimeout"]);
    bubbleTimeout = bubbleTimeout || 3;
    if (bubbleTimeout > 0) {
      setTimeout(() => {
        bubble.remove();
      }, bubbleTimeout * 1000);
    }
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    // 使用 OpenAI 接口进行翻译
    const { targetLanguage } = request;
    displayTranslation(targetLanguage);
  }
});
