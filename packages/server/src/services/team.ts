/**
 * Team 服务入口（barrel）。
 *
 * 原始实现已按职责拆分到以下文件，本文件仅做重新导出，
 * 以保持对外 import 路径 `../services/team.js` 与全部导出符号不变：
 *   - team-types.ts       领域类型与 TeamServiceResult
 *   - team-internal.ts    存储层 / 工具函数 / 视图投影 / 权限校验 / agent 来源解析
 *   - team-manage.ts      handleTeamManage（团队 CRUD + 归档）
 *   - team-membership.ts  handleTeamMembershipManage（成员生命周期）
 *   - team-message.ts     handleTeamMessageSend / Update / Delete / Comment
 *   - team-inbox.ts       handleTeamInboxQuery / handleTeamInboxDelete
 */
export type { TeamServiceResult } from './team-types.js';
export { resolveTeamAgentSource } from './team-internal.js';
export { handleTeamManage } from './team-manage.js';
export { handleTeamMembershipManage } from './team-membership.js';
export {
  handleTeamMessageSend,
  handleTeamMessageUpdate,
  handleTeamMessageDelete,
  handleTeamMessageComment,
} from './team-message.js';
export {
  handleTeamInboxQuery,
  handleTeamInboxDelete,
} from './team-inbox.js';
