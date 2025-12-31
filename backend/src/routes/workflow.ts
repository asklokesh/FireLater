// Add validation for approval workflow edge cases
function validateApprovalRequest(request: FastifyRequest): void {
  const { action, comment } = request.body as { action: string; comment?: string };
  
  if (!action) {
    throw new BadRequestError('Approval action is required');
  }
  
  if (!['approve', 'reject', 'cancel'].includes(action)) {
    throw new BadRequestError('Invalid approval action. Must be approve, reject, or cancel');
  }
  
  if (comment && comment.length > 1000) {
    throw new BadRequestError('Comment must be less than 1000 characters');
  }
}

// In the approval route handler, add edge case validations:
// Check if workflow exists and is active
const workflow = await workflowService.getById(tenantSlug, workflowId);
if (!workflow) {
  throw new NotFoundError('Workflow not found');
}

if (!workflow.isActive) {
  throw new BadRequestError('Cannot approve inactive workflow');
}

// Check if user has permission to approve this workflow
const hasPermission = await workflowService.canUserApprove(tenantSlug, workflowId, request.user.id);
if (!hasPermission) {
  throw new ForbiddenError('User does not have permission to approve this workflow');
}

// Check if workflow is in approvable state
if (workflow.status !== 'pending_approval') {
  throw new BadRequestError(`Workflow is in ${workflow.status} state and cannot be approved`);
}