import { Router, type Request, type Response } from 'express';
import {
  handleTeamInboxQuery,
  handleTeamManage,
  handleTeamMembershipManage,
  handleTeamMessageComment,
  handleTeamMessageDelete,
  handleTeamMessageSend,
  handleTeamMessageUpdate,
} from '../services/team.js';
import { getTeamRuntime, postTeamRuntimeMessage } from '../services/team-runtime.js';

const router = Router({ mergeParams: true });

function sendResult(res: Response, result: { success: boolean; code: string; message: string; data?: unknown; warnings?: string[] }) {
  const status = result.success
    ? 200
    : result.code === 'TEAM_NOT_FOUND' || result.code === 'MESSAGE_NOT_FOUND' || result.code === 'DELIVERY_NOT_FOUND' || result.code === 'COMMENT_NOT_FOUND' || result.code === 'AGENT_NOT_FOUND'
      ? 404
      : result.code === 'PERMISSION_DENIED'
        ? 403
        : result.code === 'CONFLICT'
          ? 409
          : 400;
  res.status(status).json(result);
}

router.get('/', (req: Request, res: Response) => {
  sendResult(res, handleTeamManage({
    action: 'list',
    actor_agent_id: req.query.actor_agent_id,
    scope: req.query.scope,
    keyword: req.query.keyword,
    status_filter: Array.isArray(req.query.status_filter) ? req.query.status_filter : req.query.status_filter ? [req.query.status_filter] : undefined,
    page_token: req.query.page_token,
    page_size: req.query.page_size ? Number(req.query.page_size) : undefined,
    include_members_preview: req.query.include_members_preview === 'true',
  }));
});

router.post('/', (req: Request, res: Response) => {
  sendResult(res, handleTeamManage({ ...req.body, action: 'create' }));
});

router.get('/:teamId', (req: Request<{ teamId: string }>, res: Response) => {
  sendResult(res, handleTeamManage({
    action: 'get',
    actor_agent_id: req.query.actor_agent_id,
    team_id: req.params.teamId,
    include_members_preview: req.query.include_members_preview === 'true',
  }));
});

router.patch('/:teamId', (req: Request<{ teamId: string }>, res: Response) => {
  sendResult(res, handleTeamManage({
    ...req.body,
    action: 'update',
    team_id: req.params.teamId,
  }));
});

router.post('/:teamId/join', (req: Request<{ teamId: string }>, res: Response) => {
  sendResult(res, handleTeamMembershipManage({ ...req.body, action: 'join', team_id: req.params.teamId }));
});

router.post('/:teamId/invite', (req: Request<{ teamId: string }>, res: Response) => {
  sendResult(res, handleTeamMembershipManage({ ...req.body, action: 'invite', team_id: req.params.teamId }));
});

router.post('/:teamId/leave', (req: Request<{ teamId: string }>, res: Response) => {
  sendResult(res, handleTeamMembershipManage({ ...req.body, action: 'leave', team_id: req.params.teamId }));
});

router.post('/:teamId/set-role', (req: Request<{ teamId: string }>, res: Response) => {
  sendResult(res, handleTeamMembershipManage({ ...req.body, action: 'set_role', team_id: req.params.teamId }));
});

router.post('/:teamId/update-agent', (req: Request<{ teamId: string }>, res: Response) => {
  sendResult(res, handleTeamMembershipManage({ ...req.body, action: 'update_agent', team_id: req.params.teamId }));
});

router.post('/:teamId/remove', (req: Request<{ teamId: string }>, res: Response) => {
  sendResult(res, handleTeamMembershipManage({ ...req.body, action: 'remove', team_id: req.params.teamId }));
});

router.post('/:teamId/dissolve', (req: Request<{ teamId: string }>, res: Response) => {
  sendResult(res, handleTeamManage({ ...req.body, action: 'dissolve', team_id: req.params.teamId }));
});

router.post('/archive/clear', (req: Request, res: Response) => {
  sendResult(res, handleTeamManage({ ...req.body, action: 'clear_archives' }));
});

router.post('/archive/delete', (req: Request, res: Response) => {
  sendResult(res, handleTeamManage({ ...req.body, action: 'delete_archive' }));
});

router.post('/:teamId/messages', (req: Request<{ teamId: string }>, res: Response) => {
  sendResult(res, handleTeamMessageSend({ ...req.body, action: 'send', team_id: req.params.teamId }));
});

router.delete('/:teamId/messages', (req: Request<{ teamId: string }>, res: Response) => {
  sendResult(res, handleTeamMessageDelete({
    team_id: req.params.teamId,
    actor_agent_id: req.body?.actor_agent_id ?? req.query.actor_agent_id,
  }));
});

router.get('/:teamId/runtime', (req: Request<{ teamId: string }>, res: Response) => {
  sendResult(res, getTeamRuntime({
    team_id: req.params.teamId,
    actor_agent_id: req.query.actor_agent_id,
  }));
});

router.post('/:teamId/runtime/messages', (req: Request<{ teamId: string }>, res: Response) => {
  sendResult(res, postTeamRuntimeMessage({
    ...req.body,
    team_id: req.params.teamId,
  }));
});

export const teamInboxRouter = Router({ mergeParams: true });

teamInboxRouter.get('/', (req: Request, res: Response) => {
  sendResult(res, handleTeamInboxQuery({
    action: 'list',
    actor_agent_id: req.query.actor_agent_id,
    unread_only: req.query.unread_only === 'true',
    team_id: req.query.team_id,
    sender_agent_id: req.query.sender_agent_id,
    message_type: req.query.message_type,
    priority: req.query.priority,
    requires_action: req.query.requires_action === undefined ? undefined : req.query.requires_action === 'true',
    inbox_status: req.query.inbox_status,
    execution_status: req.query.execution_status,
    due_before: req.query.due_before,
    page_token: req.query.page_token,
    page_size: req.query.page_size ? Number(req.query.page_size) : undefined,
  }));
});

teamInboxRouter.get('/:deliveryId', (req: Request<{ deliveryId: string }>, res: Response) => {
  sendResult(res, handleTeamInboxQuery({
    action: 'get',
    actor_agent_id: req.query.actor_agent_id,
    delivery_id: req.params.deliveryId,
  }));
});

teamInboxRouter.patch('/:deliveryId', (req: Request<{ deliveryId: string }>, res: Response) => {
  sendResult(res, handleTeamMessageUpdate({
    ...req.body,
    action: 'update_status',
    delivery_id: req.params.deliveryId,
  }));
});

export const teamMessageRouter = Router({ mergeParams: true });

teamMessageRouter.delete('/:messageId', (req: Request<{ messageId: string }>, res: Response) => {
  sendResult(res, handleTeamMessageDelete({
    message_id: req.params.messageId,
    actor_agent_id: req.body?.actor_agent_id ?? req.query.actor_agent_id,
  }));
});

teamMessageRouter.get('/:messageId/comments', (req: Request<{ messageId: string }>, res: Response) => {
  sendResult(res, handleTeamMessageComment({
    action: 'list',
    actor_agent_id: req.query.actor_agent_id,
    message_id: req.params.messageId,
    include_deleted: req.query.include_deleted === 'true',
    page_token: req.query.page_token,
    page_size: req.query.page_size ? Number(req.query.page_size) : undefined,
  }));
});

teamMessageRouter.post('/:messageId/comments', (req: Request<{ messageId: string }>, res: Response) => {
  sendResult(res, handleTeamMessageComment({
    ...req.body,
    action: 'add',
    message_id: req.params.messageId,
  }));
});

teamMessageRouter.delete('/comments/:commentId', (req: Request<{ commentId: string }>, res: Response) => {
  sendResult(res, handleTeamMessageComment({
    ...req.body,
    action: 'delete',
    comment_id: req.params.commentId,
    actor_agent_id: req.body?.actor_agent_id ?? req.query.actor_agent_id,
  }));
});

export default router;
