PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type_key` text NOT NULL,
	`model` text NOT NULL,
	`serial_number` text,
	`serial_normalized` text,
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
	CONSTRAINT "devices_status_ck" CHECK("__new_devices"."status" in ('in_stock','assigned','repair','disposed'))
);
--> statement-breakpoint
INSERT INTO `__new_devices`("id", "type_key", "model", "serial_number", "serial_normalized", "inventory_number", "inventory_normalized", "status", "current_employee_id", "purchase_date", "purchase_price", "supplier", "warranty_until", "notes", "ram_gb", "ram_upgraded", "ssd_gb", "screen_diagonal", "panel_type", "port_count", "peripheral_kind", "created_at", "updated_at") SELECT "id", "type_key", "model", "serial_number", "serial_normalized", "inventory_number", "inventory_normalized", "status", "current_employee_id", "purchase_date", "purchase_price", "supplier", "warranty_until", "notes", "ram_gb", "ram_upgraded", "ssd_gb", "screen_diagonal", "panel_type", "port_count", "peripheral_kind", "created_at", "updated_at" FROM `devices`;--> statement-breakpoint
DROP TABLE `devices`;--> statement-breakpoint
ALTER TABLE `__new_devices` RENAME TO `devices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `devices_serial_norm_uq` ON `devices` (`serial_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `devices_inventory_norm_uq` ON `devices` (`inventory_normalized`);--> statement-breakpoint
CREATE INDEX `devices_type_status_idx` ON `devices` (`type_key`,`status`);--> statement-breakpoint
CREATE INDEX `devices_current_employee_idx` ON `devices` (`current_employee_id`);--> statement-breakpoint
CREATE INDEX `devices_warranty_until_idx` ON `devices` (`warranty_until`) WHERE "devices"."warranty_until" is not null;