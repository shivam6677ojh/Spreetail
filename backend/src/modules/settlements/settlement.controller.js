import { createSettlementSchema } from "./settlement.schemas.js";
import { createSettlement as serviceCreate, listSettlements as serviceList } from "./settlement.service.js";

export async function create(request, response) {
  const { groupId } = request.params;
  const input = createSettlementSchema.parse(request.body);
  
  const settlement = await serviceCreate(groupId, request.auth.userId, input);
  
  response.status(201).json({
    status: "success",
    data: { settlement },
  });
}

export async function list(request, response) {
  const { groupId } = request.params;
  
  const settlements = await serviceList(groupId, request.auth.userId);
  
  response.status(200).json({
    status: "success",
    data: { settlements },
  });
}
