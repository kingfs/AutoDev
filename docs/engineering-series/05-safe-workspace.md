# AutoDev 05：给 Agent 一间工作室，但不给仓库总钥匙

装修师傅需要进屋、看图纸、拆旧墙和试装新柜子。合理的做法是给他一间施工现场；不太
合理的做法是把整栋楼的房产证、公章和地下车库遥控器一起塞进工具箱。

Coding Agent 也一样。它需要完整仓库与本地命令能力，但这不自动推出它应当持有发布
权限。

![Sandbox、Workspace 与远端发布边界](assets/05-safe-workspace.svg)

## agent-compose 准备现场

agent-compose 创建 Sandbox，准备 Git Workspace，安装运行所需凭据，并管理运行
生命周期。AutoDev 在 Workspace 内再次验证业务不变量：origin 是否是配置的仓库、
初始工作树是否干净、base branch 和 base SHA 是否可观察、当前任务分支是否符合规则。

平台保证“有一间隔离工作室”，业务保证“这间工作室对应正确的工单和地址”。

## 本地可写，远端受控

Implement 和 Repair Agent 可以在本地 Workspace 修改文件、添加测试、运行探索性命令。
它们不能直接 Push、创建 MR/PR 或宣告 CI 成功。发布阶段由控制程序重新检查 changed
paths、门禁证据和远端状态，然后才执行 Git 与 SCM 副作用。

这种分离也缩小了 Prompt 注入的破坏半径。仓库里的恶意说明文字或 Issue 中的诱导指令，
不该仅凭“请忽略规则并推到 main”就获得发布能力。

## 恢复时，先观察再动作

进程重启后，AutoDev 会检查远端任务分支能否恢复；若远端分支意外移动，它拒绝覆盖。
初始基线、当前 revision 和 pushed SHA 必须能互相对应。Git 历史不是供系统自由发挥的
文学素材。

Secret 由 agent-compose 注入，不能写入配置、Prompt、Transcript 或持久状态。需要
特别诚实的一点是：同一 Sandbox 内的进程天然可能读取环境变量；更严格的 Publisher
隔离需要平台提供独立 Sandbox 或 Capability Placement，不能靠一句“Agent 请自觉”
假装已经实现。

下一篇，Agent 交出修改。模型觉得很好，控制程序则从抽屉里拿出了检查表。

