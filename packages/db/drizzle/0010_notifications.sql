CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"data" jsonb,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Custom (not in the Drizzle schema, so drizzle-kit never regenerates or drops it): the inbox list
-- and unread count filter by user, then organization, and sort by createdAt. Drizzle's schema can't
-- declare a composite index on the better-auth-generated table.
CREATE INDEX "notification_user_org_created_idx" ON "notification" ("user_id","organization_id","created_at");
--> statement-breakpoint
-- Custom: a notification stamped with an organization is removed with that organization. The
-- better-inbox plugin's schema option can only rename columns, so the reference is added here.
ALTER TABLE "notification" ADD CONSTRAINT "notification_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
