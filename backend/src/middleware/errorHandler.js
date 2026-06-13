import { ZodError } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

export const errorHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        message: "Validation failed",
        details: error.flatten().fieldErrors,
      },
    });
    return;
  }

  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const message = error instanceof AppError ? error.message : "Internal server error";

  if (statusCode === 500 && env.NODE_ENV !== "test") {
    console.error(error);
  }

  response.status(statusCode).json({
    error: {
      message,
      ...(error instanceof AppError && error.details !== undefined
        ? { details: error.details }
        : {}),
      ...(env.NODE_ENV === "development" && error instanceof Error
        ? { stack: error.stack }
        : {}),
    },
  });
};
