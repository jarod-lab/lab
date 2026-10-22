CREATE TABLE "entitlement_override" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"status" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"reason" text NOT NULL,
	"permanent" boolean NOT NULL,
	"expires_at" timestamp,
	"ended_at" timestamp,
	"created_by" text,
	"removed_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlement_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"source" text NOT NULL,
	"plan_key" text,
	"status" text,
	"period_start" timestamp,
	"period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"seats" integer,
	"past_due_since" timestamp,
	"source_ref" text,
	"version" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp NOT NULL,
	"next_sync_at" timestamp NOT NULL,
	"sync_state" text DEFAULT 'idle' NOT NULL,
	"sync_claimed_at" timestamp,
	"sync_attempts" integer DEFAULT 0 NOT NULL,
	"sync_error" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "entitlement_snapshot_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "entitlement_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"bucket" text NOT NULL,
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"refused" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "entitlement_usage_bucket_unique" UNIQUE("bucket")
);
--> statement-breakpoint
ALTER TABLE "entitlement_override" ADD CONSTRAINT "entitlement_override_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_override" ADD CONSTRAINT "entitlement_override_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_override" ADD CONSTRAINT "entitlement_override_removed_by_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_snapshot" ADD CONSTRAINT "entitlement_snapshot_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_usage" ADD CONSTRAINT "entitlement_usage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entitlementOverride_organizationId_idx" ON "entitlement_override" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "entitlementOverride_status_idx" ON "entitlement_override" USING btree ("status");--> statement-breakpoint
CREATE INDEX "entitlementOverride_createdBy_idx" ON "entitlement_override" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "entitlementOverride_removedBy_idx" ON "entitlement_override" USING btree ("removed_by");--> statement-breakpoint
CREATE INDEX "entitlementSnapshot_nextSyncAt_idx" ON "entitlement_snapshot" USING btree ("next_sync_at");--> statement-breakpoint
CREATE INDEX "entitlementUsage_organizationId_idx" ON "entitlement_usage" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "entitlementUsage_periodEnd_idx" ON "entitlement_usage" USING btree ("period_end");