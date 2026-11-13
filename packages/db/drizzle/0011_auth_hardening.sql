CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "source" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauthConsent_grant_idx" ON "oauth_consent" USING btree ("client_id","reference_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_grant_idx" ON "oauth_refresh_token" USING btree ("client_id","reference_id","user_id","revoked","expires_at");