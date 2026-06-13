import { AppError } from "../utils/AppError.js";

export const notFound = (request, _response, next) => {
  next(new AppError(`Route ${request.method} ${request.originalUrl} not found`, 404));
};
