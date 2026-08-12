# AutoDev 01：当一个 Agent 不再是一段脚本

小周第一次写 Agent 时，桌面上只有三样东西：一份提示词、一个 YAML 文件，以及
一种“下午就能交付”的乐观。Agent 收到问题，认真回答，故事到这里本应出现片尾字幕。

两周后，需求多了几个朴素的词：自动接 Issue、修改仓库、运行测试、创建 MR、等待
CI、失败后再修一次。小周的 YAML 越长，提示词越像员工手册，JavaScript 则开始
兼职状态机、权限系统和遗言保管员。大家终于承认：这已经不是“一次 Agent 调用”，
而是一套运行程序。

![简单调用如何长成工程系统](assets/01-system-growth.svg)

## 复杂，不等于多写几段 Prompt

AutoDev 接收 GitHub 或 GitLab Issue，让 Coding Agent 完成计划、实现、审查和
修复，再由确定性程序执行门禁、Git、SCM 和 CI 操作。它比简单示例多出来的，不只是
文件数量，而是四种工程压力：流程会持续很久，外部系统会失败，副作用不能重复，输入
和模型输出都不可信。

于是代码按职责分开：`src/runtime` 只管调用 Agent；`src/controller` 协调工作流；
`src/policies` 作准入和门禁判断；`src/state` 保存状态、租约与 revision；`src/scm`
隔离 GitHub/GitLab；`src/stages` 只协调一个阶段。目录不是为了显得项目成熟，它们是
防止“顺手”——尤其是防止在 Prompt 旁边顺手放一个 Push。

## 平台搭舞台，业务决定演什么

`agent-compose.yml` 仍然重要，但它不再承载全部故事。agent-compose 提供 Webhook
入口、Scheduler、Sandbox、Git Workspace、Agent/LLM Runtime、Secret、Volume
和运行生命周期。AutoDev 使用这些设施，定义“一个 Issue 如何变成经过验证的代码
变更提案”。

这条分界线非常实用：若是“怎样创建隔离 Sandbox”，答案应在平台；若是“哪些标签
允许启动自动开发”，答案应在 AutoDev。把后者塞进平台会污染通用能力，把前者重写
在业务里则会得到第二套不完整的 Runtime。

## YAML 变薄，系统反而更完整

AutoDev 的 `agent-compose.yml` 主要描述运行资源和入口：构建哪张镜像、挂载哪个
Workspace、把状态卷放在哪里、注入哪些 Secret、监听哪些事件。Scheduler 收到事件
后运行 AutoDev 控制器，复杂业务留在可类型检查、可测试的 TypeScript 中。

这不是嫌弃 YAML。YAML 很擅长描述“有什么”，不擅长独自回答“第七步失败、远端分支
同时移动、进程重启以后怎么办”。让每种工具做它擅长的工作，也是一种礼貌。

## 本篇带走什么

复杂 Agent 工程的第一步不是增加 Agent 数量，而是承认自己正在建设一个系统。先分清
运行平台与业务控制器，再谈提示词、模型和技能，后面的状态、安全与恢复才有地方落脚。

下一篇，我们去见 AutoDev 最重要的两位同事：一位很会思考，另一位只认证据。

