/**
 * 秘塔搜索 (metaso.cn) 内容脚本
 * 无需登录
 */

const PLATFORM_ID = 'metaso';

// 选择器配置
const SELECTORS = {
    input: ['textarea', 'input[type="text"]', '.search-input'],
    send: ['button.search-btn', 'button[type="submit"]', '.search-button'],
    response: ['.search-result', '.result-content', '.answer-content'],
    loading: ['.loading', '.searching', '.spinner']
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

    // 通知 background 页面已准备好
    safeSendMessage({
        action: 'platformReady',
        platformId: PLATFORM_ID
    });

    // 检测登录状态（秘塔无需登录）
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
    console.log(`[Multi-GPT] ${PLATFORM_ID} 开始输入问题`);

    // 秘塔搜索不支持图片上传
    if (imageData) {
        console.warn(`[Multi-GPT] ${PLATFORM_ID} 不支持图片上传，仅发送文字`);
    }

    try {
        // 查找输入框
        const inputEl = await findElement(SELECTORS.input);
        if (!inputEl) {
            throw new Error('未找到输入框');
        }

        // 聚焦并输入
        inputEl.focus();
        inputEl.value = question;

        // 触发输入事件
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));

        // 等待一下
        await sleep(500);

        // 查找发送按钮
        const sendBtn = await findElement(SELECTORS.send);
        if (sendBtn) {
            sendBtn.click();
            console.log(`[Multi-GPT] ${PLATFORM_ID} 已点击发送按钮`);
        } else {
            // 尝试按 Enter
            inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            console.log(`[Multi-GPT] ${PLATFORM_ID} 已按 Enter 发送`);
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

// 查找元素
async function findElement(selectors, timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && isVisible(el)) {
                return el;
            }
        }
        await sleep(200);
    }

    return null;
}

// 检查元素是否可见
function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        el.offsetParent !== null;
}

// 监听回复
function watchResponse() {
    let lastContent = '';
    let stableCount = 0;

    const checkInterval = setInterval(() => {
        // 检查是否还在加载
        const loadingEl = document.querySelector(SELECTORS.loading.join(', '));
        if (loadingEl && isVisible(loadingEl)) {
            stableCount = 0;
            return;
        }

        // 获取回复内容
        const responseEl = document.querySelector(SELECTORS.response.join(', '));
        if (responseEl) {
            const currentContent = responseEl.textContent;

            if (currentContent === lastContent && currentContent.length > 0) {
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
