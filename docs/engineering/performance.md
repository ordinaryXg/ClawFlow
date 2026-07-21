# ClawFlow 性能优化方案

> 关联：[engineering/architecture.md](./architecture.md)、[features/README.md](../features/README.md)

**文档版本**: 1.0.0  
**创建日期**: 2026-06-02  
**负责人**: Rufus  
**目标**: 将性能指标提升至产品化标准

---

## 📊 当前性能基线

| 指标 | 目标值 | 当前值 | 差距 | 优先级 |
|------|--------|--------|------|--------|
| 应用启动时间 | < 3秒 | ~5秒 | +67% | P0 |
| 模型切换响应 | < 1秒 | ~2秒 | +100% | P0 |
| 流式输出延迟 | < 100ms | ~150ms | +50% | P1 |
| 工作区加载 (10K文件) | < 5秒 | ~8秒 | +60% | P0 |
| 记忆搜索 (10K条) | < 500ms | ~800ms | +60% | P1 |
| 内存占用 (空闲) | < 500MB | ~650MB | +30% | P0 |
| CPU占用 (空闲) | < 5% | ~8% | +60% | P1 |

**总体评价**: 所有核心性能指标均未达标，需要系统性优化。

---

## 🎯 优化目标

### Phase 1: 核心性能 (1-2个月)
- [ ] 应用启动时间 < 3秒
- [ ] 工作区加载 (10K文件) < 5秒
- [ ] 内存占用 (空闲) < 500MB
- [ ] 模型切换响应 < 1秒

### Phase 2: 体验优化 (2-3个月)
- [ ] 流式输出延迟 < 100ms
- [ ] 记忆搜索 (10K条) < 500ms
- [ ] CPU占用 (空闲) < 5%
- [ ] 大文件预览响应 < 200ms

---

## 🔍 性能瓶颈分析

### 1. 应用启动慢 (~5秒)

**问题分析**:
```
启动流程时间分解：
├─ Electron初始化          ~800ms
├─ 主进程IPC注册          ~600ms
├─ 工作区注册表加载       ~400ms
├─ Hermes记忆索引加载     ~1000ms
├─ 引擎初始化             ~800ms
├─ 渲染进程启动           ~700ms
├─ React组件树渲染        ~500ms
└─ 总计                  ~4800ms
```

**瓶颈点**:
1. ❌ Hermes记忆索引加载过慢 (1000ms)
2. ❌ 主进程IPC注册阻塞 (600ms)
3. ❌ 工作区注册表全量加载 (400ms)
4. ❌ 渲染进程同步初始化 (700ms)

---

### 2. 工作区加载慢 (~8秒 for 10K文件)

**问题分析**:
```typescript
// 当前实现 (src/main/workspace/workspace-service.ts)
export function listWorkspaceFiles(workspaceRoot: string): FileNode[] {
  // ❌ 问题1: 同步递归遍历，阻塞主进程
  const files = walkDirSync(workspaceRoot);
  
  // ❌ 问题2: 无缓存，每次全量扫描
  // ❌ 问题3: 无分页，一次性返回所有文件
  return files;
}
```

**瓶颈点**:
1. ❌ 同步文件遍历 (阻塞主进程)
2. ❌ 无文件索引缓存
3. ❌ 无虚拟滚动 (渲染10K DOM节点)
4. ❌ 无文件变化监听优化

---

### 3. 内存占用高 (~650MB)

**问题分析**:
```
内存分布估算：
├─ Electron外壳            ~80MB
├─ 主进程Heap             ~100MB
│  ├─ 工作区文件树       ~60MB (10K文件)
│  ├─ Hermes索引         ~30MB
│  └─ 会话历史           ~10MB
├─ 渲染进程Heap           ~350MB
│  ├─ React组件树        ~150MB
│  ├─ 对话消息缓存       ~100MB
│  ├─ 状态管理 (Zustand) ~50MB
│  └─ DOM节点            ~50MB
├─ GPU进程               ~120MB
└─ 总计                  ~650MB
```

**瓶颈点**:
1. ❌ 工作区文件树全量驻留内存 (60MB)
2. ❌ 对话消息无限制缓存 (100MB)
3. ❌ React组件树未优化 (150MB)
4. ❌ DOM节点未回收 (50MB)

---

### 4. 模型切换慢 (~2秒)

**问题分析**:
```typescript
// 当前实现 (src/engine/core/provider-router.ts)
export async function switchModel(modelId: string): Promise<void> {
  // ❌ 问题1: 同步销毁旧Provider (~500ms)
  await destroyOldProvider();
  
  // ❌ 问题2: 同步创建新Provider (~800ms)
  await createNewProvider(modelId);
  
  // ❌ 问题3: 同步重置引擎状态 (~700ms)
  await resetEngineState();
}
```

**瓶颈点**:
1. ❌ Provider销毁/创建同步执行
2. ❌ 引擎状态重置无优化
3. ❌ 无模型预加载机制

---

## 🛠️ 优化方案

### 方案1: 应用启动优化 (目标: <3秒)

#### 1.1 延迟加载非核心模块

**当前问题**:
```typescript
// src/index.ts (主进程入口)
import './main/win-console-utf8';
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as workspaceService from './main/workspace/workspace-service';
import { registerClawFlowIPC } from './engine/engine-ipc';
// ❌ 问题: 所有模块在启动时就加载
```

**优化方案**:
```typescript
// src/index.ts (优化后)
import './main/win-console-utf8';
import { app, BrowserWindow } from 'electron';
import * as path from 'path';

// ✅ 改进1: 仅加载核心模块
import { registerShellViewWindowIPC } from './main/ipc/register-shell-window-ipc';
import { registerWorkspaceEarlyIPC } from './main/ipc/register-workspace-early-ipc';

// ✅ 改进2: 延迟注册非核心IPC (在app.whenReady()后)
async function registerNonCriticalIPC() {
  const { registerClawFlowIPC } = await import('./engine/engine-ipc');
  const { registerGatewayIPC } = await import('./engine/gateway/gateway-daemon');
  const { registerSystemAgentsIPC } = await import('./main/system-agents/system-agents-ipc');
  
  registerClawFlowIPC();
  registerGatewayIPC();
  registerSystemAgentsIPC();
}

app.whenReady().then(async () => {
  // 先显示窗口
  createWindow();
  
  // 再延迟注册非核心IPC
  setTimeout(() => registerNonCriticalIPC(), 1000);
});
```

**预期收益**: 启动时间减少 ~800ms

---

#### 1.2 Hermes索引增量加载

**当前问题**:
```typescript
// src/engine/hermes/hermes-memory-db.ts
export function loadHermesIndex(workspaceRoot: string): void {
  // ❌ 问题: 启动时全量加载索引到内存
  const indexData = fs.readFileSync(getIndexFilePath(workspaceRoot));
  const index = deserializeIndex(indexData); // ~1000ms
  globalHermesIndex = index;
}
```

**优化方案**:
```typescript
// src/engine/hermes/hermes-memory-db.ts (优化后)
class HermesIndexManager {
  private indexCache: LRUCache<string, IndexNode>;
  private indexMetadata: IndexMetadata | null = null;

  async loadIndexMetadata(workspaceRoot: string): Promise<void> {
    // ✅ 改进1: 仅加载元数据 (文件数、最后更新时间等)
    const metadataPath = getMetadataFilePath(workspaceRoot);
    this.indexMetadata = await fs.promises.readFile(metadataPath, 'utf-8').then(JSON.parse);
    // ~50ms
  }

  async searchIndex(query: string, limit: number = 10): Promise<SearchResult[]> {
    // ✅ 改进2: 按需加载索引节点 (LRU缓存)
    const relevantNodeIds = await this.getRelevantNodeIds(query, limit);
    const nodes = await Promise.all(
      relevantNodeIds.map(id => this.loadIndexNode(id))
    );
    return this.searchInNodes(nodes, query);
  }

  private async loadIndexNode(nodeId: string): Promise<IndexNode> {
    // ✅ 改进3: LRU缓存，避免重复加载
    if (this.indexCache.has(nodeId)) {
      return this.indexCache.get(nodeId)!;
    }
    
    const nodeData = await fs.promises.readFile(`${getIndexDir()}/${nodeId}.json`);
    const node = JSON.parse(nodeData);
    this.indexCache.set(nodeId, node);
    return node;
  }
}

// 启动时仅加载元数据
await hermesIndexManager.loadIndexMetadata(workspaceRoot);
// 耗时: ~50ms (原来1000ms)
```

**预期收益**: 启动时间减少 ~950ms

---

#### 1.3 工作区注册表懒加载

**当前问题**:
```typescript
// src/main/workspace/workspace-service.ts
export function loadRegistry(): WorkspaceRegistry {
  // ❌ 问题: 启动时全量加载注册表
  const registryPath = getRegistryFilePath();
  const registryData = fs.readFileSync(registryPath, 'utf-8');
  return JSON.parse(registryData); // ~400ms for 50+ workspaces
}
```

**优化方案**:
```typescript
// src/main/workspace/workspace-service.ts (优化后)
class WorkspaceRegistryManager {
  private registryCache: WorkspaceRegistry | null = null;
  private registryMtime: number = 0;

  getRegistry(forceReload: boolean = false): WorkspaceRegistry {
    const registryPath = getRegistryFilePath();
    const stats = fs.statSync(registryPath);
    
    // ✅ 改进1: 基于mtime的缓存
    if (!forceReload && this.registryCache && this.registryMtime === stats.mtimeMs) {
      return this.registryCache;
    }
    
    // ✅ 改进2: 仅加载最近使用的5个工作区
    const fullRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    const recentWorkspaces = fullRegistry.recentWorkspacePaths.slice(0, 5);
    
    this.registryCache = {
      ...fullRegistry,
      recentWorkspacePaths: recentWorkspaces,
    };
    this.registryMtime = stats.mtimeMs;
    
    return this.registryCache;
  }
}

// 启动时仅加载最近5个工作区
const registry = workspaceRegistryManager.getRegistry();
// 耗时: ~80ms (原来400ms)
```

**预期收益**: 启动时间减少 ~320ms

---

#### 1.4 渲染进程异步初始化

**当前问题**:
```typescript
// src/renderer.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// ❌ 问题: 同步渲染，阻塞首屏
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

**优化方案**:
```typescript
// src/renderer.tsx (优化后)
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Suspense } from 'react';
import App from './App';
import LoadingSpinner from './components/common/LoadingSpinner';

// ✅ 改进1: 使用Suspense延迟渲染非关键组件
ReactDOM.createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<LoadingSpinner />}>
    <App />
  </Suspense>
);

// src/App.tsx
import { lazy, Suspense } from 'react';

// ✅ 改进2: 代码分割，懒加载页面组件
const ChatPage = lazy(() => import('./pages/ChatPage'));
const SkillsPage = lazy(() => import('./pages/SkillsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/chat" element={
          <Suspense fallback={<LoadingSpinner />}>
            <ChatPage />
          </Suspense>
        } />
        <Route path="/skills" element={
          <Suspense fallback={<LoadingSpinner />}>
            <SkillsPage />
          </Suspense>
        } />
        <Route path="/settings" element={
          <Suspense fallback={<LoadingSpinner />}>
            <SettingsPage />
          </Suspense>
        } />
      </Route>
    </Routes>
  );
}
```

**预期收益**: 首屏渲染时间减少 ~400ms

---

**小结**: 启动优化预期总收益 = 800 + 950 + 320 + 400 = **2470ms**，从~5秒降至**~2.5秒** ✅

---

### 方案2: 工作区加载优化 (目标: <5秒 for 10K文件)

#### 2.1 异步文件遍历 + 索引缓存

**优化方案**:
```typescript
// src/main/workspace/workspace-file-indexer.ts

interface FileIndex {
  [path: string]: {
    name: string;
    isDirectory: boolean;
    size: number;
    mtime: number;
    children?: string[]; // 仅目录有此字段
  };
}

class WorkspaceFileIndexer {
  private indexCache: Map<string, FileIndex> = new Map();
  private indexingPromise: Promise<void> | null = null;

  async ensureIndex(workspaceRoot: string): Promise<FileIndex> {
    // ✅ 改进1: 返回缓存的索引
    if (this.indexCache.has(workspaceRoot)) {
      return this.indexCache.get(workspaceRoot)!;
    }

    // ✅ 改进2: 防止并发索引
    if (this.indexingPromise) {
      await this.indexingPromise;
      return this.indexCache.get(workspaceRoot)!;
    }

    // ✅ 改进3: 异步索引，不阻塞主进程
    this.indexingPromise = this.buildIndex(workspaceRoot);
    await this.indexingPromise;
    
    return this.indexCache.get(workspaceRoot)!;
  }

  private async buildIndex(workspaceRoot: string): Promise<void> {
    const index: FileIndex = {};
    
    // ✅ 改进4: 使用fs.promises + 递归异步遍历
    await this.walkDirAsync(workspaceRoot, index);
    
    // ✅ 改进5: 写入索引缓存文件
    const cachePath = path.join(getAppCacheDir(), 'workspace-indexes', `${sha256(workspaceRoot)}.json`);
    await fs.promises.writeFile(cachePath, JSON.stringify(index));
    
    this.indexCache.set(workspaceRoot, index);
  }

  private async walkDirAsync(dirPath: string, index: FileIndex, depth: number = 0): Promise<void> {
    // ✅ 改进6: 限制递归深度，避免栈溢出
    if (depth > 10) return;

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    // ✅ 改进7: 并行处理多个文件 (batch)
    const batchSize = 50;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (entry) => {
          const fullPath = path.join(dirPath, entry.name);
          index[fullPath] = {
            name: entry.name,
            isDirectory: entry.isDirectory(),
            size: entry.isFile() ? (await fs.promises.stat(fullPath)).size : 0,
            mtime: (await fs.promises.stat(fullPath)).mtimeMs,
          };

          if (entry.isDirectory()) {
            index[fullPath].children = [];
            await this.walkDirAsync(fullPath, index, depth + 1);
          }
        })
      );
    }
  }

  // ✅ 改进8: 增量更新索引 (仅扫描变化的文件)
  async updateIndexIncremental(workspaceRoot: string, changedPaths: string[]): Promise<void> {
    const index = await this.ensureIndex(workspaceRoot);
    
    for (const changedPath of changedPaths) {
      if (fs.existsSync(changedPath)) {
        // 更新
        const stats = await fs.promises.stat(changedPath);
        index[changedPath] = {
          name: path.basename(changedPath),
          isDirectory: stats.isDirectory(),
          size: stats.isFile() ? stats.size : 0,
          mtime: stats.mtimeMs,
        };
      } else {
        // 删除
        delete index[changedPath];
      }
    }
    
    // 写回缓存
    const cachePath = path.join(getAppCacheDir(), 'workspace-indexes', `${sha256(workspaceRoot)}.json`);
    await fs.promises.writeFile(cachePath, JSON.stringify(index));
  }
}
```

**预期收益**: 首次索引 ~3秒，后续加载 ~200ms (从缓存)

---

#### 2.2 虚拟滚动 (渲染进程)

**当前问题**:
```typescript
// src/components/workspace/WorkspaceFileTree.tsx
function WorkspaceFileTree({ files }: { files: FileNode[] }) {
  // ❌ 问题: 一次性渲染所有文件节点
  return (
    <div>
      {files.map(file => (
        <FileTreeNode key={file.path} file={file} />
      ))}
    </div>
  );
}
```

**优化方案**:
```typescript
// src/components/workspace/WorkspaceFileTreeVirtualized.tsx
import { FixedSizeList as List } from 'react-window';

function WorkspaceFileTreeVirtualized({ files }: { files: FileNode[] }) {
  // ✅ 改进1: 使用react-window虚拟滚动，仅渲染可见区域
  const ROW_HEIGHT = 28; // 每个文件节点的高度
  
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const file = files[index];
    return (
      <div style={style}>
        <FileTreeNode file={file} />
      </div>
    );
  };

  return (
    <List
      height={800} // 容器高度
      itemCount={files.length}
      itemSize={ROW_HEIGHT}
      width="100%"
    >
      {Row}
    </List>
  );
}
```

**预期收益**: 渲染时间从 ~500ms 降至 ~50ms (10K文件)

---

#### 2.3 文件变化监听优化

**优化方案**:
```typescript
// src/main/workspace/workspace-file-watcher.ts
import chokidar from 'chokidar';

class WorkspaceFileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;

  startWatching(workspaceRoot: string): void {
    // ✅ 改进1: 使用chokidar替代原生fs.watch (性能更好)
    this.watcher = chokidar.watch(workspaceRoot, {
      ignored: /(^|[\/\\])\../, // 忽略隐藏文件
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    // ✅ 改进2: 防抖处理，避免频繁触发索引更新
    this.watcher.on('all', (event, path) => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      
      this.debounceTimer = setTimeout(() => {
        this.handleFileChange(workspaceRoot, event, path);
      }, 500); // 500ms防抖
    });
  }

  private async handleFileChange(workspaceRoot: string, event: string, changedPath: string): Promise<void> {
    // ✅ 改进3: 增量更新索引，而非全量重建
    const indexer = WorkspaceFileIndexer.getInstance();
    await indexer.updateIndexIncremental(workspaceRoot, [changedPath]);
    
    // ✅ 改进4: 批量通知渲染进程，减少IPC次数
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('workspace:filesChanged', {
        workspaceRoot,
        changedPaths: [changedPath],
      });
    });
  }
}
```

**预期收益**: 文件变化响应时间 < 500ms，CPU占用降低 ~3%

---

**小结**: 工作区加载优化预期从 ~8秒降至 **~2秒** (首次) / **~0.2秒** (缓存) ✅

---

### 方案3: 内存占用优化 (目标: <500MB)

#### 3.1 工作区文件树优化

**优化方案**:
```typescript
// src/store/modules/workspaceStore.ts

interface WorkspaceState {
  // ❌ 旧方案: 全量存储文件树
  // fileTree: FileNode[];
  
  // ✅ 新方案: 仅存储展开的目录，其他按需加载
  expandedDirs: Set<string>;
  fileIndexCache: LRUCache<string, FileNode>;
}

const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  expandedDirs: new Set<string>(),
  fileIndexCache: new LRUCache(1000), // 最多缓存1000个文件节点

  expandDir: async (dirPath: string) => {
    const state = get();
    
    // ✅ 改进: 仅加载展开的目录内容
    if (!state.expandedDirs.has(dirPath)) {
      const files = await window.workspaceAPI.listDir(dirPath);
      files.forEach(file => {
        state.fileIndexCache.set(file.path, file);
      });
      
      set(state => ({
        expandedDirs: new Set([...state.expandedDirs, dirPath]),
      }));
    }
  },
}));
```

**预期收益**: 内存占用减少 ~40MB (从60MB降至20MB)

---

#### 3.2 对话消息分页缓存

**优化方案**:
```typescript
// src/store/modules/chatStore.ts

interface ChatState {
  // ❌ 旧方案: 全量存储所有消息
  // messagesByConversation: Record<string, StoredMessage[]>;
  
  // ✅ 新方案: 分页加载，LRU缓存最近10个对话
  activeConversationId: string | null;
  messageCache: LRUCache<string, StoredMessage[]>;
  messagePageCache: LRUCache<string, { page: number; messages: StoredMessage[] }>;
}

const useChatStore = create<ChatState>((set, get) => ({
  activeConversationId: null,
  messageCache: new LRUCache(10), // 最多缓存10个对话的消息
  messagePageCache: new LRUCache(50), // 最多缓存50页消息

  loadMessages: async (conversationId: string, page: number = 1) => {
    const state = get();
    const cacheKey = `${conversationId}_page${page}`;
    
    // ✅ 改进1: 检查缓存
    if (state.messagePageCache.has(cacheKey)) {
      return state.messagePageCache.get(cacheKey)!.messages;
    }
    
    // ✅ 改进2: 从数据库分页加载 (每页50条)
    const messages = await window.chatAPI.getMessages(conversationId, page, 50);
    
    // ✅ 改进3: 写入缓存
    state.messagePageCache.set(cacheKey, { page, messages });
    
    return messages;
  },

  // ✅ 改进4: 仅缓存活跃对话的最近100条消息
  pruneMessageCache: () => {
    const state = get();
    if (state.activeConversationId) {
      const messages = state.messageCache.get(state.activeConversationId);
      if (messages && messages.length > 100) {
        state.messageCache.set(state.activeConversationId, messages.slice(-100));
      }
    }
  },
}));
```

**预期收益**: 内存占用减少 ~70MB (从100MB降至30MB)

---

#### 3.3 React组件优化

**优化方案**:
```typescript
// src/components/chat/MessageList.tsx

// ❌ 旧方案: 每次render都重新渲染所有消息
function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div>
      {messages.map(msg => (
        <MessageItem key={msg.id} message={msg} />
      ))}
    </div>
  );
}

// ✅ 新方案: 使用React.memo + useMemo + useCallback
const MessageItem = React.memo(({ message }: { message: Message }) => {
  // 仅当message变化时重新渲染
  return <div>{message.content}</div>;
}, (prevProps, nextProps) => {
  return prevProps.message.id === nextProps.message.id 
    && prevProps.message.content === nextProps.message.content;
});

function MessageList({ messages }: { messages: Message[] }) {
  // ✅ 改进1: 使用useMemo缓存消息列表
  const messageList = useMemo(() => {
    return messages.map(msg => (
      <MessageItem key={msg.id} message={msg} />
    ));
  }, [messages]);

  return <div>{messageList}</div>;
}
```

**预期收益**: 内存占用减少 ~30MB (从150MB降至120MB)

---

#### 3.4 DOM节点回收

**优化方案**:
```typescript
// src/components/chat/ChatPage.tsx

function ChatPage() {
  const messages = useChatStore(s => s.messages);
  
  // ✅ 改进: 使用react-window虚拟滚动，回收不可见消息的DOM节点
  const ROW_HEIGHT = 120; // 每条消息的平均高度
  
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const message = messages[index];
    return (
      <div style={style}>
        <MessageItem message={message} />
      </div>
    );
  };

  return (
    <List
      height={window.innerHeight}
      itemCount={messages.length}
      itemSize={ROW_HEIGHT}
      width="100%"
    >
      {Row}
    </List>
  );
}
```

**预期收益**: 内存占用减少 ~40MB (从50MB降至10MB)

---

**小结**: 内存优化预期从 ~650MB 降至 **~410MB** ✅ (还需进一步优化至<500MB)

---

### 方案4: 模型切换优化 (目标: <1秒)

#### 4.1 Provider预加载

**优化方案**:
```typescript
// src/engine/provider-manager.ts

class ProviderManager {
  private activeProvider: ModelProvider | null = null;
  private preloadedProviders: Map<string, ModelProvider> = new Map();
  private preloadPool: LRUCache<string, boolean> = new LRUCache(3); // 预加载最近使用的3个模型

  async switchModel(modelId: string): Promise<void> {
    // ✅ 改进1: 检查预加载缓存
    if (this.preloadedProviders.has(modelId)) {
      this.activeProvider = this.preloadedProviders.get(modelId)!;
      return; // ~50ms
    }

    // ✅ 改进2: 异步创建新Provider，不阻塞UI
    const newProvider = await this.createProviderAsync(modelId);
    
    // ✅ 改进3: 延迟销毁旧Provider (避免等待)
    const oldProvider = this.activeProvider;
    setTimeout(() => {
      oldProvider?.destroy();
    }, 5000); // 5秒后销毁

    this.activeProvider = newProvider;
    
    // ✅ 改进4: 预加载下一个可能使用的模型
    this.preloadNextLikelyModel(modelId);
  }

  private async preloadNextLikelyModel(currentModelId: string): Promise<void> {
    // 基于使用历史预测下一个可能切换的模型
    const likelyNextModel = this.predictNextModel(currentModelId);
    
    if (likelyNextModel && !this.preloadedProviders.has(likelyNextModel)) {
      const provider = await this.createProviderAsync(likelyNextModel);
      this.preloadedProviders.set(likelyNextModel, provider);
      
      // ✅ 改进5: LRU淘汰，避免内存泄漏
      if (this.preloadedProviders.size > 3) {
        const [oldestKey] = this.preloadedProviders.keys();
        this.preloadedProviders.get(oldestKey)?.destroy();
        this.preloadedProviders.delete(oldestKey);
      }
    }
  }
}
```

**预期收益**: 模型切换时间从 ~2秒降至 **~200ms** (命中预加载) / **~800ms** (未命中) ✅

---

## 📅 实施计划

### Week 1-2: 启动优化
- [ ] 1.1 延迟加载非核心模块
- [ ] 1.2 Hermes索引增量加载
- [ ] 1.3 工作区注册表懒加载
- [ ] 1.4 渲染进程异步初始化

**验收标准**: 启动时间 < 3秒

---

### Week 3-4: 工作区加载优化
- [ ] 2.1 异步文件遍历 + 索引缓存
- [ ] 2.2 虚拟滚动 (渲染进程)
- [ ] 2.3 文件变化监听优化

**验收标准**: 工作区加载 (10K文件) < 5秒

---

### Week 5-6: 内存优化
- [ ] 3.1 工作区文件树优化
- [ ] 3.2 对话消息分页缓存
- [ ] 3.3 React组件优化
- [ ] 3.4 DOM节点回收

**验收标准**: 内存占用 (空闲) < 500MB

---

### Week 7-8: 模型切换优化 + 测试
- [ ] 4.1 Provider预加载
- [ ] 性能回归测试
- [ ] 编写性能测试文档

**验收标准**: 模型切换响应 < 1秒

---

## 🧪 测试方案

### 性能测试自动化

```typescript
// test/performance/startup.test.ts

describe('应用启动性能', () => {
  test('启动时间应 < 3秒', async () => {
    const startTime = Date.now();
    
    // 启动Electron应用
    const app = await startElectronApp();
    
    const endTime = Date.now();
    const startupTime = endTime - startTime;
    
    expect(startupTime).toBeLessThan(3000);
  });
});

// test/performance/workspace-loading.test.ts

describe('工作区加载性能', () => {
  test('10K文件加载应 < 5秒', async () => {
    // 创建包含10K文件的测试工作区
    const testWorkspace = await createTestWorkspace(10000);
    
    const startTime = Date.now();
    
    // 加载工作区
    await loadWorkspace(testWorkspace);
    
    const endTime = Date.now();
    const loadTime = endTime - startTime;
    
    expect(loadTime).toBeLessThan(5000);
  });
});

// test/performance/memory.test.ts

describe('内存占用', () => {
  test('空闲状态应 < 500MB', async () => {
    // 启动应用，等待空闲
    const app = await startElectronApp();
    await waitForIdle(app);
    
    // 获取内存占用
    const memoryUsage = await getMemoryUsage(app);
    
    expect(memoryUsage.heapUsed).toBeLessThan(500 * 1024 * 1024); // 500MB
  });
});
```

---

## 📊 监控和告警

### 性能指标监控

```typescript
// src/utils/performance-monitor.ts

class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const values = this.metrics.get(name)!;
    values.push(value);
    
    // 保留最近100个样本
    if (values.length > 100) {
      values.shift();
    }
  }

  getAverageMetric(name: string): number {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return 0;
    
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  checkThresholds(): void {
    const thresholds = {
      'startup_time': 3000,
      'workspace_load_time': 5000,
      'memory_usage': 500 * 1024 * 1024,
      'model_switch_time': 1000,
    };

    for (const [metric, threshold] of Object.entries(thresholds)) {
      const avg = this.getAverageMetric(metric);
      if (avg > threshold) {
        console.warn(`⚠️ 性能指标超标: ${metric} = ${avg} (阈值: ${threshold})`);
        // 发送告警 (飞书/邮件)
        this.sendAlert(metric, avg, threshold);
      }
    }
  }
}
```

---

## 📝 总结

本方案通过**4大优化方向**、**15项具体优化措施**，预期将ClawFlow的性能指标提升至产品化标准：

| 指标 | 当前值 | 目标值 | 优化后预期 | 完成度 |
|------|--------|--------|------------|--------|
| 启动时间 | ~5秒 | <3秒 | **~2.5秒** | ✅ |
| 工作区加载 | ~8秒 | <5秒 | **~2秒** | ✅ |
| 内存占用 | ~650MB | <500MB | **~410MB** | 🟡 接近目标 |
| 模型切换 | ~2秒 | <1秒 | **~200ms** | ✅ |

**仍需进一步优化的点**:
1. 内存占用需从410MB进一步降至500MB以下 (可能需要更激进的缓存淘汰策略)
2. 流式输出延迟优化 (方案未完成，见Phase 2)
3. 记忆搜索优化 (方案未完成，见Phase 2)

**预计实施周期**: 6-8周  
**预计人力投入**: 1名资深开发者全职

---

**文档版本**: 1.0.0  
**最后更新**: 2026-06-02  
**维护者**: Rufus (455261624@qq.com)
