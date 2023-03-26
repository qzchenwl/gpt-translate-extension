import { callChatGPAPI } from "./chat-gpt-api.js";
import { callChatGPTWeb } from "./chat-gpt-web.js";




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


async function translateText(text, targetLanguage) {
  console.log("translateText:", text, targetLanguage);
  const { promptChinese, promptEnglish, useAPI } = await getStorageData(["promptChinese", "promptEnglish"]);
  console.log({ promptChinese, promptEnglish, useAPI });
  let prompt = `Translate the following text to ${targetLanguage === 'zh' ? 'Chinese' : 'English'}: ${text}`;
  const promptValue = targetLanguage === "zh" ? promptChinese : promptEnglish;
  if (promptValue) {
    prompt = promptValue.replace("{text}", text);
  }
  console.log("prompt:", prompt);

  let translation;
  if (useAPI) {
    translation = await callChatGPAPI(prompt);
  } else {
    translation = await callChatGPTWeb(prompt);
  }
  console.log('translation:', translation);
  return translation;
}


const backgroundFunctions = {
  translateText: ({text, targetLanguage}) => translateText(text, targetLanguage)
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
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const { menuItemId } = info;
  if (menuItemId === "translateToChinese" || menuItemId === "translateToEnglish") {
    const targetLanguage = menuItemId === "translateToChinese" ? "zh" : "en";
    chrome.tabs.sendMessage(tab.id, { action: "translate", targetLanguage });
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
