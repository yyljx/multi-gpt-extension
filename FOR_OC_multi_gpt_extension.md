# Multi-GPT Chrome 扩展 - 项目解析

> 一份写给想要「学会像优秀工程师一样思考」的开发者的项目指南

---

## 一、这个项目解决了什么问题？

### 痛点场景

想象一下：你有一个复杂的技术问题，想同时问问 ChatGPT、DeepSeek、Kimi、通义千问……手动操作是这样的：

1. 打开 ChatGPT 标签页 → 粘贴问题 → 发送
2. 打开 DeepSeek 标签页 → 粘贴问题 → 发送
3. 打开 Kimi 标签页 → 粘贴问题 → 发送
4. ……重复 8 次

每天这样操作十几次，你会发现自己成了「人肉广播站」。

### 解决方案

Multi-GPT 就像一个「问题广播塔」：

```
你输入一个问题
    ↓
[Multi-GPT 扩展]
    ↓
同时发送到 8 个 AI 平台
    ↓
所有平台并行回答
```

**一键操作，8 个 AI 同时工作。** 省下的时间，够你多喝两杯咖啡。

---

## 二、技术架构：像交响乐团一样协作

### 整体架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                         Chrome 浏览器                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│   ┌─────────────┐                                                 │
│   │   Popup     │  ← 用户界面（指挥家）                            │
│   │  popup.js   │     - 输入问题                                   │
│   │  popup.html │     - 选择平台                                   │
│   │  popup.css  │     - 上传图片                                   │
│   └──────┬──────┘                                                 │
│          │ chrome.runtime.sendMessage                              │
│          ↓                                                         │
│   ┌──────────────────┐                                            │
│   │ Service Worker   │  ← 后台调度中心（乐团经理）                  │
│   │ service-worker.js│     - 管理标签页                            │
│   │                  │     - 分发任务                              │
│   │                  │     - 追踪进度                              │
│   └────────┬─────────┘                                            │
│            │ chrome.tabs.sendMessage                               │
│            ↓                                                       │
│   ┌────────────────────────────────────────────────────────┐      │
│   │              Content Scripts（演奏家们）                 │      │
│   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │      │
│   │  │ chatgpt  │ │ deepseek │ │   kimi   │ │  gemini  │  │      │
│   │  │   .js    │ │   .js    │ │   .js    │ │   .js    │  │      │
│   │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │      │
│   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │      │
│   │  │ qianwen  │ │  doubao  │ │ yuanbao  │ │  metaso  │  │      │
│   │  │   .js    │ │   .js    │ │   .js    │ │   .js    │  │      │
│   │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │      │
│   └────────────────────────────────────────────────────────┘      │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 三个核心角色

| 角色 | 文件 | 职责 | 类比 |
|------|------|------|------|
| **Popup** | `popup/*` | 用户界面，接收输入 | 指挥家 |
| **Service Worker** | `background/service-worker.js` | 后台调度，管理标签页 | 乐团经理 |
| **Content Scripts** | `platforms/*.js` | 在各平台页面执行操作 | 演奏家 |

### 消息流程（一次完整的问答）

```
1. 用户点击「发送」
   ↓
2. Popup 发送消息: { action: 'sendToMultiplePlatforms', question: '...', platforms: [...] }
   ↓
3. Service Worker 收到后:
   - 检查是否有已打开的平台标签页（复用）
   - 没有则创建新标签页
   - 将新标签页加入「🤖 Multi-GPT」分组
   ↓
4. 标签页加载完成后，Service Worker 通知对应的 Content Script
   ↓
5. Content Script 在页面上:
   - 找到输入框
   - 填入问题
   - 如果有图片，先上传图片
   - 点击发送（或按 Enter）
   - 监听回复完成
   ↓
6. 回复完成后，Content Script 通知 Service Worker
   ↓
7. Service Worker 更新 Badge 显示进度（如 "3/8"）
```

---

## 三、代码结构：每个文件都有它的使命

```
multi_gpt_extension/
├── manifest.json           # 扩展的「身份证」- 定义权限、入口、资源
│
├── popup/                  # 用户界面层
│   ├── popup.html          # UI 骨架
│   ├── popup.css           # 样式（暗色主题）
│   └── popup.js            # 交互逻辑 + 图片处理
│
├── background/             # 后台服务层
│   └── service-worker.js   # 标签页管理 + 消息调度 + 进度追踪
│
├── platforms/              # 平台适配层（核心复杂度所在）
│   ├── chatgpt.js          # ChatGPT 适配
│   ├── gemini.js           # Google Gemini 适配
│   ├── deepseek.js         # DeepSeek 适配（含联网搜索开关处理）
│   ├── kimi.js             # Kimi 适配
│   ├── qianwen.js          # 通义千问适配
│   ├── doubao.js           # 豆包适配
│   ├── yuanbao.js          # 腾讯元宝适配
│   └── metaso.js           # 秘塔搜索适配（不支持图片）
│
├── icons/                  # 扩展图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
│
└── tests/                  # 测试
    ├── extension.test.js   # 端到端测试（Puppeteer）
    └── ...
```

### 为什么 `platforms/` 是最复杂的？

每个 AI 平台的网页结构都不一样：

- **输入框**：有的是 `<textarea>`，有的是 `<div contenteditable>`
- **发送按钮**：有的点击发送，有的按 Enter 发送
- **图片上传**：有的直接有 `<input type="file">`，有的需要点击按钮弹出
- **特殊逻辑**：DeepSeek 上传图片时必须关闭「联网搜索」

所以每个平台都需要一个专门的「适配脚本」，就像每种乐器都需要专门的演奏技巧。

---

## 四、技术选型与设计决策

### 为什么选择 Manifest V3？

Chrome 扩展有两个版本：V2（老）和 V3（新）。

| 特性 | Manifest V2 | Manifest V3 |
|------|-------------|-------------|
| 后台脚本 | Background Page（常驻） | Service Worker（按需唤醒） |
| 安全性 | 较低 | 更高（限制远程代码） |
| 未来支持 | 2024 年停止支持 | 长期支持 |

**决策**：选择 V3，虽然开发更复杂（Service Worker 有生命周期限制），但面向未来。

### 为什么不用 React/Vue？

Popup 界面很简单，只有：
- 一个输入框
- 8 个复选框
- 一个发送按钮
- 一个状态列表

**决策**：原生 JavaScript + CSS，零依赖，打包体积小，加载快。

### 图片上传的设计考量

图片数据流：

```
用户粘贴/选择图片
    ↓
FileReader 读取为 Base64
    ↓
存储在 currentImageData 对象中
    ↓
随消息发送到 Content Script
    ↓
Content Script 将 Base64 转回 File 对象
    ↓
通过 DataTransfer API 注入到平台的 <input type="file">
```

**为什么用 Base64？** 因为 Chrome 扩展的消息传递只支持「可序列化」的数据，File 对象不能直接传递。

---

## 五、踩过的坑与解决方案

### 坑 1：Content Script 重复注入

**问题**：复用已有标签页时，重新注入 content script 会导致：
```
Uncaught SyntaxError: Identifier 'PLATFORM_ID' has already been declared
```

**原因**：Content Script 用 `const` 声明的变量会保留在页面全局作用域。

**解决**：
```javascript
// service-worker.js
if (existingTab) {
    // 复用现有标签页时，不要重新注入 content script
    // 已存在的标签页应该已经有 content script 了
}
```

### 坑 2：扩展重载后消息发送失败

**问题**：开发时重载扩展后，已打开的标签页会报错：
```
Extension context invalidated
```

**原因**：扩展重载后，之前注入的 content script 与新的 Service Worker 断开连接。

**解决**：包装所有消息发送：
```javascript
function safeSendMessage(message) {
    try {
        if (chrome.runtime?.id) {  // 检查扩展是否仍然有效
            chrome.runtime.sendMessage(message);
        }
    } catch (e) {
        console.log('[Multi-GPT] 扩展上下文已失效，请刷新页面');
    }
}
```

### 坑 3：DeepSeek 上传图片时自动失败

**问题**：DeepSeek 有一个「联网搜索」功能，开启时不支持图片上传。

**原因**：平台设计如此，两个功能互斥。

**解决**：上传图片前自动关闭联网搜索：
```javascript
async function disableWebSearch() {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
        if (btn.textContent.includes('联网搜索')) {
            // 检查是否已启用，如果是则关闭
            btn.click();
            await sleep(500);
            break;
        }
    }
}
```

### 坑 4：标签页分组把已有标签也移动了

**问题**：用户已经打开的平台标签页被移动到分组里，打乱了原有布局。

**原因**：分组逻辑没有区分「新建」和「复用」的标签页。

**解决**：分开追踪：
```javascript
const newTabIds = [];      // 新建的标签页
const reusedTabIds = [];   // 复用的标签页

// 只对新建的标签页进行分组
if (newTabIds.length > 0) {
    await organizeTabsIntoGroup(newTabIds);
}
// 复用的标签页保持原位
```

### 坑 5：Pinned 标签页被复用导致意外行为

**问题**：用户把某个平台标签页 Pin 了，扩展复用它发送问题，用户不希望这样。

**原因**：查找标签页时没有排除 pinned 状态。

**解决**：
```javascript
async function findPlatformTab(platformId, windowId) {
    const tabs = await chrome.tabs.query({ url: pattern, windowId });
    // 过滤掉 pinned 的标签页
    const reusableTabs = tabs.filter(tab => !tab.pinned);
    return reusableTabs[0] || null;
}
```

---

## 六、工程化思维：优秀工程师的思考方式

### 1. 适配器模式的应用

每个平台脚本都遵循相同的「接口」：

```javascript
// 每个 platforms/*.js 都实现这些功能：
- init()           // 初始化
- checkLoginStatus() // 检查登录
- inputAndSend()   // 输入并发送
- uploadImage()    // 上传图片（可选）
- watchResponse()  // 监听回复
```

这意味着：**添加新平台只需要复制一个模板，修改选择器即可**。

### 2. 防御性编程

每个 DOM 操作都假设可能失败：

```javascript
// 不是直接 document.querySelector(selector)
// 而是带重试的查找：
async function findElement(selectors, timeout = 8000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el && isVisible(el)) return el;
            } catch (e) { }  // 选择器语法错误也不会崩溃
        }
        await sleep(300);  // 等一会儿再试
    }
    return null;  // 超时返回 null，不抛异常
}
```

### 3. 优雅降级

图片上传不是所有平台都支持：

```javascript
// popup.js
// 向不支持图片的平台发送时，扩展会自动忽略图片，仅发送文字内容

// 各平台脚本
if (imageData) {
    await uploadImage(imageData);  // 如果失败，只是 console.warn，不阻止文字发送
}
```

### 4. 用户体验优先

- **Badge 显示进度**：`3/8` 让用户知道还有多少平台在处理
- **标签页分组**：新标签页自动分组，不打乱用户已有布局
- **保存上次问题**：下次打开 popup 时恢复
- **登录方式建议**：检测用户常用的登录方式，提示统一使用

### 5. 可测试性设计

使用 Puppeteer 进行端到端测试：

```javascript
// tests/extension.test.js
test('新建标签页正确加入分组', async () => {
    // 加载扩展
    // 发送问题
    // 验证标签页被创建并加入分组
});
```

**测试覆盖的场景**：
- 新建标签页正确加入分组
- 复用标签页保持原位置不变
- 仅在当前窗口查找标签页
- Pinned 标签页不被复用

---

## 七、未来演进方向

### 短期改进

1. **选择器自动修复**：平台 UI 更新后，选择器可能失效。可以加入「智能选择器」，通过多种策略定位元素。

2. **回复聚合显示**：在 popup 中直接显示各平台的回复摘要，不需要切换标签页。

3. **快捷键全局化**：支持全局快捷键唤起扩展，不需要先点击图标。

### 长期愿景

1. **AI 回复对比**：自动分析各平台回复的差异，高亮不同观点。

2. **最佳回复推荐**：基于回复质量、响应速度，推荐最佳答案。

3. **平台插件化**：允许用户自己添加新平台，无需修改核心代码。

---

## 八、给后来者的建议

### 如果你要新增一个平台

1. 复制 `platforms/deepseek.js` 作为模板
2. 修改 `PLATFORM_ID`
3. 用浏览器开发者工具（F12）分析目标平台的 DOM 结构
4. 更新 `SELECTORS` 对象中的选择器
5. 测试：输入、发送、图片上传（如果支持）
6. 在 `manifest.json` 的 `content_scripts` 中添加新平台

### 如果选择器失效了

1. 打开目标平台
2. F12 → Elements
3. 找到输入框/发送按钮，复制新的选择器
4. 更新对应的 `platforms/*.js`

### 调试技巧

```javascript
// 在 content script 中加日志
console.log(`[Multi-GPT] ${PLATFORM_ID} 找到输入框:`, inputEl);

// 查看日志：打开平台页面 → F12 → Console
// 注意：要在平台页面的 Console 看，不是扩展的 Console
```

---

## 九、结语

这个扩展的代码量不大（约 1500 行），但麻雀虽小五脏俱全：

- **分层架构**：Popup → Service Worker → Content Scripts
- **适配器模式**：每个平台一个适配器，职责单一
- **防御性编程**：假设一切都可能失败
- **用户体验**：每个细节都在为用户省时间

希望这份解析不只是帮你「看懂代码」，更能帮你理解**为什么这样设计**，以及**优秀工程师是如何思考问题的**。

---

*最后更新：2026-01-31 | v1.2.0*
