import { Router, type Request, type Response } from 'express';
import {
  handleTeamInboxQuery,
  handleTeamManage,
  handleTeamMembershipManage,
  handleTeamMessageComment,
  handleTeamMessageSend,
  handleTeamMessageUpdate,
} from '../services/team.js';

const router = Router({ mergeParams: true });

function sendResult(res: Response, result: { success: boolean; code: string; message: string; data?: unknown; warnings?: string[] }) {
  const status = result.success
    ? 200
    : result.code === 'TEAM_NOT_FOUND' || result.code === 'MESSAGE_NOT_FOUND' || result.code === 'DELIVERY_NOT_FOUND' || result.code === 'COMMENT_NOT_FOUND'
      ? 404
      : result.code === 'PERMISSION_DENIED'
        ? 403
        : result.code === 'CONFLICT'
          ? 409
          : 400;
  res.status(status).json(result);
}

router.get('/', (req: Request<{ id: string }>, res: Response) => {
  sendResult(res, handleTeamManage(req.params.id, {
    action: 'list',
    actor_agent_id: req.query.actor_agent_id,
    scope: req.query.scope,
    keyword: req.query.keyword,
    status_filter: Array.isArray(req.query.status_filter) ? req.query.status_filter : req.query.status_filter ? [req.query.status_filter] : undefined,
    page_token: req.query.page_token,
    page_size: req.query.page_size ? Number(req.query.page_size) : undefined,
  }));
});

router.post('/', (req: Request<{ id: string }>, res: Response) => {
  sendResult(res, handleTeamManage(req.params.id, { ...req.body, action: 'create' }));
});

router.get('/:teamId', (req: Request<{ id: string; teamId: string }>, res: Response) => {
  sendResult(res, handleTeamManage(req.params.id, {
    action: 'get',
    actor_agent_id: req.query.actor_agent_id,
    team_id: req.params.teamId,
    include_members_preview: req.query.include_members_preview === 'true',
  }));
});

router.post('/:teamId/join', (req: Request<{ id: string; teamId: string }>, res: Response) => {
  sendResult(res, handleTeamMembershipManage(req.params.id, { ...req.body, action: 'join', team_id: req.params.teamId }));
});

router.post('/:teamId/leave', (req: Request<{ id: string; teamId: string }>, res: Response) => {
  sendResult(res, handleTeamMembershipManage(req.params.id, { ...req.body, action: 'leave', team_id: req.params.teamId }));
});

router.post('/:teamId/dissolve', (req: Request<{ id: string; teamId: string }>, res: Response) => {
  sendResult(res, handleTeamManage(req.params.id, { ...req.body, action: 'dissolve', team_id: req.params.teamId }));
});

router.post('/:teamId/messages', (req: Request<{ id: string; teamId: string }>, res: Response) => {
  sendResult(res, handleTeamMessageSend(req.params.id, { ...req.body, action: 'send', team_id: req.params.teamId }));
});

export const teamInboxRouter = Router({ mergeParams: true });

teamInboxRouter.get('/', (req: Request<{ id: string }>, res: Response) => {
  sendResult(res, handleTeamInboxQuery(req.params.id, {
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

teamInboxRouter.get('/:deliveryId', (req: Request<{ id: string; deliveryId: string }>, res: Response) => {
  sendResult(res, handleTeamInboxQuery(req.params.id, {
    action: 'get',
    actor_agent_id: req.query.actor_agent_id,
    delivery_id: req.params.deliveryId,
  }));
});

teamInboxRouter.patch('/:deliveryId', (req: Request<{ id: string; deliveryId: string }>, res: Response) => {
  sendResult(res, handleTeamMessageUpdate(req.params.id, {
    ...req.body,
    action: 'update_status',
    delivery_id: req.params.deliveryId,
  }));
});

export const teamMessageRouter = Router({ mergeParams: true });

teamMessageRouter.get('/:messageId/comments', (req: Request<{ id: string; messageId: string }>, res: Response) => {
  sendResult(res, handleTeamMessageComment(req.params.id, {
    action: 'list',
    actor_agent_id: req.query.actor_agent_id,
    message_id: req.params.messageId,
    include_deleted: req.query.include_deleted === 'true',
    page_token: req.query.page_token,
    page_size: req.query.page_size ? Number(req.query.page_size) : undefined,
  }));
});

teamMessageRouter.post('/:messageId/comments', (req: Request<{ id: string; messageId: string }>, res: Response) => {
  sendResult(res, handleTeamMessageComment(req.params.id, {
    ...req.body,
    action: 'add',
    message_id: req.params.messageId,
  }));
});

teamMessageRouter.delete('/comments/:commentId', (req: Request<{ id: string; commentId: string }>, res: Response) => {
  sendResult(res, handleTeamMessageComment(req.params.id, {
    ...req.body,
    action: 'delete',
    comment_id: req.params.commentId,
    actor_agent_id: req.body?.actor_agent_id ?? req.query.actor_agent_id,
  }));
});

export default router;
