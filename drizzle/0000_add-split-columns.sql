CREATE TYPE "public"."role" AS ENUM('ADMIN', 'INSPECTOR');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"prev" text,
	"next" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"work_day_id" integer NOT NULL,
	"inspector_id" integer NOT NULL,
	"count_small" integer DEFAULT 0 NOT NULL,
	"count_large" integer DEFAULT 0 NOT NULL,
	"count_coupled" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"applicant_name" varchar(191) NOT NULL,
	"month" varchar(7) NOT NULL,
	"planned_count" integer NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" varchar(191) NOT NULL,
	"name" varchar(191) NOT NULL,
	"email" varchar(191) NOT NULL,
	"role" "role" DEFAULT 'INSPECTOR' NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "work_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;