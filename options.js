document.getElementById("save").addEventListener("click", () => {
  const apiKey = document.getElementById("apiKey").value;
  const promptChinese = document.getElementById("promptChinese").value;
  const promptEnglish = document.getElementById("promptEnglish").value;
  const bubbleTimeout = document.getElementById("bubbleTimeout").value;
  chrome.storage.sync.set({ apiKey, promptChinese, promptEnglish, bubbleTimeout }, () => {
    console.log("API Key 和 Prompts 已保存。");
  });
});

function fillOptions() {
  chrome.storage.sync.get(["apiKey", "promptChinese", "promptEnglish", "bubbleTimeout"], (result) => {
    if (result.apiKey) {
      document.getElementById("apiKey").value = result.apiKey;
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
  });
}

document.addEventListener("DOMContentLoaded", fillOptions);
