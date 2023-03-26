document.getElementById("save").addEventListener("click", () => {
  const apiKey = document.getElementById("apiKey").value;
  const promptChinese = document.getElementById("promptChinese").value;
  const promptEnglish = document.getElementById("promptEnglish").value;
  const bubbleTimeout = document.getElementById("bubbleTimeout").value;
  const useAPI = document.getElementById("openaiAPI").checked ? true : false;
  chrome.storage.sync.set({ apiKey, promptChinese, promptEnglish, bubbleTimeout, useAPI }, () => {
    console.log("API Key 和 Prompts 已保存。");

    const status = document.getElementById("saveStatus");
    status.style.display = "";
    status.style.setProperty("-webkit-transition", "opacity 0.4s ease-out");
    status.style.opacity = 1;
    window.setTimeout(function() {
        document.getElementById("saveStatus").style.opacity = 0
    }, 1500);

  });
});

function fillOptions() {
  chrome.storage.sync.get(["apiKey", "promptChinese", "promptEnglish", "bubbleTimeout", "useAPI"], (result) => {
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
    if (result.useAPI) {
      document.getElementById("openaiAPI").checked = true;
    }
  });
}

document.addEventListener("DOMContentLoaded", fillOptions);
