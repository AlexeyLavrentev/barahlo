CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text,
	`byte_size` integer,
	`kind` text DEFAULT 'photo' NOT NULL,
	`storage_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_name_uq` ON `departments` (`name`);--> statement-breakpoint
CREATE TABLE `device_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_types_key_uq` ON `device_types` (`key`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type_key` text NOT NULL,
	`model` text NOT NULL,
	`serial_number` text NOT NULL,
	`serial_normalized` text NOT NULL,
	`inventory_number` text,
	`inventory_normalized` text,
	`status` text DEFAULT 'in_stock' NOT NULL,
	`current_employee_id` integer,
	`purchase_date` integer,
	`purchase_price` integer,
	`supplier` text,
	`warranty_until` integer,
	`notes` text,
	`ram_gb` integer,
	`ram_upgraded` integer,
	`ssd_gb` integer,
	`screen_diagonal` real,
	`panel_type` text,
	`port_count` integer,
	`peripheral_kind` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`type_key`) REFERENCES `device_types`(`key`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`current_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "devices_status_ck" CHECK("devices"."status" in ('in_stock','assigned','repair','disposed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_serial_norm_uq` ON `devices` (`serial_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `devices_inventory_norm_uq` ON `devices` (`inventory_normalized`);--> statement-breakpoint
CREATE INDEX `devices_type_status_idx` ON `devices` (`type_key`,`status`);--> statement-breakpoint
CREATE INDEX `devices_current_employee_idx` ON `devices` (`current_employee_id`);--> statement-breakpoint
CREATE INDEX `devices_warranty_until_idx` ON `devices` (`warranty_until`) WHERE "devices"."warranty_until" is not null;--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`department_id` integer NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`from_employee_id` integer,
	`to_employee_id` integer,
	`comment` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`from_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `movements_device_occurred_idx` ON `movements` (`device_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`login` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_login_uq` ON `users` (`login`);--> statement-breakpoint
-- Append-only guards for movements (drizzle-kit does not generate triggers — added by hand)
CREATE TRIGGER movements_no_update BEFORE UPDATE ON movements
BEGIN
  SELECT RAISE(ABORT, 'movements is append-only: UPDATE denied');
END;--> statement-breakpoint
CREATE TRIGGER movements_no_delete BEFORE DELETE ON movements
BEGIN
  SELECT RAISE(ABORT, 'movements is append-only: DELETE denied');
END;--> statement-breakpoint
-- Seed device_types (4 fixed types)
INSERT INTO `device_types` (`key`, `name`, `created_at`) VALUES ('laptop', 'Ноутбук', unixepoch());--> statement-breakpoint
INSERT INTO `device_types` (`key`, `name`, `created_at`) VALUES ('monitor', 'Монитор', unixepoch());--> statement-breakpoint
INSERT INTO `device_types` (`key`, `name`, `created_at`) VALUES ('dock', 'Док-станция', unixepoch());--> statement-breakpoint
INSERT INTO `device_types` (`key`, `name`, `created_at`) VALUES ('peripheral', 'Периферия', unixepoch());