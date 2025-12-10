import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Get the DATABASE_URL environment variable
const dbUrl = env("DATABASE_URL");

// Log the value of DATABASE_URL and its type
console.log("Prisma DATABASE_URL:", dbUrl);
console.log("Type of DATABASE_URL:", typeof dbUrl);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: dbUrl,
  },
});
