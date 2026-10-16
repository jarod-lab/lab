CREATE TABLE "agent" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"autonomy" text DEFAULT 'ask_first' NOT NULL,
	"always_ask_external_post" boolean DEFAULT true NOT NULL,
	"always_ask_merge_or_deploy" boolean DEFAULT true NOT NULL,
	"always_ask_over_energy_budget" boolean DEFAULT true NOT NULL,
	"energy_budget_wh" double precision,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"run_id" text NOT NULL,
	"step_id" text,
	"action" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp (3) DEFAULT now() NOT NULL,
	"decided_by" text,
	"decided_at" timestamp (3),
	"effective_at" timestamp (3),
	"undone_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"summary" text,
	"started_by_type" text,
	"started_by_id" text,
	"started_at" timestamp (3),
	"finished_at" timestamp (3),
	"deferred_until" timestamp (3),
	"energy_wh" double precision DEFAULT 0 NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL,
	"tool_calls" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_step" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"run_id" text NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress_done" integer,
	"progress_total" integer,
	"started_at" timestamp (3),
	"finished_at" timestamp (3),
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "run_step_run_position_key" UNIQUE("run_id","position")
);
--> statement-breakpoint
CREATE TABLE "steer_message" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"run_id" text NOT NULL,
	"body" text NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_step_id_run_step_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."run_step"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_step" ADD CONSTRAINT "run_step_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_step" ADD CONSTRAINT "run_step_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steer_message" ADD CONSTRAINT "steer_message_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steer_message" ADD CONSTRAINT "steer_message_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_organizationId_idx" ON "agent" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "approval_run_idx" ON "approval" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "approval_organizationId_status_idx" ON "approval" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "run_organizationId_createdAt_idx" ON "run" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "run_agentId_idx" ON "run" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "run_step_organizationId_idx" ON "run_step" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "steer_message_run_created_idx" ON "steer_message" USING btree ("run_id","created_at");