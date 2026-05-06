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
    title: '多 Agent 协同',
    description: (
      <>
        调度者、策划者、执行者、审核者、提交者六种 Agent 角色各司其职，
        自动完成从需求分析到代码提交的完整流程。
      </>
    ),
  },
  {
    title: '完全本地运行',
    description: (
      <>
        代码不离开你的机器，数据存储在本地。支持 Claude Code、OpenAI Codex 等多种 AI 运行时。
      </>
    ),
  },
  {
    title: 'IDE 级别体验',
    description: (
      <>
        集成 Monaco 代码编辑器、终端、Git 操作、议题管理、频道聊天，
        提供一站式的开发环境体验。
      </>
    ),
  },
  {
    title: '实时通知',
    description: (
      <>
        通过飞书、企业微信接收 Agent 状态通知，支持 Bot 斜杠命令远程操控 Agent。
      </>
    ),
  },
  {
    title: '用量统计',
    description: (
      <>
        内置 Token 消耗追踪和费用估算仪表盘，帮助你掌握 Agent 使用成本。
      </>
    ),
  },
  {
    title: '多服务器支持',
    description: (
      <>
        前端支持配置和切换多个后端服务器实例，轻松管理不同环境的 Agent 服务。
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
