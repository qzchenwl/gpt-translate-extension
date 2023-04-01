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


async function translateText(text, targetLanguage, ocr) {
    return await callBackgroundFunction('translateText', {text, targetLanguage, ocr});
}


async function ocr(imageBase64) {
    return await callBackgroundFunction('ocr', {imageBase64});
}

function createBubbleElement(content) {
    const bubble = document.createElement('div');
    bubble.className = 'translation-bubble';

    const contentContainer = document.createElement('div');
    contentContainer.className = 'bubble-content';
    contentContainer.innerText = content;
    bubble.appendChild(contentContainer);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'bubble-buttons';
    const closeButton = document.createElement('button');
    closeButton.innerText = '确定';
    closeButton.addEventListener('click', () => {
        bubble.remove();
    });
    buttonContainer.appendChild(closeButton);
    bubble.appendChild(buttonContainer);

    document.body.appendChild(bubble);
    return bubble;
}

async function callBackgroundFunction(action, params) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({action, params}, (response) => {
            if (response.success) {
                resolve(response.data);
            } else {
                reject(response.error);
            }
        });
    });
}

function unsecuredCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
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

    const width = clamp(maxRight - minLeft, 150, window.innerWidth);
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

    const contentContainer = bubble.querySelector('.bubble-content');
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
            const pre = document.createElement('pre');
            pre.innerText = message;
            contentContainer.innerHTML = pre.outerHTML;
            setBubbleTop(bubble);
        }
    } finally {
        let {bubbleTimeout} = await getStorageData(['bubbleTimeout']);
        bubbleTimeout = bubbleTimeout || 3;
        if (bubbleTimeout > 0) {
            setTimeout(() => {
                bubble.remove();
            }, bubbleTimeout * 1000);
        }
    }
}


async function displayImageTextRecognition(imageUrl, targetLanguage) {
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.id = 'image-overlay';
    overlay.className = 'image-overlay';
    // 点击遮罩层以关闭全屏显示
    overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
            document.body.removeChild(overlay);
        }
    });
    // 将遮罩层添加到页面
    document.body.appendChild(overlay);

    // 创建一个表示loading状态的元素
    const loadingElement = document.createElement('div');
    loadingElement.className = 'loading-spinner';
    // 将loading状态添加到遮罩层
    overlay.appendChild(loadingElement);

    try {
        // 创建原图展示
        const originImage = document.createElement('img');
        originImage.src = imageUrl;
        originImage.className = 'full-screen-image';
        originImage.crossOrigin = 'anonymous';
        overlay.appendChild(originImage);

        // 创建翻译图展示
        const image = document.createElement('img');
        image.src = imageUrl;
        image.className = 'full-screen-image'; // 添加此行
        image.crossOrigin = 'anonymous';
        overlay.appendChild(image);

        // 等待图片加载完成
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.onabort = reject;
        });

        // 将图片转换为Base64格式
        const subImages = splitImage(image);

        // 为每张子图调用OCR函数并合并结果
        const ocrResult = [];
        for (let i = 0; i < subImages.length; i++) {
            const {base64, offsetX, offsetY} = subImages[i];
            const subOcrResult = await ocr(base64);
            console.log('subOcrResult', subOcrResult);
            subOcrResult.forEach(x => {
                x.location.left += offsetX;
                x.location.top += offsetY;
            });
            ocrResult.push(...subOcrResult);
        }
        console.log('ocrResult', ocrResult);

        // 翻译ocrResult
        let texts = '';
        ocrResult.forEach((entry, i) => {
            texts += `[section ${i}]\n${entry.words}\n`;
        });
        const translation = await translateText(texts, targetLanguage, true);
        const translatedTexts = JSON.parse(translation);
        console.log(translation);
        console.log(translatedTexts);
        ocrResult.forEach((entry, index) => {
            entry.words = translatedTexts[index];
        });

        // 在图片上显示OCR结果
        displayOcrResults(ocrResult, image, overlay);
    } finally {
        // OCR 完成后，移除 loading 状态
        overlay.removeChild(loadingElement);
    }
}


function splitImage(image) {
    const MAX_SIZE = 4000;

    const imgWidth = image.naturalWidth;
    const imgHeight = image.naturalHeight;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let offsetX = 0;
    let offsetY = 0;
    let canvasIndex = 0;
    const canvasList = [];
    const result = [];

    while (offsetY < imgHeight) {
        while (offsetX < imgWidth) {
            const width = Math.min(MAX_SIZE, imgWidth - offsetX);
            const height = Math.min(MAX_SIZE, imgHeight - offsetY);
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(image, offsetX, offsetY, width, height, 0, 0, width, height);
            const base64 = canvas.toDataURL('image/png').replace(/^data:image\/\w+;base64,/, '');
            canvasList.push({ base64, offsetX, offsetY });
            offsetX += MAX_SIZE;
            canvasIndex++;
        }
        offsetX = 0;
        offsetY += MAX_SIZE;
    }

    canvasList.forEach((canvas) => {
        const { base64, offsetX, offsetY } = canvas;
        result.push({ base64, offsetX, offsetY });
    });

    return result;
}


function displayOcrResults(wordsResults, image, overlay) {
    const imageNaturalWidth = image.naturalWidth;
    const imageNaturalHeight = image.naturalHeight;
    const imageDisplayWidth = image.clientWidth;
    const imageDisplayHeight = image.clientHeight;

    const scaleX = imageDisplayWidth / imageNaturalWidth;
    const scaleY = imageDisplayHeight / imageNaturalHeight;

    const imageRect = image.getBoundingClientRect();
    // 创建 OCR 结果容器
    const container = document.createElement('div');
    container.className = 'ocr-container';
    container.style.top = imageRect.top + 'px';
    container.style.left = imageRect.left + 'px';
    container.style.width = imageRect.width + 'px';
    container.style.height = imageRect.height + 'px';
    overlay.appendChild(container);

    wordsResults.forEach((wordResult) => {
        const location = wordResult.location;

        // 创建 OCR 文本元素
        const textElement = document.createElement('pre');
        textElement.className = 'ocr-text';
        textElement.style.top = (location.top * scaleY) + 'px';
        textElement.style.left = (location.left * scaleX) + 'px';
        textElement.style.width = (location.width * scaleX) + 'px';
        textElement.style.height = (location.height * scaleY) + 'px';
        textElement.style.lineHeight = (wordResult.lineHeight * scaleY) + 'px';
        textElement.style.fontSize = (wordResult.fontSize * scaleY) + 'px';
        textElement.textContent = wordResult.words;

        // 将文字元素添加到遮罩层
        container.appendChild(textElement);
    });

}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === 'translate') {
        // 使用 OpenAI 接口进行翻译
        const {targetLanguage} = request;
        try {
            await displayTranslation(targetLanguage);
        } catch (error) {
            console.error(error);
            const message = error.message || JSON.stringify(error);
            alert('翻译文本失败：' + message);
        }
    } else if (request.action === 'recognize') {
        const {imageUrl, targetLanguage} = request;
        try {
            await displayImageTextRecognition(imageUrl, targetLanguage);
        } catch (error) {
            console.error(error);
            const message = error.message || JSON.stringify(error);
            alert('翻译图片失败：' + message);
        }
    }
});
