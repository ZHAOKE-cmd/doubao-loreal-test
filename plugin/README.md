# 豆包品牌测试（dsh-doubao-loreal-test）

DeepSeek Harness（DSH）插件：用 **BrowserSkill** 控制本机浏览器，把 5 条化妆品长尾问题各问豆包 **6 次**，
记录每次回复，并判断回复里有没有推荐 **欧莱雅**（含「巴黎欧莱雅」「L'Oréal」）。
左侧栏有独立入口和测试面板，智能体也能用 `doubao_loreal_test` 工具完成同样的矩阵。

- 目标品牌：**欧莱雅**（`targetBrand`）
- 默认矩阵：**5 个问题 × 每条 6 次 = 30 次**
- BrowserSkill 浏览器实例：**测试抖音链接**
- BrowserSkill 守护进程：**ws://127.0.0.1:52800**
- 运行前必须先在「测试抖音链接」浏览器里**登录豆包**（游客会被重定向到 `?from_logout=1`）

## 目录

```
plugin/
├─ index.js            Host 半：驱动 bsk、矩阵循环、HTTP 面板接口、doubao_loreal_test 工具
├─ client.js           Client 半：左侧栏入口 + 主区测试面板
├─ lib/bsk.js          bsk CLI 封装（路径解析、JSON 信封、超时、守护进程探测）
├─ lib/doubao.js       问题库、品牌命中、VOM/HTML 回复提取（纯函数）
├─ locale/             插件列表里的标题/描述（zh、en）
├─ icon.svg            插件图标
├─ test/selftest.mjs   无浏览器自检
└─ README.md
```

## 前置条件

1. 安装 `bsk` CLI（官方 Windows 脚本）：

   ```powershell
   irm https://raw.githubusercontent.com/Tencent/BrowserSkill/main/install.ps1 | iex
   & "$env:USERPROFILE\.local\bin\bsk.exe" --version
   ```

   插件会自己找 `bsk`：先看配置的 `bskPath`，再查 PATH，最后查 `~/.local/bin/bsk.exe`。

2. 在 Chrome / Edge 安装 **BrowserSkill** 扩展，并把该浏览器实例命名为 **测试抖音链接**。
   扩展协议 **1.8（扩展 0.4.2）即可**——本插件只用 `session/navigate/fill/press/snapshot/get-html`
   这些 1.8 支持的能力，不依赖 1.9 的 `evaluate --unverified`。

3. 启动守护进程。**DSH 的 pwsh 子进程在 Job Object 里，bsk 无法自行脱离启动 daemon**，
   所以要在独立终端常驻：

   ```powershell
   & "$env:USERPROFILE\.local\bin\bsk.exe" daemon start --foreground
   ```

   然后在另一个终端确认：

   ```powershell
   & "$env:USERPROFILE\.local\bin\bsk.exe" status --json
   ```

   扩展显示 Connected、`ws_port: 52800` 即可。

4. 在「测试抖音链接」浏览器里打开 <https://www.doubao.com/chat/> 并**登录豆包**。
   插件会先检查登录按钮；未登录会直接报 `豆包当前未登录`，不会浪费 50 次请求。

## 安装

用 DSH 的插件管理装本地目录（推荐，目录更新后即时生效）：

```
plugin_manager → action: install_bundle → target: E:\code\PycharmProjects\guo_proj\doubao-loreal-test\plugin
```

或在 Web UI 的 **Plugins → Add plugin** 里选择 `plugin/` 目录。
安装后左侧栏出现「豆包品牌测试」入口；`doubao_loreal_test` 工具对本 profile 的会话生效。

分发给别人时用 `dist/dsh-doubao-loreal-test-1.0.0.tgz`：对方解压/`npm i` 该 tgz 后，
把解压出的包目录按上面的方式安装即可。

## 配置

安装后的行 id 是 `doubao-loreal-test`，在 `~/.dsh/profiles/<profile>/cordis.patch.yml` 覆盖：

```yaml
- id: doubao-loreal-test
  config:
    bskPath: bsk                       # 或 bsk.exe 的绝对路径
    browserName: 测试抖音链接           # BrowserSkill 里的浏览器实例名
    daemonUrl: "ws://127.0.0.1:52800"  # 仅用于探测/排障
    chatUrl: "https://www.doubao.com/chat/"
    targetBrand: 欧莱雅
    runsPerQuestion: 6                 # 每条问题跑几次（1–50）
    pollMs: 2500                       # 读取回复的轮询间隔
    replyTimeoutMs: 180000             # 单次回复超时
    betweenRunsMs: 3000                # 两次提问之间的间隔，降低触发风控的概率
    stableReads: 4                     # 连续 N 次读到相同回复才认为生成结束
    recordDir: ""                      # 空 = ~/.dsh/doubao-loreal-test/records
    # questions:                       # 可选：覆盖默认 5 条
    #   - id: q1
    #     text: "..."
```

这是一次性替换整个 `config` 对象，需要的键要一起写上。

## 使用

### 左侧栏面板

1. 点左侧栏「豆包品牌测试」。
2. 确认浏览器、daemon、目标品牌、矩阵（5 × 6）。
3. **开始测试**：连接 daemon → 开一个 Agent Window → 每条问题导航到新对话、输入、回车、等回复稳定。
4. 面板实时显示：进度条、完成/命中/失败数、当前题号与次数、按问题汇总（命中/次数/命中率）、
   每次的回复（可展开）和错误。
5. **停止**：结束矩阵并关闭浏览器会话；**清空**：只清内存记录；**导出 CSV**：当前 50 条记录（UTF-8 BOM，Excel 可直接打开）。

### 智能体工具

```
doubao_loreal_test({ action: "start" })
doubao_loreal_test({ action: "start", runsPerQuestion: 6 })  // 本次覆盖每条次数
doubao_loreal_test({ action: "resume", recordFile: "C:\\Users\\<你>\\.dsh\\doubao-loreal-test\\records\\run-....jsonl" })
doubao_loreal_test({ action: "status" })
doubao_loreal_test({ action: "stop" })
doubao_loreal_test({ action: "reset" })
```

`resume` 会读取已有的 JSONL，跳过已完成的 `问题#次数`，只补跑缺的条目，并继续追加到同一个文件；
中途停止或浏览器被关闭后不用从头再来。

`start` 立即返回（状态 `starting`），矩阵在 Host 里异步跑；之后用 `status` 看进度，返回的快照与面板一致。

## 命中判定

`lib/doubao.js` 的 `detectBrand`：

- 目标品牌 `欧莱雅`：匹配 `欧莱雅`、`巴黎欧莱雅`、`L'Oréal` / `L’Oréal` / `L Oreal`
- 其他品牌：按配置的字符串精确匹配
- 命中 = 回复里出现至少一个匹配；`matched` 记录实际出现的写法

只做字符串判定，不用大模型，稳定、可解释、离线可测。

## 记录

每次开始测试会新建一个文件（默认目录 `~/.dsh/doubao-loreal-test/records/`）：

- `run-YYYY-MM-DDTHH-MM-SS.jsonl`：一行一次，字段
  `questionId / question / run / reply / hit / matched / at / durationMs / source / error`
- `run-….summary.json`：结束时写，含矩阵配置、按问题汇总和全部记录

面板顶部显示当前记录文件路径；**导出 CSV** 随时可导。

## 自检

```powershell
node test/selftest.mjs
```

覆盖：默认 5 条问题、问题归一化、欧莱雅/巴黎欧莱雅/L'Oréal 命中、兰蔻不命中、
VOM 回复提取、HTML 回复提取、输入框/关闭按钮 ref、登录/下载弹窗识别、CSV 表头与 BOM。

## 已知限制

- **必须先登录豆包**：游客发送会被重定向到 `?from_logout=1`，插件在开始前就会拦截。
- **回复靠 VOM/HTML 解析**：豆包前端改版后，输入框或消息容器选择器可能变化；
  输入框用 `[data-testid=chat_input_input]`，回复优先 `chat_list_wrapper` 的 HTML，其次 `main`。
  改版时改 `index.js` 里的选择器即可。
- **不绕过风控**：连续 30 次提问可能触发验证码/限流；两次之间默认停 3 秒，
  遇到弹窗会停止并保留已有记录。请遵守豆包的使用条款，只做小规模、内部测试。
- **Agent Window 必须保持可交互**：在 Agent Window 里点「停止」会中断任务，插件会记录为「用户停止」。
  中途停止后，已完成的记录仍在 JSONL 里，用 `resume` + `recordFile` 从断点继续，不会覆盖已有回复。
- **BSK 0.4.2 扩展**：`read`/`evaluate --unverified` 需要协议 1.9；本插件不使用它们，所以 1.8 可用。
- 只读取**当前页面已渲染**的回复，不调豆包接口、不破解登录态、不采集账号信息。

## 版本

1.0.0 · MIT
