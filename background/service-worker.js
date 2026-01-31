/**
 * Multi-GPT Background Service Worker
 * 负责管理标签页和协调各平台的内容脚本
 */

// 平台配置
const PLATFORMS = {
    metaso: { name: '秘塔搜索', url: 'https://metaso.cn/' },
    qianwen: { name: '通义千问', url: 'https://qianwen.com/' },
    chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' },
    gemini: { name: 'Gemini', url: 'https://gemini.google.com/app' },
    deepseek: { name: 'DeepSeek', url: 'https://chat.deepseek.com/' },
    kimi: { name: 'Kimi', url: 'https://www.kimi.com/' },
    yuanbao: { name: '腾讯元宝', url: 'https://yuanbao.tencent.com/chat' },
    doubao: { name: '豆包', url: 'https://www.doubao.com/chat/' }
};

// 活跃的查询任务
let activeTasks = {};
let completedCount = 0;
let totalCount = 0;
let currentGroupId = null; // 当前的标签页分组 ID

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'sendToMultiplePlatforms') {
        handleMultiplePlatforms(message.question, message.platforms, message.windowId, message.imageData);
        sendResponse({ success: true });
        return true;
    }

    if (message.action === 'platformReady') {
        // 平台页面加载完成，发送问题
        const { platformId } = message;
        const task = activeTasks[platformId];
        if (task) {
            sendQuestionToTab(task.tabId, platformId, task.question, task.imageData);
        }
        return true;
    }

    if (message.action === 'queryComplete') {
        // 查询完成
        const { platformId, success } = message;
        completedCount++;
        updateBadge();

        // 通知 popup 更新状态
        notifyPopup('updateStatus', {
            platformId,
            status: success ? 'success' : 'error'
        });
        return true;
    }

    if (message.action === 'loginDetected') {
        // 转发登录检测结果到 popup
        notifyPopup('loginDetected', message);
        return true;
    }
});

// 处理多平台发送
async function handleMultiplePlatforms(question, platforms, windowId, imageData) {
    activeTasks = {};
    completedCount = 0;
    totalCount = platforms.length;
    currentGroupId = null;

    updateBadge();

    // 分离新建标签页和复用标签页
    const newTabIds = [];
    const reusedTabIds = [];

    for (const platformId of platforms) {
        const config = PLATFORMS[platformId];
        if (!config) continue;

        try {
            // 查找是否已经有该平台的标签页
            const existingTab = await findPlatformTab(platformId, windowId);

            let tabId;
            let isExisting = false;

            if (existingTab) {
                // 复用现有标签页
                tabId = existingTab.id;
                isExisting = true;
                reusedTabIds.push(tabId);  // 复用的标签页单独跟踪
                console.log(`[Multi-GPT] 复用已打开的 ${config.name} 标签页 (ID: ${tabId})`);

                // 不要重新注入 content script，避免重复声明
                // 已存在的标签页应该已经有 content script 了
            } else {
                // 创建新标签页（在最右侧）
                console.log(`[Multi-GPT] 为 ${config.name} 创建新标签页`);
                const tab = await chrome.tabs.create({
                    url: config.url,
                    active: false,
                    windowId: windowId  // 确保在当前窗口创建
                });
                tabId = tab.id;
                newTabIds.push(tabId);  // 新建的标签页单独跟踪
            }

            // 记录任务
            activeTasks[platformId] = {
                tabId,
                question,
                imageData,  // 添加图片数据
                status: 'pending',
                isExisting
            };

            // 如果是已存在的标签页，延迟后直接发送问题
            if (isExisting) {
                setTimeout(() => {
                    sendQuestionToTab(tabId, platformId, question, imageData);
                }, 500);
            }
            // 新标签页会通过 tabs.onUpdated 监听器触发发送

        } catch (e) {
            console.error(`打开 ${platformId} 失败:`, e);
            notifyPopup('updateStatus', {
                platformId,
                status: 'error',
                error: e.message
            });
        }
    }

    // 只对新建的标签页进行分组
    if (newTabIds.length > 0) {
        await organizeTabsIntoGroup(newTabIds);
    }
}

// 将标签页移动到右侧并创建分组
async function organizeTabsIntoGroup(newTabIds) {
    // 如果没有新标签页，跳过分组
    if (!newTabIds || newTabIds.length === 0) {
        console.log('[Multi-GPT] 无新标签页需要分组');
        return;
    }

    try {
        // 获取当前窗口
        const currentWindow = await chrome.windows.getCurrent();

        // 获取当前窗口的所有标签页数量
        const allTabs = await chrome.tabs.query({ windowId: currentWindow.id });
        const rightmostIndex = allTabs.length;

        // 将所有 AI 标签页移动到最右侧（按顺序排列）
        for (let i = 0; i < newTabIds.length; i++) {
            try {
                await chrome.tabs.move(newTabIds[i], { index: rightmostIndex + i });
            } catch (moveError) {
                console.log(`[Multi-GPT] 移动标签页失败:`, moveError.message);
            }
        }

        // 创建标签页分组
        try {
            const groupId = await chrome.tabs.group({ tabIds: newTabIds });
            currentGroupId = groupId;

            // 设置分组标题和颜色
            await chrome.tabGroups.update(groupId, {
                title: '🤖 Multi-GPT',
                color: 'purple',
                collapsed: false // 展开分组
            });

            console.log(`[Multi-GPT] 已创建标签页分组 (ID: ${groupId})`);
        } catch (groupError) {
            console.log(`[Multi-GPT] 创建分组失败:`, groupError.message);
        }

        // 激活第一个标签页
        if (newTabIds.length > 0) {
            await chrome.tabs.update(newTabIds[0], { active: true });
        }

    } catch (e) {
        console.error(`[Multi-GPT] 整理标签页失败:`, e);
    }
}

// 查找已存在的平台标签页
async function findPlatformTab(platformId, windowId) {
    const config = PLATFORMS[platformId];
    if (!config) return null;

    const url = new URL(config.url);
    const pattern = `*://${url.hostname}/*`;

    try {
        const tabs = await chrome.tabs.query({ url: pattern, windowId });
        // 过滤掉 pinned 的标签页，pinned 标签页不应被复用
        const reusableTabs = tabs.filter(tab => !tab.pinned);
        return reusableTabs[0] || null;
    } catch (e) {
        return null;
    }
}

// 向标签页发送问题
async function sendQuestionToTab(tabId, platformId, question, imageData) {
    try {
        await chrome.tabs.sendMessage(tabId, {
            action: 'inputQuestion',
            question,
            platformId,
            imageData  // 传递图片数据
        });

        notifyPopup('updateStatus', {
            platformId,
            status: 'typing'
        });
    } catch (e) {
        console.error(`发送问题到 ${platformId} 失败:`, e);

        // 可能是 content script 还没加载，重试
        setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {
                action: 'inputQuestion',
                question,
                platformId,
                imageData  // 重试时也传递图片数据
            }).catch(() => {
                notifyPopup('updateStatus', {
                    platformId,
                    status: 'error',
                    error: '页面未响应'
                });
            });
        }, 2000);
    }
}

// 通知 popup
async function notifyPopup(action, data) {
    try {
        await chrome.runtime.sendMessage({ action, ...data });
    } catch (e) {
        // popup 可能已关闭，忽略
    }
}

// 更新 Badge
function updateBadge() {
    if (totalCount === 0) {
        chrome.action.setBadgeText({ text: '' });
        return;
    }

    const text = `${completedCount}/${totalCount}`;
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({
        color: completedCount === totalCount ? '#22c55e' : '#6366f1'
    });
}

// 标签页更新时检查
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        // 查找是否有等待这个标签页的任务
        for (const [platformId, task] of Object.entries(activeTasks)) {
            if (task.tabId === tabId && task.status === 'pending') {
                // 延迟一下让页面完全加载
                setTimeout(() => {
                    sendQuestionToTab(tabId, platformId, task.question, task.imageData);
                    task.status = 'sent';
                }, 2000);
            }
        }
    }
});

// 初始化
console.log('Multi-GPT Background Service Worker 已启动');
