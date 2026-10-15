CREATE TABLE "audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"at" timestamp (3) NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"client_id" text,
	"operation" text NOT NULL,
	"outcome" text NOT NULL,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"operation" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text NOT NULL,
	"response" jsonb,
	"created_at" timestamp (3) NOT NULL,
	"expires_at" timestamp (3) NOT NULL,
	CONSTRAINT "idempotency_key_org_key_key" UNIQUE("organization_id","key")
);
--> statement-breakpoint
CREATE TABLE "signup_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"ip" text NOT NULL,
	"email_domain" text NOT NULL,
	"created_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_daily" (
	"organization_id" text NOT NULL,
	"day" text NOT NULL,
	"operation" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_daily_org_day_op_key" UNIQUE("organization_id","day","operation")
);
--> statement-breakpoint
CREATE TABLE "device_code" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"expires_at" timestamp NOT NULL,
	"status" text NOT NULL,
	"last_polled_at" timestamp,
	"polling_interval" integer,
	"client_id" text,
	"scope" text,
	"resources" text[],
	"oauth_client_id" text
);
--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_org_at_idx" ON "audit_event" USING btree ("organization_id","at","id");--> statement-breakpoint
CREATE INDEX "idempotency_key_expiresAt_idx" ON "idempotency_key" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "signup_attempt_ip_createdAt_idx" ON "signup_attempt" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "signup_attempt_domain_createdAt_idx" ON "signup_attempt" USING btree ("email_domain","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deviceCode_deviceCode_uidx" ON "device_code" USING btree ("device_code");--> statement-breakpoint
CREATE UNIQUE INDEX "deviceCode_userCode_uidx" ON "device_code" USING btree ("user_code");