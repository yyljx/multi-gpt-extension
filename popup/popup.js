/**
 * Multi-GPT Popup 主逻辑
 */

// 平台配置
const PLATFORMS = {
    metaso: { name: '秘塔搜索', url: 'https://metaso.cn/', requiresLogin: false },
    qianwen: { name: '通义千问', url: 'https://qianwen.com/', requiresLogin: false },
    chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/', requiresLogin: true },
    gemini: { name: 'Gemini', url: 'https://gemini.google.com/app', requiresLogin: true },
    deepseek: { name: 'DeepSeek', url: 'https://chat.deepseek.com/', requiresLogin: true },
    kimi: { name: 'Kimi', url: 'https://www.kimi.com/', requiresLogin: true },
    yuanbao: { name: '腾讯元宝', url: 'https://yuanbao.tencent.com/chat', requiresLogin: true },
    doubao: { name: '豆包', url: 'https://www.doubao.com/chat/', requiresLogin: true }
};

// DOM 元素
let questionInput, sendBtn, selectAllCheckbox, statusSection, statusList, loginTips, loginTipText;
let uploadBtn, fileInput, imagePreview, previewImg, removeImageBtn, imageName, imageSize;

// 图片数据
let currentImageData = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    questionInput = document.getElementById('question');
    sendBtn = document.getElementById('sendBtn');
    selectAllCheckbox = document.getElementById('selectAll');
    statusSection = document.getElementById('statusSection');
    statusList = document.getElementById('statusList');
    loginTips = document.getElementById('loginTips');
    loginTipText = document.getElementById('loginTipText');
    
    // 图片相关元素
    uploadBtn = document.getElementById('uploadBtn');
    fileInput = document.getElementById('fileInput');
    imagePreview = document.getElementById('imagePreview');
    previewImg = document.getElementById('previewImg');
    removeImageBtn = document.getElementById('removeImage');
    imageName = document.getElementById('imageName');
    imageSize = document.getElementById('imageSize');

    // 绑定事件
    sendBtn.addEventListener('click', handleSend);
    selectAllCheckbox.addEventListener('change', handleSelectAll);
    
    // 图片相关事件
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    removeImageBtn.addEventListener('click', clearImage);
    questionInput.addEventListener('paste', handlePaste);

    // 加载上次的问题
    loadLastQuestion();

    // 检查平台登录状态
    checkPlatformStatus();

    // 快捷键：Ctrl+Enter 发送
    questionInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            handleSend();
        }
    });
});

// 加载上次的问题
async function loadLastQuestion() {
    try {
        const result = await chrome.storage.local.get(['lastQuestion']);
        if (result.lastQuestion) {
            questionInput.value = result.lastQuestion;
        }
    } catch (e) {
        console.error('加载上次问题失败:', e);
    }
}

// 保存问题
async function saveQuestion(question) {
    try {
        await chrome.storage.local.set({ lastQuestion: question });
    } catch (e) {
        console.error('保存问题失败:', e);
    }
}

// 全选/取消全选
function handleSelectAll() {
    const checkboxes = document.querySelectorAll('input[name="platform"]');
    checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
}

// 获取选中的平台
function getSelectedPlatforms() {
    const checkboxes = document.querySelectorAll('input[name="platform"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// 检查平台登录状态
async function checkPlatformStatus() {
    // 从存储中获取登录状态
    try {
        const result = await chrome.storage.local.get(['loginStatus']);
        const loginStatus = result.loginStatus || {};

        for (const [platformId, config] of Object.entries(PLATFORMS)) {
            if (!config.requiresLogin) continue;

            const statusEl = document.getElementById(`status-${platformId}`);
            if (!statusEl) continue;

            const status = loginStatus[platformId];
            if (status && status.loggedIn) {
                statusEl.textContent = '已登录';
                statusEl.className = 'platform-status logged-in';
            } else if (status && status.loggedIn === false) {
                statusEl.textContent = '未登录';
                statusEl.className = 'platform-status not-logged';
            } else {
                statusEl.textContent = '未知';
                statusEl.className = 'platform-status';
            }
        }

        // 显示登录建议
        showLoginTips(loginStatus);
    } catch (e) {
        console.error('检查登录状态失败:', e);
    }
}

// 显示登录建议
async function showLoginTips(loginStatus) {
    try {
        const result = await chrome.storage.local.get(['loginMethods']);
        const loginMethods = result.loginMethods || {};

        // 统计登录方式
        const methodCount = {};
        for (const [platform, method] of Object.entries(loginMethods)) {
            if (method && method.method) {
                methodCount[method.method] = (methodCount[method.method] || 0) + 1;
            }
        }

        // 找出最常用的登录方式
        const mostUsed = Object.entries(methodCount).sort((a, b) => b[1] - a[1])[0];

        if (mostUsed && mostUsed[1] >= 2) {
            const methodNames = {
                google: 'Google 账号',
                microsoft: 'Microsoft 账号',
                apple: 'Apple ID',
                phone: '手机号',
                email: '邮箱密码',
                wechat: '微信扫码',
                qq: 'QQ 登录'
            };

            loginTips.style.display = 'block';
            loginTipText.textContent = `您常用 ${methodNames[mostUsed[0]] || mostUsed[0]} 登录，建议其他平台也使用相同方式以节约时间。`;
        }
    } catch (e) {
        console.error('显示登录建议失败:', e);
    }
}

// 发送问题
async function handleSend() {
    const question = questionInput.value.trim();
    
    // 如果没有文字也没有图片，提示用户
    if (!question && !currentImageData) {
        questionInput.focus();
        alert('请输入问题或上传图片');
        return;
    }

    const selectedPlatforms = getSelectedPlatforms();
    if (selectedPlatforms.length === 0) {
        alert('请至少选择一个平台');
        return;
    }

    // 保存问题
    if (question) {
        await saveQuestion(question);
    }

    // 显示状态区域
    statusSection.style.display = 'block';
    statusList.innerHTML = '';

    // 禁用发送按钮
    sendBtn.disabled = true;
    sendBtn.querySelector('.btn-text').style.display = 'none';
    sendBtn.querySelector('.btn-loading').style.display = 'inline';

    // 为每个平台创建状态项
    for (const platformId of selectedPlatforms) {
        const config = PLATFORMS[platformId];
        if (!config) continue;

        const statusItem = document.createElement('div');
        statusItem.className = 'status-item pending';
        statusItem.id = `status-item-${platformId}`;
        statusItem.innerHTML = `
      <span>${config.name}</span>
      <span class="status-icon"></span>
    `;
        statusList.appendChild(statusItem);
    }

    // 发送消息到 background 打开标签页
    try {
        // 获取当前窗口ID，确保在当前窗口查找和创建标签页
        const currentWindow = await chrome.windows.getCurrent();
        const response = await chrome.runtime.sendMessage({
            action: 'sendToMultiplePlatforms',
            question: question,
            platforms: selectedPlatforms,
            windowId: currentWindow.id,
            imageData: currentImageData // 添加图片数据
        });

        console.log('发送结果:', response);
    } catch (e) {
        console.error('发送失败:', e);
    }

    // 恢复按钮
    sendBtn.disabled = false;
    sendBtn.querySelector('.btn-text').style.display = 'inline';
    sendBtn.querySelector('.btn-loading').style.display = 'none';
}

// 监听来自 content script 的状态更新
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateStatus') {
        const { platformId, status, error } = message;
        const statusItem = document.getElementById(`status-item-${platformId}`);
        if (statusItem) {
            statusItem.className = `status-item ${status}`;
            if (error) {
                statusItem.querySelector('.status-icon').title = error;
            }
        }
    }

    if (message.action === 'loginDetected') {
        const { platformId, loggedIn, loginMethod } = message;

        // 更新状态显示
        const statusEl = document.getElementById(`status-${platformId}`);
        if (statusEl) {
            if (loggedIn) {
                statusEl.textContent = '已登录';
                statusEl.className = 'platform-status logged-in';
            } else {
                statusEl.textContent = '未登录';
                statusEl.className = 'platform-status not-logged';
            }
        }

        // 保存登录状态和方式
        saveLoginInfo(platformId, loggedIn, loginMethod);
    }
});

// 保存登录信息
async function saveLoginInfo(platformId, loggedIn, loginMethod) {
    try {
        const result = await chrome.storage.local.get(['loginStatus', 'loginMethods']);
        const loginStatus = result.loginStatus || {};
        const loginMethods = result.loginMethods || {};

        loginStatus[platformId] = { loggedIn, lastChecked: Date.now() };

        if (loginMethod) {
            loginMethods[platformId] = { method: loginMethod, lastSeen: Date.now() };
        }

        await chrome.storage.local.set({ loginStatus, loginMethods });
    } catch (e) {
        console.error('保存登录信息失败:', e);
    }
}

// ============= 图片处理相关函数 =============

// 处理粘贴事件
async function handlePaste(e) {
    const items = e.clipboardData.items;
    
    for (let item of items) {
        if (item.type.indexOf('image') !== -1) {
            e.preventDefault(); // 阻止默认粘贴行为
            
            const file = item.getAsFile();
            await processImageFile(file);
            break;
        }
    }
}

// 处理文件选择
async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        await processImageFile(file);
    }
    // 清空 file input，允许重复选择同一文件
    fileInput.value = '';
}

// 处理图片文件
async function processImageFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const base64 = e.target.result;
            
            // 保存图片数据
            currentImageData = {
                base64: base64,
                name: file.name,
                size: file.size,
                type: file.type
            };
            
            // 显示预览
            previewImg.src = base64;
            imageName.textContent = file.name;
            imageSize.textContent = formatFileSize(file.size);
            imagePreview.style.display = 'block';
            
            resolve();
        };
        
        reader.onerror = (e) => {
            console.error('读取图片失败:', e);
            reject(e);
        };
        
        reader.readAsDataURL(file);
    });
}

// 清除图片
function clearImage() {
    currentImageData = null;
    imagePreview.style.display = 'none';
    previewImg.src = '';
    imageName.textContent = '';
    imageSize.textContent = '';
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

