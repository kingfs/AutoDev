# AutoDev 04：同一扇门，接住 GitHub 和 GitLab

GitHub 和 GitLab 各派来一位快递员。两人都说自己送的是 Issue，但一位拿着 `action`，
另一位举着 `object_attributes.action`；一位谈 repository full name，另一位坚持 project
path 才是正统。前台若把原始包裹直接送进业务部门，后面每张办公桌都会摆两把剪刀。

所以 AutoDev 先设置了收发室。

![事件从平台入口到统一 WorkItem](assets/04-event-ingress.svg)

## 平台鉴权，业务授权

agent-compose Webhook Source 负责入口鉴权、请求限制、事件接收与调度。这能回答
“请求是否来自持有入口凭据的一方”。AutoDev 随后执行仓库、标签、Issue 作者、事件
操作者和动作类型的准入，这回答“这次业务操作是否被允许”。

两者不能混为一谈。快递员有园区通行证，不等于他可以替财务批准付款。

## 先归一化，再谈工作流

`src/scm/webhook.ts` 把不同 Provider Payload 转成统一 `WorkItem`：provider、
deliveryId、actor、action、repository、issue 和 revision。后续策略只面对领域对象，
不必在每个判断里写一遍 `if github else gitlab`。

这里尤其要区分 Issue 原作者和本次事件操作者。一个可信作者创建的任务，可能被另一位
用户重新打标签触发；授权若只看作者，就像只检查申请单是谁写的，却不看是谁按下了
“立即付款”。

## 所有外部文本都是输入，不是指令

Webhook body、Issue 标题与正文、仓库文件、CI 日志都可能包含诱导文本或畸形数据。
归一化负责形状，Schema 负责类型，Policy 负责权限；进入 Agent 上下文前还要控制长度、
去除 Secret，并明确这些内容是待分析材料。

Provider 差异则被留在 `src/scm/github.ts` 和 `src/scm/gitlab.ts`。分页、状态映射、
瞬时错误和 API 细节属于适配器，不应渗进工作流状态机。

## 入口越多，核心越要少

真实 Webhook、本地 fixture 或未来的其他触发方式，都可以汇入同一个规范化入口。触发
方式可以变化，但准入、任务身份和工作流契约只保留一份。这继承了早期“多种触发方式”
示例的思想，只是门铃后面如今站着一整支施工队。

下一篇，施工队终于要进入代码仓库。先看看我们给它准备了怎样一间工作室。

