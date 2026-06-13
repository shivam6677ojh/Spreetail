# Spreetail Shared Expense App

A JavaScript ES modules foundation for a Splitwise-like shared expense application.

## Stack

- Frontend: React, Vite, React Router, Axios, Tailwind CSS
- Backend: Node.js, Express, Prisma, PostgreSQL, JWT, bcrypt

## Local setup

Requirements: Node.js 20+ and Docker.

```bash
docker compose up -d

cd backend
npm install
npm run prisma:migrate -- --name init
npm run dev
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173` and the API at
`http://localhost:4000/api`. Copy each `.env.example` when configuring a new
environment and never use the development JWT secret in production.

## Database design

The normalized PostgreSQL schema contains users, groups, membership history,
expenses, expense participants, settlements, imports, and import anomalies.
Application fields use camelCase while database tables and columns use
snake_case.

`group_members` stores membership intervals with `joined_at` and `left_at`.
Users can leave and later rejoin a group while retaining history, and a partial
unique index prevents more than one active membership per user and group.
Database checks enforce valid intervals, positive monetary values, distinct
settlement parties, and valid import counters.

Apply committed migrations with:

```bash
cd backend
npx prisma migrate deploy
```

## Authentication API

- `POST /api/auth/register` accepts `name`, `email`, and `password`.
- `POST /api/auth/login` accepts `email` and `password`.
- `GET /api/auth/me` requires an `Authorization: Bearer <token>` header.

Passwords are hashed with bcrypt and never returned by the API. Access tokens
are signed JWTs configured by `JWT_SECRET` and `JWT_EXPIRES_IN`.

## Group management API

All group routes require an `Authorization: Bearer <token>` header.

- `POST /api/groups` creates a group and adds its creator as an admin.
- `PATCH /api/groups/:groupId` edits a group as an active admin.
- `DELETE /api/groups/:groupId` deletes a group as its creator.
- `POST /api/groups/:groupId/members` adds a registered user by email and
  accepts an optional `joinedAt`.
- `DELETE /api/groups/:groupId/members/:userId` removes an active member by
  recording `leftAt`; it never deletes membership history.

## Verification

```bash
cd backend
npm run lint
npm test
npm run build

cd ../frontend
npm run lint
npm run build
```
