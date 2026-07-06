import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: '可视化工作流引擎',
    description: (
      <>
        基于 @xyflow/react 的 DAG 编辑器，拖拽 40+ 内置节点（流程控制 / AI / 交互 / 展示 /
        数据库 / 知识库 / Mini App / 插件），把重复的 AI 任务沉淀成可复用的自动化流程。
      </>
    ),
  },
  {
    title: '多种触发与执行形态',
    description: (
      <>
        工作流可由 cron 定时、Webhook、HTTP API（SSE 流式）、Issue 事件、Agent 工具调用触发，
        支持断点调试、暂停恢复、断线快照恢复，以及嵌套子流程与循环复合节点。
      </>
    ),
  },
  {
    title: '六种 AI 运行时',
    description: (
      <>
        Claude Code、OpenAI Codex、LangChain、Open Agent SDK、Hermes、Oh-My-Pi 六种 Agent 运行时，
        一键发现/安装/更新本地 CLI 与 SDK，按需切换。
      </>
    ),
  },
  {
    title: 'Mini App 交互节点',
    description: (
      <>
        独立的轻量 React/HTML 应用子系统，可单独运行，也可通过 show_miniapp 节点嵌入工作流，
        阻塞收集用户提交数据，实现人机协同自动化。
      </>
    ),
  },
  {
    title: '完全本地运行',
    description: (
      <>
        代码不离开你的机器，数据存储在本地（JSON 文件 + SQLite，无需外部数据库），
        Secret Key + Bearer Token 认证，安全可控。
      </>
    ),
  },
  {
    title: 'IDE 级前端 + 多端客户端',
    description: (
      <>
        Monaco 代码编辑器（TypeScript LSP）、终端、Git、飞书/企微 Bot 通知、用量仪表盘，
        Web + Electron 桌面端 + Flutter 移动端全覆盖。
      </>
    ),
  },
];

function Feature({title, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md padding-vert--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
