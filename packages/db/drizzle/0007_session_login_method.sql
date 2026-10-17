ALTER TABLE "session" ADD COLUMN "login_method" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "login_two_factor" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "two_factor_enabled_at" timestamp;