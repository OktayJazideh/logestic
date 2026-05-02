import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  DEV_ADMIN_MOBILE: z.string().optional(),
  DEV_COOP_MOBILE: z.string().optional(),
  DEV_EMPLOYER_MOBILE: z.string().optional(),
  DEV_FLEET_OWNER_MOBILE: z.string().optional(),
  DEV_HOUSEHOLD_MOBILE: z.string().optional(),
  DEV_CONSULTANT_MOBILE: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  DEV_ADMIN_MOBILE: process.env.DEV_ADMIN_MOBILE,
  DEV_COOP_MOBILE: process.env.DEV_COOP_MOBILE,
  DEV_EMPLOYER_MOBILE: process.env.DEV_EMPLOYER_MOBILE,
  DEV_FLEET_OWNER_MOBILE: process.env.DEV_FLEET_OWNER_MOBILE,
  DEV_HOUSEHOLD_MOBILE: process.env.DEV_HOUSEHOLD_MOBILE,
  DEV_CONSULTANT_MOBILE: process.env.DEV_CONSULTANT_MOBILE,
});

