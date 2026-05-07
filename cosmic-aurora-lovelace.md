# ClawFlow 开发步骤说明书

> 目标：基于 E:\ClawFlow 工程，开发类似腾讯 WorkBuddy 的 Electron + TypeScript + OpenClaw 应用软件
>
> **设计原则：**
> - 功能模块类似 WorkBuddy，但 UI 自主设计（不要求完全复刻）
> - 支持中英文切换（国际化）
> - 按优先级（P0→P1→P2）顺序开发

---

## 一、项目配置与依赖完善

### 任务 1.1：完善 package.json 依赖

**任务描述：**
补充缺失的关键依赖包，包括 UI 组件库、状态管理、样式方案、测试工具、国际化等。

**涉及文件：**
- `E:/ClawFlow/package.json`

**需要添加的依赖：**

```json
{
  "dependencies": {
    "zustand": "^5.0.13",
    "antd": "^5.22.0",
    "@ant-design/icons": "^5.5.0",
    "styled-components": "^6.1.13",
    "markdown-to-jsx": "^7.4.0",
    "highlight.js": "^11.10.0",
    "uuid": "^11.0.5",
    "i18next": "^23.16.0",
    "react-i18next": "^15.1.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.3",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "electron-mock-ipc": "^2.1.0",
    "@types/uuid": "^10.0.0",
    "@types/markdown-to-jsx": "^6.0.3",
    "@types/i18next": "^13.0.0"
  }
}
```

**前置任务：** 无

**验收标准：**
- [ ] 所有依赖成功安装（`npm install` 无错误）
- [ ] 依赖版本兼容（无 peer dependency 冲突）

**预计复杂度：** 简单

---

### 任务 1.2：完善 TypeScript 配置

**任务描述：**
优化 `tsconfig.json`，确保正确的模块解析和类型检查。

**涉及文件：**
- `E:/ClawFlow/tsconfig.json`

**修改内容：**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "allowJs": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "noImplicitAny": false,
    "sourceMap": true,
    "outDir": ".webpack",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "ignoreDeprecations": "6.0"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", ".webpack"]
}
```

**前置任务：** 无

**验收标准：**
- [ ] TypeScript 编译无错误
- [ ] 路径别名 `@/*` 可用

**预计复杂度：** 简单

---

### 任务 1.3：创建目录结构

**任务描述：**
创建完整的项目目录结构，为后续开发做好准备。

**需要创建的目录：**
```
E:/ClawFlow/src/
├── assets/              # 静态资源（图标、图片）
├── components/         # 通用组件
│   ├── common/         # 基础组件（Button、Input、Modal等）
│   ├── chat/          # 聊天相关组件
│   ├── skill/         # 技能相关组件
│   └── connector/     # 连接器相关组件
├── pages/             # 页面组件
│   ├── ChatPage/      # 对话页面
│   ├── SkillsPage/    # 技能管理页面
│   ├── ConnectorsPage/# 连接器配置页面
│   ├── SettingsPage/  # 设置页面
│   └── DashboardPage/ # 仪表盘页面（重构）
├── store/             # zustand 状态管理
│   ├── modules/       # 按模块拆分
│   └── index.ts      # 统一导出
├── engine/            # OpenClaw 引擎（已存在）
├── services/          # 业务服务层
├── hooks/             # 自定义 React Hooks
├── utils/             # 工具函数
├── types/             # TypeScript 类型定义
├── styles/            # 全局样式
└── locales/          # 国际化资源文件
    ├── zh.json        # 中文翻译
    └── en.json        # 英文翻译
```

**前置任务：** 无

**验收标准：**
- [ ] 所有目录创建成功
- [ ] `.gitkeep` 文件添加到空目录

**预计复杂度：** 简单

---

## 二、核心功能模块开发（按优先级排序）

### 任务 2.1：状态管理重构（zustand 集成）

**任务描述：**
使用 zustand 重构状态管理，替换散落的 `useState`，建立集中式的状态管理方案。

**涉及文件：**
- `E:/ClawFlow/src/store/index.ts`
- `E:/ClawFlow/src/store/modules/gatewayStore.ts`
- `E:/ClawFlow/src/store/modules/chatStore.ts`
- `E:/ClawFlow/src/store/modules/skillStore.ts`
- `E:/ClawFlow/src/store/modules/connectorStore.ts`
- `E:/ClawFlow/src/store/modules/settingsStore.ts`

**开发步骤：**

1. **创建 gatewayStore.ts**（Gateway 状态管理）
```typescript
// 管理 Gateway 的启动/停止状态、版本信息、配置
interface GatewayState {
  status: 'running' | 'stopped' | 'unknown';
  version: string;
  isStarting: boolean;
  isStopping: boolean;
  error: string | null;
  config: OpenClawEngineConfig;
  
  // Actions
  fetchStatus: () => Promise<void>;
  startGateway: () => Promise<void>;
  stopGateway: () => Promise<void>;
  fetchVersion: () => Promise<void>;
  updateConfig: (config: Partial<OpenClawEngineConfig>) => Promise<void>;
}
```

2. **创建 chatStore.ts**（对话状态管理）
```typescript
// 管理对话消息、流式响应、历史记录
interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoading: boolean;
  streamingMessage: string | null;
  
  // Actions
  sendMessage: (content: string) => Promise<void>;
  createConversation: () => void;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearMessages: () => void;
}
```

3. **创建 skillStore.ts**（技能状态管理）
```typescript
// 管理技能列表、安装状态、启用/禁用
interface SkillState {
  skills: Skill[];
  installedSkills: string[];
  enabledSkills: string[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchSkills: () => Promise<void>;
  installSkill: (skillName: string) => Promise<void>;
  uninstallSkill: (skillName: string) => Promise<void>;
  enableSkill: (skillName: string) => Promise<void>;
  disableSkill: (skillName: string) => Promise<void>;
}
```

4. **创建 connectorStore.ts**（连接器状态管理）
```typescript
// 管理连接器配置、启用状态
interface ConnectorState {
  connectors: Connector[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchConnectors: () => Promise<void>;
  addConnector: (config: ConnectorConfig) => Promise<void>;
  updateConnector: (id: string, config: Partial<ConnectorConfig>) => Promise<void>;
  deleteConnector: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<boolean>;
}
```

5. **创建 settingsStore.ts**（设置状态管理）
```typescript
// 管理应用设置、主题、语言等
interface SettingsState {
  theme: 'light' | 'dark';
  language: 'zh' | 'en';
  autoStartGateway: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  // Actions
  updateSettings: (settings: Partial<SettingsState>) => void;
  resetSettings: () => void;
}
```

**前置任务：** 任务 1.1、任务 1.3

**验收标准：**
- [ ] 所有 store 模块创建完成
- [ ] store 与 React 组件集成
- [ ] 状态更新触发 UI 重新渲染
- [ ] TypeScript 类型检查通过

**预计复杂度：** 中等

---

### 任务 2.2：扩展 IPC 通信接口

**任务描述：**
扩展 Main 进程和 Preload 之间的 IPC 接口，支持对话、技能管理、连接器配置等功能。

**涉及文件：**
- `E:/ClawFlow/src/engine/openclaw-engine.ts`（扩展）
- `E:/ClawFlow/src/preload.ts`（扩展）
- `E:/ClawFlow/src/global.d.ts`（扩展）

**需要新增的 IPC 接口：**

1. **对话相关：**
   - `openclaw:sendMessage` - 发送消息到 OpenClaw
   - `openclaw:getConversations` - 获取对话历史
   - `openclaw:deleteConversation` - 删除对话

2. **技能管理：**
   - `openclaw:getSkills` - 获取技能列表
   - `openclaw:installSkill` - 安装技能
   - `openclaw:uninstallSkill` - 卸载技能
   - `openclaw:enableSkill` - 启用技能
   - `openclaw:disableSkill` - 禁用技能

3. **连接器管理：**
   - `openclaw:getConnectors` - 获取连接器列表
   - `openclaw:addConnector` - 添加连接器
   - `openclaw:updateConnector` - 更新连接器
   - `openclaw:deleteConnector` - 删除连接器
   - `openclaw:testConnector` - 测试连接器连接

**前置任务：** 任务 2.1

**验收标准：**
- [ ] 所有 IPC 接口在 Main 进程注册
- [ ] Preload 桥接层正确暴露 API
- [ ] TypeScript 类型声明完整
- [ ] 渲染进程可以正确调用所有接口

**预计复杂度：** 中等

---

### 任务 2.3：对话界面开发（核心功能）

**任务描述：**
开发对话界面，支持消息列表、输入框、流式响应显示。UI 自主设计，不要求复刻 WorkBuddy。

**涉及文件：**
- `E:/ClawFlow/src/pages/ChatPage/index.tsx`
- `E:/ClawFlow/src/pages/ChatPage/styles.css`
- `E:/ClawFlow/src/components/chat/MessageList.tsx`
- `E:/ClawFlow/src/components/chat/MessageItem.tsx`
- `E:/ClawFlow/src/components/chat/ChatInput.tsx`
- `E:/ClawFlow/src/components/chat/StreamingMessage.tsx`

**开发步骤：**

1. **创建 ChatPage 页面组件**
   - 左侧：对话列表（历史记录）
   - 右侧：当前对话的消息列表 + 输入框

2. **创建 MessageList 组件**
   - 渲染消息列表（支持虚拟滚动以优化性能）
   - 自动滚动到最新消息
   - 支持消息选择、删除等操作

3. **创建 MessageItem 组件**
   - 显示单条消息（用户消息 / OpenClaw 响应）
   - 支持 Markdown 渲染
   - 支持代码高亮
   - 支持复制、删除等操作

4. **创建 ChatInput 组件**
   - 多行文本输入框
   - 支持 Enter 发送、Shift+Enter 换行
   - 支持文件上传（可选）
   - 禁用状态处理（正在响应时）

5. **创建 StreamingMessage 组件**
   - 流式显示 OpenClaw 的响应
   - 打字机效果
   - 中断流式响应（可选）

6. **集成 chatStore**
   - 发送消息时更新 store
   - 接收流式响应时更新 store
   - 错误处理

**UI 设计要点：**
- 使用 Ant Design 组件库
- **UI 自主设计**（不要求完全复刻 WorkBuddy）
- 支持亮色/暗色主题
- 响应式布局

**前置任务：** 任务 2.1、任务 2.2

**验收标准：**
- [ ] 用户可以输入消息并发送
- [ ] OpenClaw 的响应以流式方式显示
- [ ] 消息历史记录正确保存和显示
- [ ] 支持创建新对话、切换对话、删除对话
- [ ] Markdown 和代码正确渲染
- [ ] 错误处理完善（网络错误、OpenClaw 错误等）

**预计复杂度：** 复杂

#### 完成记录（留存记忆）

- **完成时间**：2026-05-07
- **完成内容概览**：
  - 新增 `/chat` 路由与侧边栏入口
  - 实现对话界面：会话列表（新建/切换/删除）+ 消息区 + 输入区
  - Markdown 渲染 + 代码高亮 + 一键复制
  - 基于 store 的“流式打字机”显示（先 streaming，再落盘为 assistant 消息）
  - 对话历史通过 zustand `persist` 持久化（本地存储）
  - 修正全局样式为桌面应用全屏布局（去掉 `max-width: 38rem`）
- **涉及/新增文件**：
  - `src/pages/ChatPage/index.tsx`
  - `src/pages/ChatPage/styles.css`
  - `src/components/chat/MessageList.tsx`
  - `src/components/chat/MessageItem.tsx`
  - `src/components/chat/ChatInput.tsx`
  - `src/components/chat/StreamingMessage.tsx`
  - `src/components/chat/chat.css`
  - `src/store/modules/chatStore.ts`（增强：streaming + persist）
  - `src/App.tsx`、`src/components/Layout.tsx`、`src/index.css`
- **验收结果（本阶段）**：
  - [x] 输入并发送消息
  - [x] 响应以流式方式显示（当前基于 IPC 返回的模拟 message + 打字机）
  - [x] 历史记录保存与显示（本地 persist）
  - [x] 新建/切换/删除对话
  - [x] Markdown 与代码高亮渲染
  - [x] 基础错误提示（store error + UI 展示/清除）

---

### 任务 2.4：技能管理界面开发

**任务描述：**
开发技能管理界面，支持技能浏览、安装、启用、禁用等功能。

**涉及文件：**
- `E:/ClawFlow/src/pages/SkillsPage/index.tsx`
- `E:/ClawFlow/src/pages/SkillsPage/styles.css`
- `E:/ClawFlow/src/components/skill/SkillCard.tsx`
- `E:/ClawFlow/src/components/skill/SkillList.tsx`
- `E:/ClawFlow/src/components/skill/SkillDetail.tsx`

**开发步骤：**

1. **创建 SkillsPage 页面组件**
   - 技能列表（网格或列表视图）
   - 搜索框（按名称、描述搜索技能）
   - 筛选器（已安装 / 未安装 / 全部）

2. **创建 SkillCard 组件**
   - 显示技能名称、描述、版本
   - 安装/卸载按钮
   - 启用/禁用开关
   - 技能图标（可选）

3. **创建 SkillList 组件**
   - 网格/列表视图切换
   - 分页或无限滚动
   - 空状态处理

4. **创建 SkillDetail 组件**
   - 技能详细信息
   - 使用说明
   - 配置选项（如果有）

5. **集成 skillStore**
   - 获取技能列表
   - 安装/卸载技能
   - 启用/禁用技能

**前置任务：** 任务 2.1、任务 2.2

**验收标准：**
- [ ] 技能列表正确显示
- [ ] 可以搜索和筛选技能
- [ ] 可以安装、卸载、启用、禁用技能
- [ ] 操作状态正确反馈（加载中、成功、失败）
- [ ] 错误处理完善

**预计复杂度：** 中等

---

### 任务 2.5：连接器配置界面开发

**任务描述：**
开发连接器管理界面，支持配置和管理 OpenClaw 的连接器。

**涉及文件：**
- `E:/ClawFlow/src/pages/ConnectorsPage/index.tsx`
- `E:/ClawFlow/src/pages/ConnectorsPage/styles.css`
- `E:/ClawFlow/src/components/connector/ConnectorCard.tsx`
- `E:/ClawFlow/src/components/connector/ConnectorForm.tsx`
- `E:/ClawFlow/src/components/connector/ConnectorList.tsx`

**开发步骤：**

1. **创建 ConnectorsPage 页面组件**
   - 连接器列表
   - 添加连接器按钮

2. **创建 ConnectorCard 组件**
   - 显示连接器名称、类型、状态
   - 编辑/删除按钮
   - 测试连接按钮

3. **创建 ConnectorForm 组件**
   - 表单：连接器名称、类型、配置参数
   - 表单验证
   - 提交处理

4. **集成 connectorStore**
   - 获取连接器列表
   - 添加/更新/删除连接器
   - 测试连接

**前置任务：** 任务 2.1、任务 2.2

**验收标准：**
- [ ] 连接器列表正确显示
- [ ] 可以添加、编辑、删除连接器
- [ ] 可以测试连接器连接
- [ ] 表单验证正确
- [ ] 错误处理完善

**预计复杂度：** 中等

---

### 任务 2.6：仪表盘页面重构

**任务描述：**
重构现有的 DashboardPage，使其更加美观和实用。

**涉及文件：**
- `E:/ClawFlow/src/pages/DashboardPage/index.tsx`（重构）
- `E:/ClawFlow/src/pages/DashboardPage/styles.css`

**开发步骤：**

1. **使用 Ant Design 组件重构界面**
   - 使用 Card、Statistic、Button 等组件
   - 添加图标（@ant-design/icons）

2. **显示更多信息**
   - OpenClaw 版本
   - Gateway 状态（运行中/已停止）
   - 已安装技能数量
   - 连接器数量
   - 最近对话数量（可选）

3. **快速操作入口**
   - 启动/停止 Gateway
   - 打开对话页面
   - 打开技能管理页面
   - 打开连接器配置页面

**前置任务：** 任务 2.1

**验收标准：**
- [ ] 界面美观、专业
- [ ] 信息显示完整
- [ ] 快速操作可用
- [ ] 响应式布局

**预计复杂度：** 简单

---

### 任务 2.7：设置页面开发（含多语言支持）

**任务描述：**
开发应用设置页面，支持配置应用行为、外观和多语言。

**涉及文件：**
- `E:/ClawFlow/src/pages/SettingsPage/index.tsx`
- `E:/ClawFlow/src/pages/SettingsPage/styles.css`
- `E:/ClawFlow/src/locales/zh.json`
- `E:/ClawFlow/src/locales/en.json`
- `E:/ClawFlow/src/i18n.ts`（国际化配置）

**开发步骤：**

1. **创建国际化配置文件（i18n.ts）**
   - 配置 i18next
   - 加载中英文翻译资源
   - 导出 `t` 函数和 `i18n` 实例

2. **创建翻译资源文件**
   - `locales/zh.json`：中文翻译
   - `locales/en.json`：英文翻译

3. **创建设置页面**
   - 常规设置：启动行为、日志级别
   - 外观设置：主题（亮色/暗色）
   - **语言设置：中文/英文切换**
   - OpenClaw 设置：CLI 路径、命令超时时间
   - 关于：应用版本、OpenClaw 版本、许可证

4. **集成 settingsStore**
   - 读取设置
   - 更新设置
   - 重置设置

5. **实现语言切换**
   - 切换语言时，立即更新界面文案
   - 保存语言偏好到 localStorage

**前置任务：** 任务 2.1、任务 1.1（i18next 依赖）

**验收标准：**
- [ ] 所有设置项可用
- [ ] 设置正确保存（localStorage 或配置文件）
- [ ] 主题切换立即生效
- [ ] **语言切换生效（中文/英文）**
- [ ] 所有界面文案都有中英文翻译

**预计复杂度：** 中等

---

## 三、UI/UX 优化

### 任务 3.1：导航栏完善

**任务描述：**
完善左侧导航栏，添加所有页面的导航入口。

**涉及文件：**
- `E:/ClawFlow/src/components/Layout.tsx`

**开发步骤：**

1. **添加导航项**
   - 仪表盘 (`/dashboard`)
   - 对话 (`/chat`)
   - 技能管理 (`/skills`)
   - 连接器 (`/connectors`)
   - 设置 (`/settings`)

2. **优化样式**
   - 使用 Ant Design 的 Menu 组件
   - 添加图标
   - 支持折叠/展开（可选）

3. **响应式设计**
   - 小屏幕下自动折叠

**前置任务：** 任务 2.3、任务 2.4、任务 2.5、任务 2.7

**验收标准：**
- [ ] 所有页面可以通过导航栏访问
- [ ] 当前页面高亮显示
- [ ] 图标正确显示
- [ ] 响应式布局生效

**预计复杂度：** 简单

---

### 任务 3.2：主题和样式统一

**任务描述：**
统一应用的外观样式，支持亮色和暗色主题。UI 自主设计。

**涉及文件：**
- `E:/ClawFlow/src/styles/global.css`
- `E:/ClawFlow/src/styles/theme.ts`（可选，使用 Ant Design 的 ConfigProvider）

**开发步骤：**

1. **配置 Ant Design 主题**
   - 使用 ConfigProvider 配置主题色、圆角、字体等
   - 支持亮色/暗色主题切换

2. **创建全局样式**
   - 重置默认样式
   - 定义通用类名
   - 定义动画效果

3. **优化组件样式**
   - 确保所有页面样式一致
   - 响应式布局

**UI 设计原则：**
- **不要求复刻 WorkBuddy**，可以自主设计独特的 UI 风格
- 保持界面简洁、美观、易用
- 参考现代桌面应用的设计规范

**前置任务：** 任务 1.1

**验收标准：**
- [ ] 主题切换正确生效
- [ ] 所有页面样式一致
- [ ] 响应式布局生效
- [ ] 动画流畅

**预计复杂度：** 中等

---

### 任务 3.3：Loading 和错误处理优化

**任务描述：**
完善全局的 Loading 状态和错误处理 UI。

**涉及文件：**
- `E:/ClawFlow/src/components/common/Loading.tsx`
- `E:/ClawFlow/src/components/common/ErrorBoundary.tsx`
- `E:/ClawFlow/src/components/common/EmptyState.tsx`

**开发步骤：**

1. **创建 Loading 组件**
   - 全局 Loading（Spin）
   - 局部 Loading（按钮、卡片等）

2. **创建 ErrorBoundary 组件**
   - 捕获渲染错误
   - 显示友好的错误信息和重试按钮

3. **创建 EmptyState 组件**
   - 空数据状态（无消息、无技能、无连接器等）
   - 提供操作引导

4. **集成到页面**
   - 所有页面使用 ErrorBoundary 包裹
   - 异步操作时显示 Loading
   - 空数据时使用 EmptyState

**前置任务：** 无

**验收标准：**
- [ ] Loading 状态正确显示
- [ ] 错误信息友好、可读
- [ ] 空数据状态引导清晰
- [ ] 错误恢复机制可用（重试按钮）

**预计复杂度：** 中等

---

## 四、测试策略

### 任务 4.1：单元测试

**任务描述：**
为关键模块编写单元测试，确保代码质量。

**涉及文件：**
- `E:/ClawFlow/src/__tests__/engine/openclaw-engine.test.ts`
- `E:/ClawFlow/src/__tests__/store/gatewayStore.test.ts`
- `E:/ClawFlow/src/__tests__/utils/*.test.ts`

**开发步骤：**

1. **配置 Jest**
   - 创建 `jest.config.ts`
   - 配置 ts-jest
   - 配置测试环境

2. **编写引擎测试**
   - 测试 OpenClaw 引擎的 CLI 调用
   - 测试 IPC 接口
   - Mock child_process

3. **编写 Store 测试**
   - 测试 zustand store 的状态更新
   - 测试异步 action

4. **编写工具函数测试**
   - 测试工具函数的正确性

**前置任务：** 任务 1.1

**验收标准：**
- [ ] Jest 配置正确
- [ ] 测试覆盖率 > 60%
- [ ] 所有测试通过

**预计复杂度：** 中等

---

### 任务 4.2：集成测试

**任务描述：**
编写集成测试，确保各模块协同工作正常。

**涉及文件：**
- `E:/ClawFlow/src/__tests__/integration/*.test.tsx`

**开发步骤：**

1. **配置测试环境**
   - 使用 @testing-library/react
   - Mock Electron API

2. **编写页面集成测试**
   - 测试页面渲染
   - 测试用户交互
   - 测试异步数据加载

**前置任务：** 任务 4.1

**验收标准：**
- [ ] 集成测试通过
- [ ] 覆盖关键用户流程

**预计复杂度：** 复杂

---

## 五、打包与发布

### 任务 5.1：优化打包配置

**任务描述：**
优化 Electron Forge 配置，确保应用正确打包。

**涉及文件：**
- `E:/ClawFlow/forge.config.ts`
- `E:/ClawFlow/webpack.main.config.ts`
- `E:/ClawFlow/webpack.renderer.config.ts`

**开发步骤：**

1. **优化 Forge 配置**
   - 配置打包钩子（已部分完成）
   - 配置 makers（Windows: Squirrel, macOS: DMG, Linux: DEB/RPM）

2. **优化 Webpack 配置**
   - 确保生产环境构建正确
   - 代码分割（可选）

3. **测试打包**
   - 运行 `npm run make`
   - 测试打包后的应用是否正常工作

**前置任务：** 所有功能开发完成

**验收标准：**
- [ ] 打包成功无错误
- [ ] 打包后的应用可以正常启动
- [ ] OpenClaw 集成正常工作
- [ ] 所有功能正常

**预计复杂度：** 中等

---

### 任务 5.2：代码签名和自动更新（可选）

**任务描述：**
配置代码签名和自动更新机制，提升用户体验。

**涉及文件：**
- `E:/ClawFlow/forge.config.ts`

**开发步骤：**

1. **配置代码签名**
   - Windows: 配置证书
   - macOS: 配置 Developer ID

2. **配置自动更新**
   - 使用 Electron Forge 的 publish 功能
   - 配置更新服务器（可选）

**前置任务：** 任务 5.1

**验收标准：**
- [ ] 代码签名成功
- [ ] 自动更新可用（可选）

**预计复杂度：** 复杂

---

## 六、文档编写

### 任务 6.1：用户文档

**任务描述：**
编写用户使用文档，帮助用户快速上手。

**涉及文件：**
- `E:/ClawFlow/docs/user-guide.md`
- `E:/ClawFlow/docs/faq.md`
- `E:/ClawFlow/README.md`（更新）

**文档内容：**

1. **安装指南**
   - 系统要求
   - 安装步骤
   - 首次配置

2. **使用指南**
   - 快速开始
   - 对话功能
   - 技能管理
   - 连接器配置
   - 设置说明

3. **常见问题**
   - FAQ

**前置任务：** 所有功能开发完成

**验收标准：**
- [ ] 文档完整、清晰
- [ ] 包含截图（可选）
- [ ] Markdown 格式正确

**预计复杂度：** 简单

---

### 任务 6.2：开发文档

**任务描述：**
更新和补充开发文档，帮助开发者快速上手。

**涉及文件：**
- `E:/ClawFlow/docs/development.md`
- `E:/ClawFlow/ARCHITECTURE.md`（更新）
- `E:/ClawFlow/CONTRIBUTING.md`（可选）

**文档内容：**

1. **开发环境搭建**
   - 依赖安装
   - 开发命令
   - 调试技巧

2. **架构说明**
   - 更新 ARCHITECTURE.md，补充新增模块说明

3. **贡献指南**
   - 代码规范
   - PR 流程（可选）

**前置任务：** 所有功能开发完成

**验收标准：**
- [ ] 文档完整、准确
- [ ] 代码示例正确

**预计复杂度：** 简单

---

## 七、开发优先级和时间估算

### 优先级排序（P0 - P3）

- **P0（必须完成）：** 任务 1.1 ~ 1.3、任务 2.1 ~ 2.3、任务 3.1 ~ 3.2
- **P1（重要）：** 任务 2.4 ~ 2.7、任务 3.3、任务 5.1
- **P2（建议）：** 任务 4.1 ~ 4.2
- **P3（可选）：** 任务 5.2、任务 6.1 ~ 6.2

### 时间估算（单人开发）

| 任务组 | 预计时间 | 复杂度 |
|--------|----------|--------|
| 一、项目配置与依赖完善 | 1 天 | 简单 |
| 二、核心功能模块开发 | 10-15 天 | 复杂 |
| 三、UI/UX 优化 | 3-5 天 | 中等 |
| 四、测试策略 | 3-5 天 | 中等 |
| 五、打包与发布 | 2-3 天 | 中等 |
| 六、文档编写 | 2-3 天 | 简单 |
| **总计** | **21-32 天** | - |

---

## 八、关键技术点和注意事项

### 8.1 流式响应处理

- 使用 OpenClaw CLI 的流式输出（stdout/stderr）
- 使用 ReadableStream 或 EventEmitter 处理流式数据
- 在渲染进程使用 State 逐步更新消息内容

### 8.2 IPC 通信性能优化

- 避免频繁的 IPC 调用（批量更新）
- 大数据传输使用 shared memory 或 ArrayBuffer（可选）

### 8.3 状态管理最佳实践

- 使用 zustand 的 middleware（persist、devtools 等）
- 避免 store 过于庞大，按模块拆分
- 使用 selector 优化性能

### 8.4 错误处理

- Main 进程：捕获 CLI 执行错误，通过 IPC 通知渲染进程
- 渲染进程：使用 ErrorBoundary、try-catch、Promise.catch
- 显示友好的错误信息

### 8.5 安全性

- 保持 contextIsolation: true
- 仅通过 Preload 暴露必要的 API
- 验证所有用户输入

### 8.6 多语言实现

- 使用 i18next + react-i18next
- 翻译资源文件放在 `src/locales/` 目录
- 所有用户界面文案都需要提供中英文翻译

---

## 九、参考资源

- **Electron 官方文档：** https://www.electronjs.org/docs
- **React 官方文档：** https://react.dev/
- **Ant Design 文档：** https://ant.design/docs/react/introduce
- **zustand 文档：** https://docs.pmnd.rs/zustand/getting-started/introduction
- **Electron Forge 文档：** https://www.electronforge.io/
- **i18next 文档：** https://www.i18next.com/

---

## 十、总结

本开发步骤说明书详细规划了 ClawFlow 项目从当前状态（60% 完成）到完整产品所需的全部开发工作。按照优先级顺序执行，可以先完成核心功能（对话界面），再逐步完善其他模块。

**重要原则：**
1. **功能类似 WorkBuddy，UI 自主设计** - 不需要完全复刻，鼓励创新设计
2. **支持中英文切换** - 所有界面文案都需要提供多语言翻译
3. **按优先级执行** - 严格遵循 P0→P1→P2 的顺序

**建议的开发顺序：**
1. 完成项目配置和目录结构（任务 1.1 ~ 1.3）
2. 重构状态管理（任务 2.1）
3. 扩展 IPC 接口（任务 2.2）
4. 开发对话界面（任务 2.3）← 核心功能
5. 完善导航和主题（任务 3.1 ~ 3.2）
6. 开发其他页面（任务 2.4 ~ 2.7）
7. 优化 UI/UX（任务 3.3）
8. 编写测试（任务 4.1 ~ 4.2）
9. 打包发布（任务 5.1 ~ 5.2）
10. 编写文档（任务 6.1 ~ 6.2）

---

**文件创建时间：** 2026-05-07
**作者：** CodeBuddy Code (Claude)
**版本：** v1.1（更新：支持中英文切换，UI 自主设计）
