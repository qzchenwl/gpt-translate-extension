import {callChatGPAPI} from "./chat-gpt-api.js";
import {callChatGPTWeb} from "./chat-gpt-web.js";
import {baiduOCR} from './baidu-ocr-api.js'


async function getSessionToken() {
  const cookie = await chrome.cookies.get({
      url: 'https://chat.openai.com',
      name: '__Secure-next-auth.session-token',
  });

  if (cookie && cookie.value) {
      const sessionToken = cookie.value;
      chrome.storage.sync.set({ sessionToken: sessionToken }, () => {
          console.log("sessionToken 已保存：", sessionToken);
      });
      return sessionToken;
  } else {
      return null;
  }
}


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


async function translateText(text, targetLanguage, json = false) {
  console.log("translateText:", text, targetLanguage, json);
  const { promptChinese, promptEnglish, useAPI, model } = await getStorageData(["promptChinese", "promptEnglish", "useAPI", "model"]);
  console.log({ promptChinese, promptEnglish, useAPI });
  let prompt = `Translate the following text to ${targetLanguage === 'zh' ? 'Chinese' : 'English'}: ${text}`;
  const promptValue = targetLanguage === "zh" ? promptChinese : promptEnglish;
  if (promptValue) {
    prompt = promptValue.replace("{text}", text);
  }
  if (json) {
    prompt = `Please translate following JSON object values into ${targetLanguage === 'zh' ? 'Chinese' : 'English'} one by one. You must output a translated JSON object with the same size as the original object.\n${text}`
  }
  console.log("prompt:", prompt);

  let translation;
  if (useAPI) {
    const { apiKey } = await getStorageData(["apiKey"]);
    if (!apiKey) {
      throw '请在插件选项中配置OPENAI_API_KEY';
    }
    translation = await callChatGPAPI(apiKey, model, prompt);
  } else {
    const sessionToken = await getSessionToken();
    if (!sessionToken) {
      throw 'Unauthorized';
    }
    translation = await callChatGPTWeb(sessionToken, model, prompt);
  }
  console.log('translation:', translation);
  return translation;
}


async function ocr(imageBase64) {
  console.log("ocr:", imageBase64.slice(0, 10));
  const {ocrApiKey, ocrSecretKey} = await getStorageData(["ocrApiKey", "ocrSecretKey"]);
  if (!ocrApiKey || !ocrSecretKey) {
    throw '请在插件选项中配置BAIDU_OCR_API_KEY以及BAIDU_OCR_SECRET_KEY';
  }
  return await baiduOCR(ocrApiKey, ocrSecretKey, imageBase64, "auto_detect");
}


const backgroundFunctions = {
  translateText: ({text, targetLanguage, json}) => translateText(text, targetLanguage, json),
  ocr: ({imageBase64}) => ocr(imageBase64),
};


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (backgroundFunctions.hasOwnProperty(request.action)) {
    (async () => {
      try {
        const result = await backgroundFunctions[request.action](request.params);
        sendResponse({ success: true, data: result });
      } catch (error) {
        console.error(error);
        sendResponse({ success: false, error: error });
      }
    })();
  }
  return true; // Important to keep this, as it indicates we will respond asynchronously
});


chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translateToChinese",
    title: "翻译为中文",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "translateToEnglish",
    title: "翻译为英文",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "imageTextRecognitionToChinese",
    title: "翻译图片中文字为中文",
    contexts: ["image"]
  });

  // chrome.contextMenus.create({
  //   id: "imageTextRecognitionToEnglish",
  //   title: "翻译图片中文字为英文",
  //   contexts: ["image"]
  // });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const { menuItemId } = info;
  if (menuItemId === "translateToChinese" || menuItemId === "translateToEnglish") {
    const targetLanguage = menuItemId === "translateToChinese" ? "zh" : "en";
    chrome.tabs.sendMessage(tab.id, { action: "translate", targetLanguage });
  } else if (menuItemId === "imageTextRecognitionToChinese" || menuItemId === "imageTextRecognitionToEnglish") {
    const targetLanguage = menuItemId === "imageTextRecognitionToChinese" ? "zh" : "en";
    chrome.tabs.sendMessage(tab.id, { action: "recognize", imageUrl: info.srcUrl, targetLanguage })
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command.startsWith('translate-')) {
    const targetLanguage = command.split('-')[1];
    const queryOptions = { active: true, currentWindow: true };
    const [activeTab] = await chrome.tabs.query(queryOptions);
    chrome.tabs.sendMessage(activeTab.id, { action: "translate", targetLanguage });
  }
});
