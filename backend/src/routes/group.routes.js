import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  addMember,
  create,
  remove,
  removeMember,
  update,
} from "../modules/groups/group.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const groupRouter = Router();

groupRouter.use(authenticate);
groupRouter.post("/", asyncHandler(create));
groupRouter.patch("/:groupId", asyncHandler(update));
groupRouter.delete("/:groupId", asyncHandler(remove));
groupRouter.post("/:groupId/members", asyncHandler(addMember));
groupRouter.delete("/:groupId/members/:userId", asyncHandler(removeMember));

