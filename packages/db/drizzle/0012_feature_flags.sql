CREATE TABLE "feature_flag" (
	"key" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"percentage" integer DEFAULT 0 NOT NULL,
	"reclaimed_value" boolean,
	"reclaimed_at" timestamp (3),
	"created_at" timestamp (3) NOT NULL,
	"updated_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flag_exposure_daily" (
	"flag_key" text NOT NULL,
	"day" text NOT NULL,
	"value" boolean NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "feature_flag_exposure_daily_key" UNIQUE("flag_key","day","value")
);
--> statement-breakpoint
CREATE TABLE "feature_flag_target" (
	"organization_id" text NOT NULL,
	"flag_key" text NOT NULL,
	"value" boolean NOT NULL,
	"created_at" timestamp (3) NOT NULL,
	CONSTRAINT "feature_flag_target_org_flag_key" UNIQUE("organization_id","flag_key")
);
--> statement-breakpoint
ALTER TABLE "feature_flag" ADD CONSTRAINT "feature_flag_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_target" ADD CONSTRAINT "feature_flag_target_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_target" ADD CONSTRAINT "feature_flag_target_flag_key_feature_flag_key_fk" FOREIGN KEY ("flag_key") REFERENCES "public"."feature_flag"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feature_flag_organizationId_idx" ON "feature_flag" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "feature_flag_target_flagKey_idx" ON "feature_flag_target" USING btree ("flag_key");