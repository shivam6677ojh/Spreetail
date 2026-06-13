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
