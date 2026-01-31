/**
 * DeepSeek (chat.deepseek.com) 内容脚本
 * 需要登录
 */

const PLATFORM_ID = 'deepseek';

// 选择器配置 - 基于实际 DOM 结构优化
const SELECTORS = {
    input: [
        '#chat-input',
        'textarea[placeholder*="输入"]',
        'textarea[placeholder*="发送"]',
        'textarea[placeholder*="想问"]',
        'textarea[placeholder*="DeepSeek"]',
        'textarea',
        '[contenteditable="true"]'
    ],
    send: [
        'div[role="button"][class*="send"]',
        'button[class*="send"]',
        'div[role="button"]:has(svg)',
        'button:has(svg)'
    ],
    response: ['.markdown-body', '.message-content', '.response-text'],
    loading: ['.loading', '.generating', '.typing'],
    loginIndicator: ['input[placeholder*="手机"]', 'input[type="tel"]', '.login-form'],
    // 图片上传相关 - 2026年1月基于 Playwright 验证
    // DeepSeek 的上传按钮直接触发 file chooser
    uploadButton: [
        'button:has(svg):not([disabled])',  // 附件按钮（非发送按钮）
        'div[class*="attach"]',
        'button[class*="attach"]',
        'button[class*="upload"]'
    ],
    fileInput: [
        'input[type="file"][accept*="image"]',
        'input[type="file"]'
    ],
    // 联网搜索开关 - 上传图片时需要关闭
    webSearchToggle: [
        'button:has-text("联网搜索")',
        'div[class*="web-search"]',
        '[aria-label*="联网"]'
    ]
};

// 优先使用 Enter 发送
const USE_ENTER_TO_SEND = true;

const LOGIN_METHODS = {
    google: ['button:has-text("Google")'],
    phone: ['input[type="tel"]', 'input[placeholder*="手机"]'],
    email: ['input[type="email"]'],
    wechat: ['img[alt*="微信"]', '.wechat-qrcode']
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

    if (url.includes('login') || url.includes('signin') || url.includes('sign_in')) {
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
        // 如果有图片，先关闭联网搜索再上传图片
        if (imageData) {
            await disableWebSearch();
            await uploadImage(imageData);
            await sleep(2000); // 等待图片上传完成
        }

        const inputEl = await findElement(SELECTORS.input);
        if (!inputEl) throw new Error('未找到输入框');

        console.log(`[Multi-GPT] ${PLATFORM_ID} 找到输入框:`, inputEl.tagName);

        inputEl.click();
        inputEl.focus();
        await sleep(300);

        if (question) {
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
        }

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

// 关闭联网搜索（DeepSeek 上传图片时需要关闭）
async function disableWebSearch() {
    console.log(`[Multi-GPT] ${PLATFORM_ID} 检查联网搜索状态...`);
    
    try {
        // 查找联网搜索按钮
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const text = btn.textContent || btn.innerText || '';
            if (text.includes('联网搜索')) {
                // 检查是否已启用（通过样式或属性判断）
                const isEnabled = btn.classList.contains('active') || 
                                  btn.getAttribute('aria-pressed') === 'true' ||
                                  btn.querySelector('[class*="active"]') !== null;
                
                if (isEnabled) {
                    console.log(`[Multi-GPT] ${PLATFORM_ID} 关闭联网搜索...`);
                    btn.click();
                    await sleep(500);
                }
                break;
            }
        }
    } catch (e) {
        console.warn(`[Multi-GPT] ${PLATFORM_ID} 关闭联网搜索失败:`, e);
    }
}

// 上传图片到 DeepSeek
async function uploadImage(imageData) {
    console.log(`[Multi-GPT] ${PLATFORM_ID} 开始上传图片`);

    try {
        // 方案1: 直接找到隐藏的 file input
        let fileInput = document.querySelector('input[type="file"]');
        
        if (!fileInput) {
            // 方案2: 点击上传按钮触发 file chooser
            console.log(`[Multi-GPT] ${PLATFORM_ID} 尝试点击上传按钮...`);
            
            // DeepSeek 的上传按钮是输入框旁边的图标按钮
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                // 跳过发送按钮（disabled）和深度思考/联网搜索按钮
                if (btn.disabled) continue;
                const text = btn.textContent || '';
                if (text.includes('深度思考') || text.includes('联网搜索')) continue;
                
                // 检查是否包含 svg（图标按钮）
                if (btn.querySelector('svg') && !text.trim()) {
                    btn.click();
                    await sleep(500);
                    fileInput = document.querySelector('input[type="file"]');
                    if (fileInput) break;
                }
            }
        }

        if (!fileInput) {
            console.warn(`[Multi-GPT] ${PLATFORM_ID} 未找到图片上传按钮`);
            return;
        }

        // 将 base64 转换为 File 对象
        const file = base64ToFile(imageData.base64, imageData.name);

        // 设置 file input 的 files 属性
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
