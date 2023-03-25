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
  const { menuItemId, selectionText } = info;
  console.log("Context menu clicked:", menuItemId, selectionText);

  if (menuItemId === "translateToChinese" || menuItemId === "translateToEnglish") {
    const targetLanguage = menuItemId === "translateToChinese" ? "zh" : "en";
    console.log("Sending message to content script:", { action: "translate", text: selectionText, targetLanguage });
    chrome.tabs.sendMessage(tab.id, { action: "translate", text: selectionText, targetLanguage });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "translate-zh") {
    const queryOptions = { active: true, currentWindow: true };
    const [activeTab] = await chrome.tabs.query(queryOptions);
    chrome.tabs.sendMessage(activeTab.id, { action: "translateZh" });
  } else if (command === 'translate-en') {
    const queryOptions = { active: true, currentWindow: true };
    const [activeTab] = await chrome.tabs.query(queryOptions);
    chrome.tabs.sendMessage(activeTab.id, { action: "translateEn" });
  }
});
