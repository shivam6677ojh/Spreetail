import {
  addGroupMember,
  createGroup,
  deleteGroup,
  listUserGroups,
  removeGroupMember,
  updateGroup,
} from "./group.service.js";
import {
  addMemberSchema,
  createGroupSchema,
  groupIdParamsSchema,
  memberParamsSchema,
  removeMemberSchema,
  updateGroupSchema,
} from "./group.schemas.js";

export async function list(request, response) {
  const groups = await listUserGroups(request.auth.userId);
  response.status(200).json({ data: { groups } });
}

export async function create(request, response) {
  const input = createGroupSchema.parse(request.body);
  const group = await createGroup(request.auth.userId, input);

  response.status(201).json({ data: { group } });
}

export async function update(request, response) {
  const { groupId } = groupIdParamsSchema.parse(request.params);
  const input = updateGroupSchema.parse(request.body);
  const group = await updateGroup(groupId, request.auth.userId, input);

  response.status(200).json({ data: { group } });
}

export async function remove(request, response) {
  const { groupId } = groupIdParamsSchema.parse(request.params);
  await deleteGroup(groupId, request.auth.userId);

  response.status(204).send();
}

export async function addMember(request, response) {
  const { groupId } = groupIdParamsSchema.parse(request.params);
  const input = addMemberSchema.parse(request.body);
  const membership = await addGroupMember(groupId, request.auth.userId, input);

  response.status(201).json({ data: { membership } });
}

export async function removeMember(request, response) {
  const { groupId, userId } = memberParamsSchema.parse(request.params);
  const input = removeMemberSchema.parse(request.body);
  const membership = await removeGroupMember(groupId, userId, request.auth.userId, input);

  response.status(200).json({ data: { membership } });
}

