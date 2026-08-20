CREATE INDEX "event_attendees_event_id_idx" ON "event_attendees" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_attendees_contact_id_idx" ON "event_attendees" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "events_org_id_idx" ON "events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "events_deleted_at_idx" ON "events" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "volunteer_hours_org_id_idx" ON "volunteer_hours" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "volunteer_hours_contact_id_idx" ON "volunteer_hours" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "volunteer_hours_event_id_idx" ON "volunteer_hours" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "volunteer_hours_deleted_at_idx" ON "volunteer_hours" USING btree ("deleted_at");