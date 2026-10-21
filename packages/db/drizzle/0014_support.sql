CREATE TABLE "support_canned_reply" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"user_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_counter" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" integer NOT NULL,
	CONSTRAINT "support_counter_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "support_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"status" text NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"claimed_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"detail" text,
	"provider_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_message" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"kind" text NOT NULL,
	"author_type" text NOT NULL,
	"user_id" text,
	"author_email" text,
	"author_name" text,
	"body" text NOT NULL,
	"data" jsonb,
	"mentions" jsonb,
	"email_message_id" text,
	"channel" text NOT NULL,
	"verified" boolean NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "support_message_email_message_id_unique" UNIQUE("email_message_id")
);
--> statement-breakpoint
CREATE TABLE "support_ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"priority" text,
	"channel" text NOT NULL,
	"user_id" text,
	"requester_email" text,
	"requester_name" text,
	"organization_id" text,
	"visibility" text NOT NULL,
	"assignee_id" text,
	"rating" text,
	"verified" boolean NOT NULL,
	"merged_into_id" text,
	"reply_token" text NOT NULL,
	"requester_seen_at" timestamp,
	"agent_seen_at" timestamp,
	"last_message_at" timestamp NOT NULL,
	"solved_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "support_ticket_number_unique" UNIQUE("number"),
	CONSTRAINT "support_ticket_reply_token_unique" UNIQUE("reply_token")
);
--> statement-breakpoint
CREATE TABLE "support_ticket_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"tag" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_canned_reply" ADD CONSTRAINT "support_canned_reply_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_delivery" ADD CONSTRAINT "support_delivery_message_id_support_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."support_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_delivery" ADD CONSTRAINT "support_delivery_ticket_id_support_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_ticket_id_support_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_tag" ADD CONSTRAINT "support_ticket_tag_ticket_id_support_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supportCannedReply_userId_idx" ON "support_canned_reply" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "supportDelivery_messageId_idx" ON "support_delivery" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "supportDelivery_ticketId_idx" ON "support_delivery" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "supportDelivery_status_idx" ON "support_delivery" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supportDelivery_scheduledFor_idx" ON "support_delivery" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "supportMessage_ticketId_idx" ON "support_message" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "supportMessage_userId_idx" ON "support_message" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "supportMessage_authorEmail_idx" ON "support_message" USING btree ("author_email");--> statement-breakpoint
CREATE INDEX "supportMessage_createdAt_idx" ON "support_message" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "supportTicket_status_idx" ON "support_ticket" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supportTicket_userId_idx" ON "support_ticket" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "supportTicket_requesterEmail_idx" ON "support_ticket" USING btree ("requester_email");--> statement-breakpoint
CREATE INDEX "supportTicket_organizationId_idx" ON "support_ticket" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "supportTicket_assigneeId_idx" ON "support_ticket" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "supportTicket_mergedIntoId_idx" ON "support_ticket" USING btree ("merged_into_id");--> statement-breakpoint
CREATE INDEX "supportTicket_lastMessageAt_idx" ON "support_ticket" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "supportTicketTag_ticketId_idx" ON "support_ticket_tag" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "supportTicketTag_tag_idx" ON "support_ticket_tag" USING btree ("tag");