import { getCurrentUser, loginUser, registerUser } from "./auth.service.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";

export async function register(request, response) {
  const input = registerSchema.parse(request.body);
  const result = await registerUser(input);

  response.status(201).json({ data: result });
}

export async function login(request, response) {
  const input = loginSchema.parse(request.body);
  const result = await loginUser(input);

  response.status(200).json({ data: result });
}

export async function currentUser(request, response) {
  const user = await getCurrentUser(request.auth.userId);

  response.status(200).json({ data: { user } });
}

