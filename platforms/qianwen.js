/**
 * 通义千问 (qianwen.com / www.qianwen.com) 内容脚本
 * 无需登录
 */

const PLATFORM_ID = 'qianwen';

// 选择器配置 - 基于实际 DOM 结构优化
const SELECTORS = {
    input: [
        'textarea[placeholder*="向千问提问"]',
        'textarea[placeholder*="提问"]',
        'textarea[placeholder*="输入"]',
        'textarea',
        '[contenteditable="true"]'
    ],
    send: [
        'img[src*="send"]',
        'button[type="submit"]',
        'button.ant-btn-primary'
    ],
    response: ['.message-content', '.chat-message', '.response-text', '.markdown-body'],
    loading: ['.loading', '.typing', '.generating', '.ant-spin'],
    // 图片上传相关 - 2026年1月更新
    // 通义千问支持视觉模型 (Qwen-VL)
    uploadButton: [
        'button[class*="upload"]',
        'button[aria-label*="上传"]',
        'button[aria-label*="图片"]',
        '[class*="attach"]',
        'input[type="file"]'
    ],
    fileInput: [
        'input[type="file"][accept*="image"]',
        'input[type="file"]'
    ]
};

// 优先使用 Enter 发送
const USE_ENTER_TO_SEND = true;

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

    // 通知 background 页面已准备好
    safeSendMessage({
        action: 'platformReady',
        platformId: PLATFORM_ID
    });

    // 通义千问目前无需登录即可使用
    safeSendMessage({
        action: 'loginDetected',
        platformId: PLATFORM_ID,
        loggedIn: true,
        loginMethod: null
    });
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
            await sleep(2000); // 等待图片上传完成
        }

        // 查找输入框
        const inputEl = await findElement(SELECTORS.input);
        if (!inputEl) {
            throw new Error('未找到输入框');
        }

        console.log(`[Multi-GPT] ${PLATFORM_ID} 找到输入框:`, inputEl.tagName);

        // 点击并聚焦
        inputEl.click();
        inputEl.focus();
        await sleep(300);

        // 如果有文字，输入文字
        if (question) {
            // 根据元素类型采用不同方式输入
            if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
                // 清空原有内容
                inputEl.value = '';
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
                
                // 触发各种事件以确保框架检测到变化
                inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            } else if (inputEl.isContentEditable || inputEl.getAttribute('contenteditable') === 'true') {
                inputEl.textContent = '';
                inputEl.textContent = question;
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                // 兜底：模拟输入
                inputEl.focus();
                document.execCommand('selectAll', false, null);
                document.execCommand('insertText', false, question);
            }

            console.log(`[Multi-GPT] ${PLATFORM_ID} 问题已输入`);
        }

        // 等待一下让 UI 响应
        await sleep(800);

        // 如果有图片，再等一下确保图片完全加载
        if (imageData) {
            console.log(`[Multi-GPT] ${PLATFORM_ID} 等待图片完全加载...`);
            await sleep(2000);
        }

        // 发送
        if (USE_ENTER_TO_SEND) {
            // 优先使用 Enter 发送
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
            // 查找并点击发送按钮
            const sendBtn = await findElement(SELECTORS.send, 3000);
            if (sendBtn && !sendBtn.disabled) {
                sendBtn.click();
                console.log(`[Multi-GPT] ${PLATFORM_ID} 已点击发送按钮`);
            } else {
                // 兜底：Enter
                inputEl.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    bubbles: true
                }));
            }
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

// 上传图片到通义千问
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
            console.warn(`[Multi-GPT] ${PLATFORM_ID} 未找到图片上传按钮，可能不支持图片`);
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

// 查找元素
async function findElement(selectors, timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el && isVisible(el)) {
                    return el;
                }
            } catch (e) {
                // 选择器可能不合法，跳过
            }
        }
        await sleep(200);
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
        style.visibility !== 'hidden' &&
        style.opacity !== '0';
}

// 监听回复
function watchResponse() {
    let lastContent = '';
    let stableCount = 0;
    let responseCount = 0;

    const checkInterval = setInterval(() => {
        // 检查是否还在加载
        for (const loadingSelector of SELECTORS.loading) {
            try {
                const loadingEl = document.querySelector(loadingSelector);
                if (loadingEl && isVisible(loadingEl)) {
                    stableCount = 0;
                    return;
                }
            } catch (e) { }
        }

        // 获取所有回复内容
        const responseEls = document.querySelectorAll(SELECTORS.response.join(', '));
        const currentResponseCount = responseEls.length;

        // 新回复出现
        if (currentResponseCount > responseCount) {
            responseCount = currentResponseCount;
            stableCount = 0;
            return;
        }

        // 获取最后一个回复的内容
        const lastResponse = responseEls[responseEls.length - 1];
        if (lastResponse) {
            const currentContent = lastResponse.textContent;

            if (currentContent === lastContent && currentContent.length > 10) {
                stableCount++;

                // 内容稳定 2 秒，认为完成
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

    // 最长等待 2 分钟
    setTimeout(() => {
        clearInterval(checkInterval);
        safeSendMessage({
            action: 'queryComplete',
            platformId: PLATFORM_ID,
            success: true
        });
    }, 120000);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
