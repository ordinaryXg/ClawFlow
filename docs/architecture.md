# ClawFlow 代码架构文档

## 1. 项目概述

**ClawFlow** 是一个基于 Electron + React 的桌面AI助手应用，集成了工作区管理、Hermes技能系统、智能记忆、多模型支持等核心能力。

### 技术栈
- **框架**: Electron 41 + React 19 + TypeScript 5
- **构建**: Electron Forge + Webpack 5
- **状态管理**: Zustand
- **数据库**: better-sqlite3 + sqlite-vec (向量搜索)
- **UI组件**: Ant Design 5
- **AI Provider**: DeepSeek, OpenAI, Anthropic
- **通信**: WebSocket (Gateway) + IPC

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron 应用层                        │
├─────────────────────────────────────────────────────────────┤
│  主进程 (Main Process)              │  渲染进程 (Renderer)  │
│  src/index.ts                      │  src/renderer.tsx     │
│  - 窗口管理                         │  - React SPA          │
│  - IPC注册                         │  - 路由管理            │
│  - 应用生命周期                     │  - 状态管理            │
├─────────────────────────────────────────────────────────────┤
│                  Preload 安全桥                   │
│                  src/preload.ts                              │
└─────────────────────────────────────────────────────────────┘
            ↓ IPC (contextBridge)
┌─────────────────────────────────────────────────────────────┐
│                      核心引擎层                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ ClawFlow     │  │ Gateway      │  │ Provider     │ │
│  │ Engine       │  │ Daemon       │  │ Router       │ │
│  │ (对话引擎)    │  │ (WS通信)     │  │ (模型路由)    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Tool         │  │ Hermes       │  │ Session      │ │
│  │ Runtime      │  │ Memory       │  │ Store        │ │
│  │ (工具运行时)  │  │ (记忆系统)    │  │ (会话存储)    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────────┐
│                      功能模块层                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Workspace     │  │ Skill        │  │ Scheduling   │ │
│  │ Service       │  │ Agent        │  │ System       │ │
│  │ (工作区)      │  │ (技能系统)    │  │ (定时调度)    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Messaging     │  │ Scrape       │  │ Shell        │ │
│  │ (飞书集成)    │  │ (网页抓取)    │  │ (托盘/便签)  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 目录结构详解

### 3.1 根目录
```
ClawFlow/
├── src/                    # 源代码
├── resources/              # 应用资源
├── scripts/                # 构建脚本
├── test/                   # 测试文件
├── node_modules/           # 依赖
├── package.json            # 项目配置
├── forge.config.ts         # Electron Forge配置
├── tsconfig.json           # TypeScript配置
├── webpack.*.config.ts    # Webpack配置
└── README.md              # 项目文档
```

### 3.2 核心源码 (src/)
```
src/
├── index.ts                    # 主进程入口
├── renderer.tsx               # 渲染进程入口
├── App.tsx                    # React根组件
├── preload.ts                 # Preload脚本
├── index.html                 # HTML模板
│
├── main/                      # 主进程业务模块
│   ├── application-menu.ts    # 应用菜单
│   ├── electron-workspace-context.ts
│   ├── sticky-satellite-windows.ts
│   ├── workspace/             # 工作区管理
│   │   ├── workspace-service.ts
│   │   ├── active-workspace-sync.ts
│   │   ├── workspace-ipc.ts
│   │   └── ...
│   ├── ipc/                   # IPC通信
│   │   ├── workspace-ipc.ts
│   │   ├── register-*-ipc.ts
│   │   └── ...
│   ├── system-agents/         # 系统子Agent
│   ├── scheduling/            # 定时调度
│   ├── skill/                 # Skill Agent
│   ├── shell/                 # 托盘、主窗偏好
│   └── prefs/                 # 偏好设置持久化
│
├── engine/                     # ClawFlow引擎核心
│   ├── clawflow-engine.ts     # 主引擎
│   ├── gateway-daemon.ts      # Gateway守护进程
│   ├── provider-router.ts     # Provider路由
│   ├── tool-runtime-core.ts   # 工具运行时核心
│   ├── session-store.ts       # 会话存储
│   ├── auth-store.ts          # 认证存储
│   ├── hermes-memory-*.ts    # Hermes记忆系统
│   ├── providers/             # AI Provider实现
│   │   ├── deepseek.ts
│   │   ├── openai.ts
│   │   └── anthropic.ts
│   └── ...
│
├── messaging/                  # 消息集成
│   ├── lark-bridge-service.ts # 飞书长连接
│   ├── register-messaging-ipc.ts
│   └── ...
│
├── components/                 # React组件
│   ├── Layout.tsx            # 布局组件
│   ├── chat/                 # 聊天相关组件
│   │   ├── ChatInput.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageItem.tsx
│   │   └── ...
│   ├── workspace/            # 工作区组件
│   ├── sticky/               # 便签组件
│   └── ...
│
├── pages/                      # 页面组件
│   ├── ChatPage.tsx
│   ├── SkillsPage.tsx
│   └── SettingsPage.tsx
│
├── store/                      # Zustand状态管理
│   ├── index.ts
│   └── modules/
│       ├── chatStore.ts
│       ├── gatewayStore.ts
│       ├── settingsStore.ts
│       └── ...
│
├── shared/                     # 共享类型和工具
├── utils/                      # 工具函数
├── locales/                    # 国际化
└── workspace-templates/        # 工作区模板
```

---

## 4. 核心模块详解

### 4.1 主进程 (src/index.ts)

**职责：**
- 应用生命周期管理
- 窗口创建和管理
- IPC处理器注册
- 工作区切换协调
- 系统托盘管理

**关键流程：**
```typescript
// 1. 尽早注册Messaging IPC (避免渲染层报错)
registerMessagingIPC();

// 2. 注册基础IPC
registerShellViewWindowIPC();
registerWorkspaceEarlyIPC();
registerAppPathAndIconIPC();

// 3. app.whenReady() 内初始化
app.whenReady().then(() => {
  loadMainUiPrefsOnStartup();
  applyActiveWorkspace(target);
  registerClawFlowIPC();
  registerGatewayIPC();
  registerAppSettingsIPC();
  createWindow();
  restartLarkBridgeFromPrefs(); // 飞书长连接
});
```

### 4.2 ClawFlow引擎 (src/engine/clawflow-engine.ts)

**核心接口：**
```typescript
export interface ClawFlowEngine {
  getConfig(): Readonly<ClawFlowEnginePublicConfig>;
  setWorkspaceRoot(workspaceRoot: string): void;
  
  // 会话管理
  listConversations(workspaceRoot?: string): Promise<StoredConversation[]>;
  upsertConversation(...): Promise<void>;
  deleteConversation(...): Promise<void>;
  
  // 消息发送 (核心)
  sendMessage(params: {
    conversationId: string;
    userText: string;
    mode?: InteractionMode; // 'ask' | 'plan' | 'multitask'
    modelId?: string;
    onDelta?: (delta: string) => void;
    abortSignal?: AbortSignal;
  }): Promise<ChatCompletionResult>;
}
```

**交互模式：**
- `ask`: 直接回答
- `plan`: 先规划后执行
- `multitask`: 多任务并行

**模型支持：**
```typescript
const BUILTIN_CHAT_MODEL_CATALOG = {
  deepseek: [
    'deepseek/deepseek-v4-pro',
    'deepseek/deepseek-v4-flash',
    'deepseek/deepseek-reasoner',
    'deepseek/deepseek-chat',
  ],
  openai: ['openai/gpt-4o-mini', 'openai/gpt-4o'],
  anthropic: ['anthropic/claude-3-5-sonnet-20241022'],
};
```

### 4.3 Hermes记忆系统

**组件：**
- `hermes-memory-db.ts`: 数据库操作
- `hermes-memory-embeddings.ts`: 向量嵌入
- `hermes-memory-index-hooks.ts`: 索引钩子
- `hermes-memory-service.ts`: 记忆服务
- `hermes-memory-store.ts`: 记忆存储

**功能：**
- 基于SQLite的向量存储
- 支持语义搜索
- 自动索引工作区文件
- 记忆持久化

### 4.4 工作区系统 (src/main/workspace/)

**核心功能：**
- 多工作区管理
- 工作区注册表 (`.clawflow-workspace-registry.json`)
- 活动工作区切换
- 工作区文件监听
- Git集成 (clone/pull/push)

**关键API：**
```typescript
// IPC: 工作区列表
ipcMain.handle('workspace:list', ...);

// IPC: 切换工作区
ipcMain.handle('workspace:setActive', ...);

// IPC: 工作区文件树
ipcMain.handle('workspace:listDir', ...);
```

### 4.5 Skill系统 (src/main/skill/)

**特性：**
- 技能发现和加载
- 技能进化 (Evolution)
- 技能审计
- 用户手动轮次计数 (`totalUserManualRounds`)

**进化触发：**
```typescript
// 主对话轮次后可能触发技能进化
maybeScheduleSkillEvolutionAfterMainTurn(workspaceRoot, conversationId);
```

### 4.6 工具运行时 (src/engine/tool-runtime-core.ts)

**ToolRuntime类：**
- 动态工具注册
- 工具执行沙箱
- 工具结果截断
- 工具消息去重

**默认工具：**
```typescript
// tool-runtime-default-tools.ts
export function createDefaultToolRuntime(): ToolRuntime {
  const rt = new ToolRuntime();
  // 注册内置工具
  rt.registerTool('read_file', ...);
  rt.registerTool('write_file', ...);
  rt.registerTool('execute_command', ...);
  // ...
  return rt;
}
```

### 4.7 Gateway系统 (src/engine/gateway-daemon.ts)

**职责：**
- WebSocket守护进程
- 渲染层 ↔ 引擎 通信桥接
- 流式响应传输 (`chat:send` / 流式delta)

**通信协议：**
```typescript
// 渲染层 → Gateway → 引擎
{ type: 'chat:send', conversationId, message }

// 引擎 → Gateway → 渲染层 (流式)
{ type: 'chat:delta', conversationId, delta }
{ type: 'chat:reasoning_start' }
{ type: 'chat:reasoning_end' }
```

### 4.8 调度系统 (src/main/scheduling/)

**功能：**
- 定时任务触发
- Cron表达式解析
- 调度器持久化

**使用场景：**
- 定期网页抓取
- 定时提醒
- 自动化工作流

---

## 5. 数据流

### 5.1 聊天消息流

```
用户输入
  ↓
ChatInput.tsx (UI)
  ↓
chatStore.sendMessage()
  ↓
[判断] Gateway WebSocket可用？
  ├─ 是 → gatewayStore.sendGatewayChatMessage()
  │         ↓
  │       Gateway WebSocket (chat:send)
  │         ↓
  │       gateway-daemon.ts (主进程)
  │         ↓
  │       clawflow-engine.ts (引擎)
  │         ↓
  │       流式delta → Gateway → 渲染层
  │
  └─ 否 → engine:sendMessage (IPC)
            ↓
          clawflow-engine.ts (引擎)
            ↓
          非流式 + 前端reveal动画
```

### 5.2 工作区切换流

```
用户点击侧栏工作区
  ↓
WorkspaceSidebar.tsx
  ↓
workspaceStore.setActiveWorkspace(path)
  ↓
IPC: workspace:setActive
  ↓
src/main/ipc/workspace-ipc.ts
  ↓
applyActiveWorkspace(target) (active-workspace-sync.ts)
  ↓
1. setActiveWorkspaceRoot(target)
2. syncActiveWorkspaceRootToEngine()
3. 广播 workspace:changed 给所有窗口
  ↓
引擎重新初始化 (基于新工作区)
```

---

## 6. 状态管理 (Zustand)

### 6.1 chatStore
```typescript
interface ChatStore {
  // 会话
  conversations: StoredConversation[];
  activeConversationId: string | null;
  
  // 消息
  messagesByConversation: Record<string, StoredMessage[]>;
  
  // UI状态
  isStreaming: boolean;
  streamingMessageId: string | null;
  
  // 操作方法
  sendMessage: (params: SendMessageParams) => Promise<void>;
  loadConversations: () => Promise<void>;
  // ...
}
```

### 6.2 gatewayStore
```typescript
interface GatewayStore {
  ws: WebSocket | null;
  isConnected: boolean;
  
  connect: () => void;
  disconnect: () => void;
  sendMessage: (msg: GatewayMessage) => void;
}
```

### 6.3 settingsStore
```typescript
interface SettingsStore {
  theme: 'light' | 'dark';
  language: string;
  modelProvider: string;
  modelId: string;
  // ...
}
```

---

## 7. IPC通信约定

**命名规范：** `领域:动作`

**示例：**
- `workspace:listDir` - 列出工作区目录
- `workspace:setActive` - 设置活动工作区
- `chat:sendMessage` - 发送聊天消息
- `scheduleTriggers:list` - 列出定时触发器
- `skill:list` - 列出技能
- `hermes:searchMemory` - 搜索Hermes记忆

**安全策略：**
- 工作区相对路径API先 `resolveWorkspaceRootForWebContents(event.sender)`
- 再操作磁盘
- 防止路径遍历攻击

---

## 8. 构建和开发

### 8.1 开发模式
```bash
npm start  # electron-forge start (热重载)
```

### 8.2 生产构建
```bash
npm run make  # electron-forge make (打包)
npm run publish  # electron-forge publish (发布)
```

### 8.3 测试
```bash
npm test  # jest (依赖better-sqlite3的用例可能skip)
```

### 8.4 原生模块重建
```bash
npm run rebuild:native  # electron-rebuild (对齐Node ABI)
```

---

## 9. 关键设计决策

### 9.1 为什么使用Electron？
- 跨平台桌面应用
- 访问本地文件系统
- 系统托盘、原生菜单
- Node.js生态集成

### 9.2 为什么使用BetterSQLite3？
- 同步API (更简单)
- 性能优秀
- 支持向量扩展 (sqlite-vec)
- 适合嵌入式场景

### 9.3 为什么使用Gateway架构？
- 渲染层与引擎解耦
- 支持流式传输
- 便于调试和测试
- 未来可扩展为远程引擎

### 9.4 工作区为什么放在应用缓存？
- `.clawflow-launcher-stash/` 在应用缓存 `workspaces/<sha256>/`
- 不自动创建或绑定工作区
- 用户从侧栏添加文件夹后才 `setActive`
- 避免污染用户项目

---

## 10. 扩展点

### 10.1 添加新AI Provider
1. 实现 `ModelProvider` 接口 (`src/engine/providers/provider.ts`)
2. 在 `provider-router.ts` 注册
3. 在 `BUILTIN_CHAT_MODEL_CATALOG` 添加模型ID

### 10.2 添加新工具
1. 在 `tool-runtime-default-tools.ts` 注册
2. 实现工具函数
3. 在引擎中调用 `toolRuntime.executeTool()`

### 10.3 添加新消息平台
1. 在 `src/messaging/` 创建新模块
2. 实现消息接收和发送
3. 注册IPC处理器
4. 在设置页添加配置UI

---

## 11. 性能优化

### 11.1 聊天性能
- 流式传输 (避免一次性渲染大消息)
- 虚拟滚动 (长消息列表)
- 消息分块 (历史消息分页加载)

### 11.2 工作区性能
- 文件树懒加载
- 文件监听防抖
- Hermes索引增量更新

### 11.3 记忆系统性能
- 向量索引优化
- 查询结果缓存
- 异步索引 (不阻塞UI)

---

## 12. 安全考虑

### 12.1 主进程安全
- IPC输入验证
- 工作区路径沙箱
- 工具执行权限控制

### 12.2 渲染进程安全
- ContextBridge仅暴露必要API
- CSP (Content Security Policy)
- XSS防御 (markdown渲染)

### 12.3 数据安全
- API Key加密存储
- 工作区隔离
- 敏感数据不写日志

---

## 13. 测试策略

### 13.1 单元测试
- Jest + Testing Library
- 覆盖核心逻辑
- Mock IPC和文件系统

### 13.2 集成测试
- 主进程 ↔ 渲染进程通信
- 工作区切换流程
- 消息发送完整链路

### 13.3 E2E测试 (待实现)
- Spectron或Playwright
- 关键用户流程
- 跨平台兼容性

---

## 14. 部署和发布

### 14.1 自动更新
- Electron Squirrel (Windows)
- Sparkle (macOS)
- 手动检查更新 (设置页)

### 14.2 版本管理
- SemVer (语义化版本)
- CHANGELOG.md
- Git标签

### 14.3 CI/CD (待实现)
- GitHub Actions
- 自动构建和测试
- 自动发布到GitHub Releases

---

## 15. 未来规划

### 15.1 短期 (1-3个月)
- [ ] 完善测试覆盖率
- [ ] 优化大型工作区性能
- [ ] 添加更多AI Provider
- [ ] 改进错误处理和用户提示

### 15.2 中期 (3-6个月)
- [ ] 插件系统
- [ ] 远程引擎支持
- [ ] 多人协作
- [ ] 移动端配套应用

### 15.3 长期 (6-12个月)
- [ ] AI Agent市场
- [ ] 企业版功能
- [ ] 云端同步
- [ ] 开源核心引擎

---

**文档版本**: 1.0.0  
**最后更新**: 2026-06-02  
**维护者**: Rufus (455261624@qq.com)
