import { AppError } from "../utils/AppError.js";
import { verifyAccessToken } from "../utils/token.js";

export function authenticate(request, _response, next) {
  const authorization = request.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    next(new AppError("Authentication required", 401));
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    next(new AppError("Authentication required", 401));
    return;
  }

  try {
    const payload = verifyAccessToken(token);

    if (typeof payload === "string" || typeof payload.sub !== "string") {
      throw new Error("Token subject is missing");
    }

    request.auth = { userId: payload.sub };
    next();
  } catch {
    next(new AppError("Invalid or expired authentication token", 401));
  }
}

