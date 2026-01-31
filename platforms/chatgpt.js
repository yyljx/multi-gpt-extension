/**
 * ChatGPT (chatgpt.com) 内容脚本
 * 需要登录
 */

const PLATFORM_ID = 'chatgpt';

// 选择器配置 - 2025年1月更新，基于 Playwright 实际验证的 DOM 结构
const SELECTORS = {
    input: [
        '#prompt-textarea', 
        'textarea[placeholder*="Message"]', 
        'textarea[placeholder*="问"]', 
        'textarea[data-id="root"]', 
        'div[contenteditable="true"]',
        'textarea'
    ],
    send: ['button[data-testid="send-button"]', 'button[aria-label="Send prompt"]', 'button[aria-label*="发送"]', 'button.bottom-0'],
    response: ['.markdown', '.message-content', '[data-message-author-role="assistant"]'],
    loading: ['.result-streaming', '.typing-indicator', '[data-testid="stop-button"]'],
    loginIndicator: ['button[data-testid="login-button"]', 'a[href*="auth"]', '.auth-page'],
    // 图片上传相关 - 2025年1月 Playwright 验证
    // 流程：1. 点击 "添加照片" 按钮 2. 点击 "图片" 菜单项 3. file input 弹出
    attachButton: [
        'button[aria-label="添加照片"]',      // 中文界面 - 验证通过
        'button[aria-label*="照片"]',          // 中文界面模糊匹配
        'button[aria-label="Add photos"]',     // 英文界面
        'button[aria-label*="photo"]',         // 英文界面模糊匹配
        'button[aria-label="Attach files"]',   // 旧版界面
        'button[data-testid="attachment-button"]'
    ],
    // "图片" 菜单项选择器
    imageMenuItem: [
        '[role="menuitem"]'  // 通过 role 和文本内容匹配
    ],
    fileInput: [
        '#upload-photos',                                    // ChatGPT 专用 ID
        'input[type="file"][accept*="image/gif"]',          // 带完整 accept 的 input
        'input[type="file"][accept="image/*"]',             // 通用图片 accept
        'input[type="file"][accept*="image"]',              // 模糊匹配
        'input[type="file"]'                                 // 最后兜底
    ]
};

// 登录方式检测
const LOGIN_METHODS = {
    google: ['button[data-provider="google"]', 'button:has-text("Continue with Google")'],
    microsoft: ['button[data-provider="windows-live"]', 'button:has-text("Continue with Microsoft")'],
    apple: ['button[data-provider="apple"]', 'button:has-text("Continue with Apple")'],
    email: ['input[type="email"]', 'input[name="username"]']
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

// 页面加载完成
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function init() {
    console.log(`[Multi-GPT] ${PLATFORM_ID} 内容脚本已加载`);

    // 延迟检测，等待页面完全加载
    setTimeout(() => {
        checkLoginStatus();

        // 通知 background 页面已准备好
        safeSendMessage({
            action: 'platformReady',
            platformId: PLATFORM_ID
        });
    }, 2000);
}

// 检测登录状态
function checkLoginStatus() {
    const url = window.location.href.toLowerCase();

    // URL 包含 auth/login 说明未登录
    if (url.includes('auth') || url.includes('login')) {
        detectLoginMethod();
        safeSendMessage({
            action: 'loginDetected',
            platformId: PLATFORM_ID,
            loggedIn: false,
            loginMethod: null
        });
        return;
    }

    // 检查是否有登录按钮
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

    // 检查是否有输入框（说明已登录）
    for (const selector of SELECTORS.input) {
        try {
            const el = document.querySelector(selector);
            if (el) {
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

// 检测页面上可用的登录方式
function detectLoginMethod() {
    for (const [method, selectors] of Object.entries(LOGIN_METHODS)) {
        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el && isVisible(el)) {
                    // 记录这个登录方式被点击
                    el.addEventListener('click', () => {
                        localStorage.setItem('multiGPT_lastLoginMethod', method);
                    });
                }
            } catch (e) { }
        }
    }
}

// 获取存储的登录方式
function getStoredLoginMethod() {
    return localStorage.getItem('multiGPT_lastLoginMethod') || null;
}

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'inputQuestion' && message.platformId === PLATFORM_ID) {
        inputAndSend(message.question, message.imageData);
        sendResponse({ success: true });
    }
    return true;
});

// 输入并发送问题
async function inputAndSend(question, imageData) {
    console.log(`[Multi-GPT] ${PLATFORM_ID} 开始输入问题:`, question);
    console.log(`[Multi-GPT] ${PLATFORM_ID} 图片数据:`, imageData ? '有图片' : '无图片');

    try {
        // 如果有图片，先上传图片
        if (imageData) {
            await uploadImage(imageData);
            console.log(`[Multi-GPT] ${PLATFORM_ID} 等待图片上传完成...`);
            await sleep(2000); // 增加等待时间，确保图片上传完成
        }

        // 如果有文字，输入文字
        if (question) {
            // 查找输入框
            const inputEl = await findElement(SELECTORS.input);
            if (!inputEl) {
                throw new Error('未找到输入框，可能需要登录');
            }

            // 聚焦
            inputEl.focus();
            inputEl.click();
            await sleep(300);

            // ChatGPT 使用特殊的输入方式
            // 先清空
            inputEl.value = '';
            inputEl.textContent = '';

            // 使用 paste 事件模拟粘贴
            const clipboardData = new DataTransfer();
            clipboardData.setData('text/plain', question);

            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: clipboardData
            });
            inputEl.dispatchEvent(pasteEvent);

            // 如果 paste 不起作用，尝试直接设置
            if (!inputEl.textContent && !inputEl.value) {
                if (inputEl.tagName === 'TEXTAREA') {
                    inputEl.value = question;
                } else {
                    inputEl.textContent = question;
                }
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            }

            await sleep(1000); // 增加等待时间
        }

        // 如果有图片，再等一下确保图片完全加载
        if (imageData) {
            console.log(`[Multi-GPT] ${PLATFORM_ID} 等待图片完全加载到界面...`);
            await sleep(2000);
        }

        // 查找发送按钮
        const sendBtn = await findElement(SELECTORS.send);
        if (sendBtn && !sendBtn.disabled) {
            sendBtn.click();
            console.log(`[Multi-GPT] ${PLATFORM_ID} 已点击发送按钮`);
        } else {
            // ChatGPT 通常需要点击按钮，回车可能不起作用
            console.log(`[Multi-GPT] ${PLATFORM_ID} 发送按钮未找到或被禁用`);
        }

        // 开始监听回复
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

// 上传图片到 ChatGPT
// ChatGPT 的上传流程：1. 点击"添加照片"按钮 2. 点击"图片"菜单项 3. 触发 file input
async function uploadImage(imageData) {
    console.log(`[Multi-GPT] ${PLATFORM_ID} 开始上传图片`);

    try {
        // 方案1: 直接尝试找到 file input (可能已经存在)
        let fileInput = await findElement(SELECTORS.fileInput, 1000);
        
        if (!fileInput) {
            // 方案2: ChatGPT 新版界面 - 点击"添加照片"按钮弹出菜单
            console.log(`[Multi-GPT] ${PLATFORM_ID} 尝试点击添加照片按钮...`);
            const attachBtn = await findElement(SELECTORS.attachButton, 3000);
            if (attachBtn) {
                attachBtn.click();
                await sleep(500);
                
                // 查找并点击"图片"菜单项
                const menuItems = document.querySelectorAll('[role="menuitem"], [class*="menu"] [class*="item"]');
                for (const item of menuItems) {
                    const text = item.textContent?.trim() || '';
                    // 点击"图片"菜单项（不是"创建图片"）
                    if ((text === '图片' || text === 'Image' || text === 'Photo') && !text.includes('创建')) {
                        console.log(`[Multi-GPT] ${PLATFORM_ID} 找到"图片"菜单项，点击...`);
                        item.click();
                        await sleep(300);
                        break;
                    }
                }
                
                // 再次尝试找 file input
                fileInput = await findElement(SELECTORS.fileInput, 2000);
            }
        }

        if (!fileInput) {
            console.warn(`[Multi-GPT] ${PLATFORM_ID} 未找到图片上传按钮，可能不支持图片`);
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
        // 图片上传失败不中断流程，继续发送文字
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

// 查找元素
async function findElement(selectors, timeout = 8000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el && isVisible(el)) {
                    return el;
                }
            } catch (e) { }
        }
        await sleep(300);
    }

    return null;
}

// 检查元素是否可见
function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden';
}

// 监听回复
function watchResponse() {
    let lastContent = '';
    let stableCount = 0;

    const checkInterval = setInterval(() => {
        // 检查是否还在生成
        for (const loadingSelector of SELECTORS.loading) {
            try {
                const loadingEl = document.querySelector(loadingSelector);
                if (loadingEl && isVisible(loadingEl)) {
                    stableCount = 0;
                    return;
                }
            } catch (e) { }
        }

        // 获取最新回复
        const responseEls = document.querySelectorAll(SELECTORS.response.join(', '));
        const lastResponse = responseEls[responseEls.length - 1];

        if (lastResponse) {
            const currentContent = lastResponse.textContent;

            if (currentContent === lastContent && currentContent.length > 10) {
                stableCount++;

                if (stableCount >= 4) {
                    clearInterval(checkInterval);
                    console.log(`[Multi-GPT] ${PLATFORM_ID} 回复完成`);
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

    // 最长等待 3 分钟
    setTimeout(() => {
        clearInterval(checkInterval);
        safeSendMessage({
            action: 'queryComplete',
            platformId: PLATFORM_ID,
            success: true
        });
    }, 180000);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
