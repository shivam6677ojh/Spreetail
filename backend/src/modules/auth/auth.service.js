import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import { generateAccessToken } from "../../utils/token.js";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
  updatedAt: true,
};

export async function registerUser({ name, email, password }) {
  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
      select: publicUserSelect,
    });

    return createAuthResult(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("An account with this email already exists", 409);
    }

    throw error;
  }
}

export async function loginUser({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError("Invalid email or password", 401);
  }

  return createAuthResult(toPublicUser(user));
}

export async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });

  if (!user) {
    throw new AppError("User account no longer exists", 401);
  }

  return user;
}

function createAuthResult(user) {
  return {
    user,
    token: generateAccessToken(user.id),
  };
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
