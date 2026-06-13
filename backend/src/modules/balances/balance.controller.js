import { calculateGroupBalances } from "./balance.service.js";

export async function getBalances(request, response) {
  const { groupId } = request.params;
  const data = await calculateGroupBalances(groupId, request.auth.userId);

  response.status(200).json({
    status: "success",
    data,
  });
}
