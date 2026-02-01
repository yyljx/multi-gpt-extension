/**
 * 豆包 (doubao.com) 内容脚本
 * 需要登录（字节跳动账号）
 */

const PLATFORM_ID = 'doubao';

// 选择器配置 - 基于实际 DOM 结构优化
const SELECTORS = {
    input: [
        'textarea[placeholder*="输入"]',
        'textarea[placeholder*="想问"]',
        'textarea.semi-input-textarea',
        '.chat-input textarea',
        'textarea',
        '[contenteditable="true"]'
    ],
    send: [
        'button[class*="send-btn"]',
        'div[class*="send-btn"]',
        'button[class*="send"]',
        'button:has(svg[class*="send"])'
    ],
    response: ['.message-content', '.chat-message', '.markdown-body', '[class*="message-text"]'],
    loading: ['.loading', '.typing', '.generating', '[class*="loading"]'],
    loginIndicator: ['.login-btn', 'button:has-text("登录")', 'a[href*="login"]', '.passport-login'],
    // 图片上传相关 - 豆包支持图片上传
    uploadButton: [
        'button[class*="upload"]',
        'div[class*="upload"]',
        'button:has(svg):not([disabled])',
        '[class*="attach"]',
        '[class*="image"]'
    ],
    fileInput: [
        'input[type="file"][accept*="image"]',
        'input[type="file"]'
    ]
};

// 优先使用 Enter 发送
const USE_ENTER_TO_SEND = true;

const LOGIN_METHODS = {
    phone: ['input[type="tel"]', 'input[placeholder*="手机"]'],
    email: ['input[type="email"]']
};

/**
 * 安全的消息发送函数 - 处理扩展上下文失效的情况
 */
function safeSendMessage(message) {
    try {
        if (chrome.runtime?.id) {
            chrome.runtime.sendMessage(message);
        }
    } catch (e) {
        console.log('[Multi-GPT] 扩展上下文已失效，请刷新页面');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function init() {
    console.log(`[Multi-GPT] ${PLATFORM_ID} 内容脚本已加载`);

    setTimeout(() => {
        checkLoginStatus();
        safeSendMessage({ action: 'platformReady', platformId: PLATFORM_ID });
    }, 2000);
}

function checkLoginStatus() {
    const url = window.location.href.toLowerCase();

    if (url.includes('login') || url.includes('passport')) {
        detectLoginMethod();
        safeSendMessage({
            action: 'loginDetected',
            platformId: PLATFORM_ID,
            loggedIn: false,
            loginMethod: null
        });
        return;
    }

    for (const selector of SELECTORS.loginIndicator) {
        try {
            const el = document.querySelector(selector);
            if (el && isVisible(el)) {
                safeSendMessage({
                    action: 'loginDetected',
                    platformId: PLATFORM_ID,
                    loggedIn: false,
                    loginMethod: null
                });
                return;
            }
        } catch (e) { }
    }

    for (const selector of SELECTORS.input) {
        try {
            const el = document.querySelector(selector);
            if (el && isVisible(el)) {
                safeSendMessage({
                    action: 'loginDetected',
                    platformId: PLATFORM_ID,
                    loggedIn: true,
                    loginMethod: getStoredLoginMethod()
                });
                return;
            }
        } catch (e) { }
    }
}

function detectLoginMethod() {
    for (const [method, selectors] of Object.entries(LOGIN_METHODS)) {
        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el && isVisible(el)) {
                    el.addEventListener('click', () => {
                        localStorage.setItem('multiGPT_lastLoginMethod', method);
                    });
                }
            } catch (e) { }
        }
    }
}

function getStoredLoginMethod() {
    return localStorage.getItem('multiGPT_lastLoginMethod') || null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'inputQuestion' && message.platformId === PLATFORM_ID) {
        inputAndSend(message.question, message.imageData);
        sendResponse({ success: true });
    }
    return true;
});

async function inputAndSend(question, imageData) {
    console.log(`[Multi-GPT] ${PLATFORM_ID} 开始输入问题:`, question);
    console.log(`[Multi-GPT] ${PLATFORM_ID} 图片数据:`, imageData ? '有图片' : '无图片');

    try {
        // 如果有图片，先上传图片
        if (imageData) {
            await uploadImage(imageData);
            await sleep(2000); // 等待图片上传完成
        }

        const inputEl = await findElement(SELECTORS.input);
        if (!inputEl) throw new Error('未找到输入框');

        console.log(`[Multi-GPT] ${PLATFORM_ID} 找到输入框:`, inputEl.tagName, inputEl.className);

        inputEl.click();
        inputEl.focus();
        await sleep(300);

        if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
            // 使用原生方式设置值
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype, 'value'
            )?.set || Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            )?.set;
            
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(inputEl, question);
            } else {
                inputEl.value = question;
            }
            
            inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        } else {
            inputEl.textContent = question;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }

        console.log(`[Multi-GPT] ${PLATFORM_ID} 问题已输入`);
        await sleep(800);

        // 如果有图片，再等一下确保图片完全加载
        if (imageData) {
            console.log(`[Multi-GPT] ${PLATFORM_ID} 等待图片完全加载...`);
            await sleep(2000);
        }

        // 发送
        if (USE_ENTER_TO_SEND) {
            console.log(`[Multi-GPT] ${PLATFORM_ID} 使用 Enter 发送`);
            inputEl.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }));
            inputEl.dispatchEvent(new KeyboardEvent('keypress', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }));
            inputEl.dispatchEvent(new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }));
        } else {
            const sendBtn = await findElement(SELECTORS.send, 3000);
            if (sendBtn) {
                sendBtn.click();
                console.log(`[Multi-GPT] ${PLATFORM_ID} 已点击发送`);
            } else {
                inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            }
        }

        watchResponse();

    } catch (e) {
        console.error(`[Multi-GPT] ${PLATFORM_ID} 发送失败:`, e);
        safeSendMessage({
            action: 'queryComplete',
            platformId: PLATFORM_ID,
            success: false,
            error: e.message
        });
    }
}

async function findElement(selectors, timeout = 8000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el && isVisible(el)) return el;
            } catch (e) { }
        }
        await sleep(300);
    }
    return null;
}

function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}

function watchResponse() {
    let lastContent = '';
    let stableCount = 0;

    const checkInterval = setInterval(() => {
        for (const loadingSelector of SELECTORS.loading) {
            try {
                const loadingEl = document.querySelector(loadingSelector);
                if (loadingEl && isVisible(loadingEl)) {
                    stableCount = 0;
                    return;
                }
            } catch (e) { }
        }

        const responseEls = document.querySelectorAll(SELECTORS.response.join(', '));
        const lastResponse = responseEls[responseEls.length - 1];

        if (lastResponse) {
            const currentContent = lastResponse.textContent;
            if (currentContent === lastContent && currentContent.length > 10) {
                stableCount++;
                if (stableCount >= 4) {
                    clearInterval(checkInterval);
                    safeSendMessage({
                        action: 'queryComplete',
                        platformId: PLATFORM_ID,
                        success: true
                    });
                }
            } else {
                lastContent = currentContent;
                stableCount = 0;
            }
        }
    }, 500);

    setTimeout(() => {
        clearInterval(checkInterval);
        safeSendMessage({ action: 'queryComplete', platformId: PLATFORM_ID, success: true });
    }, 180000);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 上传图片到豆包
// 注意：Chrome 扩展的 content script 没有用户激活上下文，不能触发 file chooser
// 解决方案：直接找到 file input 并设置 files 属性，不点击任何按钮
async function uploadImage(imageData) {
    console.log(`[Multi-GPT] ${PLATFORM_ID} 开始上传图片`);

    try {
        // 直接查找页面上所有的 file input（包括隐藏的）
        let fileInput = document.querySelector('input[type="file"]');
        
        if (!fileInput) {
            // 等待一下再试
            await sleep(1000);
            fileInput = document.querySelector('input[type="file"]');
        }

        if (!fileInput) {
            console.warn(`[Multi-GPT] ${PLATFORM_ID} 未找到图片上传按钮，仅发送文字`);
            return;
        }

        console.log(`[Multi-GPT] ${PLATFORM_ID} 找到 file input:`, fileInput);

        // 将 base64 转换为 File 对象
        const file = base64ToFile(imageData.base64, imageData.name);

        // 设置 file input 的 files 属性（不触发 click，避免 user activation 错误）
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;

        // 触发 change 事件
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));

        console.log(`[Multi-GPT] ${PLATFORM_ID} 图片已上传`);

    } catch (e) {
        console.error(`[Multi-GPT] ${PLATFORM_ID} 图片上传失败:`, e);
    }
}

// 将 base64 转换为 File 对象
function base64ToFile(base64, filename) {
    const arr = base64.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
}
