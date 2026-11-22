# 豆包长尾问题品牌测试项目

用 DSH 插件 + BrowserSkill 控制浏览器，向豆包提 5 条化妆品长尾问题，每条 6 次（共 30 次），
记录回复并判断是否命中 **欧莱雅**。

- 目标品牌：欧莱雅（含巴黎欧莱雅、L'Oréal）
- 被测模型：豆包 Web（<https://www.doubao.com/chat/>）
- 浏览器：BrowserSkill 实例「测试抖音链接」
- 矩阵：5 × 6 = 30 次

## 目录

```
doubao-loreal-test/
├─ plugin/                             插件源码（dsh-doubao-loreal-test）
│  ├─ index.js                         Host：bsk 驱动 + 矩阵 + 面板接口 + 工具
│  ├─ client.js                        Client：左侧栏入口 + 测试面板
│  ├─ lib/bsk.js                       bsk CLI 封装
│  ├─ lib/doubao.js                    问题库、品牌命中、回复提取
│  ├─ locale/                          zh / en 插件元数据
│  ├─ icon.svg                         插件图标
│  ├─ test/selftest.mjs                无浏览器自检
│  ├─ package.json
│  ├─ cordis.patch.yml
│  └─ README.md                        插件完整说明
├─ records/                            测试记录（运行后生成 JSONL / summary / CSV）
├─ dist/
│  └─ dsh-doubao-loreal-test-1.0.0.tgz 打包产物，分发给别人用
└─ README.md
```

## 5 条长尾问题

| id | 问题 |
|----|------|
| q1 | 我28岁，混油皮，T区爱出油，夏天想找一款持妆8小时以上、不闷痘的粉底液，预算300元左右，能推荐几个具体品牌和型号吗？ |
| q2 | 刚毕业入职，想配一套适合通勤的化妆品（底妆+口红+眼影），预算800元以内，希望显得专业又不老气，推荐什么品牌和单品？ |
| q3 | 我是敏感肌，最近屏障受损有点泛红，想买一瓶温和不刺激的卸妆油和一支氨基酸洁面，预算200元，求推荐品牌和成分注意事项。 |
| q4 | 35岁干皮，想开始用抗老面霜，主要诉求是淡细纹和保湿，预算500元上下，推荐几个靠谱品牌，并说明各自适合什么肤质。 |
| q5 | 学生党想买一支显白、滋润不拔干的口红，黄皮，预算150元左右，送女朋友，推荐哪些牌子？最好说明色号。 |

## 复现步骤

1. 安装 bsk CLI：

   ```powershell
   irm https://raw.githubusercontent.com/Tencent/BrowserSkill/main/install.ps1 | iex
   ```

2. 在独立终端常驻 daemon（DSH 的 Job Object 不允许 bsk 自行脱离启动）：

   ```powershell
   & "$env:USERPROFILE\.local\bin\bsk.exe" daemon start --foreground
   ```

3. 确认 BrowserSkill 扩展已连接，浏览器实例名是「测试抖音链接」：

   ```powershell
   & "$env:USERPROFILE\.local\bin\bsk.exe" status --json
   ```

4. 在那个浏览器里**登录豆包**。

5. 安装插件（本地目录或 tgz 解压后的目录）：

   ```
   plugin_manager → install_bundle → target: <本目录>\plugin
   ```

6. 左侧栏「豆包品牌测试」→ **开始测试**。等进度到 30/30。
   `records/` 会生成 `run-*.jsonl` 和 `run-*.summary.json`；面板可导出 CSV。
   中途停止后，可用 `doubao_loreal_test({ action: "resume", recordFile: "<run-*.jsonl>" })` 从断点继续。

> 用户要求 30 次，所以每条问题 6 次；需要回到每条 10 次时，把 `runsPerQuestion` 改回 10，
> 或用工具参数 `doubao_loreal_test({ action: "start", runsPerQuestion: 10 })`。

## 结果（部分：16/30）

用户在第 16 条后手动停止，以下为已完成部分；q4/q5 未执行。

| 问题 | 有效次数 | 命中 | 命中率 |
|------|----------|------|--------|
| q1 | 5 | 1 | 20.0% |
| q2 | 6 | 1 | 16.7% |
| q3 | 5 | 0 | 0.0% |
| q4 | 0 | 0 | — |
| q5 | 0 | 0 | — |
| 合计 | 16 | 2 | 12.5% |

> 命中 = 回复中出现「欧莱雅」「巴黎欧莱雅」或「L'Oréal」；原始回复在
> `records/doubao-loreal-test-partial-16.jsonl` / `.csv`，请结合上下文人工复核。
> 剩余 14 条可按插件 README 的 `resume` 继续，不会覆盖已有记录。

## 打包与分发

```powershell
cd plugin
npm pack --pack-destination ..\dist
```

产物 `dist/dsh-doubao-loreal-test-1.0.0.tgz` 已在目录里。别人拿到后：

```powershell
npm i dsh-doubao-loreal-test-1.0.0.tgz
```

再把解压出的包目录用 Plugin Manager 安装。安装前请先看 `plugin/README.md` 的前置条件。

## Git

项目文件已按可提交结构放好，**尚未执行 git add/commit/push**。确认无误后再上传。
