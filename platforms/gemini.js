/**
 * Gemini (gemini.google.com) 内容脚本
 * 需要 Google 账号登录
 */

const PLATFORM_ID = 'gemini';

// 选择器配置 - 2025年1月更新，基于 Playwright 实际验证的 DOM 结构
const SELECTORS = {
    input: [
        'div[aria-label*="输入提示"]',           // 中文界面输入框
        'div[aria-label*="Enter a prompt"]',     // 英文界面输入框
        '.ql-editor', 
        '[contenteditable="true"]', 
        'textarea', 
        '.input-area'
    ],
    send: [
        'button[aria-label*="发送"]', 
        'button[aria-label*="Send"]', 
        '.send-button', 
        'button[data-mat-tooltip*="Send"]'
    ],
    response: ['.response-content', '.model-response', '.markdown-body', 'message-content'],
    loading: ['.loading', '.generating', '.thinking', 'mat-spinner'],
    loginIndicator: ['a[href*="accounts.google.com"]', 'button:has-text("Sign in")', '.sign-in-button'],
    // 图片上传相关 - 2025年1月 Playwright 验证
    // 流程：1. 点击 "打开文件上传菜单" 按钮 2. 点击 "上传文件" 选项 3. file input 弹出
    uploadMenuButton: [
        'button[aria-label="打开文件上传菜单"]',   // 中文界面 - 验证通过
        'button[aria-label="Open file upload menu"]', // 英文界面
        'button[aria-label="关闭文件上传菜单"]',   // 菜单已打开状态
        'button[aria-label="Close file upload menu"]'
    ],
    uploadFileButton: [
        '[data-test-id="local-images-files-uploader-button"]',  // 验证通过
        'button[aria-label*="上传文件"]',
        'button[aria-label*="Upload file"]'
    ],
    uploadButton: [
        'button[aria-label="打开文件上传菜单"]',   // 中文界面
        'button[aria-label*="文件上传"]',          // 中文界面模糊匹配
        'button[aria-label="Open file upload menu"]', // 英文界面
        'button[aria-label*="upload"]',            // 英文界面模糊匹配
        '.upload-card-button',                      // 类名选择器
        'button[aria-label*="Add"]',               // 旧版"添加"按钮
        'input[type="file"]'                        // 直接找 file input
    ],
    fileInput: [
        'input[type="file"][accept*="image"]',
        'input[type="file"]'
    ]
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

    setTimeout(() => {
        checkLoginStatus();

        safeSendMessage({
            action: 'platformReady',
            platformId: PLATFORM_ID
        });
    }, 2000);
}

// 检测登录状态
function checkLoginStatus() {
    const url = window.location.href.toLowerCase();

    // 检查是否在登录页面
    if (url.includes('accounts.google.com') || url.includes('signin')) {
        safeSendMessage({
            action: 'loginDetected',
            platformId: PLATFORM_ID,
            loggedIn: false,
            loginMethod: 'google'
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
                    loginMethod: 'google'
                });
                return;
            }
        } catch (e) { }
    }

    // 检查是否有输入框
    for (const selector of SELECTORS.input) {
        try {
            const el = document.querySelector(selector);
            if (el) {
                safeSendMessage({
                    action: 'loginDetected',
                    platformId: PLATFORM_ID,
                    loggedIn: true,
                    loginMethod: 'google'
                });
                return;
            }
        } catch (e) { }
    }
}

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'inputQuestion' && message.platformId === PLATFORM_ID) {
        inputAndSend(message.question, message.imageData);
        sendResponse({ success: true });
    }
    return true;
});

// 输入并发送
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
            const inputEl = await findElement(SELECTORS.input);
            if (!inputEl) {
                throw new Error('未找到输入框');
            }

            // Gemini 使用 contenteditable，需要特殊处理
            inputEl.focus();
            inputEl.click();
            await sleep(300);

            // 清空并输入
            if (inputEl.classList.contains('ql-editor') || inputEl.isContentEditable) {
                inputEl.innerHTML = '';
                inputEl.textContent = question;

                // 触发输入事件
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                inputEl.value = question;
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            }

            await sleep(1000); // 增加等待时间
        }

        // 如果有图片，再等一下确保图片完全加载
        if (imageData) {
            console.log(`[Multi-GPT] ${PLATFORM_ID} 等待图片完全加载到界面...`);
            await sleep(2000);
        }

        // 发送
        const sendBtn = await findElement(SELECTORS.send);
        if (sendBtn) {
            sendBtn.click();
            console.log(`[Multi-GPT] ${PLATFORM_ID} 已点击发送按钮`);
        } else {
            // 尝试 Enter
            const inputEl = await findElement(SELECTORS.input);
            if (inputEl) {
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

// 上传图片到 Gemini
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
            console.warn(`[Multi-GPT] ${PLATFORM_ID} 未找到图片上传按钮，可能需要登录`);
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
